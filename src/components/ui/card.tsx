import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
  hoverable?: boolean;
  variant?: "default" | "dashboard" | "analytics" | "statistic" | "information" | "empty";
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, dark = false, hoverable = false, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: dark 
        ? "bg-[#0B0E23] text-white border-white/10 shadow-lg" 
        : "bg-white text-[#0B0E23] border-slate-200 shadow-[0_4px_20px_-2px_rgba(11,14,35,0.06)]",
      dashboard: "bg-white text-[#0B0E23] border-slate-200 shadow-xs hover:border-slate-300",
      analytics: "bg-gradient-to-br from-white to-[#F7F8FC] border-slate-200/80 shadow-xs",
      statistic: "bg-white border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col justify-between",
      information: "bg-gold/10 border-gold/20 text-[#1E4E8C]",
      empty: "bg-slate-50/80 border-dashed border-slate-200 text-slate-500 text-center p-8",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border transition-all duration-200 ease-out",
          variantStyles[variant],
          hoverable && "hover:-translate-y-1 hover:shadow-xl hover:border-gold/40 cursor-pointer",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-display font-bold text-[#0B0E23] text-base lg:text-lg leading-tight tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-slate-500 font-medium leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
