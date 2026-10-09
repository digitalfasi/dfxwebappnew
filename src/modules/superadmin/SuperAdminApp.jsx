"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/_shared/AuthContext";
import Monitoring from "@/modules/superadmin/Monitoring";
import Dashboard from "@/modules/superadmin/Dashboard";
import Tenants from "@/modules/superadmin/Tenants";
import { saService } from "@/modules/superadmin/saService";
import { SA_CSS, Icon, initialsOf, useNow, usePoll } from "@/modules/superadmin/saUi";

// Deep-linkable: #/control/<module>/<tab>
export const MON_PAGES = [
  { key: "live", label: "Live now", icon: "pulse", title: "Live now", sub: "Right now: how many people are using DFX, and whether everything is working. Green means all is well." },
  { key: "people", label: "People", icon: "users", title: "People", sub: "Everyone who has a DFX login - shop owners, staff and customers - and when each one last used DFX. Click a name to see their full history." },
  { key: "sessions", label: "Login history", icon: "clock", title: "Login history", sub: "One row for every time someone logged in: when they logged in, when they logged out, on which device, and how long they used DFX." },
  { key: "signins", label: "Login problems & safety", icon: "shield", title: "Login problems & safety", sub: "Wrong passwords, blocked logins and anything suspicious. If the numbers are 0, there is nothing to worry about." },
  { key: "activity", label: "Changes made", icon: "list", title: "Changes made", sub: "What each shop's team changed in DFX - who did it, what they changed and when. Newest first." },
  { key: "system", label: "System health", icon: "server", title: "System health", sub: "For the technical team: the computer DFX runs on, its storage and the nightly backups. Green everywhere means nothing needs doing." },
];

const HOME = { mod: "dashboard", tab: "live" };
const MOD_HASH = { dashboard: "#/control/dashboard", tenants: "#/control/shops" };
const MOD_PAGE = {
  dashboard: { crumb: "Platform", title: "Dashboard", sub: "How DFX is doing as a business: money billed and collected in every shop, which shops pay, and which ones need a decision from you." },
  tenants: { crumb: "Platform", title: "Shops", sub: "Every jewellery shop using DFX - its plan, when its access ends, the owner, when the owner last logged in and out, and today's sales. Click a shop for details." },
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

export default function SuperAdminApp() {
  const { user, logout } = useAuth();
  const [route, setRoute] = useState(readHash);
  const [shopFilter, setShopFilter] = useState("");
  const [monOpen, setMonOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const now = useNow(1000);
  const pulse = usePoll(async () => (await saService.overview()).live, [], { ms: 30000 });

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const h = MOD_HASH[route.mod] || `#/control/monitor/${route.tab}`;
    if (window.location.hash.split("?")[0] !== h) window.history.replaceState(null, "", h);
    document.title = `${(MOD_PAGE[route.mod] || MON_PAGES.find((p) => p.key === route.tab))?.title} · DFX Control`;
  }, [route]);

  const go = (mod, tab) => { setRoute((r) => ({ mod, tab: tab || (mod === r.mod ? r.tab : "live") })); setNavOpen(false); };
  // From a shop: its changes, or its customers. The hash carries the filter
  // the page reads when it opens.
  const watchShop = (id, where = "activity") => {
    setShopFilter(id);
    setNavOpen(false);
    window.location.hash = where === "customers" ? "#/control/monitor/people?role=Customer" : "#/control/monitor/activity";
  };
  const page = MOD_PAGE[route.mod] || { crumb: "Monitoring", ...MON_PAGES.find((p) => p.key === route.tab) };
  const time = new Date(now).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const date = new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="sa">
      <style>{SA_CSS}</style>
      <div className="sa-app">
        {navOpen && <div className="sa-scrim" onClick={() => setNavOpen(false)} />}
        <aside className={`sa-side${navOpen ? " open" : ""}`} aria-label="Navigation">
          <div className="sa-side-brand">
            <img className="sa-brand-logo" src="/dfx-gold-logo.png" alt="DFX GOLD - Super admin" width={110} height={51} />
          </div>
          <nav className="sa-side-nav">
            <div className="grp">Platform</div>
            <button className="item" aria-current={route.mod === "dashboard" ? "page" : undefined} onClick={() => go("dashboard")}>
              <Icon name="activity" size={18} /><span>Dashboard</span>
            </button>
            <button className="item" aria-current={route.mod === "tenants" ? "page" : undefined} onClick={() => go("tenants")}>
              <Icon name="shop" size={18} /><span>Shops</span>
            </button>
            <button className={`item${route.mod === "monitor" ? " on-parent" : ""}`} aria-expanded={monOpen} onClick={() => setMonOpen((v) => !v)}>
              <Icon name="pulse" size={18} /><span>Monitoring</span>
              <em className="live"><i />{pulse.data?.total ?? "–"}</em>
              <Icon name="chev" size={14} className={`chev${monOpen ? " up" : ""}`} />
            </button>
            {monOpen && (
              <div className="sub">
                {MON_PAGES.map((p) => (
                  <button key={p.key} className="subitem" aria-current={route.mod === "monitor" && route.tab === p.key ? "page" : undefined}
                    onClick={() => go("monitor", p.key)}>
                    <Icon name={p.icon} size={15} /><span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>
          <div className="sa-side-foot">
            <span className="av">{initialsOf(user?.name || "Super Admin")}</span>
            <div className="me"><b>{user?.name || "Super admin"}</b><span>{user?.email}</span></div>
            <button className="out" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="out" size={17} /></button>
          </div>
        </aside>

        <div className="sa-body">
          <header className="sa-head">
            <button className="sa-burger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Icon name="list" size={20} /></button>
            <div className="ttl">
              <div className="crumb">{page?.crumb}</div>
              <h1>{page?.title}</h1>
            </div>
            <div className="clock"><span className="sa-hide-sm">{date}</span><b className="mono">{time}</b><span>IST</span></div>
          </header>
          <main className="sa-content">
            <p className="sa-head-sub">{page?.sub}</p>
            {route.mod === "dashboard" ? <Dashboard />
              : route.mod === "tenants" ? <Tenants onWatch={watchShop} />
              : <Monitoring tab={route.tab} setTab={(t) => go("monitor", t)} shopFilter={shopFilter} setShopFilter={setShopFilter} />}
          </main>
        </div>
      </div>
    </div>
  );
}
