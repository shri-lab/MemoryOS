"""
Pydantic schemas for search requests and responses.
Fills in Task 2.3 search schemas.
"""

from uuid import UUID
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from constants import TOP_K_RETRIEVAL


class SearchRequestSchema(BaseModel):
    """Schema representing a semantic search request query."""
    query: str = Field(..., description="The natural language search query.")
    top_k: int = Field(
        default=TOP_K_RETRIEVAL, 
        ge=1, 
        le=50, 
        description="The maximum number of matches to retrieve."
    )


class SearchResultSchema(BaseModel):
    """Schema representing an individual search result item (matched text chunk)."""
    chunk_id: UUID
    file_id: UUID
    content: str
    page_number: Optional[int] = None
    score: float
    filename: str

    class Config:
        from_attributes = True


class SearchResponseSchema(BaseModel):
    """Schema representing the collection of matching search results returned to the user."""
    query: str
    results: List[SearchResultSchema]


class QaRequestSchema(BaseModel):
    """Schema representing a request to answer a question from document context."""
    question: str = Field(..., description="The user's query or question.")


class QaSourceSchema(BaseModel):
    """Schema representing a cited source chunk referenced in the QA answer."""
    file_id: UUID
    filename: str
    page_number: Optional[int] = None
    chunk_snippet: str
    similarity_score: float

    class Config:
        from_attributes = True


class QaResponseSchema(BaseModel):
    """Schema representing the grounded answer response including matching source citations."""
    question: str
    answer: str
    sources: List[QaSourceSchema]


class UnifiedSearchResultSchema(BaseModel):
    """
    Schema representing a matched text chunk result in a unified search context.
    """
    id: UUID
    file_id: UUID
    filename: str
    source_type: str
    page_number: Optional[int] = None
    content: str
    confidence_score: float

    class Config:
        from_attributes = True


class UnifiedSearchRequestSchema(BaseModel):
    """
    Request schema for cross-document unified semantic search.
    """
    query: str
    source_type: Optional[Literal["pdf", "screenshot"]] = None
    top_k: Optional[int] = None


class UnifiedSearchResponseSchema(BaseModel):
    """
    Response schema returning list of matching ranked result items.
    """
    query: str
    results: List[UnifiedSearchResultSchema]
