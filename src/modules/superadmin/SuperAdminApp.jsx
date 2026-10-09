"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_shared/AuthContext";
import Monitoring from "@/modules/superadmin/Monitoring";
import Dashboard from "@/modules/superadmin/Dashboard";
import Tenants from "@/modules/superadmin/Tenants";
import SearchPalette from "@/modules/superadmin/SearchPalette";
import { saService } from "@/modules/superadmin/saService";
import { decisionsFor, openShop } from "@/modules/superadmin/decisions";
import { SA_CSS, Icon, PageHead, initialsOf, useNow, usePoll } from "@/modules/superadmin/saUi";

// Deep-linkable: #/control/<module>/<tab>
export const MON_PAGES = [
  { key: "live", label: "Live now", icon: "live", title: "Live now", sub: "Right now: how many people are using DFX, and whether everything is working. Green means all is well." },
  { key: "people", label: "People", icon: "users", title: "People", sub: "Everyone who has a DFX login - shop owners, staff and customers - and when each one last used DFX. Click a name to see their full history." },
  { key: "sessions", label: "Login history", icon: "login", title: "Login history", sub: "One row for every time someone logged in: when they logged in, when they logged out, on which device, and how long they used DFX." },
  { key: "signins", label: "Login problems & safety", icon: "shield", title: "Login problems & safety", sub: "Wrong passwords, blocked logins and anything suspicious. If the numbers are 0, there is nothing to worry about." },
  { key: "activity", label: "Changes made", icon: "doc", title: "Changes made", sub: "What each shop's team changed in DFX - who did it, what they changed and when. Newest first." },
  { key: "system", label: "System health", icon: "server", title: "System health", sub: "For the technical team: the computer DFX runs on, its storage and the nightly backups. Green everywhere means nothing needs doing." },
];

const HOME = { mod: "dashboard", tab: "live" };
const MOD_HASH = { dashboard: "#/control/dashboard", tenants: "#/control/shops" };
const MOD_PAGE = {
  dashboard: { title: "Dashboard" },
  tenants: { eyebrow: "Platform", title: "Shops", sub: "Every jewellery shop using DFX - its plan, when its access ends, the owner, when the owner last logged in and out, and today's sales. Click a shop for details." },
};

