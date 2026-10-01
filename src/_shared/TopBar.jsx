import { useEffect, useRef, useState } from "react";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { fmtDateShort } from "@/_shared/utils";
import { useAuth } from "@/_shared/AuthContext";
import { BUILD_SHA } from "@/_shared/utils";
import NotificationBell from "@/_shared/NotificationBell";

/* One purity's cell in the rate rail. Each purity gets its own bounded cell
   rather than sharing one run of text, so the eye lands on a single figure
   instead of reading across a row. The figure is tabular so the digits hold
   their columns when a rate is republished mid-shift - an unaligned price that
   shifts sideways on refresh is what makes a feed look unreliable. */
function Quote({ label, value, dot }) {
  return (
    <div className="flex min-w-[118px] flex-col items-center justify-center border-r border-[#efe4cb] px-5 transition-colors duration-200 hover:bg-accent-soft">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dot, boxShadow: `0 0 5px ${dot}, 0 0 0 2px ${dot}22` }}
        />
        <span className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-muted">{label}</span>
      </div>
      <div className="num text-[14px] font-extrabold leading-tight tabular-nums text-ink">
        {value != null ? Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        <span className="ml-0.5 text-[9.5px] font-semibold text-muted/70">/g</span>
      </div>
    </div>
  );
}

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
    <header className="sticky top-0 z-20 border-b border-line bg-[#efe7d3] shadow-sm backdrop-blur-xl">
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

        {/* Live bullion rate — global across every module, fills the header
            middle when there's no search. Always shown (—/g until today's rate is
            published). Hidden on small screens to stay clean. */}
        {!showSearch && (
          <div className="hidden h-12 min-w-0 flex-1 items-stretch overflow-hidden rounded-2xl border border-accent-line bg-surface shadow-[0_1px_3px_rgba(30,41,59,0.08),0_6px_16px_-8px_rgba(166,134,49,0.25),inset_0_1px_0_rgba(255,255,255,0.85)] lg:flex">
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
            {/* Every published purity, scrolling as one endless feed the way a
                bullion desk board reads — no counter has to leave the screen to
                find 14K or 9K. Two identical runs sit back to back inside a
                fixed window; the track travels exactly one run width so the
                wrap is seamless. Ordered ascending by value (Silver → 24K).
                Pauses on hover; under reduced-motion it stops moving and
                becomes a normal horizontal scroll instead. */}
            {/* The live feed always moves, like a bullion board. Each run holds
                the six purities three times over (wider than any rail), and
                the track travels exactly one run, so the loop is seamless and
                no blank space ever shows - at any screen width or zoom.
                Pauses on hover. */}
            <div className="group relative min-w-[120px] flex-1 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface to-transparent" />
              <div className="flex h-full w-max animate-ticker ticker-slow items-stretch group-hover:[animation-play-state:paused]">
                {[0, 1].map((run) => (
                  <div key={run} className="flex items-stretch" aria-hidden={run === 1}>
                    {[0, 1, 2].flatMap((rep) => QUOTES.map(([label, key, dot]) => (
                      <Quote key={`${rep}-${label}`} label={label} value={bullion?.[key]} dot={dot} />
                    )))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Phone: the rate now sits under the header (MobileRate), so the
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
    <div className="mx-3 mt-2 rounded-xl border border-accent-line bg-accent-soft/50 px-3 py-1.5 sm:mx-6 lg:hidden">
      <div className="flex items-center justify-between text-[10px] font-extrabold text-ink">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-muted" : "bg-accent"}`} />
          {stale ? "Last published rate" : "Live Gold Rates"}
        </span>
        <span className="font-semibold text-muted">{stale ? `${fmtDateShort(bullion.effective_date)} · ` : ""}₹/g</span>
      </div>
      <div key={i} className="grid h-8 grid-cols-2 items-center" style={{ animation: "fadein 350ms ease both" }}>
        {pair.length ? [0, 1].map((c) => {
          const q = pair[c];
          return (
            <div key={c} className={`flex items-baseline justify-center gap-1.5 ${c ? "border-l border-[#efe4cb]" : ""}`}>
              {q && <>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-accent-strong">{q[0]}</span>
                <span className="num text-[16px] font-extrabold tabular-nums text-ink">
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
