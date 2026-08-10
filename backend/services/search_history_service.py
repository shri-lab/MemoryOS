"""
Service for recording search history in a non-blocking, exception-isolated manner.
"""

import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from models import SearchHistory

logger = logging.getLogger(__name__)


async def record_search_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    source: str = "search"
) -> None:
    """
    Records a search history entry for user_id.
    
    Wrapped in safe exception handling so database logging failures
    NEVER cause primary search or conversation endpoints to fail or return 500.
    
    Args:
        db: AsyncSession database session.
        user_id: UUID of the authenticated user.
        query: Raw query string.
        source: 'search' or 'chat'.
    """
    clean_query = query.strip() if query else ""
    if not clean_query:
        return

    try:
        entry = SearchHistory(
            user_id=user_id,
            query=clean_query,
            source=source
        )
        db.add(entry)
        await db.commit()
        logger.debug(f"Recorded search history for user_id={user_id}, source={source}, query='{clean_query[:50]}'")
    except Exception as exc:
        logger.error(f"Failed to record search history (non-blocking failure isolated): {exc}")
        try:
            await db.rollback()
        except Exception:
            pass
