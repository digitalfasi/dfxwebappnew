import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { SearchInput } from "./ui/input";

export default function TopBar({ title, crumb, onMenu, action, onNavigate, onLogout, hideTitle, search, onSearch, searchPlaceholder }) {
  // Current day, resolved client-side to avoid an SSR/client mismatch. Updates
  // automatically whenever the component mounts on a new day.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
  }, []);

  const showSearch = typeof onSearch === "function";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-line-soft/70 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-8">
        <div className="flex shrink-0 items-center gap-3">
          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink lg:hidden"
            onClick={onMenu}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {!hideTitle && (
            <div>
              <div className="text-[11px] font-semibold text-ink-soft">{crumb}</div>
              <h1 className="text-lg font-extrabold tracking-tight text-ink">{title}</h1>
            </div>
          )}
        </div>

        {/* Header search — fills the empty header space. */}
        {showSearch && (
          <div className="min-w-0 flex-1">
            <SearchInput
              className="w-full max-w-2xl"
              placeholder={searchPlaceholder || "Search..."}
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              aria-label="Search"
            />
          </div>
        )}

        <div className={`flex shrink-0 items-center gap-2.5 ${showSearch ? "" : "ml-auto"}`}>
          {action}
          {/* Current-day indicator (auto-updates; no dropdown, no From/To). */}
          <div className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-bold text-ink md:flex">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="whitespace-nowrap">Today, {today}</span>
          </div>
          <button
            className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft transition-colors duration-150 hover:border-accent-line hover:text-accent-strong"
            aria-label="Notifications"
            onClick={onNavigate ? () => onNavigate("notifications") : undefined}
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-surface bg-danger" />
          </button>
          {onNavigate && (
            <button
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft transition-colors duration-150 hover:border-accent-line hover:text-accent-strong"
              onClick={() => onNavigate("settings")}
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          )}
          {onLogout && (
            <button
              className="grid h-9 w-9 place-items-center rounded-full border border-danger-line bg-surface text-danger transition-colors duration-150 hover:bg-danger-soft"
              onClick={onLogout}
              aria-label="Logout"
            >
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageAction({ children }) {
  return <Button size="sm" className="hidden sm:inline-flex">{children}</Button>;
}
