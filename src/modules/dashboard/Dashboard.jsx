import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { formatINR, istToday, BUILD_SHA } from "@/_shared/utils";
import { apiClient } from "@/_shared/apiClient";
import { useAuth } from "@/_shared/AuthContext";
import { PAGE_SHOP_MODULE, shopHas } from "@/_shared/moduleAccess";
import { toast } from "@/_shared/toast";
import { reportService } from "@/modules/reports/reportService";
import { billingService } from "@/modules/billing/billingService";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";
import { LineChart } from "@/_shared/ui/LineChart";
import { fmtDateShort } from "@/_shared/utils";

const BUSINESS_ACCENT = "var(--color-accent)";
const SCHEME_ACCENT = "#9f1d35"; // DFX burgundy, same as the interface accent
// Distinct categorical hues so each donut segment/legend row is identifiable
// at a glance. Business starts at emerald (theme), Schemes offset to gold.
const DONUT_PALETTE = ["#9f1d35", "#c9a84c", "#d98a96", "#152238", "#7f1529", "#a68631", "#667085", "#e8b4bb", "#5c1020", "#8a93a6"];
const DONUT_BUSINESS = DONUT_PALETTE;
const DONUT_SCHEME = ["#c9a84c", "#9f1d35", "#d98a96", "#152238", "#a68631", "#7f1529", "#667085", "#e8b4bb", "#8a93a6", "#5c1020"];

// Distinguishes "the shop has no pending actions" from "we could not find out".
// How long a dashboard may sit unwatched before returning to it is worth a
// refetch. Under this, the figures on screen are still today's and still fresh
// enough to trust — and keeping them beats blanking the screen to redraw the
// same numbers.
const STALE_AFTER_MS = 5 * 60 * 1000;

// The Dashboard unmounts the moment you open any other module, so coming back
// to it used to be a cold start: every card blank, every figure refetched from
// nothing. That is the flash — it is not a rendering fault, it is the screen
// genuinely having no data again. This module-level cache outlives the
// component, so a return paints the last known figures immediately and the
// refetch happens behind them. Memory only: a browser refresh starts clean,
// and nothing here is ever shown as "today's" once the IST day has rolled
// over (the day check reloads and overwrites it).
const CACHE = { core: null, biz: new Map(), scheme: new Map() };

const CARDS_FAILED = { __failed: true };
// D7: a refusal is NOT a failure. A staff member whose grants do not cover the
// alert sources was shown "Alerts unavailable", which reads as an outage and
// teaches staff to ignore real ones. A panel he may not see is simply not
// shown; a panel that genuinely broke still says so. The two must stay apart.
const CARDS_REFUSED = { __refused: true };

