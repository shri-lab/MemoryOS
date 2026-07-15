import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

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
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
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

    const formatStatusBadge = (status: string) => {
        let dotColor = 'bg-status-amber';
        if (status === 'ready') {
            dotColor = 'bg-status-moss';
        } else if (status === 'failed') {
            dotColor = 'bg-status-brick';
        }
        return (
            <div className="flex items-center space-x-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                <span className="font-mono text-xs uppercase tracking-wider text-ink/75">
                    {status}
                </span>
            </div>
        );
    };

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
        <div className="w-full flex flex-col">
            {/* Main Area */}
            <main className="max-w-4xl w-full mx-auto px-6 py-10 flex-grow">
                <div className="mb-8">
                    <h1 className="font-serif text-3xl font-normal text-indigo-deep mb-1">
                        Workspace Overview
                    </h1>
                    <p className="text-xs text-ink/50">
                        Access and index your documents with contextual AI grounding.
                    </p>
                </div>

                {/* Stats Row Grid Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Stat Card 1 */}
                    <div className="bg-paper border border-ink/5 rounded-xl shadow-[0_4px_20px_rgba(30,27,75,0.02)] p-6 flex flex-col justify-between min-h-[110px]">
                        <span className="font-sans uppercase text-[10px] tracking-widest text-ink/50 font-semibold block mb-2">
                            Total Files
                        </span>
                        <span className="text-3xl font-bold text-indigo-deep font-sans leading-none">
                            {totalFiles}
                        </span>
                    </div>

                    {/* Stat Card 2 */}
                    <div className="bg-paper border border-ink/5 rounded-xl shadow-[0_4px_20px_rgba(30,27,75,0.02)] p-6">
                        <span className="font-sans uppercase text-[10px] tracking-widest text-ink/50 font-semibold block mb-2">
                            Status Breakdown
                        </span>
                        <div className="flex flex-col space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-status-moss" />
                                    <span className="text-ink/65 font-medium">Ready</span>
                                </div>
                                <span className="font-semibold text-indigo-deep">{readyFiles}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-status-amber" />
                                    <span className="text-ink/65 font-medium">Processing</span>
                                </div>
                                <span className="font-semibold text-indigo-deep">{processingFiles}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center space-x-2">
                                    <span className="w-2 h-2 rounded-full bg-status-brick" />
                                    <span className="text-ink/65 font-medium">Failed</span>
                                </div>
                                <span className="font-semibold text-indigo-deep">{failedFiles}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Card 3 */}
                    <div className="bg-paper border border-ink/5 rounded-xl shadow-[0_4px_20px_rgba(30,27,75,0.02)] p-6">
                        <span className="font-sans uppercase text-[10px] tracking-widest text-ink/50 font-semibold block mb-2">
                            Document Type
                        </span>
                        <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-ink/65 font-medium">PDFs</span>
                                <span className="font-semibold text-indigo-deep">{pdfFiles}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-ink/65 font-medium">Screenshots</span>
                                <span className="font-semibold text-indigo-deep">{screenshotFiles}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search Bar with Leading Search Icon */}
                <div className="mb-8">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-ink/40 pointer-events-none">
                            <Search className="w-4 h-4" />
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search your documents"
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-ink/15 bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-indigo-primary focus:ring-1 focus:ring-indigo-primary transition-all duration-150 text-sm shadow-sm"
                        />
                    </form>
                </div>

                {/* Error State retry container */}
                {error && (
                    <div className="border border-status-brick/30 bg-status-brick/5 p-6 rounded-xl mb-8 flex flex-col items-center shadow-sm">
                        <span className="font-mono text-xs text-status-brick mb-4 uppercase tracking-widest">
                            {error}
                        </span>
                        <button
                            onClick={fetchFiles}
                            className="font-sans px-4 py-1.5 border border-indigo-primary text-indigo-primary hover:bg-indigo-primary/5 text-xs font-semibold transition rounded-lg"
                        >
                            Retry Connection
                        </button>
                    </div>
                )}

                {/* Content Section Card container */}
                <div className="min-h-[250px]">
                    {loading ? (
                        /* Loading Skeleton list */
                        <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl p-6 divide-y divide-ink/10">
                            {[1, 2, 3].map((n) => (
                                <div key={n} className="flex justify-between py-5 first:pt-0 last:pb-0 animate-pulse">
                                    <div className="space-y-2 w-1/3">
                                        <div className="h-4 bg-ink/10 rounded w-3/4" />
                                        <div className="h-3 bg-ink/5 rounded w-1/2" />
                                    </div>
                                    <div className="h-4 bg-ink/10 rounded w-16 align-middle self-center" />
                                </div>
                            ))}
                        </div>
                    ) : files.length === 0 ? (
                        /* Empty State: Fraunces italic headline + CTA link */
                        <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl py-16 px-6 text-center">
                            <h3 className="font-serif italic text-2xl text-ink/70 mb-2">
                                Nothing here yet
                            </h3>
                            <p className="font-sans text-sm text-ink/50">
                                Add your first document to the <a href="/pdf-library" className="text-indigo-primary hover:underline font-semibold">PDF Library</a> to get started.
                            </p>
                        </div>
                    ) : (
                        /* Recent Files Card List */
                        <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl p-6">
                            <div className="mb-4">
                                <span className="font-sans uppercase text-[10px] tracking-widest text-indigo-deep/50 font-bold block">
                                    Recent Documents
                                </span>
                            </div>
                            <div className="divide-y divide-ink/10">
                                {recentFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between py-4 first:pt-0 last:pb-0"
                                    >
                                        <div className="mb-2 sm:mb-0">
                                            <h4 className="font-sans text-sm font-medium text-ink">
                                                {file.filename}
                                            </h4>
                                            <span className="font-sans text-[10px] text-ink/40 block mt-0.5">
                                                {file.source_type.toUpperCase()} · {formatDate(file.created_at)}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-6">
                                            {formatStatusBadge(file.status)}
                                            <span className="font-mono text-[10px] text-ink/30 select-none hidden md:inline">
                                                ID: {file.id.slice(0, 8)}...
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
