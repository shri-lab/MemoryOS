"""
Pydantic schemas for Conversation and Message management endpoints.
Fills in Task 2.6 schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict
from constants import MessageRole


from typing import Optional, List, Any, Literal

class MessageSchema(BaseModel):
    """
    Schema representing a single message turn in a conversation.
    """
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    sources: Optional[List[Any]] = None
    referenced_files: Optional[List[str]] = []
    answer_mode: Optional[Literal["grounded", "general_knowledge"]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationSchema(BaseModel):
    """
    Schema representing a base conversation.
    """
    id: UUID
    user_id: UUID
    title: Optional[str] = None
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationListItemSchema(BaseModel):
    """
    Schema representing a conversation in a list view.
    """
    id: UUID
    title: Optional[str] = None
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationDetailSchema(BaseModel):
    """
    Detailed schema representing a conversation, including all its messages.
    """
    id: UUID
    title: Optional[str] = None
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime
    messages: List[MessageSchema] = []

    model_config = ConfigDict(from_attributes=True)


class SendMessageRequestSchema(BaseModel):
    """
    Request schema for sending a message in a conversation.
    """
    content: str


class SourceSchema(BaseModel):
    """
    Schema representing a cited source chunk.
    """
    file_id: UUID
    filename: str
    page_number: Optional[int] = None
    snippet: str
    source_type: str = "pdf"

    model_config = ConfigDict(from_attributes=True)


class MessageResponseSchema(BaseModel):
    """
    Response schema representing a saved conversation message.
    """
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    sources: Optional[List[SourceSchema]] = None
    referenced_files: Optional[List[str]] = []
    answer_mode: Optional[Literal["grounded", "general_knowledge"]] = None
    conversation_title: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateConversationRequestSchema(BaseModel):
    """
    Request schema for updating conversation attributes (e.g. is_pinned).
    """
    is_pinned: bool
