"""
Conversations route handler.
Fills in Task 2.6 database routes for chat session storage and retrieval.
"""

import uuid
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.session import get_db_session
from models import User, Conversation
from auth.dependencies import get_current_user
from schemas.conversations import (
    ConversationSchema,
    ConversationListItemSchema,
    ConversationDetailSchema,
)

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
