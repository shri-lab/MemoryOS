"""
Pydantic schemas for Conversation and Message management endpoints.
Fills in Task 2.6 schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict
from constants import MessageRole


class MessageSchema(BaseModel):
    """
    Schema representing a single message turn in a conversation.
    """
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    sources: Optional[List[Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationSchema(BaseModel):
    """
    Schema representing a base conversation.
    """
    id: UUID
    user_id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationListItemSchema(BaseModel):
    """
    Schema representing a conversation in a list view.
    """
    id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationDetailSchema(BaseModel):
    """
    Detailed schema representing a conversation, including all its messages.
    """
    id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[MessageSchema] = []

    model_config = ConfigDict(from_attributes=True)
