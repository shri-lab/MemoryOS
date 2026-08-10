import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
    UploadCloud, 
    Trash2, 
    Eye, 
    RefreshCw, 
    FileText, 
    X, 
    Loader2, 
    AlertCircle,
    CheckCircle,
    Download
} from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

interface FileItem {
    id: string;
    filename: string;
    source_type: string;
    status: string;
    created_at: string;
}

interface FileDetail {
    id: string;
    filename: string;
    source_type: string;
    status: string;
    summary: string | null;
    tags?: string[];
    created_at: string;
}

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

export default function PdfLibrary() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'processing' | 'failed'>('all');

    // Upload states
    const [dragActive, setDragActive] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Detail Panel state
    const [previewFileId, setPreviewFileId] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<FileDetail | null>(null);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [summarizing, setSummarizing] = useState(false);
    const [topics, setTopics] = useState<string[]>([]);

    // Delete state
    const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

    const fetchFiles = async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get<FileItem[]>('/files');
            setFiles(res.data);
        } catch (err: any) {
            console.error('Failed to load files:', err);
            setError('Failed to retrieve document index.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchFiles();
    }, []);

    // Set first file as default preview selection
    useEffect(() => {
        if (files.length > 0 && !previewFileId) {
            setPreviewFileId(files[0].id);
        }
    }, [files]);

    // Fetch details & content blob when selected file ID changes
    useEffect(() => {
        let activeUrl: string | null = null;
        let isMounted = true;

        if (!previewFileId) {
            setPreviewFile(null);
            setContentUrl(null);
            return;
        }

        const loadDetailsAndBlob = async () => {
            setPreviewLoading(true);
            setPreviewError(null);
            setTopics([]);
            try {
                // 1. Fetch metadata detail
                const detailRes = await api.get<FileDetail>(`/files/${previewFileId}`);
                if (!isMounted) return;
                setPreviewFile(detailRes.data);
                if (detailRes.data.tags) {
                    setTopics(detailRes.data.tags);
                }

                // 2. Fetch raw content blob
                const contentRes = await api.get(`/files/${previewFileId}/content`, { responseType: 'blob' });
                if (!isMounted) return;
                const blobUrl = URL.createObjectURL(contentRes.data);
                activeUrl = blobUrl;
                setContentUrl(blobUrl);
            } catch (err: any) {
                console.error(`Failed loading preview for file ${previewFileId}:`, err);
                if (isMounted) {
                    setPreviewError('Failed to load file details or raw preview.');
                }
            } finally {
                if (isMounted) setPreviewLoading(false);
            }
        };

        loadDetailsAndBlob();

        return () => {
            isMounted = false;
            if (activeUrl) {
                URL.revokeObjectURL(activeUrl);
            }
        };
    }, [previewFileId]);

    // Polling logic for uploading/processing files
    useEffect(() => {
        const transitioningFileIds = files
            .filter(f => f.status === 'processing' || f.status === 'uploading')
            .map(f => f.id);

        if (transitioningFileIds.length === 0) return;

        const interval = setInterval(async () => {
            const promises = transitioningFileIds.map(async (id) => {
                try {
                    const res = await api.get<FileItem>(`/files/${id}`);
                    return res.data;
                } catch (err) {
                    console.error(`Failed to poll status for file ${id}`, err);
                    return null;
                }
            });

            const results = await Promise.all(promises);

            setFiles(prevFiles => {
                let updated = false;
                const nextFiles = prevFiles.map(file => {
                    const match = results.find(r => r && r.id === file.id);
                    if (match && match.status !== file.status) {
                        updated = true;
                        if (previewFileId === file.id) {
                            // Reload details if active
                            api.get<FileDetail>(`/files/${file.id}`).then(res => setPreviewFile(res.data)).catch(()=>{});
                        }
                        return { ...file, status: match.status };
                    }
                    return file;
                });
                return updated ? nextFiles : prevFiles;
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [files, previewFileId]);

    // File Drag & Drop Handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const validateAndUploadFile = (file: File) => {
        setUploadError(null);
        setUploadSuccess(null);

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setUploadError('Only PDF files are allowed.');
            return;
        }

        if (file.size > MAX_UPLOAD_SIZE) {
            setUploadError('File size exceeds the 20MB limit.');
            return;
        }

        uploadFileToServer(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndUploadFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            validateAndUploadFile(e.target.files[0]);
        }
    };

    const triggerFileBrowser = () => {
        fileInputRef.current?.click();
    };

    const handleUploadZoneKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerFileBrowser();
        }
    };

    const uploadFileToServer = async (file: File) => {
        setUploadProgress(0);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post<FileItem>('/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / (progressEvent.total || file.size)
                    );
                    setUploadProgress(percentCompleted);
                }
            });

            setUploadSuccess(`Successfully uploaded "${file.name}"`);
            setFiles(prev => [res.data, ...prev]);
            setPreviewFileId(res.data.id);
        } catch (err: any) {
            console.error('Upload failed:', err);
            setUploadError(err.response?.data?.detail || 'Failed to upload document.');
        } finally {
            setUploadProgress(null);
        }
    };

    // Manual summarization
    const handleGenerateSummary = async (fileId: string) => {
        if (summarizing) return;
        setSummarizing(true);
        try {
            const res = await api.post<{ summary: string; topics: string[] }>(`/files/${fileId}/summarize`);
            setPreviewFile(prev => prev ? { ...prev, summary: res.data.summary } : null);
            setTopics(res.data.topics);
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'ready' } : f));
        } catch (err: any) {
            console.error('Failed to summarize file:', err);
            alert(err.response?.data?.detail || 'Failed to generate summary.');
        } finally {
            setSummarizing(false);
        }
    };

    // Delete actions
    const handleDeleteConfirm = async () => {
        if (!fileToDelete) return;
        try {
            await api.delete(`/files/${fileToDelete.id}`);
        } catch (err: any) {
            if (err.response?.status !== 404) {
                console.error('Delete call failed:', err);
                alert('Failed to delete file.');
                return;
            }
        } finally {
            setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
            if (previewFileId === fileToDelete.id) {
                setPreviewFileId(null);
            }
            setFileToDelete(null);
        }
    };

    // Escape listener for dialog close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (fileToDelete) setFileToDelete(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fileToDelete]);

    const filteredFiles = files.filter(file => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'processing') return file.status === 'processing' || file.status === 'uploading';
        return file.status === statusFilter;
    });

    const formatStatusBadge = (status: string) => {
        let dotColor = 'bg-primary animate-pulse';
        let textColor = 'text-primary';
        if (status === 'ready') {
            dotColor = 'bg-success shadow-cyan-glow';
            textColor = 'text-success';
        } else if (status === 'failed') {
            dotColor = 'bg-warning shadow-violet-glow';
            textColor = 'text-warning';
        }
        return (
            <div className="flex items-center space-x-1.5 bg-glass/40 border border-glass-border px-2 py-0.5 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${dotColor}`} />
                <span className={`font-mono text-[8px] uppercase tracking-widest font-bold ${textColor}`}>
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
        <div className="w-full flex flex-col relative glow-bg min-h-screen overflow-hidden">

            {/* Main Content Area: Master-Detail Layout */}
            <main className="w-full mx-auto px-6 py-8 flex-grow relative z-10 flex flex-col h-full">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <div>
                        <h1 className="font-display text-2xl font-extrabold text-ink tracking-tight">
                            PDF Library
                        </h1>
                        <p className="text-xs text-muted">
                            Upload, index, and manage your text memories in a master-detail split workspace.
                        </p>
                    </div>
                    <button
                        onClick={() => fetchFiles(true)}
                        className="p-2 rounded-full border border-glass-border bg-glass/40 hover:bg-glass/80 text-ink hover:text-secondary hover:border-secondary/40 transition flex items-center space-x-1 text-xs font-mono font-bold"
                        title="Force reload list"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow items-stretch">
                    
                    {/* Left Pane (Master List & Uploader) */}
                    <div className="lg:col-span-5 flex flex-col space-y-6">
                        
                        {/* Compact Ingestion Portal */}
                        <div className="glass-panel border border-glass-border p-4 rounded-2xl">
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={triggerFileBrowser}
                                onKeyDown={handleUploadZoneKeyDown}
                                tabIndex={0}
                                className={`border border-dashed rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-secondary/40 ${
                                    dragActive 
                                        ? "border-secondary bg-secondary/10 shadow-cyan-glow" 
                                        : "border-glass-border hover:border-secondary/40 hover:bg-glass/30"
                                }`}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileInputChange}
                                    accept=".pdf"
                                    className="hidden"
                                />
                                <UploadCloud className="w-7 h-7 text-secondary/70 mb-2 shadow-cyan-glow" />
                                <p className="text-xs font-bold text-ink text-center">
                                    Drop PDF here or <span className="underline text-secondary">browse</span>
                                </p>
                                <p className="text-[8px] text-muted mt-0.5 font-mono uppercase tracking-wider">
                                    Max size: 20MB
                                </p>
                            </div>

                            {/* In-Flight progress bar */}
                            {uploadProgress !== null && (
                                <div className="mt-3">
                                    <div className="flex items-center justify-between text-[10px] font-mono text-muted mb-1">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-obsidian rounded-full h-1 overflow-hidden border border-glass-border">
                                        <div 
                                            className="bg-secondary h-full transition-all duration-150" 
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Status alerts */}
                            {uploadError && (
                                <div className="mt-3 p-2.5 rounded-xl border border-danger/30 bg-danger/5 text-danger flex items-center space-x-2 text-[10px] font-mono">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{uploadError}</span>
                                </div>
                            )}
                            {uploadSuccess && (
                                <div className="mt-3 p-2.5 rounded-xl border border-success/30 bg-success/5 text-success flex items-center space-x-2 text-[10px] font-mono">
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{uploadSuccess}</span>
                                </div>
                            )}
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex border-b border-glass-border text-xs font-semibold">
                            {(['all', 'ready', 'processing', 'failed'] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setStatusFilter(filter)}
                                    className={`px-3 py-1.5 border-b-2 capitalize transition -mb-px ${
                                        statusFilter === filter
                                            ? "border-secondary text-secondary font-bold"
                                            : "border-transparent text-muted hover:text-ink"
                                    }`}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>

                        {/* Master File list */}
                        <div className="flex-1 min-h-[300px] overflow-y-auto max-h-[50vh] lg:max-h-[60vh] pr-1">
                            {loading ? (
                                <div className="glass-panel rounded-2xl p-4 divide-y divide-glass-border space-y-3">
                                    {[1, 2, 3].map((n) => (
                                        <div key={n} className="py-3 animate-pulse space-y-2">
                                            <div className="h-3 bg-ink/10 rounded w-3/4" />
                                            <div className="h-2.5 bg-ink/5 rounded w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            ) : error ? (
                                <div className="border border-danger/30 bg-danger/5 p-4 rounded-xl text-center">
                                    <span className="font-mono text-[10px] text-danger block mb-2 uppercase">{error}</span>
                                    <button onClick={() => fetchFiles()} className="px-4 py-1.5 border border-danger text-danger text-[10px] font-bold rounded-full">
                                        Retry
                                    </button>
                                </div>
                            ) : filteredFiles.length === 0 ? (
                                <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">
                                    No records found matching filter.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredFiles.map((file) => (
                                        <div
                                            key={file.id}
                                            onClick={() => setPreviewFileId(file.id)}
                                            className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex items-center justify-between ${
                                                previewFileId === file.id
                                                    ? "bg-secondary/10 border-secondary shadow-cyan-glow"
                                                    : "bg-glass/20 border-glass-border hover:border-secondary/40 hover:bg-glass/40"
                                            }`}
                                        >
                                            <div className="min-w-0 pr-2">
                                                <h4 className="text-xs font-bold text-ink truncate">
                                                    {file.filename}
                                                </h4>
                                                <span className="font-mono text-[9px] text-muted mt-0.5 block">
                                                    {formatDate(file.created_at)}
                                                </span>
                                            </div>
                                            <div className="flex items-center space-x-2 shrink-0">
                                                {formatStatusBadge(file.status)}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFileToDelete(file);
                                                    }}
                                                    className="p-1 hover:bg-danger/15 rounded text-muted hover:text-danger"
                                                    title="Delete document"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Pane (Embedded Detail Panel) */}
                    <div className="lg:col-span-7 flex flex-col">
                        <div className="glass-panel border border-glass-border rounded-2xl p-6 flex flex-col h-full min-h-[480px] justify-between relative overflow-hidden bg-glass/25">
                            {previewLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                                    <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                                    <p className="text-xs text-muted font-mono">Retrieving index content...</p>
                                </div>
                            ) : previewError ? (
                                <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-danger p-6 text-center">
                                    <AlertCircle className="w-8 h-8" />
                                    <p className="text-xs font-mono">{previewError}</p>
                                </div>
                            ) : previewFile ? (
                                <div className="flex-grow flex flex-col h-full justify-between">
                                    
                                    {/* Detail Header & Action Buttons */}
                                    <div className="flex items-start justify-between border-b border-glass-border/40 pb-4 mb-4">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-extrabold text-ink truncate" title={previewFile.filename}>
                                                {previewFile.filename}
                                            </h3>
                                            <p className="font-mono text-[9px] text-muted mt-0.5 uppercase">
                                                PDF Document · ID: {previewFile.id.slice(0, 10)}...
                                            </p>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            {contentUrl && (
                                                <a
                                                    href={contentUrl}
                                                    download={previewFile.filename}
                                                    className="p-2 border border-glass-border hover:border-secondary bg-glass/30 hover:bg-secondary/15 text-muted hover:text-secondary rounded-full transition"
                                                    title="Download file"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                            {!previewFile.summary && (
                                                <button
                                                    onClick={() => handleGenerateSummary(previewFile.id)}
                                                    disabled={summarizing}
                                                    className="px-3 py-1.5 border border-secondary text-secondary hover:bg-secondary/10 disabled:opacity-50 text-[10px] font-mono font-bold rounded-full transition"
                                                >
                                                    {summarizing ? 'SUMMARIZING...' : 'GENERATE SUMMARY'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Split view: PDF Preview left, Summary/Metadata right */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow items-stretch mb-4 min-h-[300px]">
                                        
                                        {/* Embedded PDF iframe */}
                                        <div className="bg-obsidian/60 border border-glass-border rounded-xl p-2 flex flex-col items-center justify-center overflow-hidden min-h-[300px]">
                                            {contentUrl ? (
                                                <iframe 
                                                    src={`${contentUrl}#page=1`}
                                                    title={previewFile.filename}
                                                    className="w-full h-full min-h-[280px] rounded-lg border border-glass-border bg-white"
                                                />
                                            ) : (
                                                <span className="text-[10px] text-muted italic">Content preview loading...</span>
                                            )}
                                        </div>

                                        {/* Metadata details, Summary, and Topics */}
                                        <div className="space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                {/* Summary card */}
                                                <div>
                                                    <span className="font-mono text-[8px] uppercase tracking-widest text-muted block mb-1">
                                                        AI Generated Summary
                                                    </span>
                                                    <div className="text-xs text-ink bg-obsidian/45 border border-glass-border p-3 rounded-xl min-h-[100px] max-h-[180px] overflow-y-auto leading-relaxed">
                                                        {previewFile.summary || (
                                                            <span className="text-muted italic">No summary available yet. Click "Generate Summary" above to index with AI.</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Topic tags */}
                                                {topics.length > 0 && (
                                                    <div>
                                                        <span className="font-mono text-[8px] uppercase tracking-widest text-muted block mb-1">
                                                            Classified Topics
                                                        </span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {topics.map((tag, i) => (
                                                                <span key={i} className="px-2 py-0.5 rounded border border-secondary/25 bg-secondary/5 text-secondary text-[9px] font-mono">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-[9px] font-mono text-muted/70 border-t border-glass-border/30 pt-3">
                                                Uploaded on: {formatDate(previewFile.created_at)}
                                            </div>
                                        </div>

                                    </div>

                                </div>
                            ) : (
                                <div className="flex-grow flex flex-col items-center justify-center text-center p-6 space-y-2">
                                    <FileText className="w-10 h-10 text-muted/40" />
                                    <h4 className="text-sm font-bold text-ink">Inspect Records</h4>
                                    <p className="text-xs text-muted max-w-xs leading-relaxed">
                                        Select any PDF document from the index on the left to view its metadata, AI summary, and visual pages.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

            </main>

            {/* Delete Confirmation Modal */}
            {fileToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-obsidian/85 backdrop-blur-md" 
                        onClick={() => setFileToDelete(null)}
                    />
                    <div className="glass-panel rounded-2xl max-w-sm w-full p-6 shadow-cyan-glow relative z-10 animate-scaleUp">
                        <div className="flex items-start space-x-3 mb-4">
                            <div className="w-9 h-9 rounded-full bg-danger/10 flex items-center justify-center text-danger shrink-0 shadow-cyan-glow">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-display text-lg font-bold text-ink">
                                    Delete Document?
                                </h3>
                                <p className="text-xs text-muted mt-1 leading-relaxed">
                                    Are you sure you want to permanently delete <strong className="text-ink">"{fileToDelete.filename}"</strong>? This will clear all extracted summaries and vector chunks.
                                </p>
                            </div>
                        </div>

                        <div className="flex space-x-3 justify-end pt-2">
                            <button
                                onClick={() => setFileToDelete(null)}
                                className="px-4 py-2 border border-glass-border bg-glass/40 hover:bg-glass/80 text-ink text-xs font-bold rounded-full transition hover:scale-[1.01] shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 border border-danger/40 bg-danger/10 hover:bg-danger/25 text-white text-xs font-bold rounded-full transition hover:scale-[1.01] shadow-cyan-glow"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
