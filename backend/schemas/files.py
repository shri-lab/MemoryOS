"""
Pydantic schemas for File upload and management endpoints.
Fills in Task 2.1 schemas.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from constants import SourceType, FileStatus


class FileUploadResponse(BaseModel):
    """
    Response schema returned immediately upon starting a file upload.
    """
    id: UUID
    filename: str
    status: FileStatus

    model_config = ConfigDict(from_attributes=True)


class FileListItem(BaseModel):
    """
    Schema representing a single file item in a listed collection.
    """
    id: UUID
    filename: str
    source_type: SourceType
    status: FileStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FileDetail(BaseModel):
    """
    Detailed schema representing a single file, including any extracted summary.
    """
    id: UUID
    filename: str
    source_type: SourceType
    status: FileStatus
    summary: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SummarizeResponseSchema(BaseModel):
    """
    Schema representing the manually triggered document summary and topic tags response.
    """
    summary: Optional[str] = None
    topics: list[str] = []

    model_config = ConfigDict(from_attributes=True)
