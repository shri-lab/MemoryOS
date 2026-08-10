import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Search, Laptop, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import api from '../services/api';
import { useAuthStore, User } from '../store/authStore';

interface RegisterResponse {
    access_token: string;
    token_type: string;
}

export default function Register() {
    const navigate = useNavigate();
    const setToken = useAuthStore((state) => state.setToken);
    const setUser = useAuthStore((state) => state.setUser);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // 1. Submit registration credentials
            const regRes = await api.post<RegisterResponse>('/auth/register', {
                email,
                password,
            });

            const token = regRes.data.access_token;
            setToken(token);

            // 2. Query user profile using token
            const meRes = await api.get<User>('/auth/me');
            setUser(meRes.data);

            // 3. Trigger success completion state
            setSuccess(true);

            // 4. Brief pause for completion feedback
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 50 : 500));

            // 5. Redirect to dashboard
            navigate('/dashboard');
        } catch (err: any) {
            console.error('Registration failed:', err);
            if (err.response?.status === 409) {
                setError('Email already registered.');
            } else {
                setError(err.response?.data?.detail || 'API connection failed. Verify your server is running.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthRedirect = (provider: string) => {
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        window.location.href = `${base}/auth/${provider}/login`;
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row bg-obsidian text-ink font-sans glow-bg">
            {/* Left Panel: Marketing Content */}
            <div className="w-full lg:w-[45%] bg-glass/25 backdrop-blur-xl p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden min-h-[360px] lg:min-h-screen border-b lg:border-b-0 lg:border-r border-glass-border">
                {/* Decorative Dot Grid */}
                <div className="absolute top-6 right-6 w-12 h-12 grid grid-cols-4 gap-1 opacity-25 text-primary pointer-events-none">
                    {[...Array(16)].map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-current" />
                    ))}
                </div>

                {/* Logo Section */}
                <div className="flex items-center space-x-3 z-10">
                    <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-black font-display text-lg font-extrabold shadow-cyan-glow">
                        M
                    </div>
                    <div>
                        <span className="font-display text-xl font-extrabold tracking-tight text-ink block leading-none">
                            MemoryOS
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-secondary block mt-0.5">
                            Personal Knowledge Engine
                        </span>
                    </div>
                </div>

                {/* Branding Hero */}
                <div className="my-8 lg:my-auto max-w-md z-10">
                    <h1 className="font-display text-4xl lg:text-5xl font-extrabold text-ink mb-4 leading-tight tracking-tight">
                        Your digital mind, <br className="hidden lg:inline"/>perfectly recalled.
                    </h1>
                    <p className="text-sm text-muted mb-8 leading-relaxed">
                        Index your documents and screenshots with contextual search logic and offline AI grounding.
                    </p>

                    {/* Features Lists */}
                    <div className="space-y-5">
                        <div className="flex items-start space-x-3.5">
                            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0 shadow-violet-glow">
                                <Shield className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-ink">Secure Identity Linking</h3>
                                <p className="text-xs text-muted">Fully encrypted local accounts linked with standard providers.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3.5">
                            <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary shrink-0 shadow-cyan-glow">
                                <Search className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-ink">Universal Grounded Search</h3>
                                <p className="text-xs text-muted">Retrieved chunks are formatted with strict source citations.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3.5">
                            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0 shadow-violet-glow">
                                <Laptop className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-ink">Multi-Device Dashboard</h3>
                                <p className="text-xs text-muted">Access all metadata, indexes, and document history everywhere.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom SVG Mountains Backdrop */}
                <div className="absolute bottom-0 left-0 right-0 h-32 opacity-15 pointer-events-none">
                    <svg className="w-full h-full text-primary" viewBox="0 0 1440 320" preserveAspectRatio="none" fill="currentColor">
                        <path d="M0,224L240,160L480,256L720,192L960,288L1200,160L1440,224L1440,320L1200,320L960,320L720,320L480,320L240,320L0,320Z" opacity="0.4" />
                        <path d="M0,128L240,224L480,160L720,256L960,128L1200,224L1440,160L1440,320L1200,320L960,320L720,320L480,320L240,320L0,320Z" opacity="0.6" />
                    </svg>
                </div>

                {/* Footer copyright */}
                <div className="z-10 mt-6 lg:mt-0">
                    <span className="font-mono text-[9px] text-muted/60 tracking-wider">
                        © {new Date().getFullYear()} MemoryOS. All rights reserved.
                    </span>
                </div>
            </div>

            {/* Right Panel: Auth Card */}
            <div className="w-full lg:w-[55%] flex items-center justify-center p-6 lg:p-12 bg-obsidian/40 relative overflow-hidden">

                <div className="w-full max-w-[400px] glass-panel p-8 rounded-2xl shadow-cyan-glow relative z-10">
                    <div className="mb-6">
                        <h2 className="font-display text-3xl font-extrabold text-ink tracking-tight">
                            Create Account
                        </h2>
                        <p className="text-xs text-muted mt-1">
                            Join MemoryOS to build your knowledge index.
                        </p>
                    </div>

                    {/* API Error Box */}
                    {error && (
                        <div className="mb-5 p-4 rounded-xl border border-danger/30 bg-danger/5 text-danger font-mono text-xs animate-fadeIn">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email field */}
                        <div>
                            <label className="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1.5 font-mono">
                                Email Address
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted/65 pointer-events-none">
                                    <Mail className="w-4 h-4" />
                                </span>
                                <input
                                    type="email"
                                    required
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading || success}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-full border border-glass-border bg-[#1E1E2A] text-ink placeholder-ink/25 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary focus:shadow-cyan-glow transition-all duration-150 disabled:opacity-50 text-sm"
                                />
                            </div>
                        </div>

                        {/* Password field */}
                        <div>
                            <label className="block text-[10px] font-bold text-muted uppercase tracking-widest mb-1.5 font-mono">
                                Password
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted/65 pointer-events-none">
                                    <Lock className="w-4 h-4" />
                                </span>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading || success}
                                    className="w-full pl-10 pr-10 py-2.5 rounded-full border border-glass-border bg-[#1E1E2A] text-ink placeholder-ink/25 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary focus:shadow-cyan-glow transition-all duration-150 disabled:opacity-50 text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted/50 hover:text-ink transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Primary register button: Rebuilt to pill-shaped outline with mint glow */}
                        <button
                            type="submit"
                            disabled={loading || success}
                            className="relative w-full h-[44px] rounded-full border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-ink font-mono text-xs font-bold tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center mt-6 hover:shadow-cyan-glow"
                        >
                            {success ? (
                                <span className="flex items-center space-x-2 text-secondary animate-pulse">
                                    <svg className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>ACCOUNT CREATED</span>
                                </span>
                            ) : loading ? (
                                <span className="flex items-center space-x-2 text-ink">
                                    <svg className="animate-spin h-4 w-4 text-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span>CREATING ACCOUNT…</span>
                                </span>
                            ) : (
                                <span className="flex items-center justify-center space-x-1.5 text-secondary">
                                    <span>SIGN UP</span>
                                    <ArrowRight className="w-4 h-4" />
                                </span>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6 flex items-center justify-center">
                        <div className="absolute inset-x-0 border-t border-glass-border" />
                        <span className="relative px-3 bg-obsidian text-[9px] uppercase tracking-widest text-muted/50 font-mono select-none">
                            or continue with
                        </span>
                    </div>

                    {/* OAuth login buttons */}
                    <div className="grid grid-cols-2 gap-3.5">
                        <button
                            type="button"
                            onClick={() => handleOAuthRedirect('google')}
                            className="flex items-center justify-center py-2.5 px-4 rounded-full border border-glass-border bg-glass/40 hover:bg-glass/80 text-ink font-semibold text-xs transition duration-150 hover:scale-[1.01]"
                        >
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.41 0-6.19-2.78-6.19-6.19s2.78-6.19 6.19-6.19c1.7 0 3.24.69 4.36 1.81l3.05-3.05C19.34 2.87 15.98 1.5 12.24 1.5c-5.79 0-10.5 4.71-10.5 10.5s4.71 10.5 10.5 10.5c5.79 0 10.5-4.71 10.5-10.5 0-.74-.08-1.46-.22-2.165H12.24z"/>
                            </svg>
                            <span>Google</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOAuthRedirect('github')}
                            className="flex items-center justify-center py-2.5 px-4 rounded-full border border-glass-border bg-glass/40 hover:bg-glass/80 text-ink font-semibold text-xs transition duration-150 hover:scale-[1.01]"
                        >
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                            </svg>
                            <span>GitHub</span>
                        </button>
                    </div>

                    {/* Navigation Link */}
                    <div className="mt-8 text-center text-xs text-muted">
                        Already have an account?{' '}
                        <Link to="/login" className="text-secondary hover:text-secondary/85 font-semibold transition duration-150 hover:underline">
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
