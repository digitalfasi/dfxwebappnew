import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// SELECT COMPONENT
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, error = false, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          className={cn(
            "flex h-10 w-full appearance-none rounded-xl border bg-[#F7F8FC] px-3.5 py-2 pr-9 text-xs font-bold text-[#0B0E23] transition-all focus:outline-none focus:border-gold focus:ring-4 focus:ring-gold/10 disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-red-400 bg-red-50/50" : "border-slate-200",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      </div>
    );
  }
);
Select.displayName = "Select";

// TEXTAREA COMPONENT
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[90px] w-full rounded-xl border bg-[#F7F8FC] px-3.5 py-2.5 text-sm font-medium text-[#0B0E23] transition-all focus:outline-none focus:border-gold focus:ring-4 focus:ring-gold/10 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-slate-400",
          error ? "border-red-400 bg-red-50/50" : "border-slate-200",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

// CHECKBOX COMPONENT
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          className={cn(
            "w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold/30 transition-all cursor-pointer accent-gold",
            className
          )}
          ref={ref}
          {...props}
        />
        {label && <span>{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

// SWITCH COMPONENT
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false, label }) => {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-gold" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
      {label && <span className="text-xs font-semibold text-[#0B0E23]">{label}</span>}
    </label>
  );
};
