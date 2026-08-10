import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import api from '../services/api';
import {
    Settings as SettingsIcon,
    Moon,
    Sun,
    Monitor,
    User as UserIcon,
    Lock,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Loader2,
    LogOut,
    Sliders,
    Database,
    Trash2,
    Search
} from 'lucide-react';

interface UserSettings {
    email: string;
    oauth_provider: string | null;
    has_password: boolean;
    preferences: {
        default_search_top_k: number;
        default_landing_page: 'dashboard' | 'last-visited';
        chat_auto_title_enabled: boolean;
    };
}

interface StorageUsage {
    total_files: number;
    total_chunks: number;
    approx_storage_bytes: number;
}

type TabType = 'appearance' | 'account' | 'preferences' | 'data';

export default function Settings() {
    const navigate = useNavigate();
    const logout = useAuthStore((state) => state.logout);
    const { theme, resolvedTheme, setTheme } = useThemeStore();

    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('appearance');

    // Sidebar search filter query
    const [searchQuery, setSearchQuery] = useState('');

    // Change Password Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    // Preferences Sync Saving Indicator
    const [preferencesSaving, setPreferencesSaving] = useState(false);

    // Delete Account Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Fetch current user settings & usage stats on mount
    useEffect(() => {
        const fetchSettingsAndUsage = async () => {
            setLoading(true);
            setError(null);
            try {
                const [settingsRes, usageRes] = await Promise.all([
                    api.get<UserSettings>('/auth/users/me'),
                    api.get<StorageUsage>('/auth/users/me/usage')
                ]);
                setSettings(settingsRes.data);
                setUsage(usageRes.data);
            } catch (err: any) {
                console.error('Failed to load user configurations:', err);
                setError(err.response?.data?.detail || 'Failed to retrieve profile data.');
            } finally {
                setLoading(false);
            }
        };

        fetchSettingsAndUsage();
    }, []);

    // Password Update
    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);
        setPasswordSuccess(null);

        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }

        if (newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters long.');
            return;
        }

        setPasswordLoading(true);
        try {
            await api.post('/auth/users/me/change-password', {
                current_password: currentPassword,
                new_password: newPassword,
            });
            setPasswordSuccess('Password successfully updated!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error('Failed to change password:', err);
            setPasswordError(err.response?.data?.detail || 'Failed to change password. Validate current password.');
        } finally {
            setPasswordLoading(false);
        }
    };

    // User Preferences Sync
    const handlePreferencesChange = async (updatedFields: Partial<UserSettings['preferences']>) => {
        if (!settings) return;
        setPreferencesSaving(true);
        try {
            const nextPrefs = { ...settings.preferences, ...updatedFields };
            const res = await api.patch('/auth/users/me/preferences', nextPrefs);
            setSettings(res.data);
        } catch (err: any) {
            console.error('Failed to sync preferences:', err);
        } finally {
            setPreferencesSaving(false);
        }
    };

    // Account Deletion
    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteError(null);

        // Verification checks
        if (settings?.has_password) {
            if (!deletePassword) {
                setDeleteError('Please enter your password to confirm.');
                return;
            }
        } else {
            if (deleteConfirmText !== settings?.email) {
                setDeleteError(`Please type "${settings?.email}" to confirm.`);
                return;
            }
        }

        setDeleteLoading(true);
        try {
            await api.delete('/auth/users/me', {
                data: { password: settings?.has_password ? deletePassword : null }
            });
            setShowDeleteModal(false);
            logout();
            navigate('/login');
        } catch (err: any) {
            console.error('Failed to delete account:', err);
            setDeleteError(err.response?.data?.detail || 'Credentials validation failed.');
        } finally {
            setDeleteLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center glow-bg min-h-screen">
                <div className="flex flex-col items-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-secondary shadow-cyan-glow" />
                    <span className="text-xs font-mono font-bold text-muted tracking-widest uppercase">Loading configurations...</span>
                </div>
            </div>
        );
    }

    if (error || !settings) {
        return (
            <div className="max-w-2xl mx-auto my-8 p-6 bg-danger/5 border border-danger/30 rounded-2xl flex items-start space-x-3 text-danger font-mono text-xs">
                <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-danger animate-pulse" />
                <div>
                    <h3 className="font-display text-lg font-bold text-ink mb-1">Configuration Error</h3>
                    <p className="font-mono text-xs text-danger">{error || 'Could not load settings details.'}</p>
                </div>
            </div>
        );
    }

    // Sidebar items definition
    const sidebarItems: { id: TabType; label: string; icon: React.ReactNode; category: string }[] = [
        { id: 'appearance', label: 'Appearance', icon: resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />, category: 'Settings' },
        { id: 'account', label: 'Account & Security', icon: <UserIcon className="h-4 w-4" />, category: 'Settings' },
        { id: 'preferences', label: 'Preferences', icon: <Sliders className="h-4 w-4" />, category: 'Customize' },
        { id: 'data', label: 'Data & Storage', icon: <Database className="h-4 w-4" />, category: 'Customize' }
    ];

    // Filtered items based on search input
    const filteredItems = sidebarItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto px-6 py-10 text-ink font-sans relative z-10 w-full min-h-screen glow-bg overflow-hidden">

            {/* Header */}
            <div className="flex items-center space-x-3 mb-8 border-b border-glass-border pb-5 relative z-10">
                <div className="p-2.5 rounded-xl bg-glass border border-glass-border text-secondary shadow-cyan-glow">
                    <SettingsIcon className="h-6 w-6" />
                </div>
                <div>
                    <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
                        Settings
                    </h1>
                    <p className="text-xs text-muted mt-1">
                        Manage your user interface theme, profile credentials, and workspace settings
                    </p>
                </div>
            </div>

            {/* Layout container */}
            <div className="flex flex-col md:flex-row gap-8 relative z-10">
                {/* 1. Left Nav Sidebar Pane */}
                <div className="w-full md:w-64 shrink-0 space-y-6">
                    {/* Sidebar search bar */}
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted pointer-events-none">
                            <Search className="h-4 w-4" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search settings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-[#1E1E2A] border border-glass-border text-ink rounded-full focus:outline-none focus:border-secondary focus:shadow-cyan-glow transition-all"
                        />
                    </div>

                    {/* Navigation tab groups */}
                    <div className="space-y-6">
                        {['Settings', 'Customize'].map((cat) => {
                            const catItems = filteredItems.filter(item => item.category === cat);
                            if (catItems.length === 0) return null;
                            return (
                                <div key={cat} className="space-y-2">
                                    <h3 className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted px-3">
                                        {cat}
                                    </h3>
                                    <div className="space-y-1">
                                        {catItems.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveTab(item.id)}
                                                className={`w-full flex items-center space-x-2.5 px-4 py-2.5 text-sm font-bold rounded-full transition-all hover:scale-[1.01] duration-150 ${
                                                    activeTab === item.id
                                                        ? 'bg-primary/20 text-secondary border border-secondary/40 shadow-cyan-glow'
                                                        : 'text-muted hover:bg-glass/50 hover:text-ink'
                                                }`}
                                            >
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Right Main Settings Pane */}
                <div className="flex-1 min-w-0">
                    {/* Tab: Appearance */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6">
                            <div className="border-b border-glass-border pb-3">
                                <h2 className="font-display text-xl font-bold text-ink">Appearance</h2>
                                <p className="text-xs text-muted mt-1">Configure layout styling preferences.</p>
                            </div>

                            <section className="glass-panel border border-glass-border rounded-2xl p-6 shadow-cyan-glow">
                                <h3 className="text-sm font-bold mb-2">Interface Theme</h3>
                                <p className="text-xs text-muted mb-6">Choose how MemoryOS appearance adapts to your device.</p>

                                <div className="flex items-center justify-between p-4 bg-obsidian/45 border border-glass-border rounded-2xl shadow-inner">
                                    <div className="flex flex-col pr-4">
                                        <span className="text-sm font-bold">Theme Mode</span>
                                        <span className="text-xs text-muted mt-0.5">Toggle dim layout lighting for comfortable night usage.</span>
                                    </div>

                                    <div className="flex border border-glass-border rounded-full p-0.5 bg-obsidian/40 shrink-0">
                                        <button
                                            onClick={() => setTheme('system')}
                                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                                theme === 'system' 
                                                    ? 'bg-primary/25 text-secondary shadow-cyan-glow border border-glass-border/55' 
                                                    : 'text-muted hover:text-ink border border-transparent'
                                            }`}
                                            title="Follow OS theme settings"
                                        >
                                            <Monitor className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">System</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                                theme === 'light' 
                                                    ? 'bg-primary/25 text-secondary shadow-cyan-glow border border-glass-border/55' 
                                                    : 'text-muted hover:text-ink border border-transparent'
                                            }`}
                                            title="Light Mode"
                                        >
                                            <Sun className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">Light</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                                theme === 'dark' 
                                                    ? 'bg-primary/25 text-secondary shadow-cyan-glow border border-glass-border/55' 
                                                    : 'text-muted hover:text-ink border border-transparent'
                                            }`}
                                            title="Dark Mode"
                                        >
                                            <Moon className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">Dark</span>
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* Tab: Account & Security */}
                    {activeTab === 'account' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="border-b border-glass-border pb-3">
                                <h2 className="font-display text-xl font-bold text-ink">Account & Security</h2>
                                <p className="text-xs text-muted mt-1">Manage credentials and authentication preferences.</p>
                            </div>

                            <section className="glass-panel border border-glass-border rounded-2xl p-6 shadow-cyan-glow space-y-6">
                                {/* Email Info */}
                                <div>
                                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-muted mb-2">Registered Email Address</label>
                                    <div className="flex items-center justify-between p-3 bg-obsidian/45 border border-glass-border rounded-full shadow-inner">
                                        <span className="text-sm font-bold pl-2">{settings.email}</span>
                                        {settings.oauth_provider && (
                                            <span className="text-[9px] font-mono font-bold uppercase bg-primary/20 text-secondary border border-secondary/25 px-2.5 py-0.5 rounded-full shadow-sm">
                                                OAuth Linked ({settings.oauth_provider})
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Password change form */}
                                {settings.has_password ? (
                                    <form onSubmit={handleChangePassword} className="space-y-4 pt-4 border-t border-glass-border">
                                        <h3 className="text-sm font-bold text-ink">Change Password</h3>

                                        {passwordSuccess && (
                                            <div className="p-3 bg-success/5 border border-success/30 rounded-full text-success text-xs font-mono flex items-center space-x-2">
                                                <CheckCircle2 className="h-4 w-4 text-success" />
                                                <span>{passwordSuccess}</span>
                                            </div>
                                        )}

                                        {passwordError && (
                                            <div className="p-3 bg-danger/5 border border-danger/30 rounded-full text-danger text-xs font-mono flex items-center space-x-2">
                                                <XCircle className="h-4 w-4 text-danger animate-pulse" />
                                                <span>{passwordError}</span>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <label className="block text-xs text-muted">Current Password</label>
                                            <input
                                                type="password"
                                                required
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="w-full px-4 py-2 text-sm bg-[#1E1E2A] border border-glass-border text-ink rounded-full focus:outline-none focus:border-secondary focus:shadow-cyan-glow transition-all"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="block text-xs text-muted">New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    className="w-full px-4 py-2 text-sm bg-[#1E1E2A] border border-glass-border text-ink rounded-full focus:outline-none focus:border-secondary focus:shadow-cyan-glow transition-all"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="block text-xs text-muted">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    className="w-full px-4 py-2 text-sm bg-[#1E1E2A] border border-glass-border text-ink rounded-full focus:outline-none focus:border-secondary focus:shadow-cyan-glow transition-all"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={passwordLoading}
                                            className="px-5 py-2 border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-secondary rounded-full text-xs font-bold transition-all shadow-cyan-glow flex items-center space-x-1.5 hover:scale-[1.01]"
                                        >
                                            {passwordLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            <span>Update Password</span>
                                        </button>
                                    </form>
                                ) : (
                                    <div className="p-4 bg-obsidian/45 border border-glass-border rounded-2xl text-xs text-muted">
                                        Account registered via OAuth ({settings.oauth_provider}). Password modification is disabled.
                                    </div>
                                )}

                                {/* Logout Row */}
                                <div className="pt-6 border-t border-glass-border flex justify-end">
                                    <button
                                        onClick={() => {
                                            logout();
                                            navigate('/login');
                                        }}
                                        className="px-4 py-2 border border-glass-border hover:bg-glass/80 text-ink bg-glass/40 rounded-full text-xs font-bold flex items-center space-x-1.5 transition-all hover:scale-[1.01] shadow-sm"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        <span>Sign Out Account</span>
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* Tab: Preferences */}
                    {activeTab === 'preferences' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="border-b border-glass-border pb-3">
                                <h2 className="font-display text-xl font-bold text-ink">Customize Preferences</h2>
                                <p className="text-xs text-muted mt-1">Configure default search retrieval counts, auto-titles, and landing page redirection.</p>
                            </div>

                            <section className="glass-panel border border-glass-border rounded-2xl p-6 shadow-sm space-y-6">
                                {/* Saving Loader Indicator */}
                                {preferencesSaving && (
                                    <div className="flex justify-end text-[9px] font-mono font-bold text-secondary items-center space-x-1 uppercase tracking-widest animate-pulse">
                                        <Loader2 className="h-3 w-3 animate-spin text-secondary" />
                                        <span>Saving preferences...</span>
                                    </div>
                                )}

                                {/* Preference: default_search_top_k */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold">Universal Search Top K</label>
                                        <span className="text-xs font-bold text-secondary font-mono bg-secondary/15 px-2 py-0.5 rounded-full border border-secondary/25 shadow-sm">{settings.preferences.default_search_top_k} results</span>
                                    </div>
                                    <p className="text-xs text-muted">Determine the default number of matching document snippets to retrieve during search.</p>
                                    <input
                                        type="range"
                                        min="3"
                                        max="20"
                                        value={settings.preferences.default_search_top_k}
                                        onChange={(e) => handlePreferencesChange({ default_search_top_k: parseInt(e.target.value) })}
                                        className="w-full h-1.5 bg-obsidian rounded-full appearance-none cursor-pointer accent-secondary border border-glass-border shadow-cyan-glow"
                                    />
                                </div>

                                {/* Preference: default_landing_page */}
                                <div className="space-y-2 pt-4 border-t border-glass-border">
                                    <label className="block text-sm font-bold text-ink">Default Landing Page</label>
                                    <p className="text-xs text-muted">Choose which page to route to immediately after authentication.</p>
                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                        <button
                                            onClick={() => handlePreferencesChange({ default_landing_page: 'dashboard' })}
                                            className={`p-4 border rounded-2xl text-left text-xs font-semibold transition-all hover:scale-[1.01] duration-150 ${
                                                settings.preferences.default_landing_page === 'dashboard'
                                                    ? 'border-secondary bg-primary/20 text-secondary shadow-cyan-glow'
                                                    : 'border-glass-border bg-glass/40 hover:bg-glass/80 text-ink'
                                            }`}
                                        >
                                            <div className="font-bold text-sm">Dashboard</div>
                                            <div className="text-[10px] text-muted mt-1 font-normal">Go directly to the files dashboard panel.</div>
                                        </button>
                                        <button
                                            onClick={() => handlePreferencesChange({ default_landing_page: 'last-visited' })}
                                            className={`p-4 border rounded-2xl text-left text-xs font-semibold transition-all hover:scale-[1.01] duration-150 ${
                                                settings.preferences.default_landing_page === 'last-visited'
                                                    ? 'border-secondary bg-primary/20 text-secondary shadow-cyan-glow'
                                                    : 'border-glass-border bg-glass/40 hover:bg-glass/80 text-ink'
                                            }`}
                                        >
                                            <div className="font-bold text-sm">Last Visited Page</div>
                                            <div className="text-[10px] text-muted mt-1 font-normal">Recover your last open tab/workspace state automatically.</div>
                                        </button>
                                    </div>
                                </div>

                                {/* Preference: chat_auto_title_enabled */}
                                <div className="flex items-center justify-between pt-6 border-t border-glass-border">
                                    <div className="flex flex-col pr-4">
                                        <span className="text-sm font-bold">Auto-Title Conversations</span>
                                        <span className="text-xs text-muted mt-0.5">Allow Gemini to title chats based on the first message.</span>
                                    </div>
                                    <button
                                        onClick={() => handlePreferencesChange({ chat_auto_title_enabled: !settings.preferences.chat_auto_title_enabled })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none border border-glass-border/40 ${
                                            settings.preferences.chat_auto_title_enabled ? 'bg-secondary shadow-cyan-glow' : 'bg-obsidian'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                settings.preferences.chat_auto_title_enabled ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* Tab: Data & Storage */}
                    {activeTab === 'data' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="border-b border-glass-border pb-3">
                                <h2 className="font-display text-xl font-bold text-ink">Data & Storage</h2>
                                <p className="text-xs text-muted mt-1">Review storage metrics or delete your profile.</p>
                            </div>

                            {/* Storage analytics stats */}
                            <section className="glass-panel border border-glass-border rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold mb-4">Workspace Analytics</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-glass/40 border border-glass-border/50 rounded-2xl text-center shadow-inner">
                                        <div className="text-xl font-extrabold text-secondary">{usage?.total_files || 0}</div>
                                        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted mt-1">Total Files</div>
                                    </div>
                                    <div className="p-4 bg-glass/40 border border-glass-border/50 rounded-2xl text-center shadow-inner">
                                        <div className="text-xl font-extrabold text-secondary">{usage?.total_chunks || 0}</div>
                                        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted mt-1">Total Chunks</div>
                                    </div>
                                    <div className="p-4 bg-glass/40 border border-glass-border/50 rounded-2xl text-center shadow-inner">
                                        <div className="text-xl font-extrabold text-muted">N/A</div>
                                        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted mt-1" title="Size is not currently tracked by metadata database schemas.">Storage Used</div>
                                    </div>
                                </div>
                                <p className="text-[9px] font-mono text-muted mt-3 italic">* File size values are not currently tracked in model schemas (approximate storage reported as N/A).</p>
                            </section>

                            {/* Danger Zone panel */}
                            <section className="bg-danger/5 border border-danger/30 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center space-x-2 text-danger mb-3">
                                    <AlertTriangle className="h-5 w-5 text-danger animate-pulse" />
                                    <h3 className="font-display text-lg font-bold text-ink">Danger Zone</h3>
                                </div>
                                <p className="text-xs text-muted mb-4 leading-relaxed">
                                    Permanently delete your user profile and all associated data. This action is irreversible: your documents, vector chunks, chats, and histories will be permanently removed.
                                </p>
                                <button
                                    onClick={() => {
                                        setDeleteError(null);
                                        setDeletePassword('');
                                        setDeleteConfirmText('');
                                        setShowDeleteModal(true);
                                    }}
                                    className="px-5 py-2.5 bg-gradient-to-r from-danger to-danger/80 hover:to-danger/95 text-white rounded-full text-xs font-bold shadow-violet-glow flex items-center space-x-1.5 hover:scale-[1.01] transition-all"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete Account...</span>
                                </button>
                            </section>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirm Account Deletion Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 bg-obsidian/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
                    <div className="glass-panel border border-glass-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-violet-glow relative z-10 animate-scaleUp">
                        <div className="flex items-start space-x-3 text-danger">
                            <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5 text-danger animate-pulse" />
                            <div>
                                <h3 className="font-display text-lg font-bold text-ink">Delete Account permanently?</h3>
                                <p className="text-xs text-muted mt-1 leading-relaxed">This operation deletes all private documents and logs.</p>
                            </div>
                        </div>

                        {deleteError && (
                            <div className="p-3 bg-danger/5 border border-danger/30 rounded-full text-danger text-xs font-mono">
                                {deleteError}
                            </div>
                        )}

                        <form onSubmit={handleDeleteAccount} className="space-y-4">
                            {settings.has_password ? (
                                <div className="space-y-1">
                                    <label className="block text-xs text-muted">Re-enter your Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        placeholder="Enter account password"
                                        className="w-full px-4 py-2 text-sm bg-obsidian/60 border border-glass-border text-ink rounded-full focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-all focus:shadow-violet-glow"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <label className="block text-xs text-muted">
                                        Type <span className="font-mono font-bold select-all text-secondary">{settings.email}</span> to confirm
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder={settings.email}
                                        className="w-full px-4 py-2 text-sm bg-obsidian/60 border border-glass-border text-ink rounded-full focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-all focus:shadow-violet-glow"
                                    />
                                </div>
                            )}

                            <div className="flex space-x-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 py-2 text-xs font-bold border border-glass-border bg-glass/40 hover:bg-glass/80 text-ink rounded-full transition-all hover:scale-[1.01] shadow-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={
                                        deleteLoading ||
                                        (settings.has_password ? !deletePassword : deleteConfirmText !== settings.email)
                                    }
                                    className="flex-1 py-2 text-xs font-bold bg-gradient-to-r from-danger to-danger/80 hover:to-danger/95 disabled:opacity-50 text-white rounded-full transition-all hover:scale-[1.01] shadow-violet-glow flex items-center justify-center space-x-1.5"
                                >
                                    {deleteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    <span>Delete permanently</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
