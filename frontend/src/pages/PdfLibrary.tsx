import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
    UploadCloud, 
    Trash2, 
    Eye, 
    RefreshCw, 
    FileText, 
    X, 
    Loader2, 
    AlertCircle,
    CheckCircle
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

    // Preview state
    const [previewFile, setPreviewFile] = useState<FileDetail | null>(null);
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
                        // If this is the file currently open in the preview panel, refresh the panel
                        if (previewFile && previewFile.id === file.id) {
                            fetchPreviewDetail(file.id);
                        }
                        return { ...file, status: match.status };
                    }
                    return file;
                });
                return updated ? nextFiles : prevFiles;
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [files, previewFile]);

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

        // Extension check
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setUploadError('Only PDF files are allowed.');
            return;
        }

        // Size check
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

    // Axios Upload implementation
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
            
            // Add new file to state & trigger fetching list dynamically
            setFiles(prev => [res.data, ...prev]);
        } catch (err: any) {
            console.error('Upload failed:', err);
            setUploadError(err.response?.data?.detail || 'Failed to upload document.');
        } finally {
            setUploadProgress(null);
        }
    };

    // Detailed metadata fetching
    const fetchPreviewDetail = async (id: string) => {
        setPreviewLoading(true);
        setPreviewError(null);
        setTopics([]);
        try {
            const res = await api.get<FileDetail>(`/files/${id}`);
            setPreviewFile(res.data);
        } catch (err: any) {
            console.error('Failed to get preview details:', err);
            setPreviewError('Failed to retrieve file details.');
        } finally {
            setPreviewLoading(false);
        }
    };

    // Manual summarization
    const handleGenerateSummary = async (fileId: string) => {
        if (summarizing) return;
        setSummarizing(true);
        try {
            const res = await api.post<{ summary: string; topics: string[] }>(`/files/${fileId}/summarize`);
            
            // Update preview panel state
            setPreviewFile(prev => prev ? { ...prev, summary: res.data.summary } : null);
            setTopics(res.data.topics);

            // Update files list summary state dynamically if summarized file is listed
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
            // Treat 404 as already deleted (race conditions), ignore error
            if (err.response?.status !== 404) {
                console.error('Delete call failed:', err);
                alert('Failed to delete file.');
                return;
            }
        } finally {
            // Remove from list state
            setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
            if (previewFile && previewFile.id === fileToDelete.id) {
                setPreviewFile(null);
            }
            setFileToDelete(null);
        }
    };

    // Escape listener for dialog close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (fileToDelete) setFileToDelete(null);
                if (previewFile) setPreviewFile(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fileToDelete, previewFile]);

    // Filters implementation
    const filteredFiles = files.filter(file => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'processing') return file.status === 'processing' || file.status === 'uploading';
        return file.status === statusFilter;
    });

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
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink/75">
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
        <div className="w-full flex flex-col relative">
            {/* Main Area */}
            <main className="max-w-4xl w-full mx-auto px-6 py-10 flex-grow relative">
                {/* Header Title */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="font-serif text-3xl font-normal text-indigo-deep mb-1">
                            PDF Library
                        </h1>
                        <p className="text-xs text-ink/50">
                            Upload, index, and manage your text memories.
                        </p>
                    </div>
                    <button
                        onClick={() => fetchFiles(true)}
                        className="p-2 rounded-lg border border-ink/10 bg-paper hover:bg-lavender-light text-ink/60 hover:text-indigo-primary transition flex items-center space-x-1.5 text-xs font-medium"
                        title="Force reload list"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                </div>

                {/* Upload Section Box */}
                <div className="bg-paper border border-ink/5 shadow-[0_4px_20px_rgba(30,27,75,0.02)] rounded-xl p-6 mb-8">
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={triggerFileBrowser}
                        onKeyDown={handleUploadZoneKeyDown}
                        tabIndex={0}
                        className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-primary/40 ${
                            dragActive 
                                ? "border-indigo-primary bg-indigo-primary/5 scale-[1.01]" 
                                : "border-indigo-primary/20 hover:border-indigo-primary/50 hover:bg-lavender-light/10"
                        }`}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileInputChange}
                            accept=".pdf"
                            className="hidden"
                        />
                        <UploadCloud className="w-10 h-10 text-indigo-primary/60 mb-3" />
                        <p className="text-sm font-medium text-indigo-deep text-center">
                            Drag & drop your PDF here, or <span className="underline text-indigo-primary">click to browse</span>
                        </p>
                        <p className="text-[10px] text-ink/40 mt-1 font-mono uppercase tracking-wider">
                            Max size: 20MB · PDF only
                        </p>
                    </div>

                    {/* In-Flight progress bar */}
                    {uploadProgress !== null && (
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-xs font-mono text-ink/65 mb-1.5">
                                <span>Uploading file...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-lavender-light rounded-full h-2 overflow-hidden shadow-inner">
                                <div 
                                    className="bg-indigo-primary h-full transition-all duration-150" 
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Upload status messages */}
                    {uploadError && (
                        <div className="mt-4 p-3 rounded-lg border border-status-brick/20 bg-status-brick/5 text-status-brick flex items-center space-x-2 text-xs font-mono">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{uploadError}</span>
                        </div>
                    )}
                    {uploadSuccess && (
                        <div className="mt-4 p-3 rounded-lg border border-status-moss/20 bg-status-moss/5 text-status-moss flex items-center space-x-2 text-xs font-mono">
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            <span>{uploadSuccess}</span>
                        </div>
                    )}
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-ink/10 mb-6 text-sm font-medium">
                    {(['all', 'ready', 'processing', 'failed'] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter)}
                            className={`px-4 py-2 border-b-2 capitalize transition -mb-px ${
                                statusFilter === filter
                                    ? "border-indigo-primary text-indigo-primary font-semibold"
                                    : "border-transparent text-ink/50 hover:text-ink hover:border-ink/10"
                            }`}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* File Listing Container */}
                <div className="min-h-[300px]">
                    {loading ? (
                        /* Loading state skeleton */
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
                    ) : error ? (
                        /* General error state */
                        <div className="border border-status-brick/30 bg-status-brick/5 p-6 rounded-xl text-center shadow-sm">
                            <span className="font-mono text-xs text-status-brick block mb-4 uppercase tracking-widest">
                                {error}
                            </span>
                            <button
                                onClick={() => fetchFiles()}
                                className="font-sans px-4 py-1.5 border border-indigo-primary text-indigo-primary hover:bg-indigo-primary/5 text-xs font-semibold transition rounded-lg"
                            >
                                Retry Connection
                            </button>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        /* Empty state */
                        <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl py-20 px-6 text-center">
                            <h3 className="font-serif italic text-2xl text-ink/70 mb-2">
                                Nothing here yet
                            </h3>
                            <p className="font-sans text-sm text-ink/50">
                                {statusFilter === 'all' 
                                    ? "Select or drop your first document above to populate the library."
                                    : `No files matching the status "${statusFilter}" were found.`
                                }
                            </p>
                        </div>
                    ) : (
                        /* Table list */
                        <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl p-6">
                            <div className="divide-y divide-ink/10">
                                {filteredFiles.map((file) => (
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
                                        <div className="flex items-center justify-between sm:justify-end space-x-6">
                                            {formatStatusBadge(file.status)}
                                            <div className="flex items-center space-x-2">
                                                {/* Preview trigger */}
                                                <button
                                                    onClick={() => fetchPreviewDetail(file.id)}
                                                    className="p-1.5 hover:bg-lavender-light/60 rounded text-ink/50 hover:text-indigo-primary transition"
                                                    title="View details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>

                                                {/* Delete trigger */}
                                                <button
                                                    onClick={() => setFileToDelete(file)}
                                                    className="p-1.5 hover:bg-status-brick/10 rounded text-ink/50 hover:text-status-brick transition"
                                                    title="Delete file"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Slide-out Preview Panel */}
            {previewFile && (
                <div className="fixed inset-0 z-40 flex justify-end">
                    {/* Backdrop shadow mask */}
                    <div 
                        className="absolute inset-0 bg-indigo-deep/20 backdrop-blur-xs transition-opacity" 
                        onClick={() => setPreviewFile(null)}
                    />
                    
                    {/* Panel itself */}
                    <div className="relative w-full max-w-md bg-paper h-full shadow-2xl z-50 p-6 flex flex-col justify-between border-l border-ink/10 animate-slideIn">
                        <div>
                            {/* Panel Header */}
                            <div className="flex items-center justify-between pb-4 border-b border-ink/10 mb-6">
                                <div className="flex items-center space-x-2">
                                    <FileText className="w-5 h-5 text-indigo-primary" />
                                    <h3 className="font-serif text-xl font-normal text-indigo-deep truncate max-w-[240px]">
                                        {previewFile.filename}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setPreviewFile(null)}
                                    className="p-1.5 hover:bg-lavender-light rounded text-ink/40 hover:text-ink transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {previewLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                    <Loader2 className="w-8 h-8 text-indigo-primary animate-spin" />
                                    <span className="text-xs text-ink/50 font-mono">Loading metadata</span>
                                </div>
                            ) : previewError ? (
                                <div className="p-4 rounded border border-status-brick/30 bg-status-brick/5 text-status-brick font-mono text-xs">
                                    {previewError}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Telemetry info */}
                                    <div className="grid grid-cols-2 gap-4 bg-lavender-light/30 p-4 rounded-lg border border-ink/5">
                                        <div>
                                            <span className="text-[10px] font-semibold text-ink/40 uppercase block">Status</span>
                                            <span className="text-xs font-semibold text-indigo-deep">{previewFile.status.toUpperCase()}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-semibold text-ink/40 uppercase block">Created</span>
                                            <span className="text-xs font-semibold text-indigo-deep">{formatDate(previewFile.created_at)}</span>
                                        </div>
                                    </div>

                                    {/* Summary Display */}
                                    <div>
                                        <span className="text-[10px] font-bold text-indigo-deep/60 uppercase tracking-wider block mb-2">
                                            Document Summary
                                        </span>
                                        {previewFile.summary ? (
                                            <div className="text-xs text-ink/75 bg-lavender-light/20 p-4 rounded border border-ink/5 leading-relaxed overflow-y-auto max-h-[220px]">
                                                {previewFile.summary}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 border border-dashed border-ink/10 rounded">
                                                <span className="text-xs text-ink/45 block mb-4">No summary generated yet.</span>
                                                <button
                                                    onClick={() => handleGenerateSummary(previewFile.id)}
                                                    disabled={summarizing || previewFile.status !== 'ready'}
                                                    className="font-sans px-4 py-2 bg-indigo-primary hover:bg-indigo-primary/95 text-paper text-xs font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center mx-auto"
                                                >
                                                    {summarizing ? (
                                                        <>
                                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                            <span>Summarizing...</span>
                                                        </>
                                                    ) : (
                                                        <span>Generate Summary</span>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Topics display if summarized */}
                                    {topics.length > 0 && (
                                        <div>
                                            <span className="text-[10px] font-bold text-indigo-deep/60 uppercase tracking-wider block mb-2">
                                                Extracted Topics
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {topics.map((topic, i) => (
                                                    <span 
                                                        key={i} 
                                                        className="px-2 py-1 bg-indigo-primary/10 text-indigo-primary text-[10px] font-semibold font-mono rounded"
                                                    >
                                                        {topic}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Bottom link to view original */}
                        <div className="border-t border-ink/10 pt-4 mt-6">
                            <button
                                onClick={() => setPreviewFile(null)}
                                className="w-full py-2 border border-ink/20 hover:border-ink text-ink text-xs font-semibold rounded-lg transition text-center"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {fileToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Shadow masking */}
                    <div 
                        className="absolute inset-0 bg-indigo-deep/30 backdrop-blur-xs" 
                        onClick={() => setFileToDelete(null)}
                    />
                    
                    {/* Modal dialog block */}
                    <div className="bg-paper border border-ink/10 rounded-xl max-w-sm w-full p-6 shadow-2xl relative z-10 animate-scaleUp">
                        <div className="flex items-start space-x-3 mb-4">
                            <div className="w-9 h-9 rounded-full bg-status-brick/10 flex items-center justify-center text-status-brick shrink-0">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-serif text-lg font-normal text-indigo-deep">
                                    Delete Document?
                                </h3>
                                <p className="text-xs text-ink/60 mt-1 leading-relaxed">
                                    Are you sure you want to permanently delete <strong className="text-indigo-deep">"{fileToDelete.filename}"</strong>? This will clear all extracted summaries and vector chunks.
                                </p>
                            </div>
                        </div>

                        <div className="flex space-x-3 justify-end pt-2">
                            <button
                                onClick={() => setFileToDelete(null)}
                                className="px-4 py-2 border border-ink/20 hover:border-ink rounded-lg text-ink text-xs font-semibold transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 bg-status-brick hover:bg-status-brick/95 rounded-lg text-paper text-xs font-semibold transition"
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
