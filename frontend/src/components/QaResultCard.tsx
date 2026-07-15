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
            <div className="bg-paper border border-ink/10 rounded-xl p-6 shadow-sm text-center max-w-xl mx-auto my-3 animate-scaleUp">
                <div className="w-10 h-10 rounded-full bg-indigo-primary/5 flex items-center justify-center text-indigo-primary/60 mx-auto mb-4">
                    <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="font-serif text-lg font-normal text-indigo-deep mb-2">
                    Limited Context Matches
                </h3>
                <p className="text-xs text-ink/65 mb-6 leading-relaxed">
                    We couldn't retrieve enough relevant citations from your index to securely compile an answer. 
                    Consider linking more files or broadening your search keywords.
                </p>
                <Link
                    to="/pdf-library"
                    className="font-sans px-4 py-2 border border-indigo-primary text-indigo-primary text-xs font-semibold hover:bg-lavender-light transition rounded-lg inline-block"
                >
                    Upload to PDF Library
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Grounded Answer Card */}
            <div className="bg-paper border border-ink/5 shadow-[0_4px_24px_rgba(30,27,75,0.03)] rounded-xl p-6 border-l-4 border-l-indigo-primary text-left">
                <span className="font-mono text-[9px] uppercase tracking-widest text-indigo-primary font-bold block mb-3 select-none">
                    Grounded Answer
                </span>
                <div className="font-sans text-sm text-ink/85 leading-relaxed whitespace-pre-line max-w-none">
                    {answer}
                </div>
            </div>

            {/* Citations / Sources */}
            {sources.length > 0 && (
                <div className="text-left">
                    <div className="mb-3">
                        <span className="font-sans uppercase text-[10px] tracking-widest text-indigo-deep/50 font-bold block select-none">
                            Reference Citations
                        </span>
                    </div>

                    <div className="space-y-4">
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className="bg-paper border border-ink/5 shadow-[0_4px_20px_rgba(30,27,75,0.02)] rounded-xl p-6 flex flex-col justify-between"
                            >
                                {/* Citation Header */}
                                <div className="flex items-center justify-between pb-3 border-b border-ink/5">
                                    <div className="flex items-center space-x-2">
                                        <FileText className="w-4 h-4 text-indigo-primary" />
                                        <span className="font-sans text-xs font-semibold text-indigo-deep truncate max-w-[200px] sm:max-w-sm">
                                            {source.filename}
                                        </span>
                                        <span className="font-sans text-[10px] text-ink/40">
                                            · Page {source.page_number || '1'}
                                        </span>
                                    </div>

                                    <span className="font-mono text-[10px] bg-lavender-light text-indigo-primary px-2 py-0.5 rounded font-semibold select-none">
                                        {(source.similarity_score * 100).toFixed(0)}% Match
                                    </span>
                                </div>

                                {/* Snippet Block */}
                                <div className="border-l-2 border-indigo-primary/45 bg-lavender-light/10 pl-3.5 py-2.5 mt-3 rounded-r-lg">
                                    <p className="font-mono text-[11px] text-ink/75 leading-relaxed whitespace-pre-wrap">
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
