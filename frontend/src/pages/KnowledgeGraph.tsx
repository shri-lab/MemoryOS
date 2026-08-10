import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { forceCollide, forceCenter } from 'd3-force';
import { Loader2, Share2, Info, Search, Eye, EyeOff, Sliders, RefreshCw, X, FileText, Image as ImageIcon } from 'lucide-react';
import api from '../services/api';
import { GraphNode, GraphEdge, GraphResponse } from '../types/graph';
import { getGraphTheme } from '../theme/graphTheme';
import FilePreviewModal from '../components/FilePreviewModal';
import { useThemeStore } from '../store/themeStore';

export default function KnowledgeGraph() {
    const [graphData, setGraphData] = useState<GraphResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [previewFileId, setPreviewFileId] = useState<string | null>(null);

    // Controls bar state
    const [showTags, setShowTags] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.35);
    const [minTagSharedFiles, setMinTagSharedFiles] = useState<number>(2);

    // Interactive selection & hover state (Single source of truth)
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Pre-computed adjacency lookup maps
    const [neighborsMap, setNeighborsMap] = useState<Map<string, Set<string>>>(new Map());

    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

    // Active theme colors
    const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
    const isDark = resolvedTheme === 'dark';
    const theme = useMemo(() => getGraphTheme(isDark), [isDark]);

    // ResizeObserver for dynamic, responsive canvas measurement
    useEffect(() => {
        if (loading || !containerRef.current) return;

        const el = containerRef.current;
        const updateDimensions = () => {
            if (el) {
                const rect = el.getBoundingClientRect();
                const w = Math.floor(rect.width || el.clientWidth);
                const h = Math.floor(rect.height || el.clientHeight);
                if (w > 0 && h > 0) {
                    setContainerDimensions((prev) => {
                        if (Math.abs(prev.width - w) > 2 || Math.abs(prev.height - h) > 2) {
                            return { width: w, height: h };
                        }
                        return prev;
                    });
                }
            }
        };

        updateDimensions();

        const observer = new ResizeObserver(() => {
            updateDimensions();
        });
        observer.observe(el);

        window.addEventListener('resize', updateDimensions);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateDimensions);
        };
    }, [loading, graphData]);

    // Fetch GET /graph with query parameters
    const fetchGraphData = useCallback(async (simCutoff: number, minTagFiles: number) => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.get<GraphResponse>('/graph', {
                params: {
                    similarity_threshold: simCutoff,
                    min_tag_shared_files: minTagFiles,
                },
            });

            // CRITICAL: Degree & Adjacency Calculation Timing
            // react-force-graph mutates edge.source/.target in place from string IDs to node objects.
            // Degree and neighbors MUST be computed exactly once using raw string IDs before passing to ForceGraph2D.
            const degreeMap = new Map<string, number>();
            const adjMap = new Map<string, Set<string>>();

            res.data.edges.forEach((edge) => {
                const srcId = typeof edge.source === 'string' ? edge.source : (edge.source as any).id;
                const tgtId = typeof edge.target === 'string' ? edge.target : (edge.target as any).id;

                if (srcId && tgtId) {
                    degreeMap.set(srcId, (degreeMap.get(srcId) || 0) + 1);
                    degreeMap.set(tgtId, (degreeMap.get(tgtId) || 0) + 1);

                    if (!adjMap.has(srcId)) adjMap.set(srcId, new Set());
                    if (!adjMap.has(tgtId)) adjMap.set(tgtId, new Set());

                    adjMap.get(srcId)!.add(tgtId);
                    adjMap.get(tgtId)!.add(srcId);
                }
            });

            const processedNodes: GraphNode[] = res.data.nodes.map((node) => ({
                ...node,
                val: Math.max(1, degreeMap.get(node.id) || 1),
            }));

            setNeighborsMap(adjMap);
            setGraphData({
                nodes: processedNodes,
                edges: res.data.edges,
            });
        } catch (err: any) {
            console.error('Failed to fetch knowledge graph:', err);
            setError('Unable to load knowledge graph data.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchGraphData(similarityThreshold, minTagSharedFiles);
    }, []);

    // Debounced re-fetch when similarity threshold slider changes
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchGraphData(similarityThreshold, minTagSharedFiles);
        }, 400);
        return () => clearTimeout(handler);
    }, [similarityThreshold, minTagSharedFiles, fetchGraphData]);

    // Apply d3 physics simulation tuning (center anchoring + charge repulsion + collision radius)
    useEffect(() => {
        if (graphData && fgRef.current) {
            // Anchor center force at (0, 0) in canvas space to prevent graph from sinking/drifting vertically
            fgRef.current.d3Force('center', forceCenter(0, 0));

            // Increase charge repulsion (stronger push apart for comfortable spacing)
            fgRef.current.d3Force('charge')?.strength(-350);

            // Add collision force to prevent circles and badges from overlapping
            fgRef.current.d3Force(
                'collide',
                forceCollide((node: any) => {
                    const val = node.val || 1;
                    const radius = node.type === 'file' ? 6 + Math.sqrt(val) * 3 : 5 + Math.sqrt(val) * 2;
                    return radius + 16; // node radius + 16px collision padding
                })
            );

            // Link distance tuning (disperse file & tag nodes cleanly)
            fgRef.current.d3Force('link')?.distance((link: any) => (link.type === 'tag' ? 80 : 130));
        }
    }, [graphData]);

    // Zoom-to-fit whenever data or container dimensions change
    useEffect(() => {
        if (graphData && fgRef.current && containerDimensions.width > 0) {
            const timer = setTimeout(() => {
                fgRef.current?.zoomToFit(400, 80);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [graphData, containerDimensions.width, containerDimensions.height]);

    // Filter rendered graph data based on "Show Tags" toggle
    const renderedGraphData = useMemo(() => {
        if (!graphData) return { nodes: [], edges: [] };
        if (showTags) return { nodes: graphData.nodes, edges: graphData.edges };

        const fileNodes = graphData.nodes.filter((n) => n.type === 'file');
        const fileNodeIds = new Set(fileNodes.map((n) => n.id));
        const simEdges = graphData.edges.filter((e) => {
            const srcId = typeof e.source === 'string' ? e.source : (e.source as any).id;
            const tgtId = typeof e.target === 'string' ? e.target : (e.target as any).id;
            return e.type === 'similarity' && fileNodeIds.has(srcId) && fileNodeIds.has(tgtId);
        });

        return { nodes: fileNodes, edges: simEdges };
    }, [graphData, showTags]);

    // STABLE OBJECT IDENTITY FOR ForceGraph2D
    // Keyed ONLY on renderedGraphData. Prevents re-renders (hover, click, search) from recreating graphData object.
    const memoizedForceGraphData = useMemo(() => {
        return {
            nodes: renderedGraphData.nodes,
            links: renderedGraphData.edges,
        };
    }, [renderedGraphData]);

    // Filtered list of file-type nodes for the document sidebar
    const sidebarFileNodes = useMemo(() => {
        if (!graphData) return [];
        return graphData.nodes.filter((n) => n.type === 'file');
    }, [graphData]);

    // Compute active neighborhood highlighting
    const activeFocusNodeId = hoveredNodeId || selectedNodeId;
    const activeNeighborhood = useMemo(() => {
        if (!activeFocusNodeId) return null;
        const neighbors = neighborsMap.get(activeFocusNodeId) || new Set<string>();
        const set = new Set<string>(neighbors);
        set.add(activeFocusNodeId);
        return set;
    }, [activeFocusNodeId, neighborsMap]);

    // Compute text search filter matching set
    const searchMatchingNodeIds = useMemo(() => {
        if (!searchQuery.trim() || !graphData) return null;
        const q = searchQuery.toLowerCase().trim();
        const set = new Set<string>();
        graphData.nodes.forEach((n) => {
            if (n.label.toLowerCase().includes(q)) {
                set.add(n.id);
            }
        });
        return set;
    }, [searchQuery, graphData]);

    // Handle Node Clicks directly on canvas
    const handleNodeClick = (node: any) => {
        // Tag nodes are click-guarded (no modal opening, hover-only)
        if (node.type !== 'file') {
            setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
            return;
        }

        setSelectedNodeId(node.id === selectedNodeId ? null : node.id);

        // Bumps recency in Recently Viewed files
        api.post(`/files/${node.id}/view`).catch((err) => {
            console.warn('Failed to record file view:', err);
        });

        setPreviewFileId(node.id);
    };

    // Handle Sidebar Row Clicks: Selects node, triggers centerAt + zoom, highlights neighborhood
    const handleSidebarRowClick = (fileId: string) => {
        if (selectedNodeId === fileId) {
            setSelectedNodeId(null);
        } else {
            setSelectedNodeId(fileId);

            // Find latest node coordinates in physics simulation
            const physicsNode = graphData?.nodes.find((n) => n.id === fileId);
            if (physicsNode && physicsNode.x !== undefined && physicsNode.y !== undefined && fgRef.current) {
                fgRef.current.centerAt(physicsNode.x, physicsNode.y, 400);
                fgRef.current.zoom(2.0, 400);
            }
        }
    };

    // Custom Canvas Node Renderer
    const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const { x, y, type, label, val = 1, id } = node;
        if (x === undefined || y === undefined) return;

        const isHovered = hoveredNodeId === id;
        const isSelected = selectedNodeId === id;
        const isFocused = isHovered || isSelected;

        // Determine node opacity based on neighborhood selection & search query
        let opacity = 1.0;
        if (activeNeighborhood) {
            opacity = activeNeighborhood.has(id) ? 1.0 : 0.15;
        } else if (searchMatchingNodeIds) {
            opacity = searchMatchingNodeIds.has(id) ? 1.0 : 0.20;
        }

        const baseRadius = type === 'file' ? 6 + Math.sqrt(val) * 3 : 5 + Math.sqrt(val) * 2;
        const radius = isFocused ? baseRadius * 1.3 : baseRadius;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (type === 'file') {
            // File Nodes: Pulsing Mint Circle
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = isFocused ? '#3EFFC4' : theme.fileNodeFill;
            ctx.fill();
            ctx.lineWidth = isFocused ? 2.5 : 1.5;
            ctx.strokeStyle = isFocused ? 'rgba(62, 255, 196, 0.8)' : theme.fileNodeStroke;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.35, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#0A0A0F';
            ctx.fill();
        } else {
            // Tag Nodes: White Rounded Badge
            const rectWidth = radius * 2.2;
            const rectHeight = radius * 1.6;
            const rectX = x - rectWidth / 2;
            const rectY = y - rectHeight / 2;
            const cornerRadius = 4;

            ctx.beginPath();
            ctx.roundRect(rectX, rectY, rectWidth, rectHeight, cornerRadius);
            ctx.fillStyle = isFocused ? '#FFFFFF' : theme.tagNodeFill;
            ctx.fill();
            ctx.lineWidth = isFocused ? 2.5 : 1.5;
            ctx.strokeStyle = isFocused ? 'rgba(255, 255, 255, 0.8)' : theme.tagNodeStroke;
            ctx.stroke();
        }

        // Obsidian-Style Label Zoom Threshold
        // Labels hide by default when zoomed out (globalScale <= 1.4) unless node is focused or in active neighborhood
        const shouldDrawLabel =
            globalScale > 1.4 ||
            isFocused ||
            (activeNeighborhood && activeNeighborhood.has(id));

        if (shouldDrawLabel) {
            // Fix font scaling to prevent massive font sizes when zoomed out
            const fontSize = Math.min(12, Math.max(8, 11 / Math.max(0.5, globalScale)));
            ctx.font = `${isFocused ? '600' : '500'} ${fontSize}px "IBM Plex Sans", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = type === 'file' ? theme.fileNodeText : theme.tagNodeText;

            // Truncate long labels on canvas to prevent overlapping
            const rawLabel = type === 'tag' ? `#${label}` : label;
            const labelText = rawLabel.length > 20 && !isFocused ? `${rawLabel.slice(0, 18)}...` : rawLabel;
            ctx.fillText(labelText, x, y + radius + 4);
        }

        ctx.restore();
    };

    // Find hovered node object for floating tooltip
    const hoveredNodeObj = useMemo(() => {
        if (!hoveredNodeId || !graphData) return null;
        return graphData.nodes.find((n) => n.id === hoveredNodeId) || null;
    }, [hoveredNodeId, graphData]);

    if (loading && !graphData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] w-full bg-glass/40 border border-glass-border shadow-sm p-12 rounded-2xl">
                <Loader2 className="w-8 h-8 text-secondary animate-spin mb-3 shadow-cyan-glow" />
                <span className="font-mono text-xs text-muted font-bold tracking-widest uppercase">
                    Loading Knowledge Graph...
                </span>
            </div>
        );
    }

    if (error && !graphData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] w-full bg-danger/5 border border-danger/30 rounded-2xl p-8 text-center">
                <div className="p-3 bg-danger/10 text-danger rounded-full mb-3 shadow-violet-glow">
                    <Info className="w-6 h-6" />
                </div>
                <h3 className="font-display text-base font-bold text-ink mb-1">Graph Load Error</h3>
                <p className="font-mono text-xs text-danger max-w-md mb-4">{error}</p>
                <button
                    onClick={() => fetchGraphData(similarityThreshold, minTagSharedFiles)}
                    className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-danger to-danger/80 hover:to-danger/95 text-white rounded-full text-xs font-bold transition-all shadow-violet-glow"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                </button>
            </div>
        );
    }

    // Friendly Empty State (0 ready nodes)
    if (!graphData || graphData.nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[480px] w-full bg-glass/30 rounded-2xl border border-glass-border shadow-sm p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-glass border border-glass-border text-secondary flex items-center justify-center mb-4 shadow-cyan-glow">
                    <Share2 className="w-7 h-7" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink mb-2">
                    Your Knowledge Graph is Empty
                </h3>
                <p className="text-xs text-muted max-w-sm leading-relaxed mb-6">
                    Upload and tag a few files to automatically visualize semantic relationships and topic tags across your personal repository.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col space-y-3 w-full flex-1 h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)] overflow-hidden glow-bg text-ink relative">

            {/* Header section */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 shrink-0 relative z-10">
                <div>
                    <h1 className="font-display text-2xl font-extrabold text-ink tracking-tight">Knowledge Graph</h1>
                    <p className="text-xs text-muted mt-0.5">
                        Interactive map of semantic document similarity and topic tags.
                    </p>
                </div>
                <div className="flex items-center space-x-3 text-xs font-bold text-muted">
                    <div className="flex items-center space-x-1.5 bg-glass/40 px-2.5 py-1 rounded-full border border-glass-border shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-cyan-glow"></span>
                        <span>File</span>
                    </div>
                    <div className="flex items-center space-x-1.5 bg-glass/40 px-2.5 py-1 rounded-full border border-glass-border shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-sm bg-white shadow-cyan-glow"></span>
                        <span>Tag</span>
                    </div>
                    <div className="flex items-center space-x-1.5 bg-glass/40 px-2.5 py-1 rounded-full border border-glass-border shadow-sm">
                        <span className="w-4 h-0.5 bg-secondary/65"></span>
                        <span>Similarity</span>
                    </div>
                    <div className="flex items-center space-x-1.5 bg-glass/40 px-2.5 py-1 rounded-full border border-glass-border shadow-sm">
                        <span className="w-4 h-0.5 border-t border-dashed border-white/65"></span>
                        <span>Tag Link</span>
                    </div>
                </div>
            </div>

            {/* Obsidian Controls Bar */}
            <div className="bg-glass/40 border border-glass-border rounded-xl p-3 shadow-inner flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 relative z-10">
                <div className="flex items-center space-x-4">
                    {/* Toggle: Show Tags */}
                    <button
                        onClick={() => setShowTags(!showTags)}
                        className="flex items-center space-x-2 px-4 py-1.5 rounded-full border transition-all bg-glass/40 border-glass-border text-ink hover:text-secondary hover:border-secondary/40 hover:bg-glass/80"
                    >
                        {showTags ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>Show Tags</span>
                    </button>

                    {/* Search Filter Box */}
                    <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5" />
                        <input
                            type="text"
                            placeholder="Filter node labels..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-7 py-1.5 bg-[#1E1E2A] border border-glass-border rounded-full text-xs text-ink focus:outline-none focus:border-secondary placeholder:text-muted focus:shadow-cyan-glow w-48 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 text-muted hover:text-ink p-0.5"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Similarity Threshold Slider */}
                <div className="flex items-center space-x-3 bg-glass/40 border border-glass-border px-3 py-1.5 rounded-full shadow-inner">
                    <Sliders className="w-3.5 h-3.5 text-secondary shrink-0" />
                    <span className="text-muted font-bold whitespace-nowrap">
                        Min Similarity: <span className="font-mono text-secondary font-bold">{similarityThreshold.toFixed(2)}</span>
                    </span>
                    <input
                        type="range"
                        min="0.10"
                        max="0.90"
                        step="0.05"
                        value={similarityThreshold}
                        onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                        className="w-28 accent-secondary cursor-pointer shadow-cyan-glow"
                    />
                </div>
            </div>

            {/* Main Content Layout: Graph Canvas + Document Sidebar */}
            <div className="flex flex-col lg:flex-row gap-3 w-full flex-1 min-h-0 overflow-hidden relative z-10">
                {/* Canvas Container */}
                <div
                    ref={containerRef}
                    className="relative flex-1 bg-obsidian border border-glass-border rounded-2xl shadow-cyan-glow overflow-hidden select-none h-full animate-fadeIn"
                >
                    <ForceGraph2D
                        ref={fgRef as any}
                        width={containerDimensions.width}
                        height={containerDimensions.height}
                        graphData={memoizedForceGraphData}
                        cooldownTicks={120}
                        d3AlphaDecay={0.04}
                        d3VelocityDecay={0.4}
                        backgroundColor={theme.canvasBg}
                        onEngineStop={() => {
                            console.log('KnowledgeGraph physics simulation engine stopped.');
                        }}
                        nodeCanvasObject={drawNode}
                        nodePointerAreaPaint={(node: any, color, ctx) => {
                            const radius = node.type === 'file' ? 14 : 12;
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
                            ctx.fill();
                        }}
                        linkColor={(link: any) => {
                            if (!activeNeighborhood) {
                                return link.type === 'tag' ? theme.tagEdgeStroke : theme.similarityEdgeStroke;
                            }
                            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
                            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                            const isConnectedToFocus = srcId === activeFocusNodeId || tgtId === activeFocusNodeId;

                            if (isConnectedToFocus) {
                                return link.type === 'tag' ? 'rgba(6, 182, 212, 0.9)' : 'rgba(139, 92, 246, 0.9)';
                            }
                            return 'rgba(200, 200, 220, 0.04)'; // Dim non-neighborhood links
                        }}
                        linkWidth={(link: any) => {
                            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
                            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                            const isConnectedToFocus = srcId === activeFocusNodeId || tgtId === activeFocusNodeId;

                            const baseWidth = link.type === 'similarity' ? Math.max(1, (link.weight || 0.35) * 3.5) : 1.2;
                            return isConnectedToFocus ? baseWidth * 1.8 : baseWidth;
                        }}
                        linkLineDash={(link: any) => (link.type === 'tag' ? [3, 3] : null)}
                        onNodeClick={handleNodeClick}
                        onNodeHover={(node: any) => setHoveredNodeId(node ? node.id : null)}
                        onBackgroundClick={() => setSelectedNodeId(null)}
                        enableNodeDrag={true}
                        enableZoomInteraction={true}
                        enablePanInteraction={true}
                    />

                    {/* Floating Tooltip Card */}
                    {hoveredNodeObj && (
                        <div className="absolute top-4 left-4 z-20 pointer-events-none bg-glass/95 backdrop-blur-xl border border-glass-border rounded-2xl shadow-cyan-glow p-3 max-w-xs animate-fadeIn text-ink">
                            <div className="flex items-center space-x-2 mb-1">
                                <span
                                    className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                                        hoveredNodeObj.type === 'file'
                                            ? 'bg-primary/20 text-secondary border-secondary/25'
                                            : 'bg-secondary/20 text-secondary border-secondary/25'
                                    }`}
                                >
                                    {hoveredNodeObj.type}
                                </span>
                                {hoveredNodeObj.source_type && (
                                    <span className="text-[9px] font-mono text-muted uppercase">
                                        · {hoveredNodeObj.source_type}
                                    </span>
                                )}
                            </div>
                            <h4 className="font-sans text-xs font-bold text-ink truncate">
                                {hoveredNodeObj.type === 'tag' ? `#${hoveredNodeObj.label}` : hoveredNodeObj.label}
                            </h4>
                            {hoveredNodeObj.summary_snippet && (
                                <p className="font-sans text-[11px] text-ink mt-1 line-clamp-3 leading-relaxed">
                                    {hoveredNodeObj.summary_snippet}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Document Sidebar Panel */}
                <div className="w-full lg:w-80 shrink-0 bg-glass/25 backdrop-blur-xl border border-glass-border rounded-2xl shadow-sm flex flex-col p-4 overflow-hidden h-full">
                    <div className="flex items-center justify-between pb-3 border-b border-glass-border mb-3">
                        <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-primary shadow-violet-glow" />
                            <span className="font-display text-sm font-extrabold text-ink">
                                Documents ({sidebarFileNodes.length})
                            </span>
                        </div>
                        {selectedNodeId && (
                            <button
                                onClick={() => setSelectedNodeId(null)}
                                className="text-[10px] text-muted hover:text-secondary font-bold transition-colors"
                            >
                                Clear Selection
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {sidebarFileNodes.map((file) => {
                            const isSelected = selectedNodeId === file.id;
                            const isMatch = !searchMatchingNodeIds || searchMatchingNodeIds.has(file.id);

                            return (
                                <div
                                    key={file.id}
                                    onClick={() => handleSidebarRowClick(file.id)}
                                    className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer select-none duration-150 hover:scale-[1.01] ${
                                        isSelected
                                            ? 'bg-primary/20 border-secondary/40 text-secondary font-bold shadow-cyan-glow'
                                            : 'bg-glass/40 border-glass-border hover:border-secondary/40 text-ink hover:bg-glass/80'
                                    } ${!isMatch ? 'opacity-30' : 'opacity-100'}`}
                                >
                                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                        <div
                                            className={`p-1.5 rounded-full shrink-0 ${
                                                isSelected
                                                    ? 'bg-secondary text-obsidian shadow-cyan-glow'
                                                    : 'bg-secondary/15 text-secondary'
                                            }`}
                                        >
                                            {file.source_type === 'screenshot' ? (
                                                <ImageIcon className="w-3.5 h-3.5" />
                                            ) : (
                                                <FileText className="w-3.5 h-3.5" />
                                            )}
                                        </div>
                                        <span className="text-xs truncate font-sans font-bold text-ink">
                                            {file.label}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            api.post(`/files/${file.id}/view`).catch(() => {});
                                            setPreviewFileId(file.id);
                                        }}
                                        className="p-1 text-muted hover:text-secondary hover:bg-glass rounded-md border border-transparent hover:border-glass-border transition-colors ml-2 shrink-0"
                                        title="Preview document"
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* File Preview Modal integration */}
            {previewFileId && (
                <FilePreviewModal
                    fileId={previewFileId}
                    onClose={() => setPreviewFileId(null)}
                />
            )}
        </div>
    );
}
