import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { Menu, X, LogOut, ChevronDown, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface NavItem {
    label: string;
    path: string;
    isSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'PDF Library', path: '/pdf-library' },
    { label: 'Search', path: '/search' },
    { label: 'AI Chat', path: '/chat', isSoon: true },
    { label: 'Screenshots', path: '/screenshots', isSoon: true },
    { label: 'Knowledge Graph', path: '/graph', isSoon: true },
    { label: 'Settings', path: '/settings', isSoon: true },
];

export default function AppShell() {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userDropdownOpen, setUserDropdownOpen] = useState(false);

    const userInitial = user?.email 
        ? user.email.charAt(0).toUpperCase() 
        : 'U';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Close menus on resize
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setMobileMenuOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Close dropdowns on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setUserDropdownOpen(false);
                setMobileMenuOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="min-h-screen bg-lavender-light/40 text-ink font-sans flex flex-col relative">
            {/* Topbar navigation header */}
            <header className="fixed top-0 left-0 w-full h-16 bg-paper border-b border-ink/5 shadow-sm z-50 px-6 flex items-center justify-between">
                
                {/* Logo Section */}
                <div className="flex items-center space-x-8">
                    <Link 
                        to="/dashboard" 
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center space-x-2.5 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-primary/40 rounded-lg p-1"
                    >
                        <div className="w-7 h-7 rounded-md bg-indigo-primary flex items-center justify-center text-paper font-serif text-sm font-bold shadow-sm">
                            M
                        </div>
                        <span className="font-serif text-lg font-bold tracking-tight text-indigo-deep">
                            MemoryOS
                        </span>
                    </Link>

                    {/* Desktop horizontal nav */}
                    <nav className="hidden md:flex items-center space-x-6 h-16">
                        {NAV_ITEMS.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => 
                                    `text-xs font-semibold flex items-center space-x-1.5 transition-all select-none focus:outline-none focus:text-indigo-primary ${
                                        isActive 
                                            ? "text-indigo-primary border-b-2 border-indigo-primary h-16 flex items-center mt-[2px]" 
                                            : "text-ink/55 hover:text-indigo-primary"
                                    }`
                                }
                            >
                                <span>{item.label}</span>
                                {item.isSoon && (
                                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-indigo-primary/5 text-indigo-primary/75 border border-indigo-primary/10 tracking-wide font-mono scale-90">
                                        SOON
                                    </span>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                {/* Right Area: User Menu & Hamburger */}
                <div className="flex items-center space-x-4">
                    
                    {/* User profile dropdown container */}
                    <div className="relative">
                        <button
                            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                            className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-lavender-light/50 transition focus:outline-none focus:ring-2 focus:ring-indigo-primary/40"
                            aria-expanded={userDropdownOpen}
                            aria-haspopup="true"
                            title={user?.email || 'User Account'}
                        >
                            <div className="w-8 h-8 rounded-full bg-indigo-primary/10 text-indigo-primary flex items-center justify-center text-xs font-mono font-bold select-none border border-indigo-primary/20 shadow-inner">
                                {userInitial}
                            </div>
                            <span className="hidden sm:inline text-xs font-medium text-ink/65 max-w-[120px] truncate">
                                {user?.email}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 text-ink/40 hidden sm:block" />
                        </button>

                        {/* Dropdown Menu block */}
                        {userDropdownOpen && (
                            <>
                                {/* Click mask */}
                                <div 
                                    className="fixed inset-0 z-30" 
                                    onClick={() => setUserDropdownOpen(false)}
                                />
                                <div className="absolute right-0 mt-2.5 w-56 bg-paper border border-ink/10 rounded-xl shadow-xl py-2 z-40 animate-scaleUp origin-top-right">
                                    <div className="px-4 py-2 border-b border-ink/5 mb-1.5">
                                        <span className="text-[10px] text-ink/40 block font-semibold uppercase tracking-wider">
                                            Signed In As
                                        </span>
                                        <span className="text-xs font-medium text-indigo-deep truncate block font-mono">
                                            {user?.email}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setUserDropdownOpen(false);
                                            handleLogout();
                                        }}
                                        className="w-full text-left px-4 py-2 text-xs font-semibold text-status-brick hover:bg-status-brick/5 transition flex items-center space-x-2"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span>Log Out</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Hamburger menu button for small screens */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg border border-ink/10 hover:bg-lavender-light text-ink/60 transition focus:outline-none focus:ring-2 focus:ring-indigo-primary/40"
                        aria-expanded={mobileMenuOpen}
                        aria-label="Toggle navigation menu"
                    >
                        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {/* Mobile Nav Drawer panel */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-16 bg-paper border-b border-ink/10 shadow-lg z-40 animate-slideDown overflow-y-auto">
                    <nav className="p-6 space-y-3.5 flex flex-col">
                        {NAV_ITEMS.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => setMobileMenuOpen(false)}
                                className={({ isActive }) => 
                                    `text-sm font-semibold py-2 px-3 rounded-lg flex items-center justify-between transition ${
                                        isActive 
                                            ? "bg-indigo-primary/10 text-indigo-primary" 
                                            : "text-ink/65 hover:bg-lavender-light"
                                    }`
                                }
                            >
                                <span>{item.label}</span>
                                {item.isSoon && (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded bg-indigo-primary/5 text-indigo-primary/75 border border-indigo-primary/10 tracking-wide font-mono">
                                        SOON
                                    </span>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                </div>
            )}

            {/* Content outlet wrapper */}
            <div className="pt-16 min-h-screen flex flex-col">
                <Outlet />
            </div>
        </div>
    );
}
