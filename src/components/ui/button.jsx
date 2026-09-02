import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold text-sm transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-accent text-white shadow-sm hover:bg-accent-strong",
        outline: "border border-line bg-surface text-ink-soft hover:border-accent-line hover:text-accent hover:bg-accent-soft",
        ghost: "text-accent hover:bg-accent-soft",
        danger: "bg-danger-soft text-danger hover:bg-danger-line",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-9 w-9 rounded-full p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
