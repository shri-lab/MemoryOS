import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import api from '../services/api';
import QaResultCard, { QaSource } from '../components/QaResultCard';

interface QaResponse {
    question: string;
    answer: string;
    sources: QaSource[];
}

export default function UniversalSearch() {
    const [searchParams, setSearchParams] = useSearchParams();

    const queryParam = searchParams.get('q') || '';
    const [searchVal, setSearchVal] = useState(queryParam);
    const [loading, setLoading] = useState(false);
    const [answer, setAnswer] = useState<string | null>(null);
    const [sources, setSources] = useState<QaSource[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = searchVal.trim();
        if (trimmed) {
            setSearchParams({ q: trimmed });
        } else {
            setSearchParams({});
            setAnswer(null);
            setSources([]);
            setError(null);
        }
    };

    const executeSearch = async (question: string, signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        setAnswer(null);
        setSources([]);

        try {
            const res = await api.post<QaResponse>('/search/qa', { question }, { signal });
            setAnswer(res.data.answer);
            setSources(res.data.sources || []);
        } catch (err: any) {
            // Ignore canceled request errors
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
                return;
            }
            console.error('QA search failed:', err);
            setError(err.response?.data?.detail || 'Q&A engine is currently offline. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-run search when query parameter changes
    useEffect(() => {
        setSearchVal(queryParam);
        const controller = new AbortController();
        if (queryParam.trim()) {
            executeSearch(queryParam.trim(), controller.signal);
        } else {
            setAnswer(null);
            setSources([]);
            setError(null);
            setLoading(false);
        }
        return () => {
            controller.abort();
        };
    }, [queryParam]);

    return (
        <div className="w-full flex flex-col relative">
            {/* Main Content */}
            <main className="max-w-3xl w-full mx-auto px-6 py-10 flex-grow flex flex-col relative">
                {/* Search Bar section (shown at top when query exists, or as center hero when empty) */}
                {queryParam ? (
                    <div className="mb-8">
                        <form onSubmit={handleSearchSubmit} className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-ink/40 pointer-events-none">
                                <Search className="w-4 h-4" />
                            </span>
                            <input
                                type="text"
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                                placeholder="Ask a question about your documents"
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-ink/15 bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-indigo-primary focus:ring-1 focus:ring-indigo-primary transition-all duration-150 text-sm shadow-sm"
                            />
                        </form>
                    </div>
                ) : null}

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4 my-auto">
                        <Loader2 className="w-9 h-9 text-indigo-primary animate-spin" />
                        <span className="font-mono text-xs text-indigo-primary uppercase tracking-widest animate-pulse">
                            Synthesizing cited answer
                        </span>
                    </div>
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="border border-status-brick/30 bg-status-brick/5 p-6 rounded-xl text-center shadow-sm my-auto">
                        <div className="w-10 h-10 rounded-full bg-status-brick/10 flex items-center justify-center text-status-brick mx-auto mb-4">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <span className="font-mono text-xs text-status-brick block mb-4 uppercase tracking-widest">
                            {error}
                        </span>
                        <button
                            onClick={() => executeSearch(queryParam)}
                            className="font-sans px-5 py-2 bg-status-brick hover:bg-status-brick/90 text-paper text-xs font-semibold transition rounded-lg"
                        >
                            Retry Search
                        </button>
                    </div>
                )}

                {/* Empty State / Prompt Screen */}
                {!loading && !error && !queryParam && (
                    <div className="flex flex-col items-center justify-center py-20 text-center my-auto">
                        <div className="w-12 h-12 rounded-xl bg-indigo-primary/10 flex items-center justify-center text-indigo-primary mb-6 shadow-sm">
                            <Search className="w-6 h-6" />
                        </div>
                        <h2 className="font-serif text-3xl font-normal text-indigo-deep mb-3">
                            Ask your documents
                        </h2>
                        <p className="text-xs text-ink/50 mb-8 max-w-sm leading-relaxed">
                            Input a natural language query. We will crawl your indexed files and generate an answer grounded in the sources.
                        </p>
                        
                        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-ink/40 pointer-events-none">
                                <Search className="w-5 h-5" />
                            </span>
                            <input
                                type="text"
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                                placeholder="Search your digital memory..."
                                className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-ink/15 bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-indigo-primary focus:ring-1 focus:ring-indigo-primary transition-all duration-150 text-sm shadow-md"
                            />
                            <button
                                type="submit"
                                className="absolute inset-y-1.5 right-1.5 px-3 bg-indigo-deep hover:bg-indigo-deep/95 text-paper rounded-lg flex items-center justify-center shadow-sm"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                )}

                {/* Results Screen */}
                {!loading && !error && queryParam && answer && (
                    <QaResultCard answer={answer} sources={sources} />
                )}
            </main>
        </div>
    );
}
