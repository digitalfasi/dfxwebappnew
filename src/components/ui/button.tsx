import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "success" | "gold-outline";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer rounded-xl";

    const variants = {
      primary:
        "bg-gradient-to-r from-gold via-gold-light to-gold-dark hover:from-gold-dark hover:to-gold text-white shadow-sm hover:shadow-md border border-gold/40",
      secondary:
        "bg-[#0B0E23] text-white hover:bg-[#151C3A] shadow-sm border border-[#0B0E23]",
      ghost:
        "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent",
      outline:
        "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs",
      danger:
        "bg-red-600 text-white hover:bg-red-700 shadow-sm border border-red-600",
      success:
        "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-600",
      "gold-outline":
        "bg-gold/10 border border-gold/40 text-gold-dark hover:bg-gold/20 font-bold",
    };

    const sizes = {
      default: "h-10 px-4 py-2 text-xs sm:text-sm",
      sm: "h-8 px-3 text-xs rounded-lg",
      lg: "h-12 px-6 text-sm sm:text-base rounded-xl",
      icon: "h-9 w-9 p-0 rounded-xl flex items-center justify-center shrink-0",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
