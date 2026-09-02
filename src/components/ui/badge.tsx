import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 
    | "success" 
    | "pending" 
    | "cancelled" 
    | "completed" 
    | "draft" 
    | "inactive" 
    | "blocked" 
    | "gold" 
    | "warn" 
    | "danger" 
    | "neutral";
  dot?: boolean;
}

function Badge({ className, variant = "gold", dot = false, children, ...props }: BadgeProps) {
  const variants = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    pending: "bg-amber-50 text-amber-800 border-amber-200/80",
    warn: "bg-amber-50 text-amber-800 border-amber-200/80",
    cancelled: "bg-red-50 text-red-700 border-red-200/80",
    danger: "bg-red-50 text-red-700 border-red-200/80",
    blocked: "bg-red-50 text-red-700 border-red-200/80",
    inactive: "bg-slate-100 text-slate-600 border-slate-200",
    draft: "bg-blue-50 text-blue-700 border-blue-200/80",
    gold: "bg-gold/15 text-gold-dark border-gold/30 font-bold",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };

  const dotColors = {
    success: "bg-emerald-500",
    completed: "bg-emerald-500",
    pending: "bg-amber-500",
    warn: "bg-amber-500",
    cancelled: "bg-red-500",
    danger: "bg-red-500",
    blocked: "bg-red-500",
    inactive: "bg-slate-400",
    draft: "bg-blue-500",
    gold: "bg-gold",
    neutral: "bg-slate-400",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors select-none",
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 animate-pulse", dotColors[variant])} />
      )}
      <span>{children}</span>
    </div>
  );
}

export { Badge };
