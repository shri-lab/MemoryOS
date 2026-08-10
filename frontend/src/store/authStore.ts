import { create } from 'zustand';

/**
 * User profile definition.
 */
export interface User {
    id: string;
    email: string;
    created_at: string;
    theme_preference?: string;
    preferences?: {
        default_search_top_k: number;
        default_landing_page: 'dashboard' | 'last-visited';
        chat_auto_title_enabled: boolean;
    };
}

/**
 * Zustand authentication store state and actions.
 */
interface AuthState {
    token: string | null;
    user: User | null;
    isAuthenticated: boolean;
    setToken: (token: string | null) => void;
    setUser: (user: User | null) => void;
    logout: () => void;
}

const STORAGE_KEY = 'memoryos_token';

// Initial token load from localStorage
const initialToken = localStorage.getItem(STORAGE_KEY);

/**
 * Zustand authentication store. Handles JWT token lifecycle, 
 * user metadata storage, and derived authentication state.
 */
export const useAuthStore = create<AuthState>((set) => ({
    token: initialToken,
    user: null,
    isAuthenticated: !!initialToken,

    /**
     * Updates the JWT token in state and persists it to localStorage.
     * @param token The JWT access token, or null to clear it.
     */
    setToken: (token: string | null) => {
        if (token) {
            localStorage.setItem(STORAGE_KEY, token);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        set({ token, isAuthenticated: !!token });
    },

    /**
     * Updates the authenticated user metadata.
     * @param user The user object, or null to clear it.
     */
    setUser: (user: User | null) => set({ user }),

    /**
     * Clears all authentication state, including token and user,
     * and deletes the persisted token from localStorage.
     */
    logout: () => {
        localStorage.removeItem(STORAGE_KEY);
        set({ token: null, user: null, isAuthenticated: false });
    }
}));
