import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-canvas text-ink-soft",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-warn-line bg-warn-soft text-warn",
        danger: "border-danger-line bg-danger-soft text-danger",
        info: "border-info-line bg-info-soft text-info",
        accent: "border-accent bg-accent text-white",
      },
      dot: {
        true: "before:content-[''] before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", dot: false },
  }
);

export function Badge({ className, tone, dot, ...props }) {
  return <span className={cn(badgeVariants({ tone, dot }), className)} {...props} />;
}

export { badgeVariants };
