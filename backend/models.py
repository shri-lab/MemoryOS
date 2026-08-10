"""
SQLAlchemy 2.0 async data models for the MemoryOS backend.
Fills in Task 0.2 database schema.
"""

import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, ForeignKey, Text, Integer, DateTime, Enum, func, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from constants import SourceType, FileStatus, OAuthProvider, MessageRole


class Base(DeclarativeBase):
    """
    SQLAlchemy Declarative Base class.
    """
    pass


class User(Base):
    """
    User model representing a registered user of MemoryOS.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    oauth_provider: Mapped[OAuthProvider] = mapped_column(
        Enum(OAuthProvider, values_callable=lambda x: [e.value for e in x]),
        default=OAuthProvider.LOCAL,
        nullable=False,
        server_default="local"
    )
    oauth_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    preferred_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    work_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    theme_preference: Mapped[str] = mapped_column(String(10), default="system", server_default="system", nullable=False)
    preferences: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {"default_search_top_k": 5, "default_landing_page": "dashboard", "chat_auto_title_enabled": True},
        server_default='{"default_search_top_k": 5, "default_landing_page": "dashboard", "chat_auto_title_enabled": true}',
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("oauth_provider", "oauth_id", name="uq_user_oauth_provider_id"),
    )

    # Relationships
    files: Mapped[List["File"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    search_histories: Mapped[List["SearchHistory"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    file_views: Mapped[List["FileView"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class FileTag(Base):
    """
    Association model mapping the many-to-many relationship between Files and Tags.
    """
    __tablename__ = "file_tags"

    file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class File(Base):
    """
    File model representing an uploaded document (PDF or screenshot).
    """
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[SourceType] = mapped_column(
        Enum(SourceType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[FileStatus] = mapped_column(
        Enum(FileStatus, values_callable=lambda x: [e.value for e in x]),
        default=FileStatus.UPLOADING,
        nullable=False
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="files")
    chunks: Mapped[List["Chunk"]] = relationship(back_populates="file", cascade="all, delete-orphan")
    tags: Mapped[List["Tag"]] = relationship(secondary="file_tags", back_populates="files")
    file_views: Mapped[List["FileView"]] = relationship(back_populates="file", cascade="all, delete-orphan")


class FileView(Base):
    """
    FileView model representing a user's recent viewing history of a File.
    Unique per (user_id, file_id) to update viewed_at on conflict rather than accumulating duplicates.
    """
    __tablename__ = "file_views"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("user_id", "file_id", name="uq_file_view_user_file"),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="file_views")
    file: Mapped["File"] = relationship(back_populates="file_views")


class Chunk(Base):
    """
    Chunk model representing a text fragment extracted from a File, with its vector embedding.
    """
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    embedding: Mapped[Optional[Vector]] = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    # Relationships
    file: Mapped["File"] = relationship(back_populates="chunks")


class Tag(Base):
    """
    Tag model representing a label that can be attached to multiple files.
    """
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Relationships
    files: Mapped[List["File"]] = relationship(secondary="file_tags", back_populates="tags")


class SearchHistory(Base):
    """
    SearchHistory model representing a record of a search query executed by a user.
    """
    __tablename__ = "search_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="search", default="search"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="search_histories")


class Conversation(Base):
    """
    Conversation model representing a stateless chat session.
    """
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_pinned: Mapped[bool] = mapped_column(default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), default=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[List["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    """
    Message model representing a turn inside a Conversation.
    """
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    answer_mode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    @property
    def referenced_files(self) -> List[str]:
        if not self.sources:
            return []
        seen = set()
        filenames = []
        for src in self.sources:
            if isinstance(src, dict) and "filename" in src:
                fname = src["filename"]
                if fname not in seen:
                    seen.add(fname)
                    filenames.append(fname)
        return filenames
