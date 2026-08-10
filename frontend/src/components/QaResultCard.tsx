import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';

export interface QaSource {
    file_id: string;
    filename: string;
    page_number: number | null;
    chunk_snippet: string;
    similarity_score: number;
}

interface QaResultCardProps {
    answer: string;
    sources: QaSource[];
}

export default function QaResultCard({ answer, sources }: QaResultCardProps) {
    const isNoInfo = 
        answer.toLowerCase().includes("don't have enough information") || 
        sources.length === 0;

    if (isNoInfo) {
        return (
            <div className="glass-panel rounded-2xl p-6 shadow-cyan-glow text-center max-w-xl mx-auto my-3 animate-scaleUp">
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mx-auto mb-4 shadow-cyan-glow">
                    <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink mb-2">
                    Limited Context Matches
                </h3>
                <p className="text-xs text-muted mb-6 leading-relaxed">
                    We couldn't retrieve enough relevant citations from your index to securely compile an answer. 
                    Consider linking more files or broadening your search keywords.
                </p>
                <Link
                    to="/pdf-library"
                    className="px-4 py-2 border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-secondary hover:shadow-cyan-glow text-xs font-bold hover:scale-[1.01] transition duration-150 rounded-full inline-block shadow-sm"
                >
                    Upload to PDF Library
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Grounded Answer Card */}
            <div className="bg-glass/40 border border-glass-border shadow-cyan-glow rounded-2xl p-6 border-l-4 border-l-secondary text-left">
                <span className="font-mono text-[9px] uppercase tracking-widest text-secondary font-bold block mb-3 select-none">
                    Grounded Answer
                </span>
                <div className="font-sans text-sm text-ink leading-relaxed whitespace-pre-line max-w-none">
                    {answer}
                </div>
            </div>

            {/* Citations / Sources */}
            {sources.length > 0 && (
                <div className="text-left">
                    <div className="mb-3">
                        <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold block select-none">
                            Reference Citations
                        </span>
                    </div>

                    <div className="space-y-4">
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className="bg-glass/45 border border-glass-border shadow-sm rounded-2xl p-6 flex flex-col justify-between"
                            >
                                {/* Citation Header */}
                                <div className="flex items-center justify-between pb-3 border-b border-glass-border">
                                    <div className="flex items-center space-x-2">
                                        <FileText className="w-4 h-4 text-secondary" />
                                        <span className="font-sans text-xs font-bold text-ink truncate max-w-[200px] sm:max-w-sm">
                                            {source.filename}
                                        </span>
                                        <span className="font-mono text-[9px] text-muted">
                                            · Page {source.page_number || '1'}
                                        </span>
                                    </div>

                                    <span className="font-mono text-[9px] bg-secondary/15 text-secondary border border-secondary/25 px-2 py-0.5 rounded font-bold select-none shadow-sm">
                                        {(source.similarity_score * 100).toFixed(0)}% Match
                                    </span>
                                </div>

                                {/* Snippet Block */}
                                <div className="border-l-2 border-secondary bg-obsidian/60 pl-3.5 py-2.5 mt-3 rounded-r-2xl shadow-inner">
                                    <p className="font-mono text-[10px] text-ink leading-relaxed whitespace-pre-wrap">
                                        {source.chunk_snippet}...
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
