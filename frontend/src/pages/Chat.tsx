import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Plus, 
    Trash2, 
    Send, 
    Loader2, 
    Sparkles, 
    MessageSquare, 
    FileText, 
    ChevronDown, 
    Menu, 
    X,
    AlertCircle,
    RefreshCw,
    Pin,
    Copy,
    Check,
    Eye,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useChatStore, Source } from '../store/chatStore';
import FilePreviewModal from '../components/FilePreviewModal';

const SUGGESTIONS = [
    "What is the cabin baggage limit?",
    "What projects do I have listed?",
    "Is Zamzam water allowed on flights?"
];

function SourceCard({ source, onOpenPreview }: { source: Source; onOpenPreview: (source: Source) => void }) {
    return (
        <div 
            onClick={() => onOpenPreview(source)}
            className="border border-glass-border hover:border-secondary/40 rounded-xl p-3 bg-glass/65 hover:bg-glass/80 hover:shadow-cyan-glow transition-all shadow-sm text-left flex flex-col space-y-2 cursor-pointer group hover:scale-[1.01]"
        >
            <div className="flex items-center justify-between gap-3 pb-1 border-b border-glass-border">
                <div className="flex items-center space-x-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="font-sans text-[11px] font-bold text-ink truncate" title={source.filename}>
                        {source.filename}
                    </span>
                </div>
                <div className="flex items-center space-x-1 shrink-0">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/25">
                        {source.page_number != null ? `p. ${source.page_number}` : (source.source_type === 'screenshot' || source.source_type === 'image' ? 'Image' : 'PDF')}
                    </span>
                    <span className="p-1 rounded text-muted group-hover:text-secondary transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                    </span>
                </div>
            </div>
            {source.snippet && (
                <div 
                    className="text-[10px] text-ink leading-relaxed font-mono pl-2 border-l-2 border-secondary bg-obsidian/45 p-1 rounded-r mt-1 line-clamp-2 shadow-inner"
                >
                    {source.snippet}
                </div>
            )}
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1 hover:bg-glass/65 border border-transparent hover:border-glass-border rounded-lg text-muted hover:text-secondary transition flex items-center justify-center shrink-0"
            title="Copy response to clipboard"
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-success animate-pulse" />
            ) : (
                <Copy className="w-3.5 h-3.5" />
            )}
        </button>
    );
}