const QUICK_ACTIONS = [
  { title: "New Sale", hint: "Bill a piece", page: "new-sale", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" },
  { title: "Record Payment", hint: "Scheme instalment", page: "payments", icon: "M1 4h22v16H1zM1 10h22" },
  // Adding a customer and enrolling them are the same dialog, so this one tile
  // covers both (the separate Add Customer tile was a duplicate).
  // Enrolment happens in the Add Customer dialog on the Customer Directory,
  // not on Enrollment Management - that screen lists and manages enrolments
  // that already exist. Sending someone here to CREATE one left them hunting.
  { title: "New Enrollment", hint: "New customer + scheme", page: "customers", intent: "add-customer", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" },
  { title: "Add Scheme", hint: "Create a plan", page: "schemes", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { title: "Add Catalogue", hint: "Storefront product", page: "catalogue", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { title: "Generate Report", hint: "Download a summary", report: true, icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" },
];

// Phone-only Quick Actions: two modules, each opening its own two-column set.
// Every leaf is an existing page (or an existing dialog, via intent) - nothing
// here is new navigation.
const P_BAG = "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0";
const P_GRID = "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z";
const P_PLUS = "M12 5v14M5 12h14";
const MOBILE_MODULES = [
  { id: "jewellery", title: "Jewellery Management System", icon: "M6 3h12l4 6-10 12L2 9zM2 9h20M12 21 8 9l4-6 4 6z", actions: [
    { title: "Billing", page: "new-sale", icon: P_BAG },
    { title: "Supplier Directory", page: "supplier-directory", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
    { title: "Master Inventory", page: "master-inventory", icon: P_GRID },
    { title: "Inventory", page: "inventory", icon: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" },
    { title: "Bulk Purchase", page: "inventory", intent: "bulk-purchase", icon: P_PLUS },
    { title: "Add Purchase", page: "inventory", intent: "add-purchase", icon: P_PLUS },
    { title: "Catalogue Studio", page: "catalogue", icon: P_GRID, wide: true },
  ] },
  { id: "scheme", title: "Scheme", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", actions: [
    { title: "New Enrollment", page: "customers", intent: "add-customer", module: "schemes", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" },
    { title: "Scheme Plans", page: "schemes", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  ] },
];

// A shop that runs schemes without billing gets four direct actions instead of
// the module groups. Each one opens the form it names; Complete Scheme opens
// Enrollment Management on the running plans, where Manage closes one (only an
// Active enrolment can be closed - Completed ones are already finished).
const SCHEME_SHOP_ACTIONS = [
  { title: "Add Customer", hint: "New customer", page: "customers", intent: "add-customer", admin: true, icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" },
  { title: "Add Scheme", hint: "New saving plan", page: "schemes", intent: "add-scheme", admin: true, icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { title: "Add Catalogue", hint: "New design", page: "catalogue", intent: "add-product", admin: true, module: "catalogue", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7" },
  { title: "Complete Scheme", hint: "Close a plan", page: "scheme-management", intent: { status: "Active", period: "all" }, admin: true, icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" },
];

const PERIOD_TABS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];
const ANALYTICS_TABS = [
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];
const BIZ_METRICS = [
  { value: "sales", label: "Overall Sales" },
  { value: "profit", label: "Profit", adminOnly: true },
  { value: "gold", label: "Gold Sold" },
];
const SCHEME_METRICS = [
  { value: "collections", label: "Collections" },
  { value: "maturity", label: "Maturity" },
  { value: "enrollments", label: "Enrollments" },
];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, v); });
  const s = qs.toString();
  return s ? `?${s}` : "";
}
// The senior did a full day's business, opened the dashboard at 00:52 and saw
// zeroes. The figures were right - the shop's day had rolled over to the 14th
// and his work belonged to the 13th - but the card said only "TODAY'S", never
// which day, so he had no way to check and concluded the product was stuck.
// The shop's day is IST, not the browser's.
function periodWindowLabel(sel, custom) {
  const d = istToday();  // "YYYY-MM-DD" on the shop's calendar
  const pretty = (iso) => {
    const [y, m, day] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day));
    return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
  };
  switch (sel) {
    case "today": return `${pretty(d)}, since 12:00 AM IST`;
    case "this_week": return `This week to ${pretty(d)}, IST`;
    case "this_month": return `This month to ${pretty(d)}, IST`;
    case "this_year": return `This year to ${pretty(d)}, IST`;
    default:
      return custom?.from && custom?.to ? `${custom.from} → ${custom.to}, IST` : null;
  }
}

function periodPrefix(sel) {
  switch (sel) {
    case "today": return "Today's";
    case "this_week": return "This Week's";
    case "this_month": return "This Month's";
    case "this_year": return "This Year's";
    default: return "Selected Period";
  }
}
/** Named period → ?period=x ; custom → date_from/date_to (null until both set). */
function rangeQuery(sel, custom) {
  if (sel === "custom") {
    if (!custom.from || !custom.to) return null;
    return buildQuery({ date_from: custom.from, date_to: custom.to });
  }
  return buildQuery({ period: sel });
}
/* Every bucket the backend's trend reports would use for this window, oldest
   first, so a quiet day/month plots as 0 instead of vanishing (This Year with
   sales only in Sep and Oct used to draw a 2-point Sep -> Oct line).
   Mirrors reports/service.py exactly: same window per period (ending today,
   IST), month buckets "Sep 2026" when the span is over 31 days, otherwise day
   buckets "05 Oct". null = window unknown (custom awaiting dates). */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function trendBuckets(sel, custom) {
  const t = istToday();
  let from = t, to = t;
  if (sel === "custom") {
    if (!custom.from || !custom.to) return null;
    from = custom.from; to = custom.to;
  } else if (sel === "this_week") {
    const d = new Date(`${t}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    from = d.toISOString().slice(0, 10);
  } else if (sel === "this_month") {
    from = `${t.slice(0, 8)}01`;
  } else if (sel === "this_year") {
    from = `${t.slice(0, 5)}01-01`;
  } else if (sel !== "today") {
    return null;
  }
  const d0 = new Date(`${from}T00:00:00Z`), d1 = new Date(`${to}T00:00:00Z`);
  if (!(d0 <= d1)) return null;
  const out = [];
  if ((d1 - d0) / 86400000 > 31) {
    for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); y < d1.getUTCFullYear() || (y === d1.getUTCFullYear() && m <= d1.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
      out.push(`${MON[m]} ${y}`);
    }
  } else {
    for (const d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(`${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`);
    }
  }
  return out;
}
/* Lay a sparse series over the full bucket list (missing = 0). Display only:
   the KPI totals never read this. If any returned label is not a bucket we
   expected, the series is drawn exactly as returned rather than risk hiding
   a real figure. */
function fillTrend(series, buckets) {
  if (!buckets || !series.length) return series;
  const want = new Set(buckets);
  if (series.some((p) => !want.has(p.x))) return series;
  const got = new Map(series.map((p) => [p.x, p.y]));
  return buckets.map((x) => ({ x, y: got.get(x) ?? 0 }));
}
function rangeKey(sel, custom) {
  return sel === "custom" ? `c:${custom.from}:${custom.to}` : sel;
}
function analyticsQuery(sel, custom) {
  if (sel === "this_year") return buildQuery({ period: "this_year" });
  if (sel === "last_year") {
    const y = new Date().getFullYear() - 1;
    return buildQuery({ date_from: `${y}-01-01`, date_to: `${y}-12-31` });
  }
  if (!custom.from || !custom.to) return null;
  return buildQuery({ date_from: custom.from, date_to: custom.to });
}
function analyticsKey(sel, custom) {
  return sel === "custom" ? `c:${custom.from}:${custom.to}` : sel;
}
/* Card subtitle. An applied Custom range doubles as the "change dates"
   control, since the picker no longer sits above the chart. */
function RangeLabel({ sel, custom, onEdit }) {
  const text = analyticsLabel(sel, custom);
  if (sel === "custom" && custom.from && custom.to) {
    return (
      <button type="button" onClick={onEdit} title="Change dates"
        className="inline-flex items-center gap-1 text-[10px] font-bold text-faint underline decoration-dotted underline-offset-2 hover:text-ink">
        {text}
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
    );
  }
  return <span className="text-[10px] font-bold text-faint">{text}</span>;
}

function analyticsLabel(sel, custom) {
  if (sel === "this_year") return String(new Date().getFullYear());
  if (sel === "last_year") return String(new Date().getFullYear() - 1);
  return custom.from && custom.to ? `${custom.from} → ${custom.to}` : "Custom";
}

// A comparison against a period with no business is not information. Beside
// "Rs 0" a bare -100% reads as a fault - it was the first thing the senior saw
// on a dashboard that was telling him the truth. Suppressed when there is
// nothing to compare, and named when there is.
function formatGrowth(value, current) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const now = Number(current);
  if (n <= -100 && Number.isFinite(now) && now === 0) return null;
  return `${n > 0 ? "+" : ""}${n}%`;
}
function fmtGrams(g) {
  if (g === null || g === undefined) return "—";
  const n = Number(g);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
}
function fmtCurrency(v) {
  if (v === null || v === undefined) return "—";
  return formatINR(v);
}
// Profit can legitimately be negative (returns, discounts below cost). It is
// shown with an explicit minus — Math.abs() here used to render a loss as if it
// were a profit of the same size, which is the worst possible reading.
function fmtProfit(v) {
  if (v === null || v === undefined) return "—";
  const n = Number(v) || 0;
  return n < 0 ? `-${formatINR(Math.abs(n))}` : formatINR(n);
}
function fmtCount(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-IN");
}
function fmtCompact(v) {
  const n = Number(v) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function fmtTime(iso) {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return "";
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

const INVOICE_TONE = { Paid: "success", Partial: "warning", Pending: "danger", Returned: "info", Canceled: "neutral" };
const ENROLL_TONE = { Active: "success", Completed: "success", Closed: "neutral", Cancelled: "danger", Redeemed: "info" };

/** Axis tick formatter per metric unit. */
/* Full figure for the trend hover tooltip (the axis uses the compact form). */
function tipFmt(v, unit) {
  const n = Number(v) || 0;
  if (unit === "grams") return `${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
  if (unit === "count") return n.toLocaleString("en-IN");
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function axisFmt(v, unit) {
  const n = Number(v) || 0;
  if (unit === "grams") return `${Math.round(n)}g`;
  if (unit === "count") return `${Math.round(n)}`;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}

/* ── small controls, new-theme styled ── */
function PeriodTabs({ value, onChange, accent, tabs = PERIOD_TABS }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas p-0.5">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${value === t.value ? "text-white" : "text-muted hover:text-ink"}`}
          style={value === t.value ? { backgroundColor: accent } : undefined}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
function MetricSelect({ value, onChange, options, accent }) {
  return (
    // The accent bar lives on a wrapper: Select owns its trigger styling, so
    // colouring it from outside would mean adding a prop just for this.
    <span className="inline-flex items-stretch overflow-hidden rounded-lg" style={{ borderLeft: `3px solid ${accent}` }}>
      <Select
        value={value}
        onValueChange={onChange}
        options={options}
        className="w-[132px]"
        triggerClassName="h-7 min-h-[28px] rounded-l-none text-[10px] font-bold"
      />
    </span>
  );
}
function CustomRange({ value, onApply, accent, className = "mb-2" }) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  return (
    <div className={`${className} flex flex-wrap items-center justify-center gap-2 rounded-lg border border-line bg-canvas p-2`}>
      <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2">
        <span className="text-[9px] font-bold uppercase text-faint">From</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[7rem] bg-transparent text-[11px] text-muted outline-none" />
      </label>
      <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2">
        <span className="text-[9px] font-bold uppercase text-faint">To</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[7rem] bg-transparent text-[11px] text-muted outline-none" />
      </label>
      <button onClick={() => from && to && onApply({ from, to })} disabled={!from || !to}
        className="h-8 rounded-lg px-3 text-[11px] font-bold text-white disabled:opacity-40" style={{ backgroundColor: accent }}>
        Apply
      </button>
    </div>
  );
}

function ReportRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="font-medium text-muted">{label}</span>
      <span className="num font-extrabold text-ink">{value}</span>
    </div>
  );
}

/* Loading figure: four digit reels ticking 0-9 at slightly different speeds,
   like a counter scrambling. Purely visual - the real value replaces it the
   moment it arrives. Reduced-motion users get a static, faded 0000. */
function RollingDigits() {
  return (
    <div className="num mt-1.5 flex h-7 items-center text-xl font-extrabold tracking-tight text-accent-strong/45" role="status" aria-label="Loading">
      {[0.9, 1.15, 0.75, 1.3].map((d, k) => (
        <span key={k} className="digit-reel">
          <span style={{ animationDuration: `${d}s`, animationDelay: `-${k * 0.17}s` }}>
            {"0123456789".split("").map((n, j) => <span key={j}>{n}</span>)}
          </span>
        </span>
      ))}
    </div>
  );
}

function KpiCard({ title, value, growth, growthOf, danger, onClick, loading = false }) {
  const g = formatGrowth(growth, growthOf);
  const up = g === null ? true : !String(g).startsWith("-");
  return (
    <button onClick={onClick} data-motion="stat"
      className="group relative isolate flex flex-col overflow-hidden rounded-xl border border-line bg-surface p-4 text-left transition-all duration-150 hover:border-accent-line hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <div className="pointer-events-none absolute -right-5 -top-5 -z-10 h-16 w-16 rounded-full bg-accent opacity-[0.07]" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <div title={title} className="line-clamp-2 h-[2.7em] text-[10px] font-bold uppercase leading-[1.35] tracking-[0.06em] text-muted">{title}</div>
        {g && <span className={`text-[11px] font-bold ${up ? "text-accent-strong" : "text-danger"}`}>{g}</span>}
      </div>
      {/* A figure still on the wire is not a figure of "—". The em dash is
          reserved for "we asked and do not know"; this is "we are asking". */}
      {loading
        ? <RollingDigits />
        : <div data-motion="count" className={`num mt-1.5 text-xl font-extrabold tracking-tight ${danger ? "text-danger" : "text-ink"}`}>{value}</div>}
      <span className="mt-2 self-end inline-flex items-center gap-0.5 text-[10px] font-bold text-accent-strong transition-all group-hover:gap-1">View <span aria-hidden="true">→</span></span>
    </button>
  );
}

/** Professional donut: continuous stroked arc segments (butt caps, small gap),
 *  a clear center value/label, and a readable scrollable legend. Sizing is
 *  responsive (stacks under the legend on very narrow widths). */
function Donut({ items, centerValue, centerLabel }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const R = 58, SW = 22, C = 2 * Math.PI * R, GAP = total ? 2 : 0;
  let acc = 0;
  return (
    <div className="flex min-h-[150px] flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
        <svg viewBox="0 0 150 150" className="h-[150px] w-[150px] -rotate-90" role="img" aria-label="Donut chart">
          <circle cx="75" cy="75" r={R} fill="none" stroke="var(--color-line-soft)" strokeWidth={SW} />
          {items.map((m) => {
            const frac = total ? m.value / total : 0;
            const seg = Math.max(frac * C - GAP, 0);
            const el = (
              <circle key={m.name} cx="75" cy="75" r={R} fill="none" stroke={m.color} strokeWidth={SW}
                strokeLinecap="butt" strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-acc} />
            );
            acc += frac * C;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-extrabold leading-none text-ink">{centerValue}</span>
          <span className="mt-1 text-[8px] font-bold tracking-[0.15em] text-muted">{centerLabel}</span>
        </div>
      </div>
      <div className="grid max-h-[150px] w-full flex-1 gap-2 overflow-y-auto pr-1 text-xs font-semibold">
        {items.map((m) => (
          <span key={m.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
              <span className="truncate text-ink-soft">{m.name}</span>
            </span>
            <span className="shrink-0 font-bold text-ink">{total ? Math.round((m.value / total) * 100) : 0}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── data helpers ── */
/** One dashboard fetch, retried once.
 *
 * These used to swallow a failure into null with nothing to retry it, so a
 * single hiccup on a hard refresh - a token refresh still in flight, a backend
 * still warming - left a KPI blank for as long as the page stayed open.
 * Changing the period re-fired the effect and it worked, which is exactly the
 * shape of a transient first-load failure rather than a wrong query.
 *
 * A second attempt costs one request on a bad load and nothing on a good one.
 * A failure after that still returns null, which the cards render as "—"
 * rather than as a zero pretending to be real.
 */
// A dashboard card is not worth waiting 45 seconds for, and the default
// per-request ceiling is built for a cold backend waking up, not for a figure
// somebody is standing at a counter reading. Two attempts at 45s each meant a
// blocked network showed a bare em dash for a minute and a half with no
// spinner and nothing to click - indistinguishable from "the shop did nothing
// today". Twelve seconds is longer than this API has ever legitimately taken.
// 20s, twice over: the API has never legitimately taken more than a second or
// two, and the skeleton now covers the whole wait, so a slow link reads as
// "loading" rather than as "no data" however long it takes. It stays BOUNDED on
// purpose - with no ceiling at all a request that will never answer leaves the
// panel loading forever, which is the same silence in a different costume.
// Worth stating plainly: this is not what emptied anyone's dashboard. A 401
// comes back in milliseconds; no timeout was ever involved in that.
const DASHBOARD_TIMEOUT_MS = 20000;

/** Why the last attempt failed, for the panel to state. Set as a side effect
 *  rather than returned, so every existing caller keeps its shape. */
let lastFailureReason = "";
export function dashboardFailureReason() { return lastFailureReason; }

async function fetchDashboard(path, pick) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const out = pick(await apiClient.get(path, { auth: true, timeoutMs: DASHBOARD_TIMEOUT_MS }));
      lastFailureReason = "";
      return out;
    } catch (err) {
      // 403 is an answer, not an outage: this caller may not see this panel.
      // Returning it immediately also avoids a pointless second attempt.
      if (err && err.status === 403) return CARDS_REFUSED;
      if (attempt === 1) {
        lastFailureReason = err?.status ? `HTTP ${err.status}` : (err?.message || "no response");
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return null;
}

/** The same one-retry policy for a service call that is not a plain GET. */
async function retryOnce(run, fallback) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await run();
    } catch {
      if (attempt === 1) return fallback;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return fallback;
}

async function getSummary(path, wrap = "summary") {
  return fetchDashboard(path, (res) => res.data?.[wrap] ?? null);
}
async function getReport(path) {
  return fetchDashboard(path, (res) => res.data?.report ?? null);
}

/**
 * A report that did not arrive is NOT an empty report.
 *
 * This is the bug behind "the dashboard shows nothing for today on his
 * machine but works on mine". getReport() returns null when both attempts
 * fail and the refusal sentinel on a 403 - and the caller then wrote
 * `t?.trend ?? []` into state. An empty ARRAY is a real answer: the KPIs
 * reduce it to 0 and print a confident "Today's Sales Rs 0.00". So a machine
 * that reliably loses that one request - a slow link, a proxy, a token
 * refresh that outlives both attempts - was told the shop sold nothing today,
 * over and over, refresh after refresh, while the same account on another
 * machine saw the real figure. The server was right the whole time.
 *
 * null means "we do not know" and every KPI formatter already renders that as
 * an em dash. Keeping the distinction is the entire fix: a zero must be
 * something the shop actually did, never something the network did.
 */
function rowsOrUnknown(payload, key) {
  if (!payload || payload.__refused || payload.__failed) return null;
  return payload[key] ?? [];
}

export default function Dashboard({ onNavigate, search = "" }) {
  const scope = useRef(null);
  // Staff never see profit anywhere else in the product - not the number, not
  // even the word - so the dashboard does not hand it to them either. The
  // backend now returns null for them; hiding the card as well means they see
  // a screen that makes sense rather than a KPI permanently reading "—".
  const { backendRole, shopModules } = useAuth();
  const seesProfit = backendRole === "Admin" || backendRole === "SuperAdmin";
  // The Super Admin decides per shop whether it runs gold schemes, stock and
  // billing, or both. A shop is never shown the business it does not run:
  // no figures, no charts, no requests for them.
  const hasSchemes = shopHas(shopModules, "schemes");
  const hasBilling = shopHas(shopModules, "billing");
  const solo = hasSchemes !== hasBilling; // one business: it gets the full width
  const quickModules = MOBILE_MODULES
    .map((m) => ({ ...m, actions: m.actions.filter((a) => shopHas(shopModules, a.module || PAGE_SHOP_MODULE[a.page])) }))
    .filter((m) => m.actions.length > 0);
  const nav = (page, intent) => onNavigate && onNavigate(page, intent);
  const schemeShopActions = hasSchemes && !hasBilling
    ? SCHEME_SHOP_ACTIONS.filter((a) => (seesProfit || !a.admin) && (!a.module || shopHas(shopModules, a.module)))
    : null;

  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);    // Generate Report popup
  const [mobileModule, setMobileModule] = useState(null);  // phone Quick Actions: open module id
  const [exporting, setExporting] = useState(false);
  const [outstanding, setOutstanding] = useState(CACHE.core?.outstanding ?? null);
  const [pendingDues, setPendingDues] = useState(CACHE.core?.pendingDues ?? null);
  const [invoices, setInvoices] = useState(CACHE.core?.invoices ?? []);
  const [enrollList, setEnrollList] = useState(CACHE.core?.enrollList ?? []);
  // A failed alerts call must not read as "all clear". null and {} are both
  // falsy on every key, so a 500 rendered exactly like a clean shop - the one
  // thing an alert panel must never do. This sentinel keeps the two apart.
  const [cards, setCards] = useState(CACHE.core?.cards ?? {});

  // Business period (KPIs + Sales Trend chart share it)
  const [bizPeriod, setBizPeriod] = useState("today");
  const [bizCustom, setBizCustom] = useState({ from: "", to: "" });
  const [bizEditing, setBizEditing] = useState(false); // Custom date picker open
  const [bizMetric, setBizMetric] = useState("sales");
  const [salesTrend, setSalesTrend] = useState(CACHE.biz.get("today") ?? null);
  // Whether the LAST attempt to load this panel failed, as opposed to the panel
  // simply not having been asked for yet. Without it a failure and a first
  // paint look identical, and the screen has no way to say "this did not load"
  // - which is how a broken dashboard sat there looking merely quiet.
  const [bizFailed, setBizFailed] = useState(false);
  // In flight. Without this, a request still on the wire and a request that
  // came back empty both render a bare em dash, so a slow network looks exactly
  // like a quiet morning - which is how this went unexplained for a day.
  const [bizLoading, setBizLoading] = useState(!CACHE.biz.has("today"));
  const [bizReason, setBizReason] = useState("");
  // The Schemes panel needs the same three states as Store Business. It had
  // none: its KPIs read paySummary/enrollSummary, which are simply null when a
  // fetch fails, so four em dashes appeared with nothing to say why - the same
  // silence, one panel over.
  const [schemeLoading, setSchemeLoading] = useState(!CACHE.scheme.has("today"));
  const [schemeFailed, setSchemeFailed] = useState(false);
  const [schemeReason, setSchemeReason] = useState("");
  // Outstanding Amount and Pending Dues come from the FIRST effect, not from
  // the period effects, and they had neither a skeleton nor a banner - so when
  // one of those two calls failed they simply sat at an em dash with the three
  // cards beside them showing real money. That is the narrowest and most
  // confusing form of this bug: a dashboard that is plainly working, with one
  // silent hole in it.
  const [coreLoading, setCoreLoading] = useState(!CACHE.core);
  const [coreFailed, setCoreFailed] = useState(false);

  // Scheme period (KPIs + Collections Trend chart share it)
  const [schemePeriod, setSchemePeriod] = useState("today");
  const [schemeCustom, setSchemeCustom] = useState({ from: "", to: "" });
  const [schemeEditing, setSchemeEditing] = useState(false);
  const [schemeMetric, setSchemeMetric] = useState("collections");
  const [paySummary, setPaySummary] = useState(CACHE.scheme.get("today")?.pay ?? null);
  const [enrollSummary, setEnrollSummary] = useState(CACHE.scheme.get("today")?.enr ?? null);

  // Historical analytics (own period, default this_year)
  const [catPeriod, setCatPeriod] = useState("this_year");
  const [catCustom, setCatCustom] = useState({ from: "", to: "" });
  const [catEditing, setCatEditing] = useState(false); // Custom date picker open
  const [salesCats, setSalesCats] = useState(null);
  const [popPeriod, setPopPeriod] = useState("this_year");
  const [popCustom, setPopCustom] = useState({ from: "", to: "" });
  const [popEditing, setPopEditing] = useState(false); // Custom date picker open
  const [popSchemes, setPopSchemes] = useState(null);

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  // Bumping this re-runs every fetch below. A dashboard left open across
  // midnight silently starts describing a different day - which is exactly how
  // this was reported: a full day's business, then zeroes, and refreshing the
  // browser was the only thing that worked.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // The IST date the page was drawn for. When the shop's day rolls over, or the
  // window is looked at again after being away, refetch rather than keep
  // showing yesterday under today's heading. No polling timer: nothing here
  // fires while the tab is idle and untouched.
  const drawnFor = useRef(istToday());
  // When the base load last completed, so returning to the tab can tell a
  // genuinely stale page from one looked away from for a moment.
  const lastLoadAt = useRef(0);
  useEffect(() => {
    const check = () => {
      const now = istToday();
      if (now !== drawnFor.current) { drawnFor.current = now; reload(); }
    };
    // Coming back to the tab used to fire an unconditional reload, and every
    // reload flips the KPI cards back to skeletons — so merely switching tabs
    // and returning made the whole dashboard flash empty. Figures a few
    // seconds old are not worth that. A refetch now happens when the shop's
    // day has rolled over (check) or when the page has genuinely gone stale.
    const onFocus = () => {
      check();
      if (Date.now() - lastLoadAt.current > STALE_AFTER_MS) reload();
    };
    const t = setInterval(check, 60000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", check);
    };
  }, [reload]);

  // one-time base load (rate, all-time dues, recent tables, alerts)
  useEffect(() => {
    let alive = true;
    // IST, not the viewer's clock. isoDate(new Date()) read the browser's
    // timezone, so any machine west of IST asked for a range ending
    // YESTERDAY during its own daily window and got stale dues back.
    const today = istToday();
    const allTime = buildQuery({ date_from: "2020-01-01", date_to: today });
    (async () => {
      const [payAll, billing, enr, cds] = await Promise.all([
        hasSchemes ? getSummary(`/reports/payment-summary${allTime}`) : null,
        // Both now carry the dashboard's own ceiling. They were running on the
        // 45s default - twice - which is a minute and a half of em dash.
        hasBilling ? retryOnce(() => billingService.listSales({ limit: 5, timeoutMs: DASHBOARD_TIMEOUT_MS }), null) : null,
        hasSchemes ? retryOnce(() => enrollmentService.getEnrollments("", { timeoutMs: DASHBOARD_TIMEOUT_MS }), []) : [],
        // Today's KPI cards go through the same retry as every other
        // dashboard fetch. A single failed first call - a token refresh still
        // in flight straight after login - used to leave the cards dead for
        // the life of the page, which is why only a browser refresh brought
        // today's figures back.
        fetchDashboard("/reports/dashboard-cards", (r) => r.data ?? CARDS_FAILED).then(
          (d) => d ?? CARDS_FAILED
        ),
      ]);
      if (!alive) return;
      // Bullion rate now lives in the global TopBar (fetched once in App), so the
      // Dashboard no longer fetches or renders it here.
      const payAllOk = payAll && !payAll.__refused && !payAll.__failed;
      setPendingDues(payAllOk ? payAll.outstanding_dues ?? null : null);
      setInvoices(billing?.sales ?? []);
      setOutstanding(billing ? billing.totalOutstanding : null);
      setEnrollList((enr ?? []).slice(0, 5));
      setCards(cds ?? CARDS_FAILED);
      lastLoadAt.current = Date.now();
      CACHE.core = {
        outstanding: billing ? billing.totalOutstanding : null,
        pendingDues: payAllOk ? payAll.outstanding_dues ?? null : null,
        invoices: billing?.sales ?? [],
        enrollList: (enr ?? []).slice(0, 5),
        cards: cds ?? CARDS_FAILED,
      };
      setCoreLoading(false);
      // billing === null means both attempts failed. Say so rather than
      // leaving one card dashed among four that worked.
      setCoreFailed((hasBilling && billing === null) || (hasSchemes && !payAllOk));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadToken, hasSchemes, hasBilling]); // eslint-disable-line react-hooks/exhaustive-deps

  // Business KPIs + Sales Trend follow bizPeriod
  const bizReq = useRef("today");
  useEffect(() => {
    const key = rangeKey(bizPeriod, bizCustom);
    // Only a new window makes what is on screen wrong. Clearing here (and not
    // on a same-window refresh) is what lets the skeleton mean "unknown"
    // instead of "busy".
    if (bizReq.current !== key) setSalesTrend(null);
    bizReq.current = key;
    const q = rangeQuery(bizPeriod, bizCustom);
    if (!q || !hasBilling) return; // custom awaiting Apply, or no billing in this shop
    setBizLoading(true);
    getReport(`/reports/sales-trend${q}`).then((t) => {
      // A superseded response must not paint, but it must not leave the panel
      // stuck "loading" either - the newer request owns that flag.
      if (bizReq.current !== key) return;
      setBizLoading(false);
      // null (unknown) survives into state so the KPIs read "—" instead of a
      // fabricated zero. See rowsOrUnknown.
      const rows = rowsOrUnknown(t, "trend");
      if (rows) CACHE.biz.set(key, rows);
      setSalesTrend(rows);
      setBizFailed(rows === null);
      setBizReason(rows === null ? (t && t.__refused ? "not permitted for this account" : dashboardFailureReason()) : "");
    });
  }, [bizPeriod, bizCustom, reloadToken, hasBilling]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scheme KPIs + Collections Trend follow schemePeriod
  const schemeReq = useRef("today");
  useEffect(() => {
    const key = rangeKey(schemePeriod, schemeCustom);
    if (schemeReq.current !== key) { setPaySummary(null); setEnrollSummary(null); }
    schemeReq.current = key;
    const q = rangeQuery(schemePeriod, schemeCustom);
    if (!q || !hasSchemes) return;
    setSchemeLoading(true);
    Promise.all([getSummary(`/reports/payment-summary${q}`), getSummary(`/reports/enrollment-summary${q}`)])
      .then(([p, e]) => {
        if (schemeReq.current !== key) return;
        setSchemeLoading(false);
        // A refused panel is not a failed one, but neither is a zero.
        const usable = (v) => (v && !v.__refused && !v.__failed ? v : null);
        const pay = usable(p);
        const enr = usable(e);
        if (pay || enr) CACHE.scheme.set(key, { pay, enr });
        setPaySummary(pay);
        setEnrollSummary(enr);
        const dead = pay === null || enr === null;
        setSchemeFailed(dead);
        setSchemeReason(dead ? ((p && p.__refused) || (e && e.__refused) ? "not permitted for this account" : dashboardFailureReason()) : "");
      });
  }, [schemePeriod, schemeCustom, reloadToken, hasSchemes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top Selling Categories (analytics period)
  const catReq = useRef("this_year");
  useEffect(() => {
    // Below-fold analytics: hold until the base load resolves so it doesn't add
    // to the first-paint request fan-out. Data shown is unchanged, only later.
    if (loading || !hasBilling) return;
    const key = analyticsKey(catPeriod, catCustom);
    catReq.current = key;
    const q = analyticsQuery(catPeriod, catCustom);
    if (!q) return;
    getReport(`/reports/sales-by-category${q}`).then((r) => { if (catReq.current === key) setSalesCats(r); });
  }, [catPeriod, catCustom, loading, hasBilling]); // eslint-disable-line react-hooks/exhaustive-deps

  // Popular Schemes (analytics period)
  const popReq = useRef("this_year");
  useEffect(() => {
    // Below-fold analytics — deferred behind the base load, same as categories.
    if (loading || !hasSchemes) return;
    const key = analyticsKey(popPeriod, popCustom);
    popReq.current = key;
    const q = analyticsQuery(popPeriod, popCustom);
    if (!q) return;
    getReport(`/reports/scheme-summary${q}`).then((r) => { if (popReq.current === key) setPopSchemes(rowsOrUnknown(r, "schemes")); });
  }, [popPeriod, popCustom, loading, hasSchemes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* derived — all backend-authoritative, summed only (no invented values) */
  const bizPfx = periodPrefix(bizPeriod);
  // Store Business revenue is PRODUCT SALES. It used to read
  // /reports/dashboard-summary.total_revenue, which is the scheme payment
  // total - the same figure the Schemes card shows - so both cards displayed
  // the identical number and the identical growth. Sales, Gold Sold and Profit
  // now all come off the one sales-trend series, which is scoped to COMPLETED
  // sales and therefore already net of reversals.
  const bizSales = salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.total_amount) || 0), 0) : null;
  const goldSold = salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.gold_weight_grams) || 0), 0) : null;
  const profit = salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.profit) || 0), 0) : null;
  const bizSeries = fillTrend((salesTrend ?? []).map((p) => ({
    x: p.period_label,
    y: Number(bizMetric === "sales" ? p.total_amount : bizMetric === "profit" ? p.profit : p.gold_weight_grams) || 0,
  })), trendBuckets(bizPeriod, bizCustom));
  const bizUnit = bizMetric === "gold" ? "grams" : "inr";

  // Skeletons are for a card with NOTHING to show. Once a figure is on screen
  // a background refresh must leave it there and swap it when the new one
  // lands — a card that empties and refills on every visit reads as a glitch,
  // which is exactly what it looked like. Changing the PERIOD still shows
  // skeletons, because those figures really are unknown until they arrive.
  const bizFirstLoad = bizLoading && !salesTrend;

  const schemePfx = periodPrefix(schemePeriod);
  const newEnroll = enrollSummary ? enrollSummary.new_enrollments_in_range : null;
  const newMaturity = enrollSummary ? (enrollSummary.daily_trend ?? []).reduce((s, p) => s + (Number(p.maturity_amount) || 0), 0) : null;
  const schemeFirstLoad = schemeLoading && !enrollSummary && !paySummary;
  const schemeSeries = fillTrend(
    schemeMetric === "collections" ? (paySummary?.monthly_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.total_amount) || 0 }))
    : schemeMetric === "maturity" ? (enrollSummary?.daily_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.maturity_amount) || 0 }))
    : (enrollSummary?.daily_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.new_enrollments) || 0 })),
    trendBuckets(schemePeriod, schemeCustom));
  const schemeUnit = schemeMetric === "enrollments" ? "count" : "inr";

  const catDonut = (salesCats?.categories ?? []).filter((c) => c.total_sales > 0)
    .map((c, i) => ({ name: c.category, value: c.total_sales, color: DONUT_BUSINESS[i % DONUT_BUSINESS.length] }));
  const popDonut = (popSchemes ?? []).filter((s) => s.total_collected > 0).sort((a, b) => b.total_collected - a.total_collected)
    .map((s, i) => ({ name: s.scheme_name, value: s.total_collected, color: DONUT_SCHEME[i % DONUT_SCHEME.length] }));

  // Header search filters the recent tables using their existing on-page data.
  const q = search.trim().toLowerCase();
  const shownInvoices = q ? invoices.filter((s) => [s.inv, s.customer].join(" ").toLowerCase().includes(q)) : invoices;
  const shownEnroll = q ? enrollList.filter((e) => [e.customer, e.scheme].join(" ").toLowerCase().includes(q)) : enrollList;

  const alerts = [];
  // The API emits overdue_enrollments. This read overdue_customers - a key that
  // has never existed - so the one DANGER alert on the dashboard could never
  // fire, while the two beside it read correct keys and did. Silence looked
  // like good news. Worded in enrollment terms because that is what is counted:
  // one customer may hold several overdue enrollments.
  if (hasSchemes && cards.overdue_enrollments) alerts.push({ id: "overdue", tone: "danger", title: `${cards.overdue_enrollments} enrollment(s) with overdue payments`, detail: "Review collections", page: "scheme-management", intent: { status: "Overdue", period: "all" } });
  if (hasBilling && cards.pending_inspection) alerts.push({ id: "inspect", tone: "warning", title: `${cards.pending_inspection} item(s) pending inspection`, detail: "Inspect returned inventory", page: "inventory" });
  if (cards.pending_kyc) alerts.push({ id: "kyc", tone: "warning", title: `${cards.pending_kyc} pending KYC`, detail: "Verify customers", page: "customers", intent: { kyc: "Pending" } });

  return (
    <div ref={scope} className="mx-auto w-full max-w-[1440px]">
      {/* Page title (phone only) + Quick Actions: two modules, each opening its
          own actions. The live rate sits above, in the shared shell. */}
      <div>
        <h2 className="mb-3 text-2xl font-extrabold tracking-tight lg:hidden">Dashboard</h2>

        {schemeShopActions ? (schemeShopActions.length > 0 && (
        <Card data-motion="reveal" className="mb-4 p-4">
          <CardTitle className="mb-3 text-sm font-extrabold">Quick Actions</CardTitle>
          {/* auto-rows-fr: every tile in the grid is the height of the tallest,
              so the 2x2 phone grid and the 1x4 desktop row both line up. */}
          <div className={`grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 ${schemeShopActions.length >= 4 ? "xl:grid-cols-4" : schemeShopActions.length === 3 ? "xl:grid-cols-3" : ""}`}>
            {schemeShopActions.map((a) => (
              <button key={a.title} type="button" onClick={() => nav(a.page, a.intent)}
                className="group relative flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-white p-3 text-left transition-all duration-200 sm:gap-4 sm:p-4 [&:hover]:-translate-y-0.5 [&:hover]:border-accent/50 [&:hover]:shadow-[0_12px_28px_-16px_rgba(159,29,53,0.45)] active:translate-y-0 active:border-accent/50 active:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 motion-reduce:transition-none motion-reduce:[&:hover]:translate-y-0">
                <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent-soft/70 transition-transform duration-300 group-[:hover]:scale-125" />
                <span className="relative flex items-center justify-between">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-[0_6px_14px_-6px_rgba(159,29,53,0.6)] sm:h-11 sm:w-11">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon} /></svg>
                  </span>
                  <span className="text-lg leading-none text-accent-strong/70 transition-transform group-[:hover]:translate-x-0.5" aria-hidden="true">→</span>
                </span>
                <span className="relative mt-auto block min-w-0">
                  <span className="block text-[14px] font-extrabold leading-tight text-ink transition-colors group-[:hover]:text-accent-strong max-[359px]:min-h-[2.5em] sm:text-[15px]">{a.title}</span>
                  <span className="mt-1 block text-[12px] font-medium leading-snug text-muted">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
        )) : (
        <Card data-motion="reveal" className="mb-4 p-4">
          <CardTitle className="mb-3 text-sm font-extrabold">Quick Actions</CardTitle>
          {(() => {
            const mod = quickModules.length === 1 ? quickModules[0] : quickModules.find((m) => m.id === mobileModule);
            const tile = "group flex rounded-xl border border-line bg-white text-left transition-all duration-200 [&:hover]:border-accent/50 [&:hover]:bg-accent-soft [&:hover]:shadow-[0_8px_20px_-12px_rgba(159,29,53,0.35)] active:border-accent/50 active:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
            const ico = (d) => <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
            if (!mod) return (
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
                {quickModules.map((m) => {
                  // A group left with one action (e.g. only Catalogue Studio in a
                  // shop without Billing) opens that action, not a list of one.
                  const only = m.actions.length === 1 ? m.actions[0] : null;
                  return (
                  <button key={m.id} type="button" onClick={() => (only ? nav(only.page, only.intent) : setMobileModule(m.id))} className={`${tile} min-h-[60px] items-center gap-3 px-3.5 py-2.5`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong ring-1 ring-accent-line transition-colors group-[:hover]:bg-white group-[:hover]:text-accent group-[:hover]:ring-accent/30 group-active:bg-white group-active:text-accent group-active:ring-accent/30">{ico(only ? only.icon : m.icon)}</span>
                    <span className="min-w-0 flex-1 text-[14px] font-bold leading-tight text-ink transition-colors group-[:hover]:text-accent-strong group-active:text-accent-strong">{only ? only.title : m.title}</span>
                    <span className="text-lg text-accent-strong/70 transition-colors group-[:hover]:text-accent-strong group-active:text-accent-strong" aria-hidden="true">›</span>
                  </button>
                  );
                })}
              </div>
            );
            return (
              <div>
                {quickModules.length > 1 && <div className="mb-3 flex items-center gap-2.5">
                  <button type="button" onClick={() => setMobileModule(null)} aria-label="Back"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-ink active:bg-accent-soft/60">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <span className="min-w-0 text-[15px] font-extrabold leading-tight text-ink">{mod.title}</span>
                </div>}
                <div className={`grid grid-cols-2 gap-2.5 lg:gap-3 ${mod.actions.length > 2 ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
                  {/* New Enrollment adds a customer - Admin only since 2026-10-06. */}
                  {mod.actions.filter((a) => seesProfit || a.intent !== "add-customer").map((a) => (
                    <button key={a.title} type="button" onClick={() => nav(a.page, a.intent)}
                      className={`${tile} ${a.wide ? "col-span-2 min-h-[60px] items-center gap-3 px-3 py-2.5" : "min-h-[84px] flex-col items-start justify-between p-3"}`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong ring-1 ring-accent-line transition-colors group-[:hover]:bg-white group-[:hover]:text-accent group-[:hover]:ring-accent/30 group-active:bg-white group-active:text-accent group-active:ring-accent/30">{ico(a.icon)}</span>
                      <span className="text-[13px] font-bold leading-tight text-ink transition-colors group-[:hover]:text-accent-strong group-active:text-accent-strong">{a.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
        )}
      </div>

      <div className={`mb-4 grid grid-cols-1 gap-4 ${solo ? "" : "lg:grid-cols-2"}`}>
        {/* ============ BUSINESS ============ */}
        {hasBilling && (
        <section data-motion="reveal" className="space-y-2.5 rounded-2xl border border-accent-line bg-accent-soft/40 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg>
            </span>
            <div><h3 className="text-sm font-extrabold text-ink">Store Business</h3><p className="text-[10px] font-medium text-muted">Product sales, inventory &amp; billing overview</p><p className="min-h-[15px] text-[10px] font-semibold text-accent-strong">{periodWindowLabel(bizPeriod, bizCustom) || "Custom range - pick dates"}</p></div>
          </div>

          {/* Say it out loud. These figures used to come back as a confident
              Rs 0.00 when the request had actually failed, so there was nothing
              on screen to tell an owner that what he was reading was not his
              shop's day. */}
          {(bizFailed || coreFailed) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-line bg-danger-soft/40 px-3 py-2">
              {/* A 401 is not a loading problem, it is a signed-out problem,
                  and saying "could not be loaded" for it sends people hunting
                  the wrong fault. Name it. */}
              <span className="text-[11px] font-semibold text-danger">
                {bizReason === "HTTP 401"
                  ? "Your session is no longer valid — sign out and sign in again."
                  : "These figures could not be loaded — they are not zero, they are unknown."}
                {bizReason ? <span className="ml-1 font-bold">({bizReason})</span> : null}
                <span className="ml-1 font-normal opacity-70">build {BUILD_SHA}</span>
              </span>
              <button
                onClick={reload}
                className="rounded-lg border border-danger-line bg-white px-2.5 py-1 text-[11px] font-bold text-danger hover:bg-danger-soft"
              >
                Retry
              </button>
            </div>
          )}
          <div className={`grid grid-cols-2 gap-2.5 ${solo ? "lg:grid-cols-4" : ""}`}>
            <KpiCard title={`${bizPfx} Sales`} value={fmtCurrency(bizSales)} loading={bizFirstLoad} onClick={() => nav("sales-history")} />
            <KpiCard title={`${bizPfx} Gold Sold`} value={fmtGrams(goldSold)} loading={bizFirstLoad} onClick={() => nav("sales-history")} />
            {seesProfit && (
              <KpiCard title={`${bizPfx} Profit`} value={fmtProfit(profit)} loading={bizFirstLoad} danger={profit !== null && Number(profit) < 0} onClick={() => nav("sales-history")} />
            )}
            <KpiCard title="Outstanding Amount" value={fmtCurrency(outstanding)} loading={coreLoading} danger onClick={() => nav("payments", { tab: "business", dateFilter: "Overall" })} />
          </div>

          <div className={solo ? "grid gap-2.5 lg:grid-cols-2 lg:[&>*:last-child]:col-span-2" : "space-y-2.5"}>
          {/* Sales Trend */}
          <Card className="p-3.5">
            {/* Title + metric on one line (metric top-right), period tabs on
                their own row, then clear air before the plot. */}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-2"><CardTitle className="text-xs font-bold">Business Trend</CardTitle>{bizPeriod === "custom" && bizCustom.from && bizCustom.to && <RangeLabel sel="custom" custom={bizCustom} onEdit={() => setBizEditing(true)} />}</div>
              <MetricSelect
                value={bizMetric}
                onChange={setBizMetric}
                options={BIZ_METRICS.filter((m) => seesProfit || !m.adminOnly)}
                accent={BUSINESS_ACCENT}
              />
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <PeriodTabs value={bizPeriod} onChange={(v) => { setBizPeriod(v); setBizEditing(v === "custom"); }} accent={BUSINESS_ACCENT} />
            </div>
            {/* Custom dates are picked INSIDE the chart's own h-48 box, so the
                card never grows when Custom is chosen. */}
            {bizPeriod === "custom" && (bizEditing || !bizCustom.from || !bizCustom.to)
              ? <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg bg-canvas/40 px-2"><CustomRange value={bizCustom} onApply={(v) => { setBizCustom(v); setBizEditing(false); }} accent={BUSINESS_ACCENT} className="" /><span className="text-xs font-medium text-muted">Pick a date range and Apply</span></div>
              : <LineChart series={bizSeries} accent="#9f1d35" gradId="bizArea" fmtY={(v) => axisFmt(v, bizUnit)} fmtTip={(v) => tipFmt(v, bizUnit)} />}
          </Card>

          {/* Top Selling Categories */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2"><CardTitle className="text-xs font-bold">Top Selling Categories</CardTitle><RangeLabel sel={catPeriod} custom={catCustom} onEdit={() => setCatEditing(true)} /></div>
              <PeriodTabs value={catPeriod} onChange={(v) => { setCatPeriod(v); setCatEditing(v === "custom"); }} accent={BUSINESS_ACCENT} tabs={ANALYTICS_TABS} />
            </div>
            {/* Custom dates are picked INSIDE the chart area (same 150px box), so
                choosing Custom never makes this card taller than the others. */}
            {catPeriod === "custom" && (catEditing || !catCustom.from || !catCustom.to)
              ? <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-lg bg-canvas/40 px-2"><CustomRange value={catCustom} onApply={(v) => { setCatCustom(v); setCatEditing(false); }} accent={BUSINESS_ACCENT} className="" /><span className="text-xs font-medium text-muted">Pick a date range and Apply</span></div>
              : catDonut.length === 0
              ? <div className="flex min-h-[150px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">No category sales in this period</div>
              : <Donut items={catDonut} centerValue={fmtCompact(catDonut.reduce((a, b) => a + b.value, 0))} centerLabel={"TOTAL SALES"} />}
          </Card>

          {/* Recent Business Invoices */}
          <Card className="p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <CardTitle className="text-xs font-bold">Recent Business Invoices</CardTitle>
              <button onClick={() => nav("sales-history")} className="text-[10px] font-bold text-accent hover:underline">View All</button>
            </div>
            {shownInvoices.length === 0 ? <p className="py-5 text-center text-xs font-medium text-muted">{q ? "No matching invoices" : "No invoices yet"}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="border-b border-line text-[9px] font-bold uppercase text-muted"><th className="py-1.5 pr-2">Invoice</th><th className="py-1.5 pr-2">Customer</th><th className="py-1.5 pr-2 text-right">Amount</th><th className="py-1.5 pr-2">Time</th><th className="py-1.5 text-center">Status</th></tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {shownInvoices.map((s) => (
                      <tr key={s.id} className="hover:bg-canvas/60">
                        <td className="py-1.5 pr-2 font-mono font-bold text-accent">{s.inv}</td>
                        <td className="max-w-[80px] truncate py-1.5 pr-2 text-ink-soft">{s.customer}</td>
                        <td className="num py-1.5 pr-2 text-right font-bold">{formatINR(s.amount)}</td>
                        <td className="py-1.5 pr-2 text-muted">{fmtTime(s.saleTimestamp)}</td>
                        <td className="py-1.5 text-center"><Badge tone={INVOICE_TONE[s.status] ?? "neutral"} className="text-[9px]">{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button onClick={() => nav("new-sale")} variant="outline" size="sm" className="mt-2.5 w-full text-xs font-bold">+ New Sale (Billing)</Button>
          </Card>
          </div>
        </section>
        )}

        {/* ============ SCHEMES ============ */}
        {hasSchemes && (
        <section data-motion="reveal" className="space-y-2.5 rounded-2xl border border-accent-line bg-accent-soft/40 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: SCHEME_ACCENT }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </span>
            <div><h3 className="text-sm font-extrabold text-ink">Schemes</h3><p className="text-[10px] font-medium text-muted">Scheme collections, enrollments &amp; performance</p><p className="min-h-[15px] text-[10px] font-semibold text-accent-strong">{periodWindowLabel(schemePeriod, schemeCustom) || "Custom range - pick dates"}</p></div>
          </div>

          {(schemeFailed || coreFailed) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-line bg-danger-soft/40 px-3 py-2">
              <span className="text-[11px] font-semibold text-danger">
                {schemeReason === "HTTP 401"
                  ? "Your session is no longer valid — sign out and sign in again."
                  : "These figures could not be loaded — they are not zero, they are unknown."}
                {schemeReason ? <span className="ml-1 font-bold">({schemeReason})</span> : null}
                <span className="ml-1 font-normal opacity-70">build {BUILD_SHA}</span>
              </span>
              <button onClick={reload} className="rounded-lg border border-danger-line bg-white px-2.5 py-1 text-[11px] font-bold text-danger hover:bg-danger-soft">Retry</button>
            </div>
          )}
          <div className={`grid grid-cols-2 gap-2.5 ${solo ? "lg:grid-cols-4" : ""}`}>
            <KpiCard title={`${schemePfx} Collection`} value={fmtCurrency(paySummary?.total_revenue)} loading={schemeFirstLoad} growth={paySummary?.total_revenue_growth_percent} growthOf={paySummary?.total_revenue} onClick={() => nav("payments")} />
            {/* Both carry the window they were counted over, so Enrollment
                Management opens standing in the same window instead of showing
                the whole book beside a figure that counted one day of it. */}
            <KpiCard title={`${schemePfx} New Enrollments`} value={fmtCount(newEnroll)} loading={schemeFirstLoad} onClick={() => nav("scheme-management", { period: schemePeriod, from: schemeCustom.from, to: schemeCustom.to })} />
            {/* "Today's Estimated Maturity" read as "maturing today" — it is
                neither today's nor an estimate. It is what the plans TAKEN OUT
                in this window will be worth at their own maturity, years off.
                Named for what it is; free-amount plans contribute nothing to it
                because nobody has promised a figure to mature. */}
            <KpiCard title={`Maturity Value of ${schemePfx} New Plans`} value={fmtCurrency(newMaturity)} loading={schemeFirstLoad} onClick={() => nav("scheme-management", { period: schemePeriod, from: schemeCustom.from, to: schemeCustom.to })} />
            <KpiCard title="Pending Dues" value={fmtCurrency(pendingDues)} loading={coreLoading} danger onClick={() => nav("payments", { tab: "scheme", dateFilter: "Overall" })} />
          </div>

          <div className={solo ? "grid gap-2.5 lg:grid-cols-2 lg:[&>*:last-child]:col-span-2" : "space-y-2.5"}>
          {/* Collections Trend */}
          <Card className="p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-2"><CardTitle className="text-xs font-bold">Scheme Trend</CardTitle>{schemePeriod === "custom" && schemeCustom.from && schemeCustom.to && <RangeLabel sel="custom" custom={schemeCustom} onEdit={() => setSchemeEditing(true)} />}</div>
              <MetricSelect value={schemeMetric} onChange={setSchemeMetric} options={SCHEME_METRICS} accent={SCHEME_ACCENT} />
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <PeriodTabs value={schemePeriod} onChange={(v) => { setSchemePeriod(v); setSchemeEditing(v === "custom"); }} accent={SCHEME_ACCENT} />
            </div>
            {schemePeriod === "custom" && (schemeEditing || !schemeCustom.from || !schemeCustom.to)
              ? <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg bg-canvas/40 px-2"><CustomRange value={schemeCustom} onApply={(v) => { setSchemeCustom(v); setSchemeEditing(false); }} accent={SCHEME_ACCENT} className="" /><span className="text-xs font-medium text-muted">Pick a date range and Apply</span></div>
              : <LineChart series={schemeSeries} accent={SCHEME_ACCENT} gradId="schemeArea" fmtY={(v) => axisFmt(v, schemeUnit)} fmtTip={(v) => tipFmt(v, schemeUnit)} />}
          </Card>

          {/* Popular Schemes */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2"><CardTitle className="text-xs font-bold">Popular Schemes</CardTitle><RangeLabel sel={popPeriod} custom={popCustom} onEdit={() => setPopEditing(true)} /></div>
              <PeriodTabs value={popPeriod} onChange={(v) => { setPopPeriod(v); setPopEditing(v === "custom"); }} accent={SCHEME_ACCENT} tabs={ANALYTICS_TABS} />
            </div>
            {/* Custom dates are picked INSIDE the chart area (same 150px box), so
                choosing Custom never makes this card taller than the others. */}
            {popPeriod === "custom" && (popEditing || !popCustom.from || !popCustom.to)
              ? <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-lg bg-canvas/40 px-2"><CustomRange value={popCustom} onApply={(v) => { setPopCustom(v); setPopEditing(false); }} accent={SCHEME_ACCENT} className="" /><span className="text-xs font-medium text-muted">Pick a date range and Apply</span></div>
              : popDonut.length === 0
              ? <div className="flex min-h-[150px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">No scheme collections in this period</div>
              : <Donut items={popDonut} centerValue={fmtCompact(popDonut.reduce((a, b) => a + b.value, 0))} centerLabel={"COLLECTED"} />}
          </Card>

          {/* Recent Scheme Enrollments */}
          <Card className="p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <CardTitle className="text-xs font-bold">Recent Scheme Enrollments</CardTitle>
              <button onClick={() => nav("scheme-management")} className="text-[10px] font-bold text-accent hover:underline">View All</button>
            </div>
            {shownEnroll.length === 0 ? <p className="py-5 text-center text-xs font-medium text-muted">{q ? "No matching enrollments" : "No enrollments yet"}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="border-b border-line text-[9px] font-bold uppercase text-muted"><th className="py-1.5 pr-2">Customer</th><th className="py-1.5 pr-2">Scheme</th><th className="py-1.5 pr-2 text-right">Amt/Mo</th><th className="py-1.5 pr-2 text-center">Duration</th><th className="py-1.5 pr-2">Start</th><th className="py-1.5 text-center">Status</th></tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {shownEnroll.map((e) => (
                      <tr key={e.id} className="hover:bg-canvas/60">
                        <td className="max-w-[70px] truncate py-1.5 pr-2 text-ink-soft">{e.customer}</td>
                        <td className="max-w-[80px] truncate py-1.5 pr-2 text-ink-soft">{e.scheme}</td>
                        <td className="num py-1.5 pr-2 text-right font-bold">{e.installment ? formatINR(e.installment) : "—"}</td>
                        <td className="py-1.5 pr-2 text-center text-muted">{e.total ? `${e.total} mo` : "—"}</td>
                        <td className="py-1.5 pr-2 text-muted">{fmtDateShort(e.joined)}</td>
                        <td className="py-1.5 text-center"><Badge tone={ENROLL_TONE[e.status] ?? "neutral"} className="text-[9px]">{e.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button onClick={() => nav("scheme-management")} variant="outline" size="sm" className="mt-2.5 w-full text-xs font-bold">+ New Enrollment</Button>
          </Card>
          </div>
        </section>
        )}
      </div>

      {/* ACTION CENTER — real operational alerts (overdue payments, pending KYC,
          items to inspect). Each row deep-links to the module that resolves it.

          D7: when this caller may not see ANY of its sources the card is not
          rendered at all. It used to say "Alerts unavailable", which reads as an
          outage on a screen where nothing is wrong - and a staff member taught
          to ignore that message will ignore a real one. A genuine failure still
          says so, below; only a refusal disappears. */}
      {!cards.__refused && (
      <Card data-motion="reveal" className="p-3.5">
        <CardTitle className="mb-2 text-xs font-bold">Action Center</CardTitle>
        {cards.__failed ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-warn-line bg-warn-soft py-6 text-xs font-semibold text-warn">
            Alerts unavailable — could not load {[hasSchemes && "overdue payments", "KYC", hasBilling && "inspections"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " or $1")}.
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs font-medium text-faint">All clear — no pending actions</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((a) => (
              <li key={a.id}>
                <button onClick={() => nav(a.page, a.intent)} className="flex w-full items-start gap-3 rounded-xl border border-line p-2.5 text-left transition-colors hover:bg-canvas/60">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-ink">{a.title}</span><span className="block text-[11px] font-medium leading-snug text-muted">{a.detail}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}

      {/* GENERATE REPORT — a snapshot of the dashboard's own live figures for the
          currently-selected periods. No navigation; Print/Save PDF via the browser. */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowReport(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-ink">Dashboard Report</h3>
              <button onClick={() => setShowReport(false)} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
            </div>
            <div className="text-xs">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-faint">Store Business</div>
              <ReportRow label={`${bizPfx} Sales`} value={fmtCurrency(bizSales)} />
              <ReportRow label={`${bizPfx} Gold Sold`} value={fmtGrams(goldSold)} />
              <ReportRow label={`${bizPfx} Profit`} value={fmtProfit(profit)} />
              <ReportRow label="Outstanding Amount" value={fmtCurrency(outstanding)} />
              <div className="my-2.5 border-t border-line" />
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-faint">Schemes</div>
              <ReportRow label={`${schemePfx} Collection`} value={fmtCurrency(paySummary?.total_revenue)} />
              <ReportRow label={`${schemePfx} New Enrollments`} value={fmtCount(newEnroll)} />
              <ReportRow label={`Maturity Value of ${schemePfx} New Plans`} value={fmtCurrency(newMaturity)} />
              <ReportRow label="Pending Dues" value={fmtCurrency(pendingDues)} />
            </div>
            <button
              disabled={exporting}
              onClick={async () => {
                // NOT window.print(). Printing this page crashed the browser
                // tab outright - the dark "This page couldn't load" screen -
                // and it did so whether the whole document or an iframe was
                // printed, because the fault is in the print call itself. The
                // backend already builds this exact KPI table as a file, so
                // the report is downloaded instead of rendered by the printer.
                setExporting(true);
                try {
                  await reportService.exportDashboardSummary("excel");
                  toast("Report downloaded");
                } catch (err) {
                  toast(err?.message || "Could not generate the report");
                } finally {
                  setExporting(false);
                }
              }}
              className="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >{exporting ? "Preparing…" : "Download report (Excel)"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
