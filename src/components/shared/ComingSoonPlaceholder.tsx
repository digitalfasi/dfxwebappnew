import React from 'react';
import { Sparkles } from 'lucide-react';

interface ComingSoonPlaceholderProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

/**
 * Honest "not built yet" placeholder for pages with no backend support at
 * all (see SESSION_HANDOFF.md Module 17). Never pairs with fake data or a
 * fake success action — if a page needs this, nothing on it should pretend
 * to work.
 */
export const ComingSoonPlaceholder: React.FC<ComingSoonPlaceholderProps> = ({
  title,
  description,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 animate-in fade-in duration-300">
      <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/30 text-gold-dark flex items-center justify-center mb-4">
        {icon || <Sparkles className="w-7 h-7" />}
      </div>
      <h2 className="font-display font-bold text-lg text-[#0B0E23] mb-1.5">
        {title}
      </h2>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
        {description}
      </p>
      <span className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        Coming Soon
      </span>
    </div>
  );
};
