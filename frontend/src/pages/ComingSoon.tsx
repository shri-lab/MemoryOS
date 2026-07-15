import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

interface ComingSoonProps {
    title: string;
}

export default function ComingSoon({ title }: ComingSoonProps) {
    return (
        <div className="flex-grow flex flex-col items-center justify-center py-20 px-6 text-center animate-fadeIn bg-lavender-light/10">
            <div className="w-12 h-12 rounded-xl bg-indigo-primary/10 flex items-center justify-center text-indigo-primary mb-6 shadow-sm mx-auto">
                <Sparkles className="w-5 h-5" />
            </div>
            
            <h2 className="font-serif italic text-3xl text-indigo-deep mb-3">
                {title} Page
            </h2>
            
            <p className="font-sans text-sm text-ink/50 mb-8 max-w-sm leading-relaxed mx-auto">
                This space is currently under construction. Core knowledge features are linking soon.
            </p>
            
            <Link
                to="/dashboard"
                className="font-sans px-5 py-2 bg-indigo-deep hover:bg-indigo-deep/95 text-paper text-xs font-semibold rounded-lg shadow-md transition duration-150"
            >
                Return to Dashboard
            </Link>
        </div>
    );
}
