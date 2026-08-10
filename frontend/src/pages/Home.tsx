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
        <div className="min-h-screen bg-obsidian text-ink font-sans flex flex-col relative overflow-hidden glow-bg">
            {/* Top Navigation Bar */}
            <header className="w-full h-16 border-b border-glass-border px-6 flex items-center justify-between z-30 bg-obsidian/25 backdrop-blur-xl fixed top-0 left-0">
                <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-black font-display text-xs font-extrabold shadow-cyan-glow">
                        M
                    </div>
                    <span className="font-display text-base font-extrabold tracking-tight text-ink">
                        MemoryOS
                    </span>
                </div>

                <nav className="hidden md:flex items-center space-x-8">
                    {['HOME', 'LIBRARY', 'SEARCH', 'CHAT', 'GRAPH'].map((item) => (
                        <a
                            key={item}
                            href={item === 'HOME' ? '/' : item === 'LIBRARY' ? '/pdf-library' : `/${item.toLowerCase()}`}
                            className="text-[10px] font-mono font-bold tracking-widest text-muted hover:text-secondary transition-colors"
                        >
                            {item}
                        </a>
                    ))}
                </nav>

                <div>
                    <div className="flex items-center space-x-2 bg-obsidian/60 border border-glass-border px-3.5 py-1.5 rounded-full shadow-cyan-glow">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                        <span className="font-mono text-[10px] font-bold text-secondary tracking-widest uppercase">
                            1,273 CHUNKS INDEXED
                        </span>
                    </div>
                </div>
            </header>


            {/* Central Content Column */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 pt-24 pb-16 text-center max-w-4xl mx-auto">
                
                {/* 3D Isometric floating card stack visualization with mint glows */}
                <div className="w-72 h-56 relative mb-8 flex items-center justify-center">
                    <svg className="w-full h-full drop-shadow-[0_0_25px_rgba(62,255,196,0.25)]" viewBox="0 0 300 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* Top Card */}
                        <g transform="translate(40, 20)">
                            <polygon points="110,30 200,75 110,120 20,75" fill="rgba(16, 16, 24, 0.7)" stroke="#3EFFC4" strokeWidth="1.5" strokeOpacity="0.8" />
                            {/* Inner lines/text blocks simulated */}
                            <line x1="60" y1="65" x2="120" y2="95" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                            <line x1="80" y1="55" x2="150" y2="90" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                        </g>
                        
                        {/* Middle Card */}
                        <g transform="translate(60, 70)">
                            <polygon points="110,30 200,75 110,120 20,75" fill="rgba(16, 16, 24, 0.5)" stroke="rgba(62,255,196,0.3)" strokeWidth="1" />
                            <line x1="70" y1="65" x2="130" y2="95" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                        </g>

                        {/* Bottom Card */}
                        <g transform="translate(20, 110)">
                            <polygon points="110,30 200,75 110,120 20,75" fill="rgba(16, 16, 24, 0.4)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                        </g>

                        {/* Neural Connection lines & glowing points */}
                        <path d="M150,75 L170,125" stroke="#3EFFC4" strokeWidth="1.5" strokeDasharray="3 3" />
                        <path d="M130,175 L170,125" stroke="#3EFFC4" strokeWidth="1.5" />
                        <path d="M130,175 L110,95" stroke="#3EFFC4" strokeWidth="1.5" strokeDasharray="2 2" />

                        {/* Glowing dots */}
                        <circle cx="150" cy="75" r="4" fill="#3EFFC4" className="animate-ping" />
                        <circle cx="150" cy="75" r="3" fill="#3EFFC4" />

                        <circle cx="170" cy="125" r="4" fill="#FFFFFF" />
                        <circle cx="130" cy="175" r="3" fill="#3EFFC4" />
                        <circle cx="110" cy="95" r="3" fill="#3EFFC4" />
                    </svg>
                </div>

                <p className="text-muted font-display text-sm font-bold uppercase tracking-widest mb-2">
                    AI-powered personal knowledge engine
                </p>

                <p className="text-xl md:text-2xl font-sans text-[#EAEAEA] font-medium leading-relaxed max-w-2xl mb-8">
                    Search your own knowledge — instantly, like{' '}
                    <span className="text-secondary font-bold shadow-cyan-glow bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20">
                        Google searches the web
                    </span>.
                </p>

                {/* Pill-shaped CTA button matching reference */}
                <div className="flex justify-center space-x-4 mb-12">
                    <a
                        href="/login"
                        className="px-8 py-3 rounded-full border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-ink font-mono text-xs font-bold tracking-widest transition-all hover:scale-[1.02] shadow-sm hover:shadow-cyan-glow"
                    >
                        EXPLORE MEMORYOS
                    </a>
                </div>

                {/* System Diagnostics Drawer (health endpoint contract preserved) */}
                <div className="w-full max-w-md bg-glass/25 border border-glass-border p-4 rounded-2xl backdrop-blur-md text-left">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-secondary">
                            System Diagnostics
                        </span>
                        <div className="flex items-center space-x-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${health ? 'bg-secondary' : 'bg-danger animate-pulse'}`} />
                            <span className="text-[9px] font-mono text-muted uppercase">
                                {health ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    </div>
                    {loading && <p className="text-[10px] font-mono text-muted">Running check...</p>}
                    {error && <p className="text-[10px] font-mono text-danger">{error}</p>}
                    {health && (
                        <pre className="text-[10px] font-mono text-secondary bg-black/40 p-2.5 rounded-xl border border-glass-border overflow-x-auto">
                            {JSON.stringify(health, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}