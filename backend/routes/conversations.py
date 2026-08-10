"""
Conversations route handler.
Fills in Task 2.6 database routes for chat session storage and retrieval.
"""

import uuid
import logging
import asyncio
import re
from datetime import datetime
from typing import List, Optional, Tuple

STOPWORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was",
    "were", "and", "or", "what", "which", "who", "whom", "this", "that", "these", "those",
    "tell", "me", "about", "how", "why", "when", "where", "can", "you", "explain", "detail"
}

def compute_chunk_relevance(query: str, chunk_content: str, base_score: float) -> Tuple[float, str]:
    """
    Computes a hybrid precision score combining vector similarity with term overlap & phrase match.
    Also extracts the most precise sentence window for citation snippets.
    """
    words = [w.lower() for w in re.findall(r'\b\w+\b', query) if w.lower() not in STOPWORDS and len(w) > 2]
    if not words:
        words = [w.lower() for w in re.findall(r'\b\w+\b', query) if len(w) > 2]

    content_lower = chunk_content.lower()

    # Term overlap bonus (up to +0.30)
    matched_words = sum(1 for w in set(words) if w in content_lower) if words else 0
    overlap_ratio = (matched_words / len(set(words))) if words else 0.0
    keyword_bonus = overlap_ratio * 0.30

    # Phrase match bonus (+0.15)
    clean_q = query.strip().lower()
    phrase_bonus = 0.15 if (len(clean_q) > 5 and clean_q in content_lower) else 0.0

    final_score = base_score + keyword_bonus + phrase_bonus

    # Extract precise sentence snippet
    sentences = re.split(r'(?<=[.!?])\s+', chunk_content)
    best_sentence = chunk_content
    best_sent_score = -1

    for sent in sentences:
        sent_lower = sent.lower()
        s_matches = sum(1 for w in set(words) if w in sent_lower) if words else 0
        if s_matches > best_sent_score and len(sent.strip()) > 15:
            best_sent_score = s_matches
            best_sentence = sent.strip()

    if len(best_sentence) > 350:
        best_sentence = best_sentence[:347] + "..."

    return final_score, best_sentence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func

from db.session import get_db_session
from models import User, Conversation, Message, MessageRole
from auth.dependencies import get_current_user
from schemas.conversations import (
    ConversationSchema,
    ConversationListItemSchema,
    ConversationDetailSchema,
    SendMessageRequestSchema,
    MessageResponseSchema,
    UpdateConversationRequestSchema,
)
from constants import TOP_K_RETRIEVAL, SIMILARITY_THRESHOLD, MAX_HISTORY_MESSAGES, DISPLAY_THRESHOLD, RERANK_CANDIDATE_POOL_SIZE, RERANK_MODE
import services.llm_service as llm_service
import services.embedding_service as embedding_service
import services.vector_search_service as vector_search_service
import services.search_history_service as search_history_service
import services.rerank_service as rerank_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def sanitize_llm_error(err: Exception) -> str:
    err_str = str(err)
    # Check for rate limits (429)
    if "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower():
        return "The AI assistant service rate limit was reached. Please wait a moment and try again."
    
    # Check for API key / authentication errors
    if "api_key" in err_str.lower() or "auth" in err_str.lower() or "unauthorized" in err_str.lower():
        return "AI assistant service authentication issue. Please contact the administrator."
        
    # Check for timeout
    if "timeout" in err_str.lower() or "timed out" in err_str.lower():
        return "The request timed out. Please try sending your message again."

    # General fallback
    return "The AI assistant service is temporarily busy or unavailable. Please try again in a few seconds."



