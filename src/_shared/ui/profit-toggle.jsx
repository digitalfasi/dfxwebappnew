// Show / hide every profit and cost figure on a billing screen. Hidden by
// default, so a customer across the counter never sees the shop's margin.
// Used by New Sale and Sales History.
export function ProfitToggle({ on, onToggle, className = "", compact = false }) {
  const label = on ? "Hide profit and cost figures" : "Show profit and cost figures";
  if (compact) {
    // Icon only - a small eye beside a section title.
    return (
      <button type="button" onClick={onToggle} aria-pressed={on} aria-label={label} title={label}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors ${on ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-accent-line hover:text-ink"} ${className}`}>
        <EyeIcon on={on} />
      </button>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      title={on ? "Hide profit and cost figures" : "Show profit and cost figures"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${on ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-accent-line hover:text-ink"} ${className}`}>
      <EyeIcon on={on} />
      {on ? "Hide profit" : "Show profit"}
    </button>
  );
}

function EyeIcon({ on }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {on
        ? <><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></>
        : <><path d="M3 3l18 18" /><path d="M10.6 5.6A10 10 0 0 1 12 5.5c7 0 10.5 6.5 10.5 6.5a17 17 0 0 1-3.2 4M6.2 6.7C3.2 8.6 1.5 12 1.5 12S5 18.5 12 18.5a9.6 9.6 0 0 0 4.6-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>}
    </svg>
  );
}
