"""
Conversations route handler.
Fills in Task 2.6 database routes for chat session storage and retrieval.
"""

import uuid
import logging
import asyncio
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.session import get_db_session
from models import User, Conversation, Message, MessageRole
from auth.dependencies import get_current_user
from schemas.conversations import (
    ConversationSchema,
    ConversationListItemSchema,
    ConversationDetailSchema,
    SendMessageRequestSchema,
    MessageResponseSchema,
)
from constants import TOP_K_RETRIEVAL, SIMILARITY_THRESHOLD, MAX_HISTORY_MESSAGES
import services.llm_service as llm_service
import services.embedding_service as embedding_service
import services.vector_search_service as vector_search_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


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
            .order_by(Conversation.updated_at.desc())
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

        return conversation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch conversation {id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve conversation history."
        )


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
            content=request.message,
            sources=None
        )
        db.add(user_msg)
        await db.flush() # flush to generate ID and created_at without committing yet

        # 3. Determine reformulated query
        is_first_msg = (len(prior_messages) == 0)
        if is_first_msg:
            reformulated_query = request.message
        else:
            try:
                reformulated_query = await llm_service.reformulate_query(prior_messages, request.message)
            except Exception as ref_err:
                logger.warning(f"Query reformulation failed: {ref_err}. Falling back to raw user message.")
                reformulated_query = request.message

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
        # Note: similarity_search is already strictly filtered by user_id
        try:
            results = await vector_search_service.similarity_search(
                db=db,
                user_id=current_user.id,
                query_embedding=query_embedding,
                top_k=TOP_K_RETRIEVAL,
                threshold=SIMILARITY_THRESHOLD
            )
        except Exception as search_err:
            logger.error(f"Vector search failed: {search_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to query document vector index."
            )

        # 6. Grounded prompt generation and LLM QA call
        sources = []
        context_chunks = []
        if results:
            for r in results:
                # Format sources list
                sources.append({
                    "file_id": str(r["file_id"]),
                    "filename": r["filename"],
                    "page_number": r.get("page_number"),
                    "snippet": r["content"]
                })
                context_chunks.append({
                    "content": r["content"],
                    "filename": r["filename"],
                    "page_number": r.get("page_number")
                })

        try:
            answer = await llm_service.answer_conversation_qa(reformulated_query, context_chunks)
        except Exception as qa_err:
            logger.error(f"Grounded Q&A LLM call failed: {qa_err}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Q&A assistant service is currently unavailable: {qa_err}"
            )

        # 7. Save assistant message and update conversation
        assistant_msg = Message(
            conversation_id=id,
            role=MessageRole.ASSISTANT,
            content=answer,
            sources=sources
        )
        db.add(assistant_msg)
        
        conversation.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(assistant_msg)

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
