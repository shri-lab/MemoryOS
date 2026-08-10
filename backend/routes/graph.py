"""
Knowledge Graph route handler.
"""

import uuid
import logging
import numpy as np
from typing import List, Dict, Set, Tuple, Optional
from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.session import get_db_session
from models import User, File as DBFile, Tag, FileTag
from auth.dependencies import get_current_user
from schemas.graph import GraphNodeSchema, GraphEdgeSchema, GraphResponseSchema
from constants import (
    FileStatus,
    GRAPH_MAX_FILE_NODES,
    GRAPH_SIMILARITY_THRESHOLD,
    GRAPH_MAX_EDGES,
)
import services.embedding_service as embedding_service
import services.vector_search_service as vector_search_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])


def truncate_snippet_word_boundary(content: Optional[str], max_chars: int = 120) -> Optional[str]:
    """
    Truncates summary snippet to approximately max_chars on a word boundary.
    """
    if not content:
        return None
    cleaned = content.strip()
    if len(cleaned) <= max_chars:
        return cleaned

    truncated = cleaned[:max_chars]
    last_space = truncated.rfind(' ')
    if last_space > 60:
        return truncated[:last_space] + "..."
    return truncated + "..."


@router.get("", response_model=GraphResponseSchema, status_code=status.HTTP_200_OK)
async def get_knowledge_graph(
    min_tag_shared_files: int = Query(2, ge=1, description="Minimum number of files a tag must be shared across to be included"),
    similarity_threshold: Optional[float] = Query(None, description="Minimum cosine similarity threshold for similarity edges"),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> GraphResponseSchema:
    """
    Retrieves nodes and edges for the authenticated user's knowledge graph.
    
    Query Parameters:
      min_tag_shared_files: Minimum distinct files a tag must be attached to in order to be included (default 2).
      similarity_threshold: Cosine similarity cutoff (defaults to GRAPH_SIMILARITY_THRESHOLD).
      
    File Node Selection Policy:
      If a user has more than GRAPH_MAX_FILE_NODES ready files, the endpoint selects
      the most recently created files (ordered by DBFile.created_at.desc()).
      
    Tenant Isolation:
      Strictly filters File.user_id == current_user.id across all file, tag, and chunk queries.
      
    Unit Normalization & Cosine Similarity:
      Mean-pooled file centroid vectors are explicitly unit-normalized (v / ||v||) using NumPy.
      Dot products between unit-normalized vectors compute exact cosine similarity in 0 to 1 range.
      
    Zero-Chunk Files:
      Included as file nodes (to preserve tag relationships), but skipped from pairwise similarity search.
    """
    sim_cutoff = similarity_threshold if similarity_threshold is not None else GRAPH_SIMILARITY_THRESHOLD
    if sim_cutoff < 0.0 or sim_cutoff > 1.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="similarity_threshold must be between 0.0 and 1.0"
        )

    logger.debug(f"Fetching knowledge graph for user_id={current_user.id}, min_tag_shared_files={min_tag_shared_files}, sim_cutoff={sim_cutoff}")

    # 1. Fetch user's ready files (capped at GRAPH_MAX_FILE_NODES by created_at DESC)
    stmt_files = (
        select(DBFile)
        .options(selectinload(DBFile.tags))
        .where(
            DBFile.user_id == current_user.id,
            DBFile.status == FileStatus.READY
        )
        .order_by(DBFile.created_at.desc())
        .limit(GRAPH_MAX_FILE_NODES)
    )
    res_files = await db.execute(stmt_files)
    ready_files = list(res_files.scalars().all())

    if not ready_files:
        return GraphResponseSchema(nodes=[], edges=[])

    # Count distinct files per tag within the included file set
    tag_file_counts: Dict[str, int] = {}
    for f in ready_files:
        for tag in f.tags:
            tid = str(tag.id)
            tag_file_counts[tid] = tag_file_counts.get(tid, 0) + 1

    # 2. Build file nodes, tag nodes, and tag edges
    nodes: List[GraphNodeSchema] = []
    tag_nodes_map: Dict[str, GraphNodeSchema] = {}
    tag_edges: List[GraphEdgeSchema] = []

    for f in ready_files:
        src_type = f.source_type.value if hasattr(f.source_type, 'value') else str(f.source_type)

        nodes.append(GraphNodeSchema(
            id=str(f.id),
            type="file",
            label=f.filename,
            source_type=src_type,
            summary_snippet=truncate_snippet_word_boundary(f.summary)
        ))

        # Add tag relationships ONLY if tag is shared across >= min_tag_shared_files
        for tag in f.tags:
            tag_id_str = str(tag.id)
            if tag_file_counts.get(tag_id_str, 0) < min_tag_shared_files:
                continue

            if tag_id_str not in tag_nodes_map:
                tag_nodes_map[tag_id_str] = GraphNodeSchema(
                    id=tag_id_str,
                    type="tag",
                    label=tag.name
                )
            tag_edges.append(GraphEdgeSchema(
                source=str(f.id),
                target=tag_id_str,
                type="tag",
                weight=None
            ))

    # Append distinct tag nodes to node list
    nodes.extend(tag_nodes_map.values())

    # 3. Compute mean-pooled & unit-normalized centroid vectors for files with chunks
    # Note: At GRAPH_MAX_FILE_NODES=50, pairwise dot product (<= 1225 comparisons)
    # in Python/NumPy takes < 2ms. If max files cap is raised significantly later,
    # pairwise comparison can be refactored into a single batched SQL vector similarity query.
    normalized_centroids: Dict[str, np.ndarray] = {}

    for f in ready_files:
        chunks = await vector_search_service.get_chunks_by_file(db, f.id)
        if not chunks:
            logger.debug(f"File {f.id} has zero chunks. Excluded from pairwise similarity.")
            continue

        embeddings = [c.embedding for c in chunks if c.embedding is not None]
        if not embeddings:
            logger.debug(f"File {f.id} has no valid embeddings. Excluded from pairwise similarity.")
            continue

        # Mean pool chunk embeddings
        raw_centroid = embedding_service.mean_pool_embeddings(embeddings)
        centroid_arr = np.array(raw_centroid, dtype=np.float32)

        # Unit-normalize centroid (v / ||v||)
        norm = np.linalg.norm(centroid_arr)
        if norm > 1e-9:
            normalized_centroids[str(f.id)] = centroid_arr / norm
        else:
            logger.debug(f"File {f.id} has zero-norm centroid. Excluded from pairwise similarity.")

    # 4. Compute pairwise cosine similarity between normalized centroids
    similarity_edges: List[GraphEdgeSchema] = []
    active_centroid_ids = list(normalized_centroids.keys())
    num_centroids = len(active_centroid_ids)

    for i in range(num_centroids):
        id_i = active_centroid_ids[i]
        vec_i = normalized_centroids[id_i]
        for j in range(i + 1, num_centroids):
            id_j = active_centroid_ids[j]
            vec_j = normalized_centroids[id_j]

            # Cosine similarity via dot product of unit-normalized vectors
            sim_score = float(np.dot(vec_i, vec_j))
            if sim_score >= sim_cutoff:
                similarity_edges.append(GraphEdgeSchema(
                    source=id_i,
                    target=id_j,
                    type="similarity",
                    weight=round(sim_score, 4)
                ))

    # 5. Sort similarity edges descending by weight
    similarity_edges.sort(key=lambda e: e.weight if e.weight is not None else 0.0, reverse=True)

    # 6. Apply edge capping (GRAPH_MAX_EDGES) preserving tag edges preferentially
    total_edges_allowed = GRAPH_MAX_EDGES
    num_tag_edges = len(tag_edges)

    if num_tag_edges >= total_edges_allowed:
        final_edges = tag_edges[:total_edges_allowed]
    else:
        allowed_sim_edges = total_edges_allowed - num_tag_edges
        final_edges = tag_edges + similarity_edges[:allowed_sim_edges]

    return GraphResponseSchema(
        nodes=nodes,
        edges=final_edges
    )
