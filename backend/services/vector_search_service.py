"""
Vector Search Service for executing similarity queries on pgvector chunks.
Fills in Task 2.3 vector search logic.
"""

import uuid
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import Chunk, File
from constants import SIMILARITY_THRESHOLD, FileStatus

logger = logging.getLogger(__name__)


async def similarity_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_embedding: List[float],
    top_k: int = 5,
    source_type: Optional[str] = None,
    threshold: float = SIMILARITY_THRESHOLD,
    file_id: Optional[uuid.UUID] = None
) -> List[Dict[str, Any]]:
    """
    Performs a cosine similarity search over Chunk embeddings for a specific user.
    Strictly filters results to the user's files, optionally by file source type or target file_id.
    Filters out results below the similarity score threshold.
    """
    try:
        # Calculate cosine similarity: 1 - cosine_distance
        distance_expr = Chunk.embedding.cosine_distance(query_embedding)
        score_expr = 1.0 - distance_expr

        stmt = (
            select(
                Chunk.id.label("chunk_id"),
                Chunk.file_id,
                Chunk.content,
                Chunk.page_number,
                File.filename,
                File.source_type,
                score_expr.label("score")
            )
            .join(File, Chunk.file_id == File.id)
            .where(File.user_id == user_id)
        )

        if file_id:
            stmt = stmt.where(Chunk.file_id == file_id)
        elif source_type:
            stmt = stmt.where(File.source_type == source_type)

        stmt = (
            stmt.where(score_expr >= threshold)
            .order_by(distance_expr.asc())
            .limit(top_k)
        )

        result = await db.execute(stmt)
        rows = result.all()

        results_list = []
        for row in rows:
            # Handle source_type enum or string format
            src_type = row.source_type.value if hasattr(row.source_type, 'value') else str(row.source_type)
            results_list.append({
                "chunk_id": row.chunk_id,
                "file_id": row.file_id,
                "content": row.content,
                "page_number": row.page_number,
                "score": float(row.score),
                "filename": row.filename,
                "source_type": src_type
            })

        logger.info(f"Similarity search for user {user_id} returned {len(results_list)} results.")
        return results_list
    except Exception as e:
        logger.error(f"Error executing similarity search: {e}")
        raise e


async def get_chunks_by_file(
    db: AsyncSession,
    file_id: uuid.UUID
) -> List[Chunk]:
    """
    Retrieves all text chunks associated with a specific file, ordered by page number.
    
    Args:
        db: Async database session.
        file_id: The UUID of the file.
        
    Returns:
        List of Chunk records.
    """
    try:
        stmt = (
            select(Chunk)
            .where(Chunk.file_id == file_id)
            .order_by(Chunk.page_number.asc(), Chunk.created_at.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    except Exception as e:
        logger.error(f"Error fetching chunks for file ID {file_id}: {e}")
        raise e


async def find_related_file_chunks(
    db: AsyncSession,
    user_id: uuid.UUID,
    source_file_id: uuid.UUID,
    target_vector: List[float],
    candidate_limit: int = 25,
    min_score: float = 0.30
) -> List[Dict[str, Any]]:
    """
    Executes a pgvector similarity search against all ready files owned by user_id,
    excluding the source file itself.
    
    Distance -> Similarity Conversion:
        pgvector's `<=>` operator computes cosine distance (lower = more similar).
        This function explicitly calculates `similarity_score = 1.0 - cosine_distance`
        at the SQL layer so all score comparisons and outputs follow higher = more similar.
        
    Tenant Isolation & Scoping:
        Strictly enforces `File.user_id == user_id`, `File.id != source_file_id`,
        and `File.status == FileStatus.READY`.
    """
    try:
        distance_expr = Chunk.embedding.cosine_distance(target_vector)
        score_expr = 1.0 - distance_expr

        stmt = (
            select(
                Chunk.id.label("chunk_id"),
                Chunk.file_id,
                Chunk.content,
                Chunk.page_number,
                File.filename,
                File.source_type,
                score_expr.label("similarity_score")
            )
            .join(File, Chunk.file_id == File.id)
            .where(
                File.user_id == user_id,
                File.id != source_file_id,
                File.status == FileStatus.READY,
                score_expr >= min_score
            )
            .order_by(score_expr.desc())
            .limit(candidate_limit)
        )

        logger.debug(f"Executing related file chunks query for user_id={user_id}, source_file_id={source_file_id}, min_score={min_score}, candidate_limit={candidate_limit}")
        result = await db.execute(stmt)
        rows = result.all()

        results_list = []
        for row in rows:
            src_type = row.source_type.value if hasattr(row.source_type, 'value') else str(row.source_type)
            results_list.append({
                "chunk_id": row.chunk_id,
                "file_id": row.file_id,
                "filename": row.filename,
                "source_type": src_type,
                "content": row.content,
                "page_number": row.page_number,
                "similarity_score": float(row.similarity_score)
            })

        return results_list
    except Exception as e:
        logger.error(f"Error executing related file chunks search: {e}")
        raise e
