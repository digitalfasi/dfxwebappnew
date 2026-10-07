import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/_shared/utils";

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
  const [coords, setCoords] = useState({ top: 0, bottom: null, left: 0, width: 0, maxHeight: 224 });

  useEffect(() => {
    const idx = normalized.findIndex((o) => o.value === value);
    setFocused(idx >= 0 ? idx : 0);
  }, [value, options]);

  // The list is a fixed-position portal, so it has to be placed against the
  // VIEWPORT, not the trigger alone. It opens DOWNWARD, directly under the
  // field it belongs to, and flips above only when there is genuinely not
  // enough room below to show a usable list.
  //
  // It used to flip whenever the space below was under the preferred 224px and
  // the space above was larger - which on any laptop-height window is most of
  // the time. A select sitting mid-dialog with 200px under it, room for five
  // options, still threw its list upward across the fields above it: in Add
  // Customer the scheme list covered Date of Birth and Initial Password. The
  // list is also capped to the room that ACTUALLY exists and scrolls inside
  // that cap, so the fix holds however many schemes the store adds.
  const updateCoords = () => {
    if (!triggerRef.current) return;
    const GAP = 6;
    const EDGE = 12; // breathing room against the window edge
    const PREFERRED = 224;
    const MIN = 132; // below this, scrolling a 3-option list is worse than flipping
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    // Down unless down cannot work. Ties go downward, which is where the eye
    // already is and where every native select puts it.
    const openUp = below < MIN && above > below;
    const room = Math.max(0, openUp ? above : below);
    // MIN is a floor on the BOX, not a claim about the space: a cramped window
    // gets a short scrollable list rather than a list flattened to nothing. The
    // top is clamped to the viewport below, so the floor can never push the
    // list off the screen the way it used to.
    // Opening up, the box may not be taller than the room above it - the MIN
    // floor would push its top off the window.
    const maxHeight = openUp ? Math.min(PREFERRED, room) : Math.max(MIN, Math.min(PREFERRED, room));
    // Keep the list inside the window horizontally too, for a trigger near the
    // right edge whose list is wider than it is.
    // The list is never narrower than 160px, so the clamp and the rendered
    // width must both use THAT figure. They disagreed: the horizontal clamp
    // reserved 160 while the list was rendered at the trigger's own width, so a
    // narrow trigger - an Audience or Status select in a dialog - had its list
    // pushed off its anchor and sitting to one side of the field it belongs to.
    const width = Math.max(r.width, 160);
    const left = Math.min(Math.max(EDGE, r.left), Math.max(EDGE, window.innerWidth - width - EDGE));
    // Opening up, the list is pinned by its BOTTOM edge just above the field.
    // It was placed by its top at (field - 224px), so a list shorter than 224 -
    // three payment statuses - floated with a gap under it, well away from the
    // field it belongs to.
    if (openUp) {
      setCoords({ top: null, bottom: window.innerHeight - r.top + GAP, left, width, maxHeight });
      return;
    }
    // Opening down, the box stays inside the window. Without this the MIN
    // floor could hang a list off the bottom edge where its last options
    // cannot be reached at all.
    const top = Math.min(Math.max(EDGE, r.bottom + GAP), Math.max(EDGE, window.innerHeight - maxHeight - EDGE));
    setCoords({ top, bottom: null, left, width, maxHeight });
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
      style={{
        position: "fixed",
        ...(coords.bottom != null ? { bottom: coords.bottom } : { top: coords.top }),
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        zIndex: 9999,
      }}
      className="overflow-auto overscroll-contain rounded-xl border border-line bg-white p-1 shadow-xl"
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
