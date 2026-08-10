import React, { useState, useEffect, useRef } from 'react';
import { FileText, Image as ImageIcon, X, Copy, Check, Bookmark, Loader2, AlertCircle } from 'lucide-react';
import api from '../services/api';

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

interface FilePreviewModalProps {
    fileId: string;
    sourceType?: string;
    highlightPage?: number | null;
    highlightSnippet?: string | null;
    onClose: () => void;
}

export default function FilePreviewModal({
    fileId,
    sourceType,
    highlightPage,
    highlightSnippet,
    onClose
}: FilePreviewModalProps) {
    const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const textContainerRef = useRef<HTMLDivElement>(null);
    const snippetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let activeUrl: string | null = null;
        let isMounted = true;

        const loadFileDetailsAndContent = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Fetch metadata detail
                const detailRes = await api.get<FileDetail>(`/files/${fileId}`);
                if (!isMounted) return;
                setFileDetail(detailRes.data);

                // 2. Fetch raw content blob
                const contentRes = await api.get(`/files/${fileId}/content`, { responseType: 'blob' });
                if (!isMounted) return;
                const blobUrl = URL.createObjectURL(contentRes.data);
                activeUrl = blobUrl;
                setContentUrl(blobUrl);
            } catch (err: any) {
                console.error(`Failed loading file preview for ${fileId}:`, err);
                if (isMounted) {
                    setError(err.response?.data?.detail || 'Failed to load file preview.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadFileDetailsAndContent();

        return () => {
            isMounted = false;
            if (activeUrl) {
                URL.revokeObjectURL(activeUrl);
            }
        };
    }, [fileId]);

    // Handle snippet scrolling when extracted text loaded
    useEffect(() => {
        if (highlightSnippet && snippetRef.current) {
            snippetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightSnippet, fileDetail]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const resolvedSourceType = sourceType || fileDetail?.source_type || 'pdf';
    const isImage = resolvedSourceType === 'screenshot' || resolvedSourceType === 'image' || 
        (fileDetail?.filename && /\.(png|jpg|jpeg|webp|bmp)$/i.test(fileDetail.filename));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/85 backdrop-blur-md animate-fade-in">
            <div className="glass-panel rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-cyan-glow overflow-hidden text-ink">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-glass/65">
                    <div className="flex items-center space-x-3 truncate">
                        <div className="p-2.5 rounded-2xl bg-secondary/10 text-secondary shadow-cyan-glow">
                            {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                        </div>
                        <div className="truncate">
                            <h3 className="text-base font-bold text-ink truncate" title={fileDetail?.filename || 'Loading file...'}>
                                {fileDetail?.filename || 'Document Preview'}
                            </h3>
                            <div className="flex items-center space-x-2 text-xs text-muted font-mono mt-0.5">
                                <span>{isImage ? 'Image File' : 'PDF Document'}</span>
                                {highlightPage != null && (
                                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-bold border border-secondary/25">
                                        <Bookmark className="w-3 h-3" />
                                        <span>Page {highlightPage}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-full text-muted hover:text-ink hover:bg-glass/40 border border-transparent hover:border-glass-border transition-colors"
                        title="Close preview"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Content */}
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
                        <p className="text-sm text-muted font-mono">Loading document content...</p>
                    </div>
                ) : error ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                        <AlertCircle className="w-10 h-10 text-danger" />
                        <p className="text-sm text-danger font-medium">{error}</p>
                    </div>
                ) : (
                    <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-obsidian/45">
                        {/* Left Column: Visual Document Preview (PDF Iframe or Image Blob) */}
                        <div className="bg-obsidian/60 rounded-2xl border border-glass-border p-3 flex flex-col items-center justify-center min-h-[350px] max-h-[550px] overflow-hidden shadow-inner">
                            {contentUrl ? (
                                isImage ? (
                                    <img 
                                        src={contentUrl} 
                                        alt={fileDetail?.filename} 
                                        className="max-h-[500px] w-auto object-contain rounded-2xl shadow-sm"
                                    />
                                ) : (
                                    <iframe 
                                        src={`${contentUrl}#page=${highlightPage || 1}`}
                                        title={fileDetail?.filename || 'PDF View'}
                                        className="w-full h-full min-h-[480px] rounded-2xl border border-glass-border bg-white dark:bg-slate-900"
                                    />
                                )
                            ) : (
                                <p className="text-xs text-muted italic">Preview content unavailable.</p>
                            )}
                        </div>

                        {/* Right Column: Metadata, Summary, Tags & Extracted Text with Snippet Highlight */}
                        <div className="space-y-5 flex flex-col justify-between overflow-y-auto pr-1">
                            <div className="space-y-5">
                                {/* Summary */}
                                {fileDetail?.summary && (
                                    <div>
                                        <h4 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted mb-1.5">Summary</h4>
                                        <p className="text-sm text-ink leading-relaxed bg-obsidian/60 p-3.5 rounded-2xl border border-glass-border shadow-inner">
                                            {fileDetail.summary}
                                        </p>
                                    </div>
                                )}

                                {/* Tags */}
                                {fileDetail?.tags && fileDetail.tags.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted mb-1.5">Tags</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {fileDetail.tags.map((tag, idx) => (
                                                <span 
                                                    key={idx}
                                                    className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-white border border-white/20 shadow-sm"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Matched Snippet Highlight */}
                                {highlightSnippet && (
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <h4 className="text-[10px] font-bold font-mono uppercase tracking-widest text-secondary flex items-center space-x-1">
                                                <span>Matched Citation Snippet</span>
                                                {highlightPage != null && <span>(Page {highlightPage})</span>}
                                            </h4>
                                            <button
                                                onClick={() => handleCopy(highlightSnippet)}
                                                className="text-xs text-secondary hover:text-secondary/80 hover:underline flex items-center space-x-1"
                                            >
                                                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{copied ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        </div>
                                        <div 
                                            ref={snippetRef}
                                            className="bg-secondary/10 border-l-4 border-secondary text-ink p-3.5 rounded-r-2xl text-xs font-mono leading-relaxed shadow-cyan-glow"
                                        >
                                            "{highlightSnippet}"
                                        </div>
                                    </div>
                                )}

                                {/* Full Extracted Text */}
                                <div>
                                    <h4 className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted mb-1.5">
                                        Extracted Document Text
                                    </h4>
                                    <div 
                                        ref={textContainerRef}
                                        className="bg-obsidian/60 p-3.5 rounded-2xl border border-glass-border max-h-52 overflow-y-auto font-mono text-xs text-ink whitespace-pre-wrap leading-relaxed shadow-inner"
                                    >
                                        {fileDetail?.extracted_text || 'No extracted text available.'}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-glass-border flex justify-end">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2 bg-glass/40 border border-glass-border hover:bg-glass/80 text-ink text-sm font-bold rounded-full transition-all duration-150 hover:scale-[1.01] active:scale-95 shadow-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
