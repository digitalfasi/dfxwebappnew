import { useEffect, useRef, useState } from "react";
import Sidebar, { NAV_SECTIONS } from "./components/Sidebar";
import { useAuth } from "./context/AuthContext";
import TopBar from "./components/TopBar";
import Dashboard from "./views/Dashboard";
import GoldRate from "./views/GoldRate";
import Customers from "./views/Customers";
import Schemes from "./views/Schemes";
import Enrollments from "./views/Enrollments";
import Collections from "./views/Collections";
import Payments from "./views/Payments";
import CatalogueStudio from "./views/CatalogueStudio";
import PromotionBanners from "./views/PromotionBanners";
import PromotionCreate from "./views/PromotionCreate";
import Branches from "./views/Branches";
import StaffUsers from "./views/StaffUsers";
import Support from "./views/Support";
import Notifications from "./views/Notifications";
import Settings from "./views/Settings";
import Inventory from "./views/Inventory";
import NewSale from "./views/NewSale";
import ReportsAnalytics from "./views/ReportsAnalytics";
import SalesHistory from "./views/SalesHistory";
import ComingSoon from "./views/ComingSoon";
import { subscribe } from "./lib/toast";
import { INITIAL_PROMOTIONS } from "./lib/promotionStore";

const PAGES = {
  dashboard: { title: "Dashboard", crumb: "Overview", component: Dashboard },
  "gold-rate": { title: "Gold Rate", crumb: "Overview", component: GoldRate, action: "Publish update" },
  customers: { title: "Customers", crumb: "People", component: Customers },
  schemes: { title: "Schemes", crumb: "Schemes", component: Schemes },
  enrollments: { title: "Enrollments", crumb: "Schemes", component: Enrollments },
  collections: { title: "Collections", crumb: "Schemes", component: Collections },
  payments: { title: "Payments", crumb: "Billing", component: Payments },
  inventory: { title: "Inventory", crumb: "Billing", component: Inventory },
  "new-sale": { title: "New Sale", crumb: "Billing", component: NewSale },
  "sales-history": { title: "Sales History", crumb: "Billing", component: SalesHistory, action: "New sale" },
  catalogue: { title: "Catalogue Studio", crumb: "Growth", component: CatalogueStudio },
  marketing: { title: "Promotion Banners", crumb: "Growth", component: PromotionBanners },
  "promotion-create": { title: "Create Promotion", crumb: "Growth", component: PromotionCreate },
  reports: { title: "Reports & Analytics", crumb: "Growth", component: ReportsAnalytics },
  branches: { title: "Branches", crumb: "Operations", component: Branches },
  "staff-users": { title: "Staff Users", crumb: "Operations", component: StaffUsers },
  support: { title: "Support", crumb: "System", component: Support },
  notifications: { title: "Notifications", crumb: "System", component: Notifications },
  settings: { title: "Settings", crumb: "System", component: Settings },
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

export default function App() {
  const { tenantName, logout } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(""); }, [page]);
  const [promotions, setPromotions] = useState(INITIAL_PROMOTIONS);
  const [editingPromo, setEditingPromo] = useState(null);
  const meta = PAGES[page] ?? NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === page) ?? { title: "Dashboard" };
  const Page = meta.component;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar page={page} onNavigate={setPage} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="auto-fade-scroll flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain" onScroll={(e) => { const el = e.currentTarget; el.classList.add("is-scrolling"); clearTimeout(el._fadeT); el._fadeT = setTimeout(() => el.classList.remove("is-scrolling"), 1000); }}>
        <TopBar
          title={meta.title}
          crumb={`${tenantName || "DFX Solution"} / ${meta.crumb ?? ""}`}
          onMenu={() => setNavOpen(true)}
          onNavigate={setPage}
          onLogout={logout}
          hideTitle={page === "dashboard"}
          search={search}
          onSearch={page === "dashboard" ? setSearch : undefined}
          searchPlaceholder="Search recent invoices or enrollments..."
          action={
            meta.action && (
              <button
                onClick={() => {}}
                className="hidden h-8 items-center rounded-full bg-accent px-4 text-xs font-bold text-white transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-accent-strong active:scale-95 sm:inline-flex"
              >
                {meta.action}
              </button>
            )
          }
        />
        <main className="content-shell w-full min-w-0 flex-1 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {Page ? <Page onNavigate={setPage} search={search} promotions={promotions} setPromotions={setPromotions} editingPromo={editingPromo} setEditingPromo={setEditingPromo} /> : <ComingSoon name={meta.title} />}
        </main>
      </div>
      <Toast onRef={() => {}} />
    </div>
  );
}
