import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar, { NAV_SECTIONS } from "@/_shared/Sidebar";
import { useAuth } from "@/_shared/AuthContext";
import { canOpen, landingPage, shopHas, PAGE_SHOP_MODULE } from "@/_shared/moduleAccess";
import { istToday } from "@/_shared/utils";
import TopBar, { MobileRate } from "@/_shared/TopBar";
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
import Inbox from "@/modules/inbox/Inbox";
import Settings from "@/modules/settings/Settings";
import Inventory from "@/modules/procurement/inventory/Inventory";
import MasterInventory from "@/modules/procurement/master-inventory/MasterInventory";
import Vendors from "@/modules/procurement/purchase-history/Vendors";
import SupplierDirectory from "@/modules/procurement/supplier-directory/SupplierDirectory";
import NewSale from "@/modules/billing/new-sale/NewSale";
import PricingSettings from "@/modules/billing/pricing-settings/PricingSettings";
import ReportsAnalytics from "@/modules/reports/ReportsAnalytics";
import SalesHistory from "@/modules/billing/sale-history/SalesHistory";
import QuotationsHistory from "@/modules/billing/quotations/QuotationsHistory";
import ComingSoon from "@/_shared/ComingSoon";
import { subscribe, toast } from "@/_shared/toast";
import { useScannerInput } from "@/modules/barcode/scanner";
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
  "supplier-directory": { title: "Supplier Directory", component: SupplierDirectory },
  vendors: { title: "Purchase History", component: Vendors },
  "new-sale": { title: "New Sale", component: NewSale },
  "sales-history": { title: "Sales History", component: SalesHistory },
  "quotations-history": { title: "Quotations", component: QuotationsHistory },
  "store-defaults": { title: "Store Defaults", component: PricingSettings },
  catalogue: { title: "Catalogue Studio", component: CatalogueStudio },
  marketing: { title: "Promotion Banners", component: PromotionBanners },
  "promotion-create": { title: "Create Promotion", component: PromotionCreate },
  reports: { title: "Reports & Analytics", component: ReportsAnalytics },
  branches: { title: "Branches", component: Branches },
  "staff-users": { title: "Staff Users", component: StaffUsers },
  support: { title: "Support", component: Support },
  notifications: { title: "Send Notifications", component: Notifications },
  inbox: { title: "All notifications", component: Inbox },
  settings: { title: "Settings", component: Settings },
};

