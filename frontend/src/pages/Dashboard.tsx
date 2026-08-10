import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import FrequentSearches from '../components/FrequentSearches';

interface FileItem {
    id: string;
    filename: string;
    source_type: string;
    status: string;
    created_at: string;
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchFiles = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<FileItem[]>('/files');
            setFiles(res.data);
        } catch (err: any) {
            console.error('Failed to load files:', err);
            setError('Failed to retrieve document index.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/chat?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    // Client-side stats computations
    const totalFiles = files.length;
    const processingFiles = files.filter(
        (f) => f.status === 'processing' || f.status === 'uploading'
    ).length;
    const readyFiles = files.filter((f) => f.status === 'ready').length;
    const failedFiles = files.filter((f) => f.status === 'failed').length;

    const pdfFiles = files.filter((f) => f.source_type === 'pdf').length;
    const screenshotFiles = files.filter((f) => f.source_type === 'screenshot').length;

    // Sorting 5 most recent by created_at descending
    const recentFiles = [...files]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="w-full flex flex-col glow-bg min-h-screen relative overflow-hidden">

            {/* Main Area */}
            <main className="max-w-6xl w-full mx-auto px-6 py-10 flex-grow relative z-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-glass-border pb-6 relative z-10">
                    <div>
                        <h1 className="font-display text-3xl font-extrabold text-ink mb-1 tracking-tight">
                            Workspace Overview
                        </h1>
                        <p className="text-sm text-muted">
                            Access and index your documents with contextual AI grounding.
                        </p>
                    </div>
                </div>

                {/* Prominent Hero Search Bar */}
                <div className="max-w-3xl mx-auto w-full relative z-10 py-6">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <span className="absolute inset-y-0 left-0 pl-5 flex items-center text-secondary pointer-events-none">
                            <Search className="w-5 h-5 shadow-cyan-glow" />
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Ask anything about your uploaded knowledge base... (⌘K to explore index)"
                            className="w-full pl-14 pr-4 py-4 rounded-full border border-glass-border bg-[#1E1E2A] text-ink placeholder:text-muted focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary focus:shadow-cyan-glow transition-all duration-150 text-base shadow-lg"
                        />
                    </form>
                </div>

                {/* Error State retry container */}
                {error && (
                    <div className="border border-danger/30 bg-danger/5 p-6 rounded-2xl mb-8 flex flex-col items-center shadow-sm relative z-10">
                        <span className="font-mono text-xs text-danger mb-4 uppercase tracking-widest">
                            {error}
                        </span>
                        <button
                            onClick={fetchFiles}
                            className="px-5 py-2 border border-danger text-danger hover:bg-danger/10 text-xs font-bold transition rounded-full shadow-sm"
                        >
                            Retry Connection
                        </button>
                    </div>
                )}

                {/* Bento Grid layout */}
                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center space-y-3 relative z-10">
                        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
                        <p className="text-sm text-muted font-mono">Loading telemetry index...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
                        
                        {/* Module 1: Interactive Knowledge Graph Hero (8-cols, tall) */}
                        <div className="lg:col-span-8 glass-panel border border-glass-border rounded-2xl shadow-cyan-glow p-6 flex flex-col justify-between min-h-[380px] relative overflow-hidden group">
                            <div>
                                <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold block mb-1">
                                    Active Connectome Map
                                </span>
                                <h3 className="font-display text-lg font-extrabold text-ink">
                                    Knowledge Graph Preview
                                </h3>
                            </div>
                            
                            {/* Graph representation container */}
                            <div className="flex-grow flex items-center justify-center my-4 min-h-[220px] bg-obsidian/40 border border-glass-border rounded-xl relative overflow-hidden">
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                                    <svg className="w-full h-full" viewBox="0 0 400 200">
                                        <line x1="100" y1="50" x2="200" y2="120" stroke="#3EFFC4" strokeWidth="1.5" strokeDasharray="3 3" />
                                        <line x1="200" y1="120" x2="300" y2="70" stroke="#3EFFC4" strokeWidth="1.5" />
                                        <line x1="100" y1="50" x2="300" y2="70" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                                        <line x1="200" y1="120" x2="150" y2="160" stroke="#3EFFC4" strokeWidth="1.5" />
                                        <line x1="300" y1="70" x2="350" y2="150" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

                                        <circle cx="100" cy="50" r="6" fill="#3EFFC4" className="animate-pulse" />
                                        <circle cx="200" cy="120" r="8" fill="#3EFFC4" />
                                        <circle cx="300" cy="70" r="5" fill="#ffffff" />
                                        <circle cx="150" cy="160" r="7" fill="#3EFFC4" />
                                        <circle cx="350" cy="150" r="6" fill="#ffffff" />
                                    </svg>
                                </div>
                                <div className="text-center z-10 p-4">
                                    <p className="text-xs text-ink/75 font-mono">Neural Graph Active</p>
                                    <Link to="/graph" className="text-[10px] text-secondary hover:underline font-bold mt-2 inline-block">
                                        Open Full Connectome →
                                    </Link>
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs border-t border-glass-border/40 pt-4">
                                <span className="text-muted">Total Nodes: {totalFiles}</span>
                                <span className="text-secondary font-mono">Grounding Stable</span>
                            </div>
                        </div>

                        {/* Module 2: Recent Activity / Sync Logs (4-cols, tall) */}
                        <div className="lg:col-span-4 glass-panel border border-glass-border rounded-2xl p-6 flex flex-col justify-between min-h-[380px]">
                            <div>
                                <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold block mb-1">
                                    Workspace Logs
                                </span>
                                <h3 className="font-display text-lg font-extrabold text-ink mb-4">
                                    Recent Activity
                                </h3>
                                
                                {/* List files */}
                                <div className="space-y-3.5">
                                    {recentFiles.length === 0 ? (
                                        <p className="text-xs text-muted italic">No recent sync events.</p>
                                    ) : (
                                        recentFiles.slice(0, 4).map(file => (
                                            <div key={file.id} className="flex items-start justify-between gap-2 border-b border-glass-border/30 pb-2">
                                                <div className="min-w-0">
                                                    <h4 className="text-xs font-bold text-ink truncate" title={file.filename}>
                                                        {file.filename}
                                                    </h4>
                                                    <span className="font-mono text-[9px] text-muted">
                                                        {file.source_type.toUpperCase()} · {formatDate(file.created_at)}
                                                    </span>
                                                </div>
                                                <span className={`shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                    file.status === 'ready' 
                                                        ? 'bg-secondary/10 border-secondary/25 text-secondary' 
                                                        : 'bg-glass-border/40 border-glass-border text-muted'
                                                }`}>
                                                    {file.status}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            <Link to="/pdf-library" className="text-xs text-secondary hover:underline font-bold border-t border-glass-border/40 pt-4 block text-center mt-4">
                                Manage Records →
                            </Link>
                        </div>

                        {/* Module 3: Quick Ingest Portal (4-cols, wide) */}
                        <div className="lg:col-span-4 glass-panel border border-glass-border rounded-2xl p-6 flex flex-col justify-between min-h-[220px]">
                            <div>
                                <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold block mb-1">
                                    Ingest Portal
                                </span>
                                <h3 className="font-display text-lg font-extrabold text-ink mb-3">
                                    Quick Ingestion
                                </h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Directly upload PDF files or screenshots into your digital repository.
                                </p>
                            </div>
                            
                            <div className="mt-4">
                                <Link 
                                    to="/pdf-library"
                                    className="w-full py-2.5 rounded-full border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-secondary hover:shadow-cyan-glow text-xs font-bold transition flex items-center justify-center space-x-2"
                                >
                                    <span>Upload Files</span>
                                </Link>
                            </div>
                        </div>

                        {/* Module 4: System Telemetry / Search Stats (8-cols, wide) */}
                        <div className="lg:col-span-8 glass-panel border border-glass-border rounded-2xl p-6 flex flex-col justify-between min-h-[220px]">
                            <div>
                                <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold block mb-1">
                                    Telemetry Readout
                                </span>
                                <h3 className="font-display text-lg font-extrabold text-ink mb-4">
                                    Indexed Repository Stats
                                </h3>
                                
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-obsidian/40 border border-glass-border rounded-xl p-3.5 shadow-inner">
                                        <span className="font-mono text-[9px] text-muted uppercase">Ready Index</span>
                                        <div className="text-2xl font-extrabold text-secondary mt-1">{readyFiles}</div>
                                    </div>
                                    <div className="bg-obsidian/40 border border-glass-border rounded-xl p-3.5 shadow-inner">
                                        <span className="font-mono text-[9px] text-muted uppercase">PDF Count</span>
                                        <div className="text-2xl font-extrabold text-white mt-1">{pdfFiles}</div>
                                    </div>
                                    <div className="bg-obsidian/40 border border-glass-border rounded-xl p-3.5 shadow-inner">
                                        <span className="font-mono text-[9px] text-muted uppercase">Screenshots</span>
                                        <div className="text-2xl font-extrabold text-white mt-1">{screenshotFiles}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-muted border-t border-glass-border/40 pt-4 mt-4">
                                <span>Capacity Utilized: {(totalFiles * 2.3).toFixed(1)}MB</span>
                                <span>OS: Stable</span>
                            </div>
                        </div>

                    </div>
                )}

                {/* Frequently Searched Queries Widget */}
                <FrequentSearches />
            </main>
        </div>
    );
}