export default function Chat() {
    const { conversationId } = useParams<{ conversationId?: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryParam = searchParams.get('q');

    const {
        conversations,
        activeConversationId,
        activeMessages,
        loading,
        error,
        fetchConversations,
        fetchConversationDetails,
        createConversation,
        deleteConversation,
        sendMessage,
        togglePin,
        clearActiveConversation
    } = useChatStore();

    const [inputVal, setInputVal] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [openCitations, setOpenCitations] = useState<Source[] | null>(null);
    const [timeTick, setTimeTick] = useState(0);
    const [previewTarget, setPreviewTarget] = useState<{
        fileId: string;
        sourceType?: string;
        highlightPage?: number | null;
        highlightSnippet?: string | null;
    } | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Live-updating timestamps refresh tick
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeTick(t => t + 1);
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Initial load of conversations list
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Handle Route change / URL deep-linking
    useEffect(() => {
        if (conversationId) {
            if (activeConversationId !== conversationId) {
                fetchConversationDetails(conversationId).catch(() => {
                    navigate('/chat', { replace: true });
                });
            }
        } else {
            clearActiveConversation();
        }
    }, [conversationId, activeConversationId, fetchConversationDetails, clearActiveConversation, navigate]);

    // Handle dashboard search query submission redirect
    useEffect(() => {
        const handleInitialQuery = async () => {
            if (queryParam && queryParam.trim()) {
                setSearchParams({});
                try {
                    const newId = await createConversation();
                    navigate(`/chat/${newId}`, { replace: true });
                    setTimeout(() => {
                        sendMessage(newId, queryParam.trim());
                    }, 100);
                } catch (err) {
                    console.error('Failed to handle initial dashboard query:', err);
                }
            }
        };
        handleInitialQuery();
    }, [queryParam, setSearchParams, createConversation, navigate, sendMessage]);

    // Auto-scroll to bottom of thread and show references in side panel automatically
    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
        
        if (activeMessages.length > 0) {
            const lastMsg = activeMessages[activeMessages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.sources && lastMsg.sources.length > 0) {
                setOpenCitations(lastMsg.sources);
            }
        }
    }, [activeMessages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = inputVal.trim();
        if (!trimmed || loading) return;

        setInputVal('');

        let convId = activeConversationId;
        try {
            if (!convId) {
                convId = await createConversation();
                navigate(`/chat/${convId}`, { replace: true });
            }
            await sendMessage(convId, trimmed);
        } catch (err) {
            console.error('Failed to process message send:', err);
        } finally {
            inputRef.current?.focus();
        }
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this conversation? This will delete all its messages permanently.")) {
            try {
                await deleteConversation(id);
                if (activeConversationId === id) {
                    navigate('/chat', { replace: true });
                }
            } catch (err) {
                alert("Failed to delete conversation.");
            }
        }
    };

    const handleSuggestionClick = async (suggestion: string) => {
        setInputVal('');
        let convId = activeConversationId;
        try {
            if (!convId) {
                convId = await createConversation();
                navigate(`/chat/${convId}`, { replace: true });
            }
            await sendMessage(convId, suggestion);
        } catch (err) {
            console.error('Failed to process suggestion send:', err);
        }
    };

    const handleRetry = async (msgId: string, userText: string) => {
        if (!activeConversationId) return;
        
        useChatStore.setState(state => ({
            activeMessages: state.activeMessages.filter(m => m.id !== msgId)
        }));
        
        try {
            await sendMessage(activeConversationId, userText);
        } catch (err) {
            console.error('Retry failed:', err);
        }
    };

    const formatRelativeTime = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            let cleanStr = dateStr.trim();
            if (!cleanStr.endsWith('Z') && !cleanStr.includes('+')) {
                const lastDashIndex = cleanStr.lastIndexOf('-');
                const firstDashIndex = cleanStr.indexOf('-');
                const secondDashIndex = cleanStr.indexOf('-', firstDashIndex + 1);
                if (lastDashIndex === secondDashIndex) {
                    cleanStr = cleanStr + 'Z';
                }
            }
            if (cleanStr.includes(' ') && !cleanStr.includes('T')) {
                cleanStr = cleanStr.replace(' ', 'T');
            }
            const date = new Date(cleanStr);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            
            if (diffMs < 0) return 'Just now';
            
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    };

    const filteredConversations = conversations.filter(conv => 
        (conv.title || "New Conversation").toLowerCase().includes(searchQuery.toLowerCase())
    );

    const sidebarContent = (
        <div className="flex-grow flex flex-col h-full bg-glass/25 backdrop-blur-xl border-r border-glass-border">
            {/* Header controls & Toggle Collapse */}
            <div className="p-4 border-b border-glass-border flex items-center justify-between shrink-0">
                {!sidebarCollapsed && (
                    <span className="font-display text-[10px] font-extrabold text-ink tracking-widest uppercase">
                        Memory Logs
                    </span>
                )}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="p-1.5 rounded-lg border border-glass-border hover:bg-glass/80 text-muted hover:text-secondary transition bg-glass/40 ml-auto"
                    title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* New Chat Button */}
            <div className="p-4 border-b border-glass-border shrink-0 flex justify-center">
                <button
                    onClick={() => {
                        navigate('/chat', { replace: true });
                        clearActiveConversation();
                        setMobileSidebarOpen(false);
                    }}
                    className={`flex items-center justify-center border border-glass-border bg-glass/40 text-primary hover:text-secondary hover:bg-glass/80 transition-all shadow-sm hover:scale-[1.01] duration-150 shadow-violet-glow ${
                        sidebarCollapsed 
                            ? "w-10 h-10 rounded-full" 
                            : "w-full py-2.5 px-4 rounded-full space-x-2 text-xs font-bold"
                    }`}
                    title="New Chat"
                >
                    <Plus className="w-4 h-4" />
                    {!sidebarCollapsed && <span>New Chat</span>}
                </button>
            </div>

            {/* Search Input */}
            {!sidebarCollapsed && (
                <div className="px-4 pb-3 pt-2 border-b border-glass-border shrink-0">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search conversations..."
                        className="w-full px-3 py-1.5 rounded-full border border-glass-border bg-[#1E1E2A] text-xs text-ink focus:outline-none focus:border-secondary placeholder:text-muted focus:shadow-cyan-glow transition-all"
                    />
                </div>
            )}

            {/* Conversation list */}
            <div className="flex-grow overflow-y-auto px-2 py-3 space-y-1">
                {filteredConversations.length === 0 ? (
                    !sidebarCollapsed && (
                        <div className="text-center py-8 text-muted text-xs font-semibold">
                            No conversations found.
                        </div>
                    )
                ) : (
                    filteredConversations.map((conv) => {
                        const isActive = activeConversationId === conv.id;
                        return (
                            <div
                                key={conv.id}
                                onClick={() => {
                                    navigate(`/chat/${conv.id}`);
                                    setMobileSidebarOpen(false);
                                }}
                                className={`group flex items-center justify-between rounded-2xl cursor-pointer transition select-none ${
                                    sidebarCollapsed ? "p-2 justify-center" : "p-3"
                                } ${
                                    isActive 
                                        ? "bg-primary/20 text-secondary font-bold border-l-4 border-l-secondary shadow-sm" 
                                        : "text-muted hover:bg-glass/50 hover:text-ink"
                                }`}
                                title={conv.title || "New Conversation"}
                            >
                                {sidebarCollapsed ? (
                                    <MessageSquare className={`w-4 h-4 ${isActive ? 'text-secondary' : 'text-muted'}`} />
                                ) : (
                                    <>
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className="text-xs truncate">
                                                {conv.title || "New Conversation"}
                                            </span>
                                            <span className="text-[9px] font-mono text-muted mt-0.5">
                                                {formatRelativeTime(conv.updated_at)}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-1 shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePin(conv.id);
                                                }}
                                                className={`p-1 rounded-full transition md:opacity-0 group-hover:opacity-100 shrink-0 ${
                                                    conv.is_pinned 
                                                        ? "text-secondary md:opacity-100 bg-secondary/10" 
                                                        : "text-muted hover:text-secondary hover:bg-glass"
                                                }`}
                                                title={conv.is_pinned ? "Unpin" : "Pin"}
                                            >
                                                <Pin className={`w-3 h-3 ${conv.is_pinned ? "fill-secondary/20" : ""}`} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteConversation(conv.id, e)}
                                                className="p-1 text-muted hover:text-danger hover:bg-danger/10 rounded-full transition md:opacity-0 group-hover:opacity-100 shrink-0"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="flex-grow flex h-[calc(100vh-48px)] md:h-screen overflow-hidden bg-obsidian relative glow-bg flex-col md:flex-row">

            {/* Desktop Left Sidebar (Collapsible) */}
            <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} shrink-0 hidden md:flex flex-col h-full z-10 transition-all duration-200`}>
                {sidebarContent}
            </aside>

            {/* Mobile Sidebar Overlay Drawer */}
            {mobileSidebarOpen && (
                <div className="md:hidden fixed inset-0 z-30 flex">
                    <div 
                        className="fixed inset-0 bg-obsidian/85 backdrop-blur-md transition-opacity" 
                        onClick={() => setMobileSidebarOpen(false)}
                    />
                    <aside className="relative w-64 max-w-xs bg-obsidian h-full shadow-2xl z-40 flex flex-col pt-16 border-r border-glass-border">
                        <button
                            onClick={() => setMobileSidebarOpen(false)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg border border-glass-border hover:bg-glass/80 text-ink transition bg-glass/40"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        {sidebarContent}
                    </aside>
                </div>
            )}

            {/* Central Workspace: Chat Interface */}
            <main className="flex-grow flex flex-col h-full overflow-hidden relative border-r border-glass-border z-10">
                
                {/* Mobile top navigation header bar */}
                <div className="md:hidden h-12 border-b border-glass-border bg-glass/65 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-10">
                    <button
                        onClick={() => setMobileSidebarOpen(true)}
                        className="p-2 rounded-lg border border-glass-border hover:bg-glass/80 text-ink transition bg-glass/40"
                    >
                        <Menu className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-ink font-sans">
                        {conversations.find(c => c.id === activeConversationId)?.title || "Chat Session"}
                    </span>
                    <div className="w-8" />
                </div>

                {/* Messages scroll content pane */}
                <div 
                    ref={messagesContainerRef}
                    className="flex-grow overflow-y-auto px-4 md:px-6 py-6 space-y-6 relative z-10"
                >
                    {activeMessages.length === 0 ? (
                        <div className="max-w-xl mx-auto py-12 text-center animate-fadeIn flex flex-col justify-center min-h-[60vh]">
                            <div className="w-12 h-12 rounded-2xl bg-glass flex items-center justify-center text-secondary mb-6 border border-glass-border shadow-cyan-glow mx-auto select-none">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            
                            <h2 className="font-display text-3xl font-extrabold text-ink mb-3 tracking-tight">
                                Ask your digital memory
                            </h2>
                            
                            <p className="text-sm text-muted mb-8 max-w-sm mx-auto leading-relaxed">
                                Start a chat session grounded in your PDF library. We will reformulate queries contextually and retrieve relevant reference citations.
                            </p>
                            
                            <div className="space-y-2.5 max-w-md mx-auto relative z-10">
                                <span className="font-mono text-[9px] text-muted font-bold uppercase tracking-widest block select-none mb-2">
                                    Suggestions
                                </span>
                                <div className="flex flex-col space-y-2">
                                    {SUGGESTIONS.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSuggestionClick(s)}
                                            className="text-left px-4 py-2.5 rounded-full border border-glass-border bg-glass/40 hover:bg-glass/80 text-xs font-bold text-ink hover:text-secondary hover:border-secondary transition shadow-sm hover:shadow-cyan-glow duration-150"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl w-full mx-auto space-y-6 relative z-10">
                            {activeMessages.map((msg, index) => {
                                const isUser = msg.role === 'user';
                                
                                if (isUser) {
                                    return (
                                        <div key={msg.id} className="flex justify-end animate-fadeIn">
                                            <div className="bg-glass/60 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-cyan-glow font-sans border border-secondary/40">
                                                {msg.content}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={msg.id} className="flex justify-start animate-fadeIn">
                                        <div className="w-full max-w-[90%] md:max-w-[85%]">
                                            
                                            {msg.status === 'pending' && (
                                                <div className="flex space-x-1.5 p-3.5 bg-glass/40 border border-glass-border rounded-full max-w-[80px] justify-center items-center shadow-inner select-none shadow-cyan-glow">
                                                    <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce shadow-cyan-glow" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce shadow-cyan-glow" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce shadow-cyan-glow" style={{ animationDelay: '300ms' }} />
                                                </div>
                                            )}

                                            {msg.status === 'error' && (
                                                <div className="p-4 rounded-2xl border border-danger/30 bg-danger/5 text-danger flex flex-col sm:flex-row sm:items-start justify-between gap-4 max-w-xl shadow-sm animate-fadeIn font-mono text-xs">
                                                    <div className="flex items-start space-x-2.5 text-xs font-sans">
                                                        <AlertCircle className="w-4.5 h-4.5 shrink-0 text-danger mt-0.5 animate-pulse" />
                                                        <div className="flex flex-col space-y-1">
                                                            <span className="font-bold text-ink">Unable to Complete Request</span>
                                                            <span className="text-danger leading-relaxed">{msg.content}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const userQuestion = activeMessages[index - 1]?.content || '';
                                                            handleRetry(msg.id, userQuestion);
                                                        }}
                                                        className="px-3.5 py-1.5 bg-gradient-to-r from-danger to-danger/80 hover:to-danger/95 text-white text-[10px] font-bold transition rounded-full flex items-center space-x-1 justify-center shrink-0 shadow-violet-glow hover:scale-[1.02] duration-150"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        <span>Retry Query</span>
                                                    </button>
                                                </div>
                                            )}

                                            {msg.status === 'done' && (() => {
                                                const isGrounded = msg.answer_mode === 'grounded' || (msg.answer_mode === undefined && msg.sources && msg.sources.length > 0);
                                                return (
                                                    <div className="glass-panel border border-glass-border shadow-violet-glow rounded-2xl rounded-tl-none p-5 border-l-4 border-l-secondary text-left relative overflow-hidden">
                                                        
                                                         <div className="flex items-start justify-between gap-4 mb-3.5 relative z-10">
                                                            {isGrounded ? (
                                                                <div className="flex items-center space-x-2">
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => setOpenCitations(msg.sources || null)}
                                                                        className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-secondary/15 text-secondary border border-secondary/25 shadow-sm hover:bg-secondary/35 transition"
                                                                    >
                                                                        CITATIONS ({msg.sources?.length || 0})
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center space-x-1.5 select-none text-muted text-[9px] font-bold font-mono">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                                                                    <span>General knowledge</span>
                                                                </div>
                                                            )}
                                                            <CopyButton text={msg.content} />
                                                         </div>

                                                         <div className="font-sans text-sm text-ink leading-relaxed markdown-content relative z-10">
                                                             <ReactMarkdown
                                                                 components={{
                                                                     p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                                                                     strong: ({ node, ...props }) => <strong className="font-bold text-secondary" {...props} />,
                                                                     ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                                                                     ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                                                                     li: ({ node, ...props }) => <li className="pl-0.5" {...props} />,
                                                                     code({ node, className, children, ...props }) {
                                                                         const inline = !className;
                                                                         return inline ? (
                                                                             <code className="bg-obsidian px-1 py-0.5 rounded font-mono text-xs text-secondary border border-glass-border" {...props}>
                                                                                 {children}
                                                                             </code>
                                                                         ) : (
                                                                             <pre className="bg-obsidian p-3 border border-glass-border rounded-lg font-mono text-xs overflow-x-auto my-2 text-ink">
                                                                                 <code className={className} {...props}>
                                                                                     {children}
                                                                                 </code>
                                                                             </pre>
                                                                         );
                                                                     }
                                                                 }}
                                                             >
                                                                 {msg.content}
                                                             </ReactMarkdown>
                                                         </div>
                                                    </div>
                                                );
                                            })()}

                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Input box bottom panel */}
                <div className="border-t border-glass-border bg-glass/65 backdrop-blur-xl p-4 shrink-0 shadow-lg relative z-10">
                    <div className="max-w-3xl w-full mx-auto">
                        <form onSubmit={handleSend} className="relative flex items-center">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputVal}
                                onChange={(e) => setInputVal(e.target.value)}
                                placeholder={loading ? "Synthesizing answer..." : "Ask your digital memory..."}
                                disabled={loading}
                                className="w-full pl-4 pr-12 py-3 rounded-full border border-glass-border bg-[#1E1E2A] text-ink placeholder:text-muted focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary focus:shadow-cyan-glow transition-all duration-150 text-sm disabled:opacity-65"
                            />
                            <button
                                type="submit"
                                disabled={loading || !inputVal.trim()}
                                className="absolute right-1.5 p-2 border border-secondary/40 bg-glass/60 hover:bg-secondary/10 text-secondary rounded-full flex items-center justify-center hover:shadow-cyan-glow disabled:opacity-50 transition duration-150"
                                aria-label="Send query"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </form>
                    </div>
                </div>

            </main>

            {/* Right Pane: Citations Side Panel (Desktop slide-out / drawer style) */}
            {openCitations && (
                <aside className="w-80 border-l border-glass-border h-full bg-glass/10 backdrop-blur-md hidden lg:flex flex-col z-20 animate-slideLeft">
                    <div className="p-4 border-b border-glass-border flex items-center justify-between shrink-0">
                        <span className="font-display text-[10px] font-extrabold text-ink tracking-widest uppercase">
                            Sources & Citations
                        </span>
                        <button 
                            onClick={() => setOpenCitations(null)}
                            className="p-1 rounded-lg border border-glass-border hover:bg-glass/80 text-muted hover:text-ink transition bg-glass/40"
                            title="Close citations panel"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {openCitations.map((source, idx) => (
                            <SourceCard 
                                key={idx} 
                                source={source} 
                                onOpenPreview={(src) => setPreviewTarget({
                                    fileId: src.file_id,
                                    sourceType: src.source_type,
                                    highlightPage: src.page_number,
                                    highlightSnippet: src.snippet
                                })}
                            />
                        ))}
                    </div>
                </aside>
            )}

            {/* Mobile citations drawer overlay */}
            {openCitations && (
                <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
                    <div className="fixed inset-0 bg-obsidian/85 backdrop-blur-md" onClick={() => setOpenCitations(null)} />
                    <aside className="relative w-80 max-w-xs bg-obsidian h-full shadow-2xl z-50 flex flex-col pt-16 border-l border-glass-border">
                        <div className="p-4 border-b border-glass-border flex items-center justify-between shrink-0">
                            <span className="font-display text-[10px] font-extrabold text-ink tracking-widest uppercase">
                                Sources & Citations
                            </span>
                            <button 
                                onClick={() => setOpenCitations(null)}
                                className="p-1 rounded-lg border border-glass-border hover:bg-glass/80 text-muted hover:text-ink transition"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {openCitations.map((source, idx) => (
                                <SourceCard 
                                    key={idx} 
                                    source={source} 
                                    onOpenPreview={(src) => setPreviewTarget({
                                        fileId: src.file_id,
                                        sourceType: src.source_type,
                                        highlightPage: src.page_number,
                                        highlightSnippet: src.snippet
                                    })}
                                />
                            ))}
                        </div>
                    </aside>
                </div>
            )}

            {previewTarget && (
                <FilePreviewModal
                    fileId={previewTarget.fileId}
                    sourceType={previewTarget.sourceType}
                    highlightPage={previewTarget.highlightPage}
                    highlightSnippet={previewTarget.highlightSnippet}
                    onClose={() => setPreviewTarget(null)}
                />
            )}
        </div>
    );
}
