import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export function Select({
  value,
  onValueChange,
  options = [],
  placeholder = "Select",
  label,
  error,
  helperText,
  disabled = false,
  variant = "default",
  className,
  triggerClassName,
  id,
}) {
  const autoId = useId();
  const selectId = id || autoId;
  const [open, setOpen] = useState(false);
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const selectedOpt = normalized.find((o) => o.value === value);
  const [focused, setFocused] = useState(() => {
    const idx = normalized.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  });
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const idx = normalized.findIndex((o) => o.value === value);
    setFocused(idx >= 0 ? idx : 0);
  }, [value, options]);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onClick = (e) => {
      const portalEl = document.getElementById(`${selectId}-portal`);
      if (ref.current?.contains(e.target)) return;
      if (portalEl?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    const onReposition = () => updateCoords();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, selectId]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[focused];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [focused, open]);

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); updateCoords(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused((f) => Math.min(f + 1, normalized.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setFocused(0); }
    else if (e.key === "End") { e.preventDefault(); setFocused(normalized.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); onValueChange?.(normalized[focused].value); setOpen(false); }
  };

  const triggerVariant = variant === "accent"
    ? "border-accent bg-accent-soft text-accent-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
    : "border-line bg-surface text-ink focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]";

  const popover = open ? createPortal(
    <div
      id={`${selectId}-portal`}
      ref={listRef}
      role="listbox"
      style={{ position: "fixed", top: coords.top, left: coords.left, width: Math.max(coords.width, 160), zIndex: 9999 }}
      className="max-h-56 overflow-auto rounded-xl border border-line bg-white p-1 shadow-xl"
    >
      {normalized.map((opt, i) => {
        const selected = opt.value === value;
        const isFocused = i === focused;
        return (
          <button
            key={opt.value}
            role="option"
            aria-selected={selected}
            onMouseEnter={() => setFocused(i)}
            onClick={() => { onValueChange?.(opt.value); setOpen(false); }}
            className={cn(
              "flex h-9 min-h-[36px] w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors duration-100",
              isFocused ? "bg-canvas text-ink" : "text-ink-soft",
              selected && "bg-accent-soft text-accent-strong font-bold"
            )}
          >
            <span className="flex-1 truncate">{opt.label}</span>
            {selected && <svg viewBox="0 0 24 24" className="ml-2 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {label && <label htmlFor={selectId} className="mb-1.5 block text-xs font-bold">{label}</label>}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${selectId}-listbox`}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
        disabled={disabled}
        onClick={() => { if (!disabled) { updateCoords(); setOpen(!open); } }}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-10 min-h-[44px] w-full items-center justify-between rounded-xl border px-3.5 pr-9 text-left text-sm font-medium outline-none transition duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_var(--color-danger-soft)]" : triggerVariant,
          open && !error && "border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]",
          error && open && "border-danger shadow-[0_0_0_3px_var(--color-danger-soft)]",
          triggerClassName
        )}
      >
        <span className={cn("truncate", !selectedOpt ? "text-faint" : variant === "accent" ? "text-accent-strong" : "text-ink")}>
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <svg viewBox="0 0 24 24" className={cn("pointer-events-none absolute right-3 h-4 w-4 shrink-0 transition-transform duration-150", variant === "accent" ? "text-accent-strong" : "text-muted", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {helperText && !error && <p id={`${selectId}-helper`} className="mt-1.5 text-xs text-muted">{helperText}</p>}
      {error && <p id={`${selectId}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
      {popover}
    </div>
  );
}
