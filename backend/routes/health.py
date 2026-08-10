"""Health check router — verifies API and database connectivity."""
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db_session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db_session)) -> JSONResponse:
    """Return API status and confirm the database connection is live."""
    try:
        await db.execute(text("SELECT 1"))
        return JSONResponse(status_code=200, content={"status": "ok", "database": "connected"})
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unreachable"})
