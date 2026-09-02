import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CollapsibleProps {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  /** Small summary/count shown next to the title when collapsed or open. */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A single collapsible section — Step 3's Studio panel organizes Image /
 * Background / Auto Fit / Quality / Watermark tools into a stack of these,
 * per the explicit "organize the tools into collapsible sections"
 * requirement. No existing accordion primitive in this codebase, so this is
 * a small, real, reusable addition.
 */
export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
  className,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-gold-dark shrink-0" />}
          <span className="text-sm font-bold text-[#0B0E23] truncate">{title}</span>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 animate-fade-in space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};
