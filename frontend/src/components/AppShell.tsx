import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
    Menu, 
    X, 
    LogOut, 
    ChevronDown, 
    User, 
    LayoutDashboard, 
    Library, 
    Image as ImageIcon, 
    MessageSquare, 
    Network, 
    Settings as SettingsIcon, 
    Search,
    FileText
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import FilePreviewModal from './FilePreviewModal';

interface NavItem {
    label: string;
    path: string;
    icon: React.ComponentType<any>;
    isSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'HOME', path: '/dashboard', icon: LayoutDashboard },
    { label: 'LIBRARY', path: '/pdf-library', icon: Library },
    { label: 'IMAGES', path: '/images', icon: ImageIcon },
    { label: 'CHAT', path: '/chat', icon: MessageSquare },
    { label: 'GRAPH', path: '/graph', icon: Network },
    { label: 'SETTINGS', path: '/settings', icon: SettingsIcon },
];

export default function AppShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    const [chunksCount, setChunksCount] = useState<number | null>(null);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [searchVal, setSearchVal] = useState('');
    const [files, setFiles] = useState<any[]>([]);
    const [previewFileId, setPreviewFileId] = useState<string | null>(null);
    const [userDropdownOpen, setUserDropdownOpen] = useState(false);

    useEffect(() => {
        if (user) {
            api.get('/auth/users/me/usage')
                .then((res: any) => {
                    if (res.data && typeof res.data.total_chunks === 'number') {
                        setChunksCount(res.data.total_chunks);
                    }
                })
                .catch((err) => {
                    console.warn('Failed to fetch chunks count for navigation readout:', err);
                });
        }
    }, [user]);

    // Save active page route path in local storage
    useEffect(() => {
        const path = location.pathname;
        if (path && !['/login', '/register', '/auth/callback', '/'].includes(path)) {
            localStorage.setItem('memoryos-last-visited', path);
        }
    }, [location]);

    // Keyboard trigger for Command Palette
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setCommandPaletteOpen(false);
                setUserDropdownOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Load recent files on palette open
    useEffect(() => {
        if (commandPaletteOpen) {
            api.get('/files/recent')
                .then((res: any) => {
                    if (res.data && Array.isArray(res.data)) {
                        setFiles(res.data);
                    }
                })
                .catch(() => {});
        }
    }, [commandPaletteOpen]);

    const userInitial = user?.email 
        ? user.email.charAt(0).toUpperCase() 
        : 'U';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredFiles = files.filter(f => 
        f.filename.toLowerCase().includes(searchVal.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-obsidian text-ink font-sans flex flex-col md:flex-row relative">
            
            {/* Desktop Left Persistent Navigation Rail */}
            <aside className="hidden md:flex flex-col justify-between items-center py-6 w-20 border-r border-glass-border bg-glass/30 h-screen fixed left-0 top-0 z-50">
                <div className="flex flex-col items-center space-y-8 w-full">
                    {/* Brand Logo */}
                    <Link to="/dashboard" className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-black font-display text-base font-extrabold shadow-cyan-glow focus:outline-none">
                        M
                    </Link>

                    {/* Navigation Items */}
                    <nav className="flex flex-col items-center space-y-4 w-full">
                        {/* Command Palette Trigger Button */}
                        <button
                            onClick={() => setCommandPaletteOpen(true)}
                            className="group relative w-12 h-12 rounded-full flex items-center justify-center border border-glass-border bg-glass/20 hover:border-secondary hover:text-secondary text-muted hover:shadow-cyan-glow transition-all"
                            title="Search Memory (⌘K)"
                        >
                            <Search className="w-5 h-5" />
                            <span className="absolute left-full ml-3 px-2 py-1 text-[10px] font-mono font-bold text-secondary bg-obsidian border border-glass-border rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                SEARCH (⌘K)
                            </span>
                        </button>

                        <div className="w-8 h-[1px] bg-glass-border my-2" />

                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) => 
                                        `group relative w-12 h-12 rounded-full flex items-center justify-center transition-all focus:outline-none ${
                                            isActive 
                                                ? "text-secondary border border-secondary/40 bg-secondary/10 shadow-cyan-glow" 
                                                : "text-muted hover:text-secondary hover:bg-glass/30"
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <Icon className="w-5 h-5" />
                                            {isActive && (
                                                <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-secondary rounded-r-full shadow-cyan-glow" />
                                            )}
                                            <span className="absolute left-full ml-3 px-2 py-1 text-[10px] font-mono font-bold text-secondary bg-obsidian border border-glass-border rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                                {item.label}
                                            </span>
                                        </>
                                    )}
                                </NavLink>
                            );
                        })}
                    </nav>
                </div>

                {/* Footer User Profile */}
                <div className="flex flex-col items-center space-y-6 w-full">
                    {/* User profile dropdown container */}
                    <div className="relative">
                        <button
                            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                            className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary/10 text-secondary border border-secondary/25 shadow-cyan-glow transition focus:outline-none"
                            title={user?.email || 'User Account'}
                        >
                            <span className="text-xs font-mono font-bold">{userInitial}</span>
                        </button>
 
                        {/* Dropdown Menu block */}
                        {userDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setUserDropdownOpen(false)} />
                                <div className="absolute left-12 bottom-0 w-56 glass-panel rounded-2xl shadow-cyan-glow py-2 z-40 animate-scaleUp origin-bottom-left">
                                    <div className="px-4 py-2 border-b border-glass-border mb-1.5">
                                        <span className="text-[9px] text-muted block font-bold uppercase tracking-wider font-mono">
                                            Signed In As
                                        </span>
                                        <span className="text-xs font-medium text-ink truncate block font-mono">
                                            {user?.email}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setUserDropdownOpen(false);
                                            handleLogout();
                                        }}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-danger hover:bg-danger/5 transition flex items-center space-x-2"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span>Log Out</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* Mobile Top Navigation Header */}
            <header className="md:hidden fixed top-0 left-0 w-full h-12 bg-glass/65 backdrop-blur-md border-b border-glass-border flex items-center justify-between px-4 z-40">
                <Link to="/dashboard" className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-black font-display text-xs font-extrabold shadow-cyan-glow">
                        M
                    </div>
                    <span className="font-display text-sm font-extrabold tracking-tight text-ink">
                        MemoryOS
                    </span>
                </Link>

                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setCommandPaletteOpen(true)}
                        className="p-1.5 rounded-full border border-glass-border bg-glass/20 text-muted"
                        title="Search"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    
                    {/* Simple Logout indicator */}
                    <button
                        onClick={handleLogout}
                        className="p-1.5 rounded-full border border-glass-border bg-glass/20 text-danger"
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Mobile Bottom Frosted Navigation Tab Bar */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full h-16 bg-glass/85 backdrop-blur-xl border-t border-glass-border flex items-center justify-around z-50 px-2">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => 
                                `flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                                    isActive 
                                        ? "text-secondary bg-secondary/10" 
                                        : "text-muted"
                                }`
                            }
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[8px] font-bold mt-1 font-mono tracking-tight">{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>

            {/* Content Outlet Wrapper */}
            <div className="pt-12 pb-16 md:pt-0 md:pb-0 md:pl-20 min-h-screen flex flex-col flex-1 w-full relative z-10 overflow-hidden">
                
                {/* Global Digital Chunks Counter (Desktop Top-Right Floating) */}
                <div className="hidden md:flex absolute top-6 right-6 z-20">
                    <div className="flex items-center space-x-2 bg-obsidian/60 border border-glass-border px-3.5 py-1.5 rounded-full shadow-cyan-glow">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                        <span className="font-mono text-[9px] font-bold text-secondary tracking-widest uppercase">
                            {chunksCount !== null ? chunksCount.toLocaleString() : '1,273'} CHUNKS INDEXED
                        </span>
                    </div>
                </div>

                <Outlet />
            </div>

            {/* Global Command Palette Overlay Dialog (⌘K) */}
            {commandPaletteOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-obsidian/75 backdrop-blur-md animate-fadeIn">
                    <div className="fixed inset-0" onClick={() => setCommandPaletteOpen(false)} />
                    <div className="glass-panel max-w-xl w-full rounded-2xl shadow-cyan-glow border border-glass-border overflow-hidden bg-obsidian/90 z-10 animate-scaleUp">
                        <div className="relative flex items-center">
                            <Search className="w-4 h-4 text-muted absolute left-4" />
                            <input
                                type="text"
                                placeholder="Search index or files... (ESC to exit)"
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                                className="w-full bg-transparent pl-12 pr-4 py-4 text-ink placeholder-muted focus:outline-none text-sm border-b border-glass-border font-sans"
                                autoFocus
                            />
                        </div>

                        {/* Search Results / Quick Actions */}
                        <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
                            {searchVal.trim() === '' ? (
                                <>
                                    <div className="px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-muted">
                                        Quick Navigation
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                                        {NAV_ITEMS.map((item) => (
                                            <button
                                                key={item.path}
                                                onClick={() => {
                                                    navigate(item.path);
                                                    setCommandPaletteOpen(false);
                                                }}
                                                className="flex items-center space-x-2.5 p-2 rounded-xl border border-glass-border hover:border-secondary/40 hover:bg-glass/30 text-left transition-all text-xs font-bold"
                                            >
                                                <item.icon className="w-4 h-4 text-secondary" />
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : filteredFiles.length === 0 ? (
                                <div className="p-4 text-center text-xs text-muted font-mono">
                                    No matching documents found.
                                </div>
                            ) : (
                                <>
                                    <div className="px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-muted">
                                        Documents Found ({filteredFiles.length})
                                    </div>
                                    {filteredFiles.map((file) => (
                                        <button
                                            key={file.id}
                                            onClick={() => {
                                                setPreviewFileId(file.id);
                                                setCommandPaletteOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-glass-border hover:border-secondary/40 bg-glass/10 hover:bg-glass/40 text-left transition-all text-xs font-bold"
                                        >
                                            <div className="flex items-center space-x-2.5 truncate">
                                                <FileText className="w-4 h-4 text-secondary shrink-0" />
                                                <span className="truncate">{file.filename}</span>
                                            </div>
                                            <span className="text-[9px] font-mono text-muted uppercase shrink-0">
                                                {file.source_type}
                                            </span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Global File Preview Modal trigger */}
            {previewFileId && (
                <FilePreviewModal
                    fileId={previewFileId}
                    onClose={() => setPreviewFileId(null)}
                />
            )}
        </div>
    );
}
