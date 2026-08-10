import React, { useEffect, useState, useRef } from 'react';
import { 
    UploadCloud, 
    Trash2, 
    RefreshCw, 
    Image as ImageIcon, 
    Loader2, 
    AlertCircle,
    CheckCircle,
    Copy,
    Check,
    Download
} from 'lucide-react';
import api from '../services/api';

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
    tags: string[];
    extracted_text: string | null;
    created_at: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB limit
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
const MAX_POLL_ATTEMPTS = 20;

export default function ImageLibrary() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'processing' | 'failed'>('all');

    // Blob object URLs: fileId -> blobUrl
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [pollCounts, setPollCounts] = useState<Record<string, number>>({});
    const [stuckFiles, setStuckFiles] = useState<Record<string, boolean>>({});

    // Upload states
    const [dragActive, setDragActive] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Detail Panel Preview state
    const [previewFileId, setPreviewFileId] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<FileDetail | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [copiedText, setCopiedText] = useState(false);

    // Delete state
    const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

    // Fetch images list
    const fetchFiles = async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get<FileItem[]>('/files?source_type=screenshot');
            setFiles(res.data);
        } catch (err: any) {
            console.error('Failed to load image library:', err);
            setError('Failed to retrieve image library.');
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
            fetchPreviewDetail(files[0].id);
        }
    }, [files]);

    // Load Image Blob using authenticated Axios
    const loadImageBlob = async (fileId: string) => {
        if (imageUrls[fileId]) return;
        try {
            const res = await api.get(`/files/${fileId}/content`, { responseType: 'blob' });
            const objectUrl = URL.createObjectURL(res.data);
            setImageUrls(prev => ({ ...prev, [fileId]: objectUrl }));
        } catch (err) {
            console.error(`Failed to load image content blob for file ${fileId}`, err);
        }
    };

    // Load blobs for ready files
    useEffect(() => {
        files.forEach(f => {
            if (f.status === 'ready' && !imageUrls[f.id]) {
                loadImageBlob(f.id);
            }
        });
    }, [files]);

    // Clean up created object URLs on unmount
    useEffect(() => {
        return () => {
            Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [imageUrls]);

    // Fetch details
    const fetchPreviewDetail = async (id: string) => {
        setPreviewFileId(id);
        setPreviewLoading(true);
        setPreviewError(null);
        setCopiedText(false);
        try {
            const res = await api.get<FileDetail>(`/files/${id}`);
            setPreviewFile(res.data);
            loadImageBlob(id);
        } catch (err: any) {
            console.error('Failed to get image details:', err);
            setPreviewError('Failed to retrieve image details.');
        } finally {
            setPreviewLoading(false);
        }
    };

    // Polling logic for uploading/processing images
    useEffect(() => {
        const activeFileIds = files
            .filter(f => (f.status === 'processing' || f.status === 'uploading') && !stuckFiles[f.id])
            .map(f => f.id);

        if (activeFileIds.length === 0) return;

        const interval = setInterval(async () => {
            const nextCounts = { ...pollCounts };
            const idsToPoll: string[] = [];

            activeFileIds.forEach(id => {
                const currentCount = (nextCounts[id] || 0) + 1;
                nextCounts[id] = currentCount;

                if (currentCount >= MAX_POLL_ATTEMPTS) {
                    setStuckFiles(prev => ({ ...prev, [id]: true }));
                } else {
                    idsToPoll.push(id);
                }
            });

            setPollCounts(nextCounts);
            if (idsToPoll.length === 0) return;

            const promises = idsToPoll.map(async (id) => {
                try {
                    const res = await api.get<FileItem>(`/files/${id}`);
                    return res.data;
                } catch (err) {
                    console.error(`Failed polling status for file ${id}`, err);
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
    }, [files, previewFileId, pollCounts, stuckFiles]);

    // Drag and drop handlers
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

        const lowerName = file.name.toLowerCase();
        const isValidExt = ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));

        if (!isValidExt) {
            setUploadError(`Invalid image format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            setUploadError('Image file size exceeds the 10MB limit.');
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

    const uploadFileToServer = async (file: File) => {
        setUploadProgress(0);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post<FileItem>('/files/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / (progressEvent.total || file.size)
                    );
                    setUploadProgress(percentCompleted);
                }
            });

            setUploadSuccess(`Successfully uploaded "${file.name}"`);
            setFiles(prev => [res.data, ...prev]);
            fetchPreviewDetail(res.data.id);
        } catch (err: any) {
            console.error('Image upload failed:', err);
            setUploadError(err.response?.data?.detail || 'Failed to upload image.');
        } finally {
            setUploadProgress(null);
        }
    };

    const handleCopyText = (textToCopy: string) => {
        navigator.clipboard.writeText(textToCopy);
        setCopiedText(true);
        setTimeout(() => setCopiedText(false), 2000);
    };

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
            if (imageUrls[fileToDelete.id]) {
                URL.revokeObjectURL(imageUrls[fileToDelete.id]);
                setImageUrls(prev => {
                    const copy = { ...prev };
                    delete copy[fileToDelete.id];
                    return copy;
                });
            }
            setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
            if (previewFileId === fileToDelete.id) {
                setPreviewFileId(null);
            }
            setFileToDelete(null);
        }
    };

    // Escape listener
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

    const formatStatusBadge = (file: FileItem) => {
        const isStuck = stuckFiles[file.id];
        let dotColor = 'bg-primary animate-pulse';
        let textColor = 'text-primary';
        let label = file.status;

        if (file.status === 'ready') {
            dotColor = 'bg-success shadow-cyan-glow';
            textColor = 'text-success';
        } else if (file.status === 'failed') {
            dotColor = 'bg-warning shadow-violet-glow';
            textColor = 'text-warning';
        } else if (isStuck) {
            dotColor = 'bg-warning shadow-violet-glow';
            textColor = 'text-warning';
            label = 'stuck';
        }

        return (
            <div className="flex items-center space-x-1 bg-glass/40 border border-glass-border px-2 py-0.5 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${dotColor}`} />
                <span className={`font-mono text-[8px] uppercase tracking-widest font-bold ${textColor} truncate max-w-[100px]`}>
                    {label}
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

            {/* Main Workspace: Master-Detail Layout */}
            <main className="w-full mx-auto px-6 py-8 flex-grow relative z-10 flex flex-col h-full">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <div>
                        <h1 className="font-display text-2xl font-extrabold text-ink tracking-tight">
                            Image Library
                        </h1>
                        <p className="text-xs text-muted">
                            Upload photos, screenshots, and visual notes for automated OCR extraction.
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
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
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
                                    accept=".png,.jpg,.jpeg,.webp,.bmp"
                                    className="hidden"
                                />
                                <UploadCloud className="w-7 h-7 text-secondary/70 mb-2 shadow-cyan-glow" />
                                <p className="text-xs font-bold text-ink text-center">
                                    Drop screenshot or <span className="underline text-secondary">browse</span>
                                </p>
                                <p className="text-[8px] text-muted mt-0.5 font-mono uppercase tracking-wider">
                                    Max size: 10MB
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
                        <div className="flex-1 min-h-[300px] overflow-y-auto max-h-[55vh] lg:max-h-[60vh] pr-1">
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
                                            onClick={() => fetchPreviewDetail(file.id)}
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
                                                {formatStatusBadge(file)}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFileToDelete(file);
                                                    }}
                                                    className="p-1 hover:bg-danger/15 rounded text-muted hover:text-danger"
                                                    title="Delete screenshot"
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
                                    <p className="text-xs text-muted font-mono">Retrieving index details...</p>
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
                                                Screenshot Image · ID: {previewFile.id.slice(0, 10)}...
                                            </p>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            {imageUrls[previewFile.id] && (
                                                <a
                                                    href={imageUrls[previewFile.id]}
                                                    download={previewFile.filename}
                                                    className="p-2 border border-glass-border hover:border-secondary bg-glass/30 hover:bg-secondary/15 text-muted hover:text-secondary rounded-full transition"
                                                    title="Download Image"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Split view: Image Preview left, OCR Text right */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow items-stretch mb-4 min-h-[300px]">
                                        
                                        {/* Image Display */}
                                        <div className="bg-obsidian/60 border border-glass-border rounded-xl p-2 flex items-center justify-center overflow-hidden min-h-[300px] max-h-[420px]">
                                            {imageUrls[previewFile.id] ? (
                                                <img 
                                                    src={imageUrls[previewFile.id]}
                                                    alt={previewFile.filename}
                                                    className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                                                />
                                            ) : (
                                                <span className="text-[10px] text-muted italic">Image loading...</span>
                                            )}
                                        </div>

                                        {/* Metadata, OCR Text */}
                                        <div className="space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                {/* OCR Extracted Text */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-mono text-[8px] uppercase tracking-widest text-muted">
                                                            OCR Extracted Text
                                                        </span>
                                                        {previewFile.extracted_text && (
                                                            <button
                                                                onClick={() => handleCopyText(previewFile.extracted_text || '')}
                                                                className="flex items-center space-x-1 text-[9px] text-secondary hover:underline font-mono"
                                                            >
                                                                {copiedText ? (
                                                                    <>
                                                                        <Check className="w-3 h-3" />
                                                                        <span>COPIED</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3 h-3" />
                                                                        <span>COPY</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-xs font-mono text-ink bg-obsidian/45 border border-glass-border p-3 rounded-xl min-h-[140px] max-h-[220px] overflow-y-auto leading-relaxed whitespace-pre-wrap">
                                                        {previewFile.extracted_text || (
                                                            <span className="text-muted italic">No extracted OCR text found. Check if the image status is fully ready.</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Tags */}
                                                {previewFile.tags && previewFile.tags.length > 0 && (
                                                    <div>
                                                        <span className="font-mono text-[8px] uppercase tracking-widest text-muted block mb-1">
                                                            Classified Tags
                                                        </span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {previewFile.tags.map((tag, i) => (
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
                                    <ImageIcon className="w-10 h-10 text-muted/40" />
                                    <h4 className="text-sm font-bold text-ink">Inspect Records</h4>
                                    <p className="text-xs text-muted max-w-xs leading-relaxed">
                                        Select any screenshot from the index on the left to view its OCR text content, tags, and visuals.
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
                                    Delete Image?
                                </h3>
                                <p className="text-xs text-muted mt-1 leading-relaxed">
                                    Are you sure you want to permanently delete <strong className="text-ink">"{fileToDelete.filename}"</strong>? This will clear all parsed OCR texts and vector indices.
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
