/**
 * Home page — calls the backend /health endpoint on mount and displays
 * the raw JSON response. Confirms API connectivity and DB status.
 */
import { useEffect, useState } from 'react';
import api from '../services/api';

interface HealthResponse {
    status: string;
    database?: string;
}

export default function Home() {
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api
            .get<HealthResponse>('/health')
            .then((response) => setHealth(response.data))
            .catch(() => setError('Could not reach the backend.'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-8 font-sans min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />

            <div className="relative z-10 text-center max-w-xl">
                <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                    MemoryOS
                </h1>
                <p className="text-slate-400 text-base leading-relaxed mb-8">
                    Your personal digital memory index. Retrieve and search your personal data, screenshots, and documents instantly with AI.
                </p>

                <div className="flex justify-center space-x-4 mb-8">
                    <a
                        href="/login"
                        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition duration-200 shadow-lg shadow-indigo-600/20"
                    >
                        Sign In
                    </a>
                    <a
                        href="/register"
                        className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition duration-200 border border-white/10"
                    >
                        Sign Up
                    </a>
                </div>

                <div className="text-left bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-300 mb-3">
                        System Health Status
                    </h2>
                    {loading && <p className="text-slate-400 text-sm">Loading health check status...</p>}
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    {health && (
                        <pre className="text-xs text-indigo-200 bg-black/40 p-4 rounded-xl overflow-x-auto border border-white/5">
                            {JSON.stringify(health, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}