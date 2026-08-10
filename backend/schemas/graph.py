"""
Pydantic schemas for Knowledge Graph API response.

Note:
  Node `id` values are UUID strings serialized into a single namespace shared by
  both File and Tag entities. While UUID entropy ensures global uniqueness across tables,
  frontend consumers (such as graph visualizers) must treat `id` as globally unique
  across all node types.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict


class GraphNodeSchema(BaseModel):
    """
    Schema representing a single node in the knowledge graph.
    Can be either a 'file' node or a 'tag' node.
    """
    id: str
    type: Literal["file", "tag"]
    label: str
    source_type: Optional[str] = None
    summary_snippet: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GraphEdgeSchema(BaseModel):
    """
    Schema representing a connection between two nodes in the knowledge graph.
    Can be a file-to-file 'similarity' edge (with numeric weight) or a file-to-tag 'tag' edge.
    """
    source: str
    target: str
    type: Literal["similarity", "tag"]
    weight: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class GraphResponseSchema(BaseModel):
    """
    Schema representing the complete knowledge graph payload with nodes and edges.
    """
    nodes: List[GraphNodeSchema]
    edges: List[GraphEdgeSchema]

    model_config = ConfigDict(from_attributes=True)
