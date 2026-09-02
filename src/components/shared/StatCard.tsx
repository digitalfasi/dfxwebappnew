import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  delta: string;
  up?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  delta,
  up = true,
  className,
}) => {
  return (
    <Card className={cn("p-4 border-slate-line bg-white shadow-sm hover:shadow-md transition-all rounded-xl", className)}>
      <CardContent className="p-0 space-y-1">
        <div className="text-xs font-bold text-slate-muted">
          {label}
        </div>
        <div className="font-display font-extrabold text-2xl text-ink">
          {value}
        </div>
        <div className={cn("text-[11px] font-bold flex items-center gap-1 pt-0.5", up ? "text-emerald-600" : "text-rose-600")}>
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          <span>{delta}</span>
        </div>
      </CardContent>
    </Card>
  );
};
