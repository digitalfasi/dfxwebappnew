import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  dark?: boolean;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dark = false, error = false, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-red-400 bg-red-50/50 text-red-900 focus:border-red-500 focus:ring-red-500/10 placeholder:text-red-300"
            : dark
              ? "border-white/10 bg-[#182142] text-white focus:border-gold focus:ring-gold/10 placeholder:text-slate-400"
              : "border-slate-200 bg-[#F7F8FC] text-[#0B0E23] focus:border-gold focus:ring-gold/10 placeholder:text-slate-400",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
