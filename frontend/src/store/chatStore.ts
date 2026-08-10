import { create } from 'zustand';
import api from '../services/api';

export interface Source {
    file_id: string;
    filename: string;
    page_number: number | null;
    snippet: string;
    source_type?: string;
}

export interface Message {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    sources: Source[] | null;
    referenced_files?: string[] | null;
    answer_mode?: 'grounded' | 'general_knowledge' | null;
    created_at: string;
    status?: 'pending' | 'done' | 'error';
}

export interface Conversation {
    id: string;
    title: string | null;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
}

interface ChatState {
    conversations: Conversation[];
    activeConversationId: string | null;
    activeMessages: Message[];
    loading: boolean;
    error: string | null;
    
    // Actions
    fetchConversations: () => Promise<void>;
    fetchConversationDetails: (id: string) => Promise<void>;
    createConversation: () => Promise<string>;
    deleteConversation: (id: string) => Promise<void>;
    sendMessage: (id: string, content: string) => Promise<void>;
    togglePin: (id: string) => Promise<void>;
    setActiveConversationId: (id: string | null) => void;
    clearActiveConversation: () => void;
}

export const sortConversations = (conversations: Conversation[]): Conversation[] => {
    return [...conversations].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
};

export const useChatStore = create<ChatState>((set, get) => ({
    conversations: [],
    activeConversationId: null,
    activeMessages: [],
    loading: false,
    error: null,

    fetchConversations: async () => {
        set({ error: null });
        try {
            const res = await api.get<Conversation[]>('/conversations');
            set({ conversations: sortConversations(res.data) });
        } catch (err: any) {
            console.error('Failed to fetch conversations:', err);
            set({ error: err.response?.data?.detail || 'Failed to retrieve chat list.' });
        }
    },

    fetchConversationDetails: async (id: string) => {
        set({ loading: true, error: null });
        try {
            const res = await api.get<{ id: string; messages: Message[] }>(`/conversations/${id}`);
            const messagesWithStatus = res.data.messages.map(m => ({
                ...m,
                sources: m.sources ? m.sources.map(s => ({ ...s })) : null,
                referenced_files: m.referenced_files ? [...m.referenced_files] : null,
                status: 'done' as const
            }));
            set(state => {
                const fetchedIds = new Set(messagesWithStatus.map(m => m.id));
                const pendingMessages = state.activeMessages.filter(
                    m => m.conversation_id === id && !fetchedIds.has(m.id)
                );
                return {
                    activeMessages: [...messagesWithStatus, ...pendingMessages],
                    activeConversationId: id
                };
            });
        } catch (err: any) {
            console.error(`Failed to fetch conversation details for ${id}:`, err);
            set({ error: err.response?.data?.detail || 'Failed to load conversation history.' });
            throw err;
        } finally {
            set({ loading: false });
        }
    },

    createConversation: async () => {
        set({ error: null });
        try {
            const res = await api.post<Conversation>('/conversations');
            const newConv = res.data;
            set(state => ({
                conversations: sortConversations([newConv, ...state.conversations]),
                activeConversationId: newConv.id,
                activeMessages: []
            }));
            return newConv.id;
        } catch (err: any) {
            console.error('Failed to create conversation:', err);
            set({ error: err.response?.data?.detail || 'Failed to start a new chat session.' });
            throw err;
        }
    },

    deleteConversation: async (id: string) => {
        set({ error: null });
        try {
            await api.delete(`/conversations/${id}`);
            set(state => {
                const updatedConversations = state.conversations.filter(c => c.id !== id);
                const isActiveDeleted = state.activeConversationId === id;
                return {
                    conversations: updatedConversations,
                    activeConversationId: isActiveDeleted ? null : state.activeConversationId,
                    activeMessages: isActiveDeleted ? [] : state.activeMessages
                };
            });
        } catch (err: any) {
            console.error(`Failed to delete conversation ${id}:`, err);
            set({ error: err.response?.data?.detail || 'Failed to delete conversation.' });
            throw err;
        }
    },

    sendMessage: async (id: string, content: string) => {
        const userMsgId = crypto.randomUUID();
        const assistantMsgId = crypto.randomUUID();

        const userMsg: Message = {
            id: userMsgId,
            conversation_id: id,
            role: 'user',
            content,
            sources: null,
            created_at: new Date().toISOString(),
            status: 'done'
        };

        const assistantMsg: Message = {
            id: assistantMsgId,
            conversation_id: id,
            role: 'assistant',
            content: '',
            sources: null,
            created_at: new Date().toISOString(),
            status: 'pending'
        };

        set(state => ({
            activeMessages: [...state.activeMessages, userMsg, assistantMsg]
        }));

        try {
            const res = await api.post<Message>(`/conversations/${id}/messages`, { content });
            
            set(state => {
                const updatedMessages = state.activeMessages.map(m => {
                    if (m.id === assistantMsgId) {
                        return {
                            ...res.data,
                            sources: res.data.sources ? res.data.sources.map(s => ({ ...s })) : null,
                            referenced_files: res.data.referenced_files ? [...res.data.referenced_files] : null,
                            status: 'done' as const
                        };
                    }
                    return m;
                });

                const updatedConversations = state.conversations.map(c => {
                    if (c.id === id) {
                        const newTitle = (res.data as any).conversation_title || c.title;
                        return { ...c, title: newTitle, updated_at: new Date().toISOString() };
                    }
                    return c;
                });

                return {
                    activeMessages: updatedMessages,
                    conversations: sortConversations(updatedConversations)
                };
            });
        } catch (err: any) {
            console.error('Failed to send message:', err);
            const errorMsg = err.response?.data?.detail || 'Network error: failed to reach Q&A server.';
            set(state => ({
                activeMessages: state.activeMessages.map(m => {
                    if (m.id === assistantMsgId) {
                        return {
                            ...m,
                            content: errorMsg,
                            status: 'error' as const
                        };
                    }
                    return m;
                })
            }));
        }
    },

    togglePin: async (id: string) => {
        const conversations = get().conversations;
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;

        const newPinned = !conv.is_pinned;

        // Optimistically update frontend and sort
        set(state => {
            const updated = state.conversations.map(c => {
                if (c.id === id) {
                    return { ...c, is_pinned: newPinned };
                }
                return c;
            });
            return { conversations: sortConversations(updated) };
        });

        try {
            await api.patch(`/conversations/${id}`, { is_pinned: newPinned });
        } catch (err) {
            console.error('Failed to toggle pin:', err);
            // Revert state on error and re-sort
            set(state => {
                const reverted = state.conversations.map(c => {
                    if (c.id === id) {
                        return { ...c, is_pinned: !newPinned };
                    }
                    return c;
                });
                return { conversations: sortConversations(reverted) };
            });
        }
    },

    setActiveConversationId: (id: string | null) => {
        set({ activeConversationId: id });
    },

    clearActiveConversation: () => {
        set({ activeConversationId: null, activeMessages: [] });
    }
}));
