import { create } from 'zustand';
import api from '../services/api';

export type ThemeType = 'light' | 'dark' | 'system';
export type ResolvedThemeType = 'light' | 'dark';

interface ThemeState {
    theme: ThemeType;
    resolvedTheme: ResolvedThemeType;
    setTheme: (theme: ThemeType) => void;
    reconcileWithBackend: (backendTheme: ThemeType) => void;
}

const checkIsDark = (theme: ThemeType): boolean => {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
};

const applyThemeClass = (isDark: boolean) => {
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

export const useThemeStore = create<ThemeState>((set, get) => {
    // Read initial theme from localStorage (default to 'system')
    const initialTheme = (localStorage.getItem('memoryos-theme') as ThemeType) || 'system';
    const initialIsDark = checkIsDark(initialTheme);
    
    // Apply immediately on load
    applyThemeClass(initialIsDark);

    // Setup live OS media listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        if (get().theme === 'system') {
            const nextIsDark = e.matches;
            applyThemeClass(nextIsDark);
            set({ resolvedTheme: nextIsDark ? 'dark' : 'light' });
        }
    };

    try {
        mediaQuery.addEventListener('change', handleSystemThemeChange);
    } catch {
        // Fallback for older browsers
        mediaQuery.addListener(handleSystemThemeChange);
    }

    return {
        theme: initialTheme,
        resolvedTheme: initialIsDark ? 'dark' : 'light',
        setTheme: (newTheme: ThemeType) => {
            localStorage.setItem('memoryos-theme', newTheme);
            const isDark = checkIsDark(newTheme);
            applyThemeClass(isDark);
            
            set({
                theme: newTheme,
                resolvedTheme: isDark ? 'dark' : 'light'
            });

            // Trigger non-blocking async PATCH call to backend
            api.patch('/auth/users/me', { theme_preference: newTheme })
                .catch((err) => {
                    console.error('Failed to sync theme preference to backend:', err);
                });
        },
        reconcileWithBackend: (backendTheme: ThemeType) => {
            const currentLocalTheme = localStorage.getItem('memoryos-theme') as ThemeType;
            if (backendTheme && backendTheme !== currentLocalTheme) {
                localStorage.setItem('memoryos-theme', backendTheme);
                const isDark = checkIsDark(backendTheme);
                applyThemeClass(isDark);
                set({
                    theme: backendTheme,
                    resolvedTheme: isDark ? 'dark' : 'light'
                });
            }
        }
    };
});
