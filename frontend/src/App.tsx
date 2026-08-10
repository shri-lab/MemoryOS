import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, User } from './store/authStore';
import api from './services/api';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PdfLibrary from './pages/PdfLibrary';
import ImageLibrary from './pages/ImageLibrary';
import Chat from './pages/Chat';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import AuthCallback from './pages/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import { useThemeStore } from './store/themeStore';

/**
 * Main Application Component.
 * Sets up routing structure and performs app-level session recovery
 * on mount if a JWT token is present in the local storage.
 */
export default function App() {
    // Initialize global theme state
    useThemeStore();

    const reconcileWithBackend = useThemeStore((state) => state.reconcileWithBackend);
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);
    const logout = useAuthStore((state) => state.logout);
    const [initializing, setInitializing] = useState(!!token && !user);

    useEffect(() => {
        /**
         * Resolves user metadata if token exists but user profile is unpopulated.
         */
        const initUser = async () => {
            if (token && !user) {
                try {
                    const res = await api.get<User>('/auth/me');
                    setUser(res.data);
                    if (res.data.theme_preference) {
                        reconcileWithBackend(res.data.theme_preference as any);
                    }
                } catch (err) {
                    console.error('Failed to initialize user session:', err);
                    logout();
                } finally {
                    setInitializing(false);
                }
            } else {
                setInitializing(false);
            }
        };
        initUser();
    }, [token, user, setUser, logout, reconcileWithBackend]);

    if (initializing) {
        return (
            <div className="min-h-screen bg-paper flex items-center justify-center text-ink font-sans">
                <div className="flex flex-col items-center space-y-4">
                    <svg
                        className="animate-spin h-8 w-8 text-indigo-primary"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <span className="text-ink/50 text-sm font-medium">Initializing session...</span>
                </div>
            </div>
        );
    }

    return (
        <Router>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route
                    element={
                        <ProtectedRoute>
                            <AppShell />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/pdf-library" element={<PdfLibrary />} />
                    <Route path="/images" element={<ImageLibrary />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/chat/:conversationId" element={<Chat />} />
                    <Route path="/screenshots" element={<Navigate to="/images" replace />} />
                    <Route path="/graph" element={<KnowledgeGraph />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}
