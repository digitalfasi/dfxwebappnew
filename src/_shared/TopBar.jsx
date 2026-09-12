import { useEffect, useRef, useState } from "react";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { fmtDateShort } from "@/_shared/utils";
import { useAuth } from "@/_shared/AuthContext";

/* One purity's cell in the rate rail. Each purity gets its own bounded cell
   rather than sharing one run of text, so the eye lands on a single figure
   instead of reading across a row. The figure is tabular so the digits hold
   their columns when a rate is republished mid-shift - an unaligned price that
   shifts sideways on refresh is what makes a feed look unreliable. */
function Quote({ label, value, dot }) {
  return (
    <div className="min-w-[92px] border-r border-line-soft px-3.5 py-1.5 last:border-r-0">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-faint">{label}</span>
      </div>
      <div className="num text-[14px] font-extrabold leading-tight tabular-nums text-ink">
        {value != null ? Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        <span className="ml-0.5 text-[9.5px] font-semibold text-faint">/g</span>
      </div>
    </div>
  );
}

function roleText(u) {
  return u?.backendRole || u?.role || "Admin";
}

/* Two letters at most, from the name the account actually carries. */
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function TopBar({ title, crumb, onMenu, action, onNavigate, onLogout, hideTitle, search, onSearch, searchPlaceholder, bullion }) {
  // Current day, resolved client-side to avoid an SSR/client mismatch. Updates
  // automatically whenever the component mounts on a new day.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
  }, []);

  // Who is signed in. The header used to show a bare sign-out icon and nothing
  // else, so a shared counter machine gave no way to tell whose till you were
  // billing against without opening a menu.
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const away = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  const showSearch = typeof onSearch === "function";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[#efe7d3] shadow-sm backdrop-blur-xl">
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
          {/* Compact context breadcrumb. The page title itself lives once, in
              the body — never duplicated here. */}
          {(crumb || (!hideTitle && title)) && (
            <div>
              {crumb && <div className="text-[11px] font-semibold text-ink-soft">{crumb}</div>}
              {!hideTitle && title && (
                <h1 className="text-lg font-extrabold tracking-tight text-ink">{title}</h1>
              )}
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

        {/* Live bullion rate — global across every module, fills the header
            middle when there's no search. Always shown (—/g until today's rate is
            published). Hidden on small screens to stay clean. */}
        {!showSearch && (
          <div className="hidden min-w-0 shrink-0 items-stretch overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(30,41,59,0.06)] lg:flex">
            {/* Which day this rail is showing. "Live" ONLY when today's rate has
                been published; otherwise the date it is actually from, so a
                yesterday figure is never read as today's. */}
            <div className="flex shrink-0 items-center gap-2 border-r border-line-soft bg-accent-soft px-3.5">
              {bullion && bullion.isToday === false ? (
                <span
                  className="flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted"
                  title="Today's rate has not been published yet — this is the last published rate."
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  {fmtDateShort(bullion.effective_date)}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Live
                </span>
              )}
            </div>
            {/* Every published purity, not just the three that used to fit. A
                counter quoting 14K or 9K had to leave this screen to find the
                rate it was about to charge. */}
            <div className="flex items-stretch">
              <Quote label="24K" value={bullion?.rate_24k} dot="#c9a84c" />
              <Quote label="22K" value={bullion?.rate_22k} dot="#d4b65e" />
              <Quote label="18K" value={bullion?.rate_18k} dot="#e3cd8a" />
              <Quote label="14K" value={bullion?.rate_14k} dot="#c9b78c" />
              <Quote label="9K" value={bullion?.rate_9k} dot="#cfc3a4" />
              <Quote label="Silver" value={bullion?.silver_999} dot="#a8adb7" />
            </div>
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
          {/* Settings lives in the sidebar — no duplicate header gear. */}
          {onLogout && (
            <div className="relative" ref={menuRef}>
              <button
                className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface py-0 pl-1 pr-2.5 transition-colors duration-150 hover:border-accent-line"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-white">
                  {initials(user?.name)}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block max-w-[11rem] truncate text-[12.5px] font-extrabold text-ink">{user?.name || "Signed in"}</span>
                  <span className="block text-[9.5px] font-bold uppercase tracking-[0.09em] text-faint">{roleText(user)}</span>
                </span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  <div className="border-b border-line-soft px-3.5 py-3">
                    <div className="truncate text-[13px] font-extrabold text-ink">{user?.name || "Signed in"}</div>
                    {user?.email && <div className="truncate text-[11.5px] text-muted">{user.email}</div>}
                  </div>
                  {/* Sign out sits inside the menu rather than one stray click
                      from the whole screen — it ends the shift for whoever is
                      at the counter, and it used to be a single bare icon. */}
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-bold text-danger transition-colors hover:bg-danger-soft"
                    onClick={() => { setMenuOpen(false); onLogout(); }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageAction({ children }) {
  return <Button size="sm" className="hidden sm:inline-flex">{children}</Button>;
}
