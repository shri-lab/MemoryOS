import React, { useEffect, useState } from 'react';
import { Clock, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '../services/api';
import FilePreviewModal from './FilePreviewModal';

interface RecentFileItem {
  id: string;
  filename: string;
  source_type: string;
  status: string;
  viewed_at: string;
}

export default function RecentlyViewed() {
  const [recentFiles, setRecentFiles] = useState<RecentFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const fetchRecentFiles = async () => {
    try {
      setLoading(true);
      const res = await api.get<RecentFileItem[]>('/files/recent');
      setRecentFiles(res.data);
    } catch (err) {
      console.error('Failed to fetch recent files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentFiles();
  }, []);

  const handleFileClick = (fileId: string) => {
    // Fire-and-forget view recording endpoint to bump recency
    api.post(`/files/${fileId}/view`).catch((err) => {
      console.warn('Failed to record file view:', err);
    });
    setPreviewFileId(fileId);
  };

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="bg-glass/40 border border-glass-border shadow-sm rounded-2xl p-6 flex justify-center items-center min-h-[140px]">
        <Loader2 className="w-5 h-5 text-secondary animate-spin" />
      </div>
    );
  }

  if (recentFiles.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-glass/40 border border-glass-border shadow-sm rounded-2xl p-6 mb-8">
        <div className="flex items-center space-x-2 mb-4">
          <Clock className="w-4 h-4 text-secondary" />
          <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold">
            Recently Viewed Files
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recentFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => handleFileClick(file.id)}
              className="flex items-center space-x-3 p-3 rounded-2xl border border-glass-border bg-glass/65 hover:border-secondary hover:shadow-cyan-glow transition-all text-left group hover:scale-[1.01]"
            >
              <div className="p-2 rounded-full bg-secondary/10 text-secondary group-hover:bg-secondary/20 transition-colors shadow-sm">
                {file.source_type === 'screenshot' ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-sans text-xs font-bold text-ink truncate group-hover:text-secondary transition-colors">
                  {file.filename}
                </h4>
                <span className="font-mono text-[9px] text-muted block mt-0.5">
                  {file.source_type.toUpperCase()} · {formatRelativeTime(file.viewed_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {previewFileId && (
        <FilePreviewModal
          fileId={previewFileId}
          onClose={() => {
            setPreviewFileId(null);
            fetchRecentFiles(); // Refresh list after closing
          }}
        />
      )}
    </>
  );
}
