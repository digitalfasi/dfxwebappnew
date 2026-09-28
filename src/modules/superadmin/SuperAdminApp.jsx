"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/_shared/AuthContext";
import Monitoring from "@/modules/superadmin/Monitoring";
import Tenants from "@/modules/superadmin/Tenants";
import { saService } from "@/modules/superadmin/saService";
import { SA_CSS, Icon, initialsOf, useNow, usePoll } from "@/modules/superadmin/saUi";

// Deep-linkable: #/control/<module>/<tab>
export const MON_PAGES = [
  { key: "live", label: "Live now", icon: "pulse", title: "Live now", sub: "What is happening on DFX this minute" },
  { key: "shops", label: "Shops", icon: "shop", title: "Shops", sub: "Activity and health of every shop today" },
  { key: "people", label: "People", icon: "users", title: "People", sub: "Every admin, staff member and customer, and when they were last seen" },
  { key: "sessions", label: "Sessions", icon: "clock", title: "Sessions", sub: "Each sign-in, from start to sign-out" },
  { key: "signins", label: "Sign-ins & security", icon: "shield", title: "Sign-ins & security", sub: "Successful, failed and blocked sign-ins" },
  { key: "activity", label: "Activity log", icon: "list", title: "Activity log", sub: "What people changed, in every shop" },
  { key: "system", label: "Server & database", icon: "server", title: "Server & database", sub: "The machine, containers, backups, traffic and logs" },
];

function readHash() {
  if (typeof window === "undefined") return { mod: "monitor", tab: "live" };
  const [, root, mod, tab] = window.location.hash.replace(/^#/, "").split("/");
  if (root !== "control") return { mod: "monitor", tab: "live" };
  return { mod: mod === "tenants" ? "tenants" : "monitor", tab: MON_PAGES.some((p) => p.key === tab) ? tab : "live" };
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
    const h = route.mod === "tenants" ? "#/control/tenants" : `#/control/monitor/${route.tab}`;
    if (window.location.hash !== h) window.history.replaceState(null, "", h);
    const pg = MON_PAGES.find((p) => p.key === route.tab);
    document.title = `${route.mod === "tenants" ? "Tenants" : pg?.title} · DFX Control`;
  }, [route]);

  const go = (mod, tab) => { setRoute((r) => ({ mod, tab: tab || (mod === r.mod ? r.tab : "live") })); setNavOpen(false); };
  const watchShop = (id) => { setShopFilter(id); go("monitor", "people"); };
  const page = route.mod === "tenants"
    ? { title: "Tenants", sub: "Create shops, manage plans and access, and look after each shop's admin" }
    : MON_PAGES.find((p) => p.key === route.tab);
  const time = new Date(now).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const date = new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="sa">
      <style>{SA_CSS}</style>
      <div className="sa-app">
        {navOpen && <div className="sa-scrim" onClick={() => setNavOpen(false)} />}
        <aside className={`sa-side${navOpen ? " open" : ""}`} aria-label="Navigation">
          <div className="sa-side-brand">
            <span className="mark"><Icon name="pulse" size={17} stroke={2.4} /></span>
            <div><b>DFX Control</b><span>Super admin</span></div>
          </div>
          <nav className="sa-side-nav">
            <div className="grp">Platform</div>
            <button className={`item${route.mod === "monitor" ? " on-parent" : ""}`} aria-expanded={monOpen} onClick={() => setMonOpen((v) => !v)}>
              <Icon name="activity" size={18} /><span>Monitoring</span>
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
            <button className="item" aria-current={route.mod === "tenants" ? "page" : undefined} onClick={() => go("tenants")}>
              <Icon name="shop" size={18} /><span>Tenants</span>
            </button>

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
              <div className="crumb">{route.mod === "tenants" ? "Platform" : "Monitoring"}</div>
              <h1>{page?.title}</h1>
            </div>
            <div className="clock"><span className="sa-hide-sm">{date}</span><b className="mono">{time}</b><span>IST</span></div>
          </header>
          <main className="sa-content">
            <p className="sa-head-sub">{page?.sub}</p>
            {route.mod === "tenants"
              ? <Tenants onWatch={watchShop} />
              : <Monitoring tab={route.tab} setTab={(t) => go("monitor", t)} shopFilter={shopFilter} setShopFilter={setShopFilter} />}
          </main>
        </div>
      </div>
    </div>
  );
}
