import { useEffect, useRef, useState } from "react";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { fmtDateShort } from "@/_shared/utils";
import { useAuth } from "@/_shared/AuthContext";
import { BUILD_SHA } from "@/_shared/utils";
import NotificationBell from "@/_shared/NotificationBell";

// Most-asked first: the counter reads 24K / 22K before anything else.
export const QUOTES = [
  ["24K", "rate_24k", "#c9a84c"], ["22K", "rate_22k", "#d4b65e"], ["18K", "rate_18k", "#e3cd8a"],
  ["14K", "rate_14k", "#c9b78c"], ["9K", "rate_9k", "#cfc3a4"], ["Silver", "silver_999", "#a8adb7"],
];

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
    <header className="sticky top-0 z-20 border-b border-line bg-surface shadow-[0_1px_2px_rgba(120,80,60,0.05),0_10px_24px_-18px_rgba(120,80,60,0.28)] backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:h-[71px] lg:px-4 lg:py-0">
        {/* Only phone controls live here unless a crumb/title is shown - on
            desktop the empty box would push the rate rail out of line with
            the page cards below. */}
        <div className={`flex shrink-0 items-center gap-3 ${crumb || (!hideTitle && title) ? "" : "lg:hidden"}`}>
          {/* 44px on touch, 36px once there's a mouse: below 44 a thumb starts
              catching the edge of the next control. */}
          <button
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink lg:hidden"
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

        {/* The rate sits under the header (MobileRate) on every screen size, so the
            controls just push right. */}
        <div className={`flex shrink-0 items-center gap-2.5 ${showSearch ? "" : "ml-auto"}`}>
          {action}
          {/* Current-day indicator (auto-updates; no dropdown, no From/To). */}
          <div className="hidden h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-bold text-ink 2xl:flex">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent-strong" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="whitespace-nowrap">Today, {today}</span>
          </div>
          <NotificationBell onNavigate={onNavigate} />
          {/* Settings lives in the sidebar — no duplicate header gear. */}
          {onLogout && (
            <div className="relative" ref={menuRef}>
              <button
                className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface py-0 pl-1 pr-2.5 lg:h-9 transition-colors duration-150 hover:border-accent-line"
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
                  {/* Role, and the build this browser is running. The sidebar
                      carries the build too, but that footer is lg-only and so
                      is hidden exactly when someone has devtools open beside
                      the app - which is precisely when the question is asked.
                      Here it survives every viewport. */}
                  <span className="block text-[9.5px] font-bold uppercase tracking-[0.09em] text-faint">
                    {roleText(user)} <span className="font-mono normal-case tracking-normal opacity-70">{BUILD_SHA}</span>
                  </span>
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

/* Phone-only live rate, rendered by the shell between the header and the page.
   Same `bullion` payload the header strip uses - no request of its own. It
   shows two purities side by side in a fixed-size box and swaps to the next
   pair every 3s on a local timer (presentation only). */
export function MobileRate({ bullion }) {
  const rows = QUOTES.filter(([, key]) => bullion?.[key] != null);
  const pairs = [];
  for (let k = 0; k < rows.length; k += 2) pairs.push(rows.slice(k, k + 2));
  const [i, setI] = useState(0);
  const n = pairs.length;
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % n), 3000);
    return () => clearInterval(t);
  }, [n]);
  const stale = bullion && bullion.isToday === false;
  const pair = pairs[n ? i % n : 0] || [];
  return (
    <div className="mx-3 mt-2 rounded-xl border border-accent-line border-x-2 border-x-accent/38 bg-[#fbf1f1] shadow-[0_8px_22px_-14px_rgba(159,29,53,0.3)] px-3 py-1.5 sm:mx-6 lg:mx-8 lg:mt-4 lg:flex lg:items-center lg:gap-5 lg:px-5 lg:py-2.5">
      <div className="flex items-center justify-between text-[10px] font-extrabold text-accent-strong lg:contents">
        <span className="flex items-center gap-1.5 lg:shrink-0 lg:text-[11px]">
          <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-muted" : "bg-accent shadow-[0_0_0_3px_rgba(159,29,53,0.15)]"}`} />
          {stale ? "Last published rate" : "Live Gold Rates"}
        </span>
        <span className="font-semibold text-muted lg:order-last lg:shrink-0 lg:text-[11px]">{stale ? `${fmtDateShort(bullion.effective_date)} · ` : ""}₹/g</span>
      </div>
      <div key={i} className="mt-1 grid h-8 grid-cols-2 items-center rounded-lg border border-accent-line/60 bg-surface lg:mt-0 lg:h-11 lg:min-w-0 lg:flex-1" style={{ animation: "fadein 350ms ease both" }}>
        {pair.length ? [0, 1].map((c) => {
          const q = pair[c];
          return (
            <div key={c} className={`flex items-baseline justify-center gap-1.5 lg:gap-3 ${c ? "border-l border-line-soft" : ""}`}>
              {q && <>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-accent-strong lg:text-[11px] lg:tracking-[0.14em]">{q[0]}</span>
                <span className="num text-[16px] font-extrabold tabular-nums text-ink lg:text-[22px]">
                  ₹{Number(bullion[q[1]]).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </>}
            </div>
          );
        }) : <span className="col-span-2 text-center text-[13px] font-bold text-muted">—</span>}
      </div>
    </div>
  );
}
