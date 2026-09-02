import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Shared error+retry card — same visual language as EmptyState, so every
 * page's failure state looks and feels consistent. */
export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div className="py-10 px-4 flex flex-col items-center justify-center text-center bg-red-50/60 border border-red-200 rounded-2xl animate-in fade-in zoom-in-95 duration-200">
      <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-xs font-medium text-red-700 max-w-xs mb-4">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
};