@router.post(
    "",
    response_model=ConversationSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation session",
)
async def create_conversation(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Creates an empty conversation for the authenticated user.
    """
    try:
        new_conv = Conversation(
            user_id=current_user.id,
            title=None
        )
        db.add(new_conv)
        await db.commit()
        await db.refresh(new_conv)
        logger.info(f"Created conversation {new_conv.id} for user {current_user.id}")
        return new_conv
    except Exception as e:
        logger.error(f"Failed to create conversation: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize conversation session."
        )


@router.get(
    "",
    response_model=List[ConversationListItemSchema],
    summary="List all conversations of the authenticated user",
)
async def list_conversations(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Lists all conversations for the authenticated user, ordered by updated_at descending.
    """
    try:
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(Conversation.is_pinned.desc(), Conversation.updated_at.desc())
        )
        res = await db.execute(stmt)
        conversations = res.scalars().all()
        return conversations
    except Exception as e:
        logger.error(f"Failed to list conversations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve conversation list."
        )


@router.get(
    "/{id}",
    response_model=ConversationDetailSchema,
    summary="Get conversation details and full message history",
)
async def get_conversation(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the conversation plus its full ordered message list.
    Returns 404 (not 403) if not found or not owned by the requesting user.
    """
    try:
        stmt = (
            select(Conversation)
            .where(Conversation.id == id)
            .options(selectinload(Conversation.messages))
        )
        res = await db.execute(stmt)
        conversation = res.scalar_one_or_none()

        if not conversation or conversation.user_id != current_user.id:
            logger.warning(
                f"Unauthorized access attempt or missing conversation {id} for user {current_user.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation session not found."
            )

        if conversation and conversation.messages:
            for msg in conversation.messages:
                if msg.sources:
                    normalized = []
                    for s in msg.sources:
                        if isinstance(s, dict):
                            s_copy = dict(s)
                            if "source_type" not in s_copy or not s_copy["source_type"]:
                                fname = s_copy.get("filename", "").lower()
                                s_copy["source_type"] = "screenshot" if fname.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")) else "pdf"
                            normalized.append(s_copy)
                        else:
                            normalized.append(s)
                    msg.sources = normalized

        return conversation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch conversation {id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve conversation history."
        )


def resolve_target_file_id(last_assistant_msg: Optional[Message], user_input: str) -> Optional[uuid.UUID]:
    """
    Parses user input for ordinal language ("first reference", "2nd source", "the last one")
    or filename substring matches against the sources array of the immediately preceding assistant message.
    Returns the target file_id UUID if matched, or None if no match / no sources / out of bounds.
    """
    if not last_assistant_msg or last_assistant_msg.role != MessageRole.ASSISTANT:
        return None

    sources = last_assistant_msg.sources
    if not sources or not isinstance(sources, list) or len(sources) == 0:
        return None

    user_text_lower = user_input.lower()

    # 1. Check for ordinal keywords / position references
    ordinals_map = [
        (["first", "1st", "number one", "no. 1", "no 1"], 0),
        (["second", "2nd", "number two", "no. 2", "no 2"], 1),
        (["third", "3rd", "number three", "no. 3", "no 3"], 2),
        (["fourth", "4th", "number four", "no. 4", "no 4"], 3),
        (["fifth", "5th", "number five", "no. 5", "no 5"], 4),
    ]

    target_index = None

    if "last" in user_text_lower or "final" in user_text_lower:
        target_index = len(sources) - 1
    else:
        for phrases, idx in ordinals_map:
            if any(phrase in user_text_lower for phrase in phrases):
                target_index = idx
                break

    if target_index is not None:
        if 0 <= target_index < len(sources):
            matched_source = sources[target_index]
            if isinstance(matched_source, dict) and "file_id" in matched_source:
                try:
                    return uuid.UUID(str(matched_source["file_id"]))
                except Exception:
                    pass
        return None

    # 2. Check for filename substring match
    for source in sources:
        if isinstance(source, dict) and "filename" in source:
            fname = source["filename"].lower()
            fname_no_ext = fname.rsplit(".", 1)[0]
            if (fname and fname in user_text_lower) or (fname_no_ext and len(fname_no_ext) >= 3 and fname_no_ext in user_text_lower):
                if "file_id" in source:
                    try:
                        return uuid.UUID(str(source["file_id"]))
                    except Exception:
                        pass

    return None


@router.delete(
    "/{id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a conversation and all its messages",
)
async def delete_conversation(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes the specified conversation and cascades deletion to messages.
    Returns 404 if not found or not owned by the requesting user.
    """
    try:
        stmt = select(Conversation).where(Conversation.id == id)
        res = await db.execute(stmt)
        conversation = res.scalar_one_or_none()

        if not conversation or conversation.user_id != current_user.id:
            logger.warning(
                f"Unauthorized delete attempt or missing conversation {id} for user {current_user.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation session not found."
            )

        await db.delete(conversation)
        await db.commit()
        logger.info(f"Deleted conversation {id} and cascaded messages for user {current_user.id}")
        return {"detail": "Conversation deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete conversation {id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversation."
        )


@router.post(
    "/{id}/messages",
    response_model=MessageResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message to a conversation and receive a grounded response",
)
async def send_conversation_message(
    id: uuid.UUID,
    request: SendMessageRequestSchema,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Sends a user message, reformulates it using the prior conversation context,
    performs a vector similarity search on document chunks, and answers grounded
    in the retrieved content.
    Returns 404 if the conversation is not found or is not owned by the requesting user.
    """
    # 1. Validate conversation existence and ownership
    try:
        stmt = select(Conversation).where(Conversation.id == id)
        res = await db.execute(stmt)
        conversation = res.scalar_one_or_none()

        if not conversation or conversation.user_id != current_user.id:
            logger.warning(
                f"Unauthorized send attempt or missing conversation {id} for user {current_user.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation session not found."
            )

        # 2. Fetch the prior messages for context (last MAX_HISTORY_MESSAGES turns, oldest to newest)
        stmt_messages = (
            select(Message)
            .where(Message.conversation_id == id)
            .order_by(Message.created_at.desc())
            .limit(MAX_HISTORY_MESSAGES)
        )
        res_messages = await db.execute(stmt_messages)
        prior_messages = list(reversed(res_messages.scalars().all()))

        # Save incoming user message
        user_msg = Message(
            conversation_id=id,
            role=MessageRole.USER,
            content=request.content,
            sources=None
        )
        db.add(user_msg)
        await db.flush() # flush to generate ID and created_at without committing yet

        # 3. Determine reformulated query
        is_first_msg = (len(prior_messages) == 0)
        if is_first_msg:
            reformulated_query = request.content
        else:
            try:
                reformulated_query = await llm_service.reformulate_query(prior_messages, request.content)
            except Exception as ref_err:
                logger.warning(f"Query reformulation failed: {ref_err}. Falling back to raw user message.")
                reformulated_query = request.content

        # 4. Generate query embedding (CPU-bound sentence-transformers run in thread pool)
        try:
            query_embedding = await asyncio.to_thread(
                embedding_service.generate_embedding,
                reformulated_query
            )
        except Exception as emb_err:
            logger.error(f"Failed to generate embedding for query: {emb_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process search query embedding."
            )

        # 5. Perform similarity search across user's documents
        # Check for explain-mode triggers in user message
        explain_keywords = ["explain", "in detail", "elaborate", "walk me through"]
        is_explain_mode = any(kw in request.content.lower() for kw in explain_keywords)
        explain_keywords = ["explain", "in detail", "elaborate", "walk me through"]
        is_explain_mode = any(kw in request.content.lower() for kw in explain_keywords)
        
        # Pull a wider candidate pool for re-ranking
        candidate_pool_size = RERANK_CANDIDATE_POOL_SIZE * 2 if is_explain_mode else RERANK_CANDIDATE_POOL_SIZE
        final_top_k = TOP_K_RETRIEVAL * 2 if is_explain_mode else TOP_K_RETRIEVAL
        logger.info(f"Explain mode triggered: {is_explain_mode}. Query: '{request.content}'. Rerank pool: {candidate_pool_size}, final top_k: {final_top_k}")

        # Check for reference-targeted retrieval against immediately preceding assistant message
        last_assistant_msg = prior_messages[-1] if prior_messages and prior_messages[-1].role == MessageRole.ASSISTANT else None
        target_file_id = resolve_target_file_id(last_assistant_msg, request.content)
        if target_file_id:
            logger.info(f"Reference-targeted retrieval activated for target file_id: {target_file_id}")
        else:
            # Record genuine retrieval chat query in search history (skips pure follow-up / ordinal references)
            await search_history_service.record_search_history(
                db=db,
                user_id=current_user.id,
                query=request.content,
                source="chat"
            )

        try:
            results = await vector_search_service.similarity_search(
                db=db,
                user_id=current_user.id,
                query_embedding=query_embedding,
                top_k=candidate_pool_size,
                threshold=SIMILARITY_THRESHOLD,
                file_id=target_file_id
            )
            
            # Apply re-ranking step if candidates are found
            if results:
                logger.info(f"Reranking candidate pool of size {len(results)} using mode '{RERANK_MODE}' for chat query: '{reformulated_query}'")
                if RERANK_MODE == "gemini":
                    results = await rerank_service.rerank_gemini(reformulated_query, results, final_top_k)
                else:
                    results = rerank_service.rerank_cross_encoder(reformulated_query, results, final_top_k)
                logger.info(f"Rerank complete. Final selected chunk IDs: {[r['chunk_id'] for r in results]}")
        except Exception as search_err:
            logger.error(f"Vector search or re-ranking failed: {search_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to query or rerank document vector index."
            )

        # 6. Hybrid prompt generation and LLM call
        # Log top similarity scores at debug level
        if results:
            logger.debug(f"Top similarity scores for query '{reformulated_query}': {[float(r['score']) for r in results]}")
        else:
            logger.debug(f"No similarity search results passed threshold {SIMILARITY_THRESHOLD} for query '{reformulated_query}'")

        sources = []
        context_chunks = []
        if results:
            # All returned results feed into LLM context for grounding
            for r in results:
                context_chunks.append({
                    "content": r["content"],
                    "filename": r["filename"],
                    "page_number": r.get("page_number")
                })

            # Hybrid precision re-ranking & sentence-window snippet extraction for user-visible citations
            processed_results = []
            for r in results:
                rel_score, precise_snippet = compute_chunk_relevance(
                    query=reformulated_query,
                    chunk_content=r["content"],
                    base_score=float(r["score"])
                )
                processed_results.append({
                    "file_id": str(r["file_id"]),
                    "filename": r["filename"],
                    "page_number": r.get("page_number"),
                    "snippet": precise_snippet,
                    "source_type": r.get("source_type", "pdf"),
                    "score": rel_score
                })

            # Calculate tight dynamic cutoff so only high-accuracy matches are shown
            max_rel_score = max(pr["score"] for pr in processed_results) if processed_results else 0.0
            dynamic_cutoff = max(DISPLAY_THRESHOLD, max_rel_score * 0.78)

            # Deduplicate by (file_id, page_number) keeping the highest scoring chunk
            unique_sources_map = {}
            for pr in processed_results:
                if pr["score"] >= dynamic_cutoff:
                    key = (pr["file_id"], pr["page_number"])
                    if key not in unique_sources_map or pr["score"] > unique_sources_map[key]["score"]:
                        unique_sources_map[key] = pr

            # Sort descending by precision score
            sorted_sources = sorted(unique_sources_map.values(), key=lambda x: x["score"], reverse=True)

            # Cap at top 4 distinct accurate citations
            for s in sorted_sources[:4]:
                sources.append({
                    "file_id": s["file_id"],
                    "filename": s["filename"],
                    "page_number": s["page_number"],
                    "snippet": s["snippet"],
                    "source_type": s["source_type"]
                })

        # Define async task for generating RAG / GK answer
        async def generate_answer():
            if results:
                try:
                    answer = await llm_service.answer_conversation_qa(
                        question=reformulated_query,
                        context_chunks=context_chunks,
                        is_explain_mode=is_explain_mode
                    )
                except Exception as qa_err:
                    logger.error(f"Grounded Q&A LLM call failed: {qa_err}")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=sanitize_llm_error(qa_err)
                    )

                # If answer says not found, fall back to general knowledge answering!
                if answer.strip().lower() == "not found in your documents":
                    logger.info(f"Grounded QA yielded 'not found' for query '{reformulated_query}'. Falling back to General Knowledge.")
                    nonlocal sources
                    sources = []
                    try:
                        answer = await llm_service.answer_general_knowledge(
                            question=reformulated_query,
                            conversation_history=prior_messages
                        )
                        return answer, [], "general_knowledge"
                    except Exception as gk_err:
                        logger.error(f"Fallback general knowledge LLM call failed: {gk_err}")
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=sanitize_llm_error(gk_err)
                        )
                return answer, sources, "grounded"
            else:
                try:
                    answer = await llm_service.answer_general_knowledge(
                        question=reformulated_query,
                        conversation_history=prior_messages
                    )
                    return answer, [], "general_knowledge"
                except Exception as gk_err:
                    logger.error(f"General knowledge LLM call failed: {gk_err}")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=sanitize_llm_error(gk_err)
                    )

        # Define async task for generating title concurrently
        async def generate_title():
            prefs = current_user.preferences or {}
            auto_title_enabled = prefs.get("chat_auto_title_enabled", True)
            if auto_title_enabled and is_first_msg and conversation.title is None:
                try:
                    t = await llm_service.generate_conversation_title(request.content)
                    return t
                except Exception as e:
                    logger.error(f"Error generating conversation title: {e}")
                    return None
            return None

        # Execute both concurrently
        ans_res, title_res = await asyncio.gather(
            generate_answer(),
            generate_title(),
            return_exceptions=True
        )

        # Handle answer result / exceptions
        if isinstance(ans_res, Exception):
            logger.error(f"Failed to generate answer due to exception: {ans_res}")
            if isinstance(ans_res, HTTPException):
                raise ans_res
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate response message."
            )
        
        answer, final_sources, final_answer_mode = ans_res

        # Handle title result / exceptions
        if not isinstance(title_res, Exception) and title_res:
            conversation.title = title_res

        # 7. Save assistant message and update conversation
        assistant_msg = Message(
            conversation_id=id,
            role=MessageRole.ASSISTANT,
            content=answer,
            sources=final_sources,
            answer_mode=final_answer_mode
        )
        db.add(assistant_msg)
        
        conversation.updated_at = func.now()
        await db.commit()
        await db.refresh(assistant_msg)
        
        # Attach conversation title dynamically for serialization
        assistant_msg.conversation_title = conversation.title

        logger.info(f"Successfully processed message and generated response for conversation {id}")
        return assistant_msg

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error handling conversation message: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the conversation message."
        )

@router.patch(
    "/{id}",
    response_model=ConversationSchema,
    summary="Update conversation attributes (e.g. toggle is_pinned)",
)
async def patch_conversation(
    id: uuid.UUID,
    request: UpdateConversationRequestSchema,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """
    Updates conversation properties (e.g., toggling is_pinned).
    JWT-protected and ownership-checked. Returns 404 if not found or unauthorized.
    """
    try:
        stmt = select(Conversation).where(Conversation.id == id)
        res = await db.execute(stmt)
        conversation = res.scalar_one_or_none()

        if not conversation or conversation.user_id != current_user.id:
            logger.warning(f"Unauthorized patch attempt or missing conversation {id} for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation session not found."
            )

        conversation.is_pinned = request.is_pinned
        # Save change
        await db.commit()
        await db.refresh(conversation)
        logger.info(f"Updated conversation {id} (is_pinned={conversation.is_pinned}) for user {current_user.id}")
        return conversation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update conversation {id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update conversation."
        )
