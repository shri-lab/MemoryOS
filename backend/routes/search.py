"""
Search route handler.
Fills in Task 2.3 semantic search routing.
"""

import logging
import asyncio
from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy import func, desc, select
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
    UnifiedSearchResponseSchema,
    FrequentSearchItemSchema
)
import services.embedding_service as embedding_service
import services.vector_search_service as vector_search_service
import services.llm_service as llm_service
import services.search_history_service as search_history_service
import services.rerank_service as rerank_service
from services.llm_service import LlmServiceError
from constants import SourceType, TOP_K_RETRIEVAL, FREQUENT_SEARCHES_LIMIT, RERANK_CANDIDATE_POOL_SIZE, RERANK_MODE

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
        
        # 3. Log search query in user's search history (non-blocking)
        await search_history_service.record_search_history(
            db=db,
            user_id=current_user.id,
            query=request.query,
            source="search"
        )
        
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
    
    # 2. Run pgvector similarity search pulling a wider candidate pool
    results = await vector_search_service.similarity_search(
        db=db,
        user_id=current_user.id,
        query_embedding=query_embedding,
        top_k=RERANK_CANDIDATE_POOL_SIZE,
        source_type=SourceType.PDF
    )
    
    # Apply re-ranking step if candidates are found
    if results:
        logger.info(f"Reranking candidate pool of size {len(results)} using mode '{RERANK_MODE}' for question: '{request.question}'")
        if RERANK_MODE == "gemini":
            results = await rerank_service.rerank_gemini(request.question, results, TOP_K_RETRIEVAL)
        else:
            results = rerank_service.rerank_cross_encoder(request.question, results, TOP_K_RETRIEVAL)
        logger.info(f"Rerank complete. Final selected chunk IDs: {[r['chunk_id'] for r in results]}")
    
    # 3. Log query to SearchHistory (non-blocking)
    await search_history_service.record_search_history(
        db=db,
        user_id=current_user.id,
        query=request.question,
        source="search"
    )
    
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
        prefs = current_user.preferences or {}
        default_k = prefs.get("default_search_top_k", TOP_K_RETRIEVAL)
        k = request.top_k if request.top_k is not None else default_k
        
        # 2. Execute similarity search (defaults to no type filter if source_type is None)
        results = await vector_search_service.similarity_search(
            db=db,
            user_id=current_user.id,
            query_embedding=query_embedding,
            top_k=k,
            source_type=request.source_type
        )
        
        # 3. Log query to SearchHistory (non-blocking)
        await search_history_service.record_search_history(
            db=db,
            user_id=current_user.id,
            query=request.query,
            source="search"
        )
        
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


@router.get("/frequent", response_model=List[FrequentSearchItemSchema], status_code=status.HTTP_200_OK)
async def get_frequent_searches(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[FrequentSearchItemSchema]:
    """
    Retrieves the current user's top N most frequent search queries.
    Groups by normalized (lowercased, trimmed) query text, but returns the
    most recent original (natural-cased) query text for display.
    Ordered by frequency count descending, capped at FREQUENT_SEARCHES_LIMIT.
    """
    grouped_stmt = (
        select(
            func.lower(func.trim(SearchHistory.query)).label("norm_query"),
            func.count(SearchHistory.id).label("search_count"),
            func.max(SearchHistory.created_at).label("last_searched")
        )
        .where(SearchHistory.user_id == current_user.id)
        .group_by(func.lower(func.trim(SearchHistory.query)))
        .order_by(desc("search_count"), desc("last_searched"))
        .limit(FREQUENT_SEARCHES_LIMIT)
    )

    grouped_res = await db.execute(grouped_stmt)
    grouped_rows = grouped_res.all()

    if not grouped_rows:
        return []

    frequent_items = []
    for norm_q, count, last_searched in grouped_rows:
        # Fetch the most recent raw (original-cased) query text for this normalized group
        raw_q_stmt = (
            select(SearchHistory.query)
            .where(
                SearchHistory.user_id == current_user.id,
                func.lower(func.trim(SearchHistory.query)) == norm_q
            )
            .order_by(SearchHistory.created_at.desc())
            .limit(1)
        )
        raw_res = await db.execute(raw_q_stmt)
        display_query = raw_res.scalar_one_or_none() or norm_q

        frequent_items.append(FrequentSearchItemSchema(
            query=display_query,
            count=count,
            last_searched_at=last_searched
        ))

    return frequent_items
