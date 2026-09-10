import { useEffect, useRef, useState } from "react";
import Sidebar, { NAV_SECTIONS } from "@/_shared/Sidebar";
import { useAuth } from "@/_shared/AuthContext";
import TopBar from "@/_shared/TopBar";
import Dashboard from "@/modules/dashboard/Dashboard";
import GoldRate from "@/modules/gold-rate/GoldRate";
import Customers from "@/modules/customers/Customers";
import Schemes from "@/modules/plan/scheme/Schemes";
import SchemeManagement from "@/modules/plan/enrollment/SchemeManagement";
import Payments from "@/modules/payments/Payments";
import CatalogueStudio from "@/modules/catalogue-studio/CatalogueStudio";
import PromotionBanners from "@/modules/marketing/PromotionBanners";
import PromotionCreate from "@/modules/marketing/PromotionCreate";
import Branches from "@/modules/branches/Branches";
import StaffUsers from "@/modules/staff/StaffUsers";
import Support from "@/modules/support/Support";
import Notifications from "@/modules/notifications/Notifications";
import Settings from "@/modules/settings/Settings";
import Inventory from "@/modules/procurement/inventory/Inventory";
import MasterInventory from "@/modules/procurement/master-inventory/MasterInventory";
import Vendors from "@/modules/procurement/purchase-history/Vendors";
import NewSale from "@/modules/billing/new-sale/NewSale";
import ReportsAnalytics from "@/modules/reports/ReportsAnalytics";
import SalesHistory from "@/modules/billing/sale-history/SalesHistory";
import ComingSoon from "@/_shared/ComingSoon";
import { subscribe } from "@/_shared/toast";
import { goldRateService } from "@/modules/gold-rate/goldRateService";

const PAGES = {
  dashboard: { title: "Dashboard", component: Dashboard },
  "gold-rate": { title: "Gold Rate", component: GoldRate },
  customers: { title: "Customers", component: Customers },
  schemes: { title: "Schemes", component: Schemes },
  "scheme-management": { title: "Enrollment Management", component: SchemeManagement },
  payments: { title: "Payments", component: Payments },
  inventory: { title: "Inventory", component: Inventory },
  "master-inventory": { title: "Master Inventory", component: MasterInventory },
  vendors: { title: "Purchase History", component: Vendors },
  "new-sale": { title: "New Sale", component: NewSale },
  "sales-history": { title: "Sales History", component: SalesHistory },
  catalogue: { title: "Catalogue Studio", component: CatalogueStudio },
  marketing: { title: "Promotion Banners", component: PromotionBanners },
  "promotion-create": { title: "Create Promotion", component: PromotionCreate },
  reports: { title: "Reports & Analytics", component: ReportsAnalytics },
  branches: { title: "Branches", component: Branches },
  "staff-users": { title: "Staff Users", component: StaffUsers },
  support: { title: "Support", component: Support },
  notifications: { title: "Notifications", component: Notifications },
  settings: { title: "Settings", component: Settings },
};

function Toast({ onRef }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => onRef(ref), [onRef]);
  useEffect(() =>
    subscribe((m) => {
      setMsg(m);
      setShow(true);
      clearTimeout(ref.current);
      ref.current = setTimeout(() => setShow(false), 3200);
    }), []);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-ink px-5 py-3.5 text-sm font-semibold text-white shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="h-2 w-2 rounded-full bg-accent" />
      {msg}
    </div>
  );
}

// Current module id from the URL hash, so a browser refresh restores the same
// page instead of falling back to the Dashboard. "#/payments" -> "payments".
function pageFromHash() {
  const h = window.location.hash.replace(/^#\/?/, "").trim();
  return h || "dashboard";
}

export default function App() {
  const { logout } = useAuth();
  const [page, setPageState] = useState(pageFromHash);
  // Navigate = update state AND the URL hash, so refresh/back/forward keep the page.
  const setPage = (p) => setPageState((prev) => (typeof p === "function" ? p(prev) : p));
  useEffect(() => {
    if (pageFromHash() !== page) window.location.hash = `/${page}`;
  }, [page]);
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  // Desktop sidebar collapsed to an icon rail, so the content area can expand.
  // Per-viewer convenience only — safe to lose.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem("dfx:navCollapsed") === "1"; } catch { return false; }
  });
  const toggleNavCollapsed = () => setNavCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem("dfx:navCollapsed", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(""); }, [page]);
  // Real promotions only — PromotionBanners fetches /admin/promotions on mount.
  const [promotions, setPromotions] = useState([]);
  const [editingPromo, setEditingPromo] = useState(null);
  // Today's bullion rate — fetched once here so the TopBar can show it on
  // every module, not just the Dashboard. When today's rate has not been
  // published yet the strip falls back to the LAST published rate and flags it
  // as not-today, so an admin is never shown a stale figure as if it were
  // today's. Display only: every price is resolved server-side.
  const [bullion, setBullion] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const today = await goldRateService.getTodayRate();
        if (!alive) return;
        if (today?.rate_24k != null) { setBullion({ ...today, isToday: true }); return; }
        const last = await goldRateService.getLastPublishedRate();
        if (!alive) return;
        setBullion(last ? { ...last, isToday: false } : null);
      } catch {
        if (alive) setBullion(null);
      }
    };
    load();
    // Re-fetch the moment an admin publishes a new rate (Gold Rate screen), so
    // the TopBar strip updates without a reload.
    window.addEventListener("dfx:rate-published", load);
    return () => { alive = false; window.removeEventListener("dfx:rate-published", load); };
  }, []);
  const meta = PAGES[page] ?? NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === page) ?? { title: "Dashboard" };
  const Page = meta.component;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar page={page} onNavigate={setPage} open={navOpen} onClose={() => setNavOpen(false)} collapsed={navCollapsed} onToggleCollapse={toggleNavCollapsed} />
      <div className="auto-fade-scroll flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain" onScroll={(e) => { const el = e.currentTarget; el.classList.add("is-scrolling"); clearTimeout(el._fadeT); el._fadeT = setTimeout(() => el.classList.remove("is-scrolling"), 1000); }}>
        <TopBar
          title={meta.title}
          onMenu={() => setNavOpen(true)}
          onNavigate={setPage}
          onLogout={logout}
          bullion={bullion}
          hideTitle
        />
        <main className="content-shell w-full min-w-0 flex-1 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {Page ? <Page onNavigate={setPage} search={search} promotions={promotions} setPromotions={setPromotions} editingPromo={editingPromo} setEditingPromo={setEditingPromo} /> : <ComingSoon name={meta.title} />}
        </main>
      </div>
      <Toast onRef={() => {}} />
    </div>
  );
}