// Shown when a URL resolves to a module this user was not granted. It is a
// statement, not an error: the server would refuse the calls this page makes,
// so the page is not opened at all. Not a security boundary - the server is.
function NoAccess({ name, notInShop }) {
  if (notInShop) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-canvas/40 px-6 py-8 text-center">
        <div className="text-sm font-extrabold text-ink">{name} is not part of this shop&apos;s DFX plan</div>
        <p className="mt-2 text-xs text-muted">
          Contact DFX support if you would like to add it.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-canvas/40 px-6 py-8 text-center">
      <div className="text-sm font-extrabold text-ink">{name} is not part of your access</div>
      <p className="mt-2 text-xs text-muted">
        Ask an administrator if you need it. Nothing is wrong — this account simply
        has not been granted this module.
      </p>
    </div>
  );
}

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
  const { logout, user, permissions, shopModules } = useAuth();
  const [page, setPageState] = useState(pageFromHash);
  // What the navigation was FOR, when the destination alone does not say it.
  // "New Enrollment" on the Dashboard has to land on Customers with the Add
  // Customer dialog already open, because that dialog is where a scheme is
  // actually joined. One-shot: any later navigation clears it, and a hash
  // change (refresh, back, a typed URL) never sets one, so a reopened page is
  // never haunted by a dialog the user did not ask for.
  const [intent, setIntent] = useState(null);
  // Navigate = update state AND the URL hash, so refresh/back/forward keep the page.
  const setPage = (p, nextIntent = null) => {
    setIntent(nextIntent);
    setPageState((prev) => (typeof p === "function" ? p(prev) : p));
  };
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
  // Every page shares one scrolling area, so a new page used to open at the
  // scroll position the last one was left at, with its title out of view.
  // Start each page at the top. (Both the column and <main> can scroll.)
  const scrollRef = useRef(null);
  useEffect(() => {
    const col = scrollRef.current;
    if (!col) return;
    col.scrollTop = 0;
    const main = col.querySelector(":scope > main");
    if (main) main.scrollTop = 0;
  }, [page]);
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
        // Fall back to the last published rate through carry_forward on the
        // SAME endpoint, not through the rate HISTORY. History is the Gold
        // Rate screen's own data and is still module-gated, so a staff member
        // without that module got a 403 here and the header strip sat at
        // "-/g" - the shop looking like it has no price. The carried rate
        // arrives with its own effective_date, which is what decides isToday;
        // a stale figure is never passed off as today's.
        const last = await goldRateService.getTodayRate({ carryForward: true });
        if (!alive) return;
        setBullion(last?.rate_24k != null ? { ...last, isToday: last.effective_date === istToday() } : null);
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
  // D2: gate the ROUTE, not only the menu. The page comes from the URL hash, so
  // hiding a sidebar entry is not enough - typing #/customers would still mount
  // the module and let it fire API calls it cannot make. A refusal we control
  // beats a red error from a screen that should never have opened.
  const role = user?.backendRole ?? user?.role ?? null;
  const navOrder = NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.id);
  const allowed = canOpen(page, role, permissions, shopModules);
  // Refused because the SHOP does not use this module, not because of a grant.
  const notInShop = !allowed && !shopHas(shopModules, PAGE_SHOP_MODULE[page]);
  // Land somewhere openable. A staff member without Dashboard used to arrive on
  // a page that refused him before he had touched anything.
  useEffect(() => {
    if (allowed || !role) return;
    const home = landingPage(role, permissions, navOrder, shopModules);
    if (home && home !== page) setPage(home);
  }, [allowed, role, page, permissions, shopModules]);

  // A barcode scanned on any other page opens that piece in New Sale. New Sale
  // runs its own scanner listener, so this one is off there.
  const onAppScan = useCallback((raw) => {
    const v = String(raw || "").trim().toUpperCase();
    if (!v) return;
    if (!shopHas(shopModules, "billing")) return; // no billing in this shop: a scan means nothing
    if (!canOpen("new-sale", role, permissions, shopModules)) { toast(`Scanned ${v} - this login cannot open New Sale`); return; }
    // Owner's rule: a scan on any page goes straight to New Sale, found or not.
    setPage("new-sale", { scan: v });
  }, [role, permissions, shopModules]); // eslint-disable-line react-hooks/exhaustive-deps
  useScannerInput(onAppScan, !!user && page !== "new-sale" && shopHas(shopModules, "billing"));

  const meta = PAGES[page] ?? NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === page) ?? { title: "Dashboard" };
  const Page = allowed ? meta.component : null;

  return (
    <div className="flex h-dvh overflow-hidden lg:h-screen">
      <Sidebar page={page} onNavigate={setPage} open={navOpen} onClose={() => setNavOpen(false)} collapsed={navCollapsed} onToggleCollapse={toggleNavCollapsed} />
      <div ref={scrollRef} className="auto-fade-scroll flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain" onScroll={(e) => { const el = e.currentTarget; el.classList.add("is-scrolling"); clearTimeout(el._fadeT); el._fadeT = setTimeout(() => el.classList.remove("is-scrolling"), 1000); }}>
        <TopBar
          title={meta.title}
          onMenu={() => setNavOpen(true)}
          onNavigate={setPage}
          onLogout={logout}
          bullion={bullion}
          hideTitle
        />
        <MobileRate bullion={bullion} />
        <main className="content-shell relative w-full [&:has([data-own-back])>[data-shell-back]]:hidden min-w-0 flex-1 overflow-x-hidden px-3 py-5 max-lg:pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {/* Phone/tablet page-level Back, on its own row above the page title.
              It used to be pinned to the top-right corner, where every page
              header puts its own main button, so it sat on top of it. In the
              page flow nothing can end up underneath it. Every page but the
              Dashboard is reached from somewhere else, so it goes one step back
              through the same hash history the browser already keeps. */}
          {page !== "dashboard" && (
            <button
              type="button"
              aria-label="Go back"
              data-shell-back
              onClick={() => (window.history.length > 1 ? window.history.back() : setPage("dashboard"))}
              className="-ml-1 mb-3 inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface pl-2 pr-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-accent-soft active:bg-accent-soft lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              Back
            </button>
          )}
          {Page
            ? <Page onNavigate={setPage} intent={intent} clearIntent={() => setIntent(null)} search={search} promotions={promotions} setPromotions={setPromotions} editingPromo={editingPromo} setEditingPromo={setEditingPromo} />
            : allowed
              ? <ComingSoon name={meta.title} />
              : <NoAccess name={meta.title} notInShop={notInShop} />}
        </main>
      </div>
      <Toast onRef={() => {}} />
    </div>
  );
}