function readHash() {
  if (typeof window === "undefined") return HOME;
  // A KPI card can link with filters: #/control/monitor/sessions?status=active
  const [, root, mod, tab] = window.location.hash.replace(/^#/, "").split("?")[0].split("/");
  if (root !== "control" || mod === "dashboard" || !mod) return HOME;
  // #/control/monitor/shops was the old second shops list - it is the Shops page now.
  if (mod === "tenants" || mod === "shops" || tab === "shops") return { mod: "tenants", tab: "live" };
  return { mod: "monitor", tab: MON_PAGES.some((p) => p.key === tab) ? tab : "live" };
}

// Closes a small popover on an outside click or Esc.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

export default function SuperAdminApp() {
  const { user, logout } = useAuth();
  const [route, setRoute] = useState(readHash);
  const [shopFilter, setShopFilter] = useState("");
  const [monOpen, setMonOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const bell = usePopover();
  const me = usePopover();
  const now = useNow(1000);
  const pulse = usePoll(async () => (await saService.overview()), [], { ms: 30000 });
  const shops = usePoll(() => saService.tenants(), [], { ms: 120000 });
  const decisions = decisionsFor(shops.data || [], pulse.data?.tenants || []);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const h = MOD_HASH[route.mod] || `#/control/monitor/${route.tab}`;
    if (window.location.hash.split("?")[0] !== h) window.history.replaceState(null, "", h);
    document.title = `${(MOD_PAGE[route.mod] || MON_PAGES.find((p) => p.key === route.tab))?.title} · DFX Control`;
    setNavOpen(false);
  }, [route]);
  // Ctrl+K / Cmd+K opens search anywhere in the console.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearching(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (mod, tab) => { setRoute((r) => ({ mod, tab: tab || (mod === r.mod ? r.tab : "live") })); setNavOpen(false); };
  // From a shop: its changes, or its customers. The hash carries the filter
  // the page reads when it opens.
  const watchShop = (id, where = "activity") => {
    setShopFilter(id);
    setNavOpen(false);
    window.location.hash = where === "customers" ? "#/control/monitor/people?role=Customer" : "#/control/monitor/activity";
  };
  const page = MOD_PAGE[route.mod] || { eyebrow: "Monitoring", ...MON_PAGES.find((p) => p.key === route.tab) };
  const date = new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = new Date(now).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  return (
    <div className="sa">
      <style>{SA_CSS}</style>
      <div className="sa-app">
        {navOpen && <div className="sa-scrim" onClick={() => setNavOpen(false)} />}
        <aside className={`sa-side${navOpen ? " open" : ""}`} aria-label="Navigation">
          <div className="sa-side-brand" aria-label="DFX GOLD">
            <div className="sa-mark">DFX</div>
            <div className="sa-mark-sub">GOLD</div>
          </div>
          <nav className="sa-side-nav">
            <button className="item" aria-current={route.mod === "dashboard" ? "page" : undefined} onClick={() => go("dashboard")}>
              <Icon name="home" size={19} /><span>Dashboard</span>
            </button>
            <button className="item" aria-current={route.mod === "tenants" ? "page" : undefined} onClick={() => go("tenants")}>
              <Icon name="store" size={19} /><span>Shops</span>
            </button>
            <button className={`item${route.mod === "monitor" ? " on-parent" : ""}`} aria-expanded={monOpen} onClick={() => setMonOpen((v) => !v)}>
              <Icon name="pulse" size={19} /><span>Monitoring</span>
              <em className="live" title="People using DFX right now"><i />{pulse.data?.live?.total ?? "–"}</em>
              <Icon name="chev" size={15} className={`chev${monOpen ? " up" : ""}`} />
            </button>
            {monOpen && (
              <div className="sub">
                {MON_PAGES.map((p) => (
                  <button key={p.key} className="subitem" aria-current={route.mod === "monitor" && route.tab === p.key ? "page" : undefined}
                    onClick={() => go("monitor", p.key)}>
                    <Icon name={p.icon} size={17} /><span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>
          <div className="sa-side-foot">
            <span className="av">{initialsOf(user?.name || "Super Admin")}</span>
            <div className="me"><b>{user?.name || "Super admin"}</b><span>{user?.email}</span></div>
            <button className="out" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="out" size={18} /></button>
          </div>
        </aside>

        <div className="sa-body">
          <header className="sa-top">
            <button className="sa-burger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Icon name="list" size={20} /></button>
            <button className="sa-search" onClick={() => setSearching(true)} aria-label="Search shops, customers, or anything (Ctrl+K)">
              <Icon name="search" size={17} style={{ color: "var(--muted)", flex: "none" }} />
              <span className="ph">Search shops, customers, or anything…</span>
              <span className="sa-kbd"><kbd>Ctrl</kbd><kbd>K</kbd></span>
            </button>
            <div className="sa-top-right">
              <div className="sa-clock" aria-label="India time">
                <Icon name="calendar" size={16} style={{ color: "var(--muted)" }} />
                <span>{date}</span><b>{time}</b><em>IST</em>
              </div>
              <div style={{ position: "relative" }} ref={bell.ref}>
                <button className="sa-iconbtn" onClick={() => bell.setOpen((v) => !v)} aria-expanded={bell.open}
                  aria-label={decisions.length ? `${decisions.length} shops need your decision` : "Notifications"} title="Needs your decision">
                  <Icon name="bell" size={18} />{decisions.length > 0 && <i className="dot" />}
                </button>
                {bell.open && (
                  <div className="sa-pop" role="dialog" aria-label="Needs your decision">
                    <div className="sa-pop-h"><span>Needs your decision</span>{decisions.length > 0 && <span className="db-badge">{decisions.length} pending</span>}</div>
                    <div className="sa-pop-list">
                      {!decisions.length ? <div className="sa-empty" style={{ margin: 12 }}><b>Nothing waiting</b>No trial is ending and no shop has gone quiet.</div>
                        : decisions.map((r) => (
                          <button key={r.t.id} onClick={() => { bell.setOpen(false); openShop(r.t.id); }}>
                            <span className={`sa-ico t-${r.tone}`}><Icon name={r.rank <= 1 ? "clock" : "alert"} size={15} style={{ color: `var(--${r.tone})` }} /></span>
                            <div style={{ minWidth: 0 }}><b>{r.t.name}</b> {r.what}<span>{r.why}</span></div>
                            <Icon name="arrow" size={15} style={{ color: "var(--faint)" }} />
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }} ref={me.ref}>
                <button className="sa-avatar" onClick={() => me.setOpen((v) => !v)} aria-expanded={me.open} aria-label="Your account">
                  {(initialsOf(user?.name || "S")[0]) || "S"}
                </button>
                {me.open && (
                  <div className="sa-pop" role="dialog" aria-label="Your account" style={{ width: 260 }}>
                    <div className="sa-pop-h" style={{ display: "block" }}>
                      <div>{user?.name || "Super admin"}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
                    </div>
                    <div className="sa-pop-list">
                      <button onClick={logout}><Icon name="out" size={16} /><div><b>Sign out</b></div><span /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="sa-content">
            {route.mod !== "dashboard" && <PageHead eyebrow={page?.eyebrow} title={page?.title} sub={page?.sub} />}
            {route.mod === "dashboard" ? <Dashboard decisions={decisions} shopsPoll={shops} live={pulse.data} />
              : route.mod === "tenants" ? <Tenants onWatch={watchShop} />
              : <Monitoring tab={route.tab} setTab={(t) => go("monitor", t)} shopFilter={shopFilter} setShopFilter={setShopFilter} />}
          </main>
        </div>
      </div>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
