import React from 'react';
import { SearchX, Inbox } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No data found",
  description = "There are no records matching your current filter criteria.",
  icon,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="py-12 px-4 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="w-14 h-14 rounded-2xl bg-slate-line/50 border border-slate-line text-slate-muted flex items-center justify-center mb-3">
        {icon || <SearchX className="h-7 w-7 text-gold" />}
      </div>
      <h3 className="font-display font-bold text-sm text-ink mb-1">
        {title}
      </h3>
      <p className="text-xs text-slate-muted max-w-xs mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" variant="outline">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
