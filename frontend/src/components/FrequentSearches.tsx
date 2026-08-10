import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Search, Loader2 } from 'lucide-react';
import api from '../services/api';

interface FrequentSearchItem {
  query: string;
  count: number;
  last_searched_at: string;
}

export default function FrequentSearches() {
  const navigate = useNavigate();
  const [frequentSearches, setFrequentSearches] = useState<FrequentSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFrequentSearches = async () => {
    try {
      setLoading(true);
      const res = await api.get<FrequentSearchItem[]>('/search/frequent');
      setFrequentSearches(res.data);
    } catch (err) {
      console.error('Failed to fetch frequent searches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFrequentSearches();
  }, []);

  const handleChipClick = (query: string) => {
    navigate(`/chat?q=${encodeURIComponent(query)}`);
  };

  if (loading) {
    return null;
  }

  if (frequentSearches.length === 0) {
    return null;
  }

  return (
    <div className="bg-glass/40 border border-glass-border shadow-sm rounded-2xl p-6 mb-8">
      <div className="flex items-center space-x-2 mb-3">
        <TrendingUp className="w-4 h-4 text-secondary" />
        <span className="font-mono uppercase text-[9px] tracking-widest text-muted font-bold">
          Frequently Searched
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {frequentSearches.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleChipClick(item.query)}
            className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-glass-border bg-glass/65 hover:border-secondary hover:shadow-cyan-glow text-ink hover:text-secondary transition-all text-xs font-bold group shadow-sm hover:scale-[1.02] active:scale-95"
          >
            <Search className="w-3 h-3 text-muted/60 group-hover:text-secondary transition-colors" />
            <span>{item.query}</span>
            <span className="font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-secondary/10 group-hover:bg-secondary/20 text-secondary transition-colors">
              {item.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
