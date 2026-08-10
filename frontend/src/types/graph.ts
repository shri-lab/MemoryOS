/**
 * TypeScript interfaces matching backend GraphResponseSchema payload.
 */

export interface GraphNode {
    id: string;
    type: 'file' | 'tag';
    label: string;
    source_type?: string;
    summary_snippet?: string;
    /** Degree (count of connected edges) computed pre-render */
    val?: number;
    /** Physics simulation coordinates populated by ForceGraph2D */
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
}

export interface GraphEdge {
    source: string | GraphNode;
    target: string | GraphNode;
    type: 'similarity' | 'tag';
    weight?: number | null;
}

export interface GraphResponse {
    nodes: GraphNode[];
    edges: GraphEdge[];
}
