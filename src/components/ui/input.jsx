import { cn } from "../../lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function SearchInput({ className, icon = true, ...props }) {
  return (
    <div className={cn("relative", className)}>
      {icon && (
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      )}
      <Input className={icon ? "pl-10" : undefined} {...props} />
    </div>
  );
}
