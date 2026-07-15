import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, ArrowRight, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import QaResultCard, { QaSource } from '../components/QaResultCard';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: QaSource[];
    status: 'pending' | 'done' | 'error';
}

interface QaResponse {
    question: string;
    answer: string;
    sources: QaSource[];
}

const EXAMPLE_SUGGESTIONS = [
    "What is the cabin baggage limit?",
    "What projects do I have listed?",
    "Is Zamzam water allowed on flights?"
];

export default function AiChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputVal, setInputVal] = useState('');
    const [loading, setLoading] = useState(false);
    
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    // Auto-focus input on page load
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Handle scroll to check if user has scrolled away from bottom
    const handleScroll = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        // Enable auto scroll only if near the bottom (within 120px)
        setShouldAutoScroll(distanceToBottom < 120);
    };

    // Auto-scroll logic when messages change
    useEffect(() => {
        if (shouldAutoScroll && messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            // Scroll to bottom smoothly
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, shouldAutoScroll]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const query = inputVal.trim();
        if (!query || loading) return;

        setInputVal('');
        setLoading(true);
        setShouldAutoScroll(true);

        const userMsgId = crypto.randomUUID();
        const assistantMsgId = crypto.randomUUID();

        // 1. Append User Message
        const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: query,
            status: 'done'
        };

        // 2. Append Pending Assistant Message
        const assistantMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            status: 'pending'
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);

        await executeQaRequest(query, assistantMsgId);
    };

    const executeQaRequest = async (question: string, assistantMsgId: string) => {
        try {
            const res = await api.post<QaResponse>('/search/qa', { question });
            
            setMessages(prev => prev.map(msg => {
                if (msg.id === assistantMsgId) {
                    return {
                        ...msg,
                        content: res.data.answer,
                        sources: res.data.sources || [],
                        status: 'done'
                    };
                }
                return msg;
            }));
        } catch (err: any) {
            console.error('Chat Q&A failed:', err);
            setMessages(prev => prev.map(msg => {
                if (msg.id === assistantMsgId) {
                    return {
                        ...msg,
                        content: err.response?.data?.detail || 'The Q&A assistant is currently offline.',
                        status: 'error'
                    };
                }
                return msg;
            }));
        } finally {
            setLoading(false);
            // Re-focus input field
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleRetry = async (msgId: string, question: string) => {
        setLoading(true);
        setShouldAutoScroll(true);

        // Reset message state to pending
        setMessages(prev => prev.map(msg => {
            if (msg.id === msgId) {
                return {
                    ...msg,
                    content: '',
                    status: 'pending',
                    sources: undefined
                };
            }
            return msg;
        }));

        await executeQaRequest(question, msgId);
    };

    const handleSuggestionClick = (suggestion: string) => {
        setInputVal(suggestion);
        inputRef.current?.focus();
    };

    return (
        <div className="flex-grow flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-lavender-light/10 relative">
            
            {/* Messages Scrollable Container */}
            <div 
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-grow overflow-y-auto px-6 py-8 space-y-6"
            >
                {messages.length === 0 ? (
                    /* Onboarding Empty State view */
                    <div className="max-w-xl mx-auto py-16 text-center animate-fadeIn flex flex-col justify-center min-h-[50vh]">
                        <div className="w-12 h-12 rounded-xl bg-indigo-primary/10 flex items-center justify-center text-indigo-primary mb-6 shadow-sm mx-auto select-none">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        
                        <h2 className="font-serif text-3xl font-normal text-indigo-deep mb-3">
                            Ask your documents anything
                        </h2>
                        
                        <p className="font-sans text-xs text-ink/50 mb-8 max-w-sm mx-auto leading-relaxed">
                            Start a stateless conversation about your linked PDF index. We will compile answers with grounded sources.
                        </p>
                        
                        {/* Clickable example suggestions list */}
                        <div className="space-y-2.5 max-w-md mx-auto">
                            <span className="font-sans text-[10px] text-ink/40 font-bold uppercase tracking-wider block select-none">
                                Suggestions
                            </span>
                            <div className="flex flex-col space-y-2">
                                {EXAMPLE_SUGGESTIONS.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSuggestionClick(s)}
                                        className="text-left px-4 py-2.5 rounded-lg border border-ink/10 bg-paper hover:bg-lavender-light text-xs font-semibold text-ink/75 hover:text-indigo-primary hover:border-indigo-primary/30 transition shadow-sm"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Message list bubble items */
                    <div className="max-w-3xl w-full mx-auto space-y-6">
                        {messages.map((msg, index) => {
                            const isUser = msg.role === 'user';
                            
                            // User Message Bubble rendering
                            if (isUser) {
                                return (
                                    <div key={msg.id} className="flex justify-end animate-fadeIn">
                                        <div className="bg-indigo-deep text-paper rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-sm font-sans">
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            }

                            // Assistant Message Bubble rendering
                            return (
                                <div key={msg.id} className="flex justify-start animate-fadeIn">
                                    <div className="w-full max-w-[90%]">
                                        
                                        {msg.status === 'pending' && (
                                            /* Typing indicator loading bounce */
                                            <div className="flex space-x-1.5 p-3.5 bg-lavender-light/35 rounded-xl max-w-[80px] justify-center items-center shadow-inner select-none">
                                                <span className="w-1.5 h-1.5 bg-indigo-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 bg-indigo-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 bg-indigo-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        )}

                                        {msg.status === 'error' && (
                                            /* Scoped inline message error retry view */
                                            <div className="p-4 rounded-xl border border-status-brick/20 bg-status-brick/5 text-status-brick flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-lg shadow-sm">
                                                <div className="flex items-center space-x-2 text-xs font-mono">
                                                    <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                                                    <span>{msg.content}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const userQuestion = messages[index - 1]?.content || '';
                                                        handleRetry(msg.id, userQuestion);
                                                    }}
                                                    className="font-sans px-3 py-1.5 bg-status-brick hover:bg-status-brick/90 text-paper text-[10px] font-semibold transition rounded flex items-center space-x-1 justify-center shrink-0 shadow-sm"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    <span>Retry Query</span>
                                                </button>
                                            </div>
                                        )}

                                        {msg.status === 'done' && (
                                            /* Shared component for compiled response and cited references output */
                                            <QaResultCard 
                                                answer={msg.content} 
                                                sources={msg.sources || []} 
                                            />
                                        )}

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Bottom sticky input bar */}
            <div className="border-t border-ink/5 bg-paper p-4 shrink-0 shadow-lg">
                <div className="max-w-3xl w-full mx-auto">
                    <form onSubmit={handleSend} className="relative flex items-center">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            placeholder={loading ? "Synthesizing answer..." : "Ask your digital index..."}
                            disabled={loading}
                            className="w-full pl-4 pr-12 py-3 rounded-xl border border-ink/15 bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-indigo-primary focus:ring-1 focus:ring-indigo-primary transition-all duration-150 text-sm shadow-inner disabled:opacity-65"
                        />
                        <button
                            type="submit"
                            disabled={loading || !inputVal.trim()}
                            className="absolute right-1.5 p-2 bg-indigo-primary hover:bg-indigo-primary/95 text-paper rounded-lg flex items-center justify-center shadow-sm disabled:opacity-50 transition duration-150"
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

        </div>
    );
}
