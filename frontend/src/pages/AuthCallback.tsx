import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore, User } from '../store/authStore';

export default function AuthCallback() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const setToken = useAuthStore((state) => state.setToken);
    const setUser = useAuthStore((state) => state.setUser);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const code = searchParams.get('code');
        if (!code) {
            setError('Authorization exchange code is missing.');
            return;
        }

        const exchangeCode = async () => {
            try {
                // 1. Exchange short-lived code for JWT
                const res = await api.post<{ access_token: string }>('/auth/oauth/exchange', { code });
                const token = res.data.access_token;
                setToken(token);

                // 2. Fetch authenticated profile details
                const meRes = await api.get<User>('/auth/me');
                setUser(meRes.data);

                // 3. Redirect to dashboard
                navigate('/dashboard');
            } catch (err: any) {
                console.error('OAuth exchange error:', err);
                setError('Authorization expired or invalid. Please request a fresh login session.');
            }
        };

        exchangeCode();
    }, [searchParams, setToken, setUser, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-paper text-ink font-sans relative px-4 overflow-hidden">
            {/* Barely perceptible radial gradient backplate */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(44,62,99,0.03)_0%,transparent_70%)] pointer-events-none" />

            <div className="w-full max-w-[420px] p-8 rounded-[10px] border border-ink/10 bg-paper shadow-[0_4px_24px_rgba(30,27,75,0.04)] z-10 text-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40 block mb-2 select-none">
                    MemoryOS · Personal Knowledge Engine
                </span>

                {error ? (
                    <div>
                        <h2 className="font-serif text-2xl font-normal text-status-brick mb-4">
                            Authentication Failed
                        </h2>
                        <div className="mb-6 p-4 rounded-[4px] border border-status-brick/30 bg-status-brick/5 text-status-brick font-mono text-xs text-left">
                            {error}
                        </div>
                        <Link
                            to="/login"
                            className="font-sans px-4 py-2 border border-indigo-primary text-indigo-primary text-xs font-semibold hover:bg-lavender-light transition rounded-lg inline-block"
                        >
                            Return to Sign In
                        </Link>
                    </div>
                ) : (
                    <div>
                        <h2 className="font-serif text-2xl font-normal text-indigo-deep mb-4">
                            Syncing digital mind…
                        </h2>
                        <div className="flex flex-col items-center justify-center space-y-4">
                            {/* Loader Spinner */}
                            <svg className="animate-spin h-8 w-8 text-indigo-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="font-mono text-xs text-ink/50 uppercase tracking-widest">
                                Validating security token
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
