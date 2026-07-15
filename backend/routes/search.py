"""
Search route handler.
Fills in Task 2.3 semantic search routing.
"""

import logging
import asyncio
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db_session
from models import User, SearchHistory
from auth.dependencies import get_current_user
from schemas.search import (
    SearchRequestSchema,
    SearchResponseSchema,
    QaRequestSchema,
    QaResponseSchema,
    QaSourceSchema,
    UnifiedSearchRequestSchema,
    UnifiedSearchResultSchema,
    UnifiedSearchResponseSchema
)
import services.embedding_service as embedding_service
import services.vector_search_service as vector_search_service
import services.llm_service as llm_service
from services.llm_service import LlmServiceError
from constants import SourceType, TOP_K_RETRIEVAL

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/pdf", response_model=SearchResponseSchema, status_code=status.HTTP_200_OK)
async def search_pdf_chunks(
    request: SearchRequestSchema,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> SearchResponseSchema:
    """
    Semantic search over PDF chunks using query vector similarity.
    Requires user authentication and maintains strict multi-tenant boundaries.
    """
    logger.info(f"User {current_user.id} requested PDF semantic search for query: '{request.query}'")
    
    try:
        # 1. Generate query embedding (CPU-bound)
        query_embedding = await asyncio.to_thread(
            embedding_service.generate_embedding, 
            request.query
        )
        
        # 2. Run pgvector similarity search restricted to PDF source types
        results = await vector_search_service.similarity_search(
            db=db,
            user_id=current_user.id,
            query_embedding=query_embedding,
            top_k=request.top_k,
            source_type=SourceType.PDF
        )
        
        # 3. Log search query in user's search history
        search_log = SearchHistory(
            user_id=current_user.id,
            query=request.query
        )
        db.add(search_log)
        await db.commit()
        
        return SearchResponseSchema(
            query=request.query,
            results=results
        )
    except Exception as e:
        logger.error(f"Error during search_pdf_chunks: {e}")
        raise e


@router.post("/qa", response_model=QaResponseSchema, status_code=status.HTTP_200_OK)
async def search_pdf_qa(
    request: QaRequestSchema,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> QaResponseSchema:
    """
    Retrieves matching document context chunks and answers questions grounded strictly 
    in the context using Gemini (primary) or Groq Llama 3.3 (fallback).
    Logs the query in search history and returns cited source snippets.
    """
    logger.info(f"User {current_user.id} requested QA for question: '{request.question}'")
    
    # 1. Generate query embedding (CPU-bound)
    query_embedding = await asyncio.to_thread(
        embedding_service.generate_embedding, 
        request.question
    )
    
    # 2. Run pgvector similarity search restricted to PDF source types
    results = await vector_search_service.similarity_search(
        db=db,
        user_id=current_user.id,
        query_embedding=query_embedding,
        top_k=TOP_K_RETRIEVAL,
        source_type=SourceType.PDF
    )
    
    # 3. Log query to SearchHistory (consistent with Task 2.3)
    search_log = SearchHistory(
        user_id=current_user.id,
        query=request.question
    )
    db.add(search_log)
    await db.commit()
    
    # 4. If zero chunks match, skip LLM call and return canned response
    if not results:
        logger.info(f"Zero chunks matched search query. Skipping LLM call.")
        return QaResponseSchema(
            question=request.question,
            answer="I don't have enough information in your documents to answer that.",
            sources=[]
        )
    
    # 5. Format chunks as dictionary list context for llm_service
    context_chunks = [
        {
            "content": r["content"],
            "filename": r["filename"],
            "page_number": r.get("page_number")
        }
        for r in results
    ]
    
    # 6. Call LLM service to answer question
    try:
        answer = await llm_service.answer_question(request.question, context_chunks)
    except LlmServiceError as llm_err:
        logger.error(f"Failed to answer question due to LLM Service Error: {llm_err}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Q&A assistant is currently unavailable: {llm_err}"
        )
        
    # 7. Map search result metadata to QaSourceSchema response elements
    sources = []
    for r in results:
        snippet = r["content"][:200]  # Truncate content to snippet length
        sources.append(QaSourceSchema(
            file_id=r["file_id"],
            filename=r["filename"],
            page_number=r.get("page_number"),
            chunk_snippet=snippet,
            similarity_score=r["score"]
        ))
        
    return QaResponseSchema(
        question=request.question,
        answer=answer,
        sources=sources
    )


@router.post("", response_model=UnifiedSearchResponseSchema, status_code=status.HTTP_200_OK)
async def unified_search(
    request: UnifiedSearchRequestSchema,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> UnifiedSearchResponseSchema:
    """
    Unified search endpoint returning ranked results across all source types
    (currently PDFs, screenshots in Phase 5) with confidence scores.
    """
    logger.info(f"User {current_user.id} requested unified search for query: '{request.query}'")
    
    try:
        # 1. Generate query embedding
        query_embedding = await asyncio.to_thread(
            embedding_service.generate_embedding,
            request.query
        )
        
        # Determine top_k retrieval count
        k = request.top_k if request.top_k is not None else TOP_K_RETRIEVAL
        
        # 2. Execute similarity search (defaults to no type filter if source_type is None)
        results = await vector_search_service.similarity_search(
            db=db,
            user_id=current_user.id,
            query_embedding=query_embedding,
            top_k=k,
            source_type=request.source_type
        )
        
        # 3. Log query to SearchHistory
        search_log = SearchHistory(
            user_id=current_user.id,
            query=request.query
        )
        db.add(search_log)
        await db.commit()
        
        # 4. Map similarity search results to UnifiedSearchResultSchema
        mapped_results = []
        for r in results:
            mapped_results.append(UnifiedSearchResultSchema(
                id=r["chunk_id"],
                file_id=r["file_id"],
                filename=r["filename"],
                source_type=r["source_type"],
                page_number=r.get("page_number"),
                content=r["content"],
                confidence_score=r["score"]
            ))
            
        # Results from similarity_search are already sorted by cosine distance ascending (score descending)
        return UnifiedSearchResponseSchema(
            query=request.query,
            results=mapped_results
        )
    except Exception as e:
        logger.error(f"Error during unified_search: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during search: {e}"
        )
