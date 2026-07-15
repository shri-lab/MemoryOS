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
from constants import SIMILARITY_THRESHOLD

logger = logging.getLogger(__name__)


async def similarity_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_embedding: List[float],
    top_k: int = 5,
    source_type: Optional[str] = None,
    threshold: float = SIMILARITY_THRESHOLD
) -> List[Dict[str, Any]]:
    """
    Performs a cosine similarity search over Chunk embeddings for a specific user.
    Strictly filters results to the user's files and optionally by file source type.
    Filters out results below the similarity score threshold.
    
    Args:
        db: Async database session.
        user_id: The UUID of the current authenticated user.
        query_embedding: The 384-dimensional query vector.
        top_k: Maximum number of chunks to return.
        source_type: Optional file source type filter (e.g. 'pdf', 'screenshot').
        threshold: Minimum similarity score (cosine similarity = 1 - cosine_distance).
        
    Returns:
        List of dicts representing search result details:
        [{"chunk_id": UUID, "file_id": UUID, "content": str, "page_number": int, "score": float, "filename": str}]
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

        if source_type:
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
