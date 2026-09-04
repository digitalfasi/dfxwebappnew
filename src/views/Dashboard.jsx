import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { formatINR } from "../lib/utils";
import { apiClient } from "../lib/apiClient";
import { billingService } from "../services/billingService";
import { enrollmentService } from "../services/enrollmentService";
import { goldRateService } from "../services/goldRateService";

const BUSINESS_ACCENT = "var(--color-accent)";
const SCHEME_ACCENT = "#b8934a"; // refined champagne, not bright orange
// Distinct categorical hues so each donut segment/legend row is identifiable
// at a glance. Business starts at emerald (theme), Schemes offset to gold.
const DONUT_PALETTE = ["#059669", "#d19a2e", "#2563eb", "#8b5cf6", "#e11d48", "#0891b2", "#ea580c", "#475569", "#16a34a", "#db2777"];
const DONUT_BUSINESS = DONUT_PALETTE;
const DONUT_SCHEME = ["#d19a2e", "#059669", "#8b5cf6", "#2563eb", "#e11d48", "#0891b2", "#ea580c", "#475569", "#db2777", "#16a34a"];

const QUICK_ACTIONS = [
  { title: "New Sale", page: "new-sale", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" },
  { title: "Add Customer", page: "customers", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { title: "Record Payment", page: "payments", icon: "M1 4h22v16H1zM1 10h22" },
  { title: "New Enrollment", page: "enrollments", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6" },
  { title: "Add Scheme", page: "schemes", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { title: "Add Catalogue", page: "catalogue", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { title: "Generate Report", page: "reports", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" },
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
  { value: "profit", label: "Profit" },
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
function analyticsLabel(sel, custom) {
  if (sel === "this_year") return String(new Date().getFullYear());
  if (sel === "last_year") return String(new Date().getFullYear() - 1);
  return custom.from && custom.to ? `${custom.from} → ${custom.to}` : "Custom";
}

function formatGrowth(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
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
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch { return "—"; }
}

const INVOICE_TONE = { Paid: "success", Partial: "warning", Pending: "danger", Returned: "info", Canceled: "neutral" };
const ENROLL_TONE = { Active: "success", Completed: "success", Closed: "neutral", Cancelled: "danger", Redeemed: "info" };

/** Axis tick formatter per metric unit. */
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
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-bold text-ink outline-none"
      style={{ borderLeft: `3px solid ${accent}` }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function CustomRange({ value, onApply, accent }) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-2">
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

function KpiCard({ title, value, growth, danger, onClick }) {
  const g = formatGrowth(growth);
  const up = g === null ? true : !String(g).startsWith("-");
  return (
    <button onClick={onClick} data-motion="stat"
      className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-all duration-150 hover:border-accent-line hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <div className="flex items-center justify-between gap-2">
        <div className="line-clamp-2 min-h-[1.9em] text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{title}</div>
        {g && <span className={`text-[11px] font-bold ${up ? "text-accent-strong" : "text-danger"}`}>{g}</span>}
      </div>
      <div data-motion="count" className={`num mt-1.5 text-xl font-extrabold tracking-tight ${danger ? "text-danger" : "text-ink"}`}>{value}</div>
      <span className="mt-2 self-end inline-flex items-center gap-0.5 text-[10px] font-bold text-accent-strong transition-all group-hover:gap-1">View <span aria-hidden="true">→</span></span>
    </button>
  );
}

/** Line/area chart with real X labels and Y ticks/gridlines. Uniform scaling
 *  (no preserveAspectRatio="none") so axis text stays crisp on any width. */
function TrendChart({ series, unit = "inr", accent, gradId }) {
  const pts = (series ?? []).filter((p) => p && Number.isFinite(Number(p.y)));
  const max = pts.length ? Math.max(...pts.map((p) => Number(p.y) || 0)) : 0;
  if (pts.length < 2 || max <= 0) {
    return <div className="flex h-44 items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">No data in this period</div>;
  }
  const W = 640, H = 232, padL = 46, padR = 12, padT = 12, padB = 26;
  const x0 = padL, x1 = W - padR, yTop = padT, yBot = H - padB;
  const plotW = x1 - x0, plotH = yBot - yTop;
  const niceMax = max;
  const px = (i) => x0 + (i / (pts.length - 1)) * plotW;
  const py = (v) => yBot - (Number(v) / niceMax) * plotH;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${x1},${yBot} L${x0},${yBot} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: niceMax * f, y: yBot - f * plotH }));
  const step = Math.max(1, Math.ceil(pts.length / 6));
  const xTicks = pts.map((p, i) => ({ i, label: p.x })).filter((t) => t.i % step === 0 || t.i === pts.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Trend chart">
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity="0.18" /><stop offset="100%" stopColor={accent} stopOpacity="0" /></linearGradient></defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={x0} y1={t.y} x2={x1} y2={t.y} stroke="var(--color-line-soft)" strokeWidth="1" />
          <text x={x0 - 6} y={t.y + 3} textAnchor="end" className="fill-muted" fontSize="9" fontWeight="600">{axisFmt(t.v, unit)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={accent} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" data-motion="draw" />
      {pts.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r="2.2" fill={accent} />)}
      {xTicks.map((t) => (
        <text key={t.i} x={px(t.i)} y={yBot + 16} textAnchor="middle" className="fill-muted" fontSize="9" fontWeight="600">{t.label}</text>
      ))}
    </svg>
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
async function getSummary(path, wrap = "summary") {
  const res = await apiClient.get(path, { auth: true }).catch(() => ({ data: null }));
  return res.data?.[wrap] ?? null;
}
async function getReport(path) {
  const res = await apiClient.get(path, { auth: true }).catch(() => ({ data: null }));
  return res.data?.report ?? null;
}

export default function Dashboard({ onNavigate, search = "" }) {
  const scope = useRef(null);
  const nav = (page) => onNavigate && onNavigate(page);

  const [loading, setLoading] = useState(true);
  const [goldRate, setGoldRate] = useState(null);
  const [bullion, setBullion] = useState(null); // today's full rate row (rate_22k, silver_999)
  const [outstanding, setOutstanding] = useState(null);   // business product dues (all-time)
  const [overdue, setOverdue] = useState(null);           // scheme installment dues (all-time)
  const [invoices, setInvoices] = useState([]);
  const [enrollList, setEnrollList] = useState([]);
  const [cards, setCards] = useState({});

  // Business period (KPIs + Sales Trend chart share it)
  const [bizPeriod, setBizPeriod] = useState("today");
  const [bizCustom, setBizCustom] = useState({ from: "", to: "" });
  const [bizMetric, setBizMetric] = useState("sales");
  const [bizSummary, setBizSummary] = useState(null);     // dashboard-summary (revenue+growth)
  const [salesTrend, setSalesTrend] = useState(null);     // sales-trend points

  // Scheme period (KPIs + Collections Trend chart share it)
  const [schemePeriod, setSchemePeriod] = useState("today");
  const [schemeCustom, setSchemeCustom] = useState({ from: "", to: "" });
  const [schemeMetric, setSchemeMetric] = useState("collections");
  const [paySummary, setPaySummary] = useState(null);     // payment-summary (collection + monthly_trend)
  const [enrollSummary, setEnrollSummary] = useState(null); // enrollment-summary (new + daily_trend)

  // Historical analytics (own period, default this_year)
  const [catPeriod, setCatPeriod] = useState("this_year");
  const [catCustom, setCatCustom] = useState({ from: "", to: "" });
  const [salesCats, setSalesCats] = useState(null);
  const [popPeriod, setPopPeriod] = useState("this_year");
  const [popCustom, setPopCustom] = useState({ from: "", to: "" });
  const [popSchemes, setPopSchemes] = useState(null);

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  // one-time base load (rate, all-time dues, recent tables, alerts)
  useEffect(() => {
    let alive = true;
    const today = isoDate(new Date());
    const allTime = buildQuery({ date_from: "2020-01-01", date_to: today });
    (async () => {
      const [payAll, billing, enr, cds, todayRate] = await Promise.all([
        getSummary(`/reports/payment-summary${allTime}`),
        billingService.listSales({ limit: 5 }).catch(() => null),
        enrollmentService.getEnrollments().catch(() => []),
        apiClient.get("/reports/dashboard-cards", { auth: true }).then((r) => r.data).catch(() => null),
        goldRateService.getTodayRate().catch(() => null),
      ]);
      if (!alive) return;
      // Single gold-rate source: derive the 24K headline from today's rate row
      // instead of a second /billing/dashboard-summary fetch. Same "today 24K"
      // figure, one fewer request on first paint.
      setBullion(todayRate);
      setGoldRate(todayRate?.rate_24k ?? null);
      setOverdue(payAll?.outstanding_dues ?? null);
      setInvoices(billing?.sales ?? []);
      setOutstanding(billing ? billing.totalOutstanding : null);
      setEnrollList((enr ?? []).slice(0, 5));
      setCards(cds ?? {});
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Business KPIs + Sales Trend follow bizPeriod
  const bizReq = useRef("today");
  useEffect(() => {
    const key = rangeKey(bizPeriod, bizCustom);
    bizReq.current = key;
    const q = rangeQuery(bizPeriod, bizCustom);
    if (!q) return; // custom awaiting Apply
    Promise.all([getSummary(`/reports/dashboard-summary${q}`), getReport(`/reports/sales-trend${q}`)])
      .then(([s, t]) => {
        if (bizReq.current !== key) return;
        setBizSummary(s);
        setSalesTrend(t?.trend ?? []);
      });
  }, [bizPeriod, bizCustom]);

  // Scheme KPIs + Collections Trend follow schemePeriod
  const schemeReq = useRef("today");
  useEffect(() => {
    const key = rangeKey(schemePeriod, schemeCustom);
    schemeReq.current = key;
    const q = rangeQuery(schemePeriod, schemeCustom);
    if (!q) return;
    Promise.all([getSummary(`/reports/payment-summary${q}`), getSummary(`/reports/enrollment-summary${q}`)])
      .then(([p, e]) => {
        if (schemeReq.current !== key) return;
        setPaySummary(p);
        setEnrollSummary(e);
      });
  }, [schemePeriod, schemeCustom]);

  // Top Selling Categories (analytics period)
  const catReq = useRef("this_year");
  useEffect(() => {
    // Below-fold analytics: hold until the base load resolves so it doesn't add
    // to the first-paint request fan-out. Data shown is unchanged, only later.
    if (loading) return;
    const key = analyticsKey(catPeriod, catCustom);
    catReq.current = key;
    const q = analyticsQuery(catPeriod, catCustom);
    if (!q) return;
    getReport(`/reports/sales-by-category${q}`).then((r) => { if (catReq.current === key) setSalesCats(r); });
  }, [catPeriod, catCustom, loading]);

  // Popular Schemes (analytics period)
  const popReq = useRef("this_year");
  useEffect(() => {
    // Below-fold analytics — deferred behind the base load, same as categories.
    if (loading) return;
    const key = analyticsKey(popPeriod, popCustom);
    popReq.current = key;
    const q = analyticsQuery(popPeriod, popCustom);
    if (!q) return;
    getReport(`/reports/scheme-summary${q}`).then((r) => { if (popReq.current === key) setPopSchemes(r?.schemes ?? []); });
  }, [popPeriod, popCustom, loading]);

  /* derived — all backend-authoritative, summed only (no invented values) */
  const bizPfx = periodPrefix(bizPeriod);
  const goldSold = salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.gold_weight_grams) || 0), 0) : null;
  const profit = salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.profit) || 0), 0) : null;
  const bizSeries = (salesTrend ?? []).map((p) => ({
    x: p.period_label,
    y: Number(bizMetric === "sales" ? p.total_amount : bizMetric === "profit" ? p.profit : p.gold_weight_grams) || 0,
  }));
  const bizUnit = bizMetric === "gold" ? "grams" : "inr";

  const schemePfx = periodPrefix(schemePeriod);
  const newEnroll = enrollSummary ? enrollSummary.new_enrollments_in_range : null;
  const newMaturity = enrollSummary ? (enrollSummary.daily_trend ?? []).reduce((s, p) => s + (Number(p.maturity_amount) || 0), 0) : null;
  const schemeSeries =
    schemeMetric === "collections" ? (paySummary?.monthly_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.total_amount) || 0 }))
    : schemeMetric === "maturity" ? (enrollSummary?.daily_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.maturity_amount) || 0 }))
    : (enrollSummary?.daily_trend ?? []).map((p) => ({ x: p.period_label, y: Number(p.new_enrollments) || 0 }));
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
  if (cards.overdue_customers) alerts.push({ id: "overdue", tone: "danger", title: `${cards.overdue_customers} customer(s) with overdue payments`, detail: "Review collections", page: "collections" });
  if (cards.pending_inspection) alerts.push({ id: "inspect", tone: "warning", title: `${cards.pending_inspection} item(s) pending inspection`, detail: "Inspect returned inventory", page: "inventory" });
  if (cards.pending_kyc) alerts.push({ id: "kyc", tone: "warning", title: `${cards.pending_kyc} pending KYC`, detail: "Verify customers", page: "customers" });

  return (
    <div ref={scope} className="mx-auto w-full max-w-[1440px]">
      {/* GOLD RATE STRIP */}
      <div data-motion="reveal" className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs">
        <span className="flex items-center gap-2 font-bold text-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Today&apos;s Live Bullion Rate (IBJA):</span>
        <span className="flex items-center gap-1.5"><span className="font-bold text-muted">24K Gold:</span><span className="font-extrabold text-ink">{goldRate != null ? `₹${goldRate.toLocaleString("en-IN")} / g` : "— / g"}</span></span>
        <span className="flex items-center gap-1.5"><span className="font-bold text-muted">22K Gold:</span><span className="font-extrabold text-ink">{bullion?.rate_22k != null ? `₹${Number(bullion.rate_22k).toLocaleString("en-IN")} / g` : "— / g"}</span></span>
        <span className="flex items-center gap-1.5"><span className="font-bold text-muted">Silver 999:</span><span className="font-extrabold text-ink">{bullion?.silver_999 != null ? `₹${Number(bullion.silver_999).toLocaleString("en-IN")} / g` : "— / g"}</span></span>
      </div>

      {/* QUICK ACTIONS */}
      <Card data-motion="reveal" className="mb-4 p-3.5">
        <CardTitle className="mb-3 text-xs font-bold">Quick Actions</CardTitle>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
          {QUICK_ACTIONS.map((qa) => (
            <button key={qa.page} onClick={() => nav(qa.page)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line p-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-sm">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={qa.icon} /></svg>
              </span>
              <span className="text-center text-[10px] font-bold leading-tight text-muted">{qa.title}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ============ BUSINESS ============ */}
        <section data-motion="reveal" className="space-y-2.5 rounded-2xl border border-accent-line bg-accent-soft/40 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg>
            </span>
            <div><h3 className="text-sm font-extrabold text-ink">Store Business</h3><p className="text-[10px] font-medium text-muted">Product sales, inventory &amp; billing overview</p></div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard title={`${bizPfx} Sales`} value={fmtCurrency(bizSummary?.total_revenue)} growth={bizSummary?.total_revenue_growth_percent} onClick={() => nav("sales-history")} />
            <KpiCard title={`${bizPfx} Gold Sold`} value={fmtGrams(goldSold)} onClick={() => nav("sales-history")} />
            <KpiCard title={`${bizPfx} Profit`} value={fmtCurrency(profit)} onClick={() => nav("sales-history")} />
            <KpiCard title="Outstanding Amount" value={fmtCurrency(outstanding)} danger onClick={() => nav("sales-history")} />
          </div>

          {/* Sales Trend */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xs font-bold">Business Pulse</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <MetricSelect value={bizMetric} onChange={setBizMetric} options={BIZ_METRICS} accent={BUSINESS_ACCENT} />
                <PeriodTabs value={bizPeriod} onChange={setBizPeriod} accent={BUSINESS_ACCENT} />
              </div>
            </div>
            {bizPeriod === "custom" && <CustomRange value={bizCustom} onApply={setBizCustom} accent={BUSINESS_ACCENT} />}
            {bizPeriod === "custom" && (!bizCustom.from || !bizCustom.to)
              ? <div className="flex h-40 items-center justify-center text-xs font-medium text-faint">Pick a date range and Apply</div>
              : <TrendChart series={bizSeries} unit={bizUnit} accent="#059669" gradId="bizArea" />}
          </Card>

          {/* Top Selling Categories */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2"><CardTitle className="text-xs font-bold">Top Selling Categories</CardTitle><span className="text-[10px] font-bold text-faint">{analyticsLabel(catPeriod, catCustom)}</span></div>
              <PeriodTabs value={catPeriod} onChange={setCatPeriod} accent={BUSINESS_ACCENT} tabs={ANALYTICS_TABS} />
            </div>
            {catPeriod === "custom" && <CustomRange value={catCustom} onApply={setCatCustom} accent={BUSINESS_ACCENT} />}
            {catPeriod === "custom" && (!catCustom.from || !catCustom.to)
              ? <div className="flex min-h-[128px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">Pick a date range and Apply</div>
              : catDonut.length === 0
              ? <div className="flex min-h-[128px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">No category sales in this period</div>
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
        </section>

        {/* ============ SCHEMES ============ */}
        <section data-motion="reveal" className="space-y-2.5 rounded-2xl border border-warn-line bg-warn-soft/40 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: SCHEME_ACCENT }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </span>
            <div><h3 className="text-sm font-extrabold text-ink">Schemes</h3><p className="text-[10px] font-medium text-muted">Scheme collections, enrollments &amp; performance</p></div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard title={`${schemePfx} Collection`} value={fmtCurrency(paySummary?.total_revenue)} growth={paySummary?.total_revenue_growth_percent} onClick={() => nav("collections")} />
            <KpiCard title={`${schemePfx} New Enrollments`} value={fmtCount(newEnroll)} onClick={() => nav("enrollments")} />
            <KpiCard title={`${schemePfx} Estimated Maturity`} value={fmtCurrency(newMaturity)} onClick={() => nav("enrollments")} />
            <KpiCard title="Overdue Amount" value={fmtCurrency(overdue)} danger onClick={() => nav("collections")} />
          </div>

          {/* Collections Trend */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xs font-bold">Payment Activity</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <MetricSelect value={schemeMetric} onChange={setSchemeMetric} options={SCHEME_METRICS} accent={SCHEME_ACCENT} />
                <PeriodTabs value={schemePeriod} onChange={setSchemePeriod} accent={SCHEME_ACCENT} />
              </div>
            </div>
            {schemePeriod === "custom" && <CustomRange value={schemeCustom} onApply={setSchemeCustom} accent={SCHEME_ACCENT} />}
            {schemePeriod === "custom" && (!schemeCustom.from || !schemeCustom.to)
              ? <div className="flex h-40 items-center justify-center text-xs font-medium text-faint">Pick a date range and Apply</div>
              : <TrendChart series={schemeSeries} unit={schemeUnit} accent={SCHEME_ACCENT} gradId="schemeArea" />}
          </Card>

          {/* Popular Schemes */}
          <Card className="p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2"><CardTitle className="text-xs font-bold">Popular Schemes</CardTitle><span className="text-[10px] font-bold text-faint">{analyticsLabel(popPeriod, popCustom)}</span></div>
              <PeriodTabs value={popPeriod} onChange={setPopPeriod} accent={SCHEME_ACCENT} tabs={ANALYTICS_TABS} />
            </div>
            {popPeriod === "custom" && <CustomRange value={popCustom} onApply={setPopCustom} accent={SCHEME_ACCENT} />}
            {popPeriod === "custom" && (!popCustom.from || !popCustom.to)
              ? <div className="flex min-h-[128px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">Pick a date range and Apply</div>
              : popDonut.length === 0
              ? <div className="flex min-h-[128px] items-center justify-center rounded-lg bg-canvas/40 text-xs font-medium text-muted">No scheme collections in this period</div>
              : <Donut items={popDonut} centerValue={fmtCompact(popDonut.reduce((a, b) => a + b.value, 0))} centerLabel={"COLLECTED"} />}
          </Card>

          {/* Recent Scheme Enrollments */}
          <Card className="p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <CardTitle className="text-xs font-bold">Recent Scheme Enrollments</CardTitle>
              <button onClick={() => nav("enrollments")} className="text-[10px] font-bold text-warn hover:underline">View All</button>
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
                        <td className="py-1.5 pr-2 text-muted">{fmtDate(e.joined)}</td>
                        <td className="py-1.5 text-center"><Badge tone={ENROLL_TONE[e.status] ?? "neutral"} className="text-[9px]">{e.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button onClick={() => nav("enrollments")} variant="outline" size="sm" className="mt-2.5 w-full text-xs font-bold">+ New Enrollment</Button>
          </Card>
        </section>
      </div>

      {/* REMINDERS + ALERTS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-motion="reveal" className="p-3.5">
          <div className="mb-2 flex items-center justify-between"><CardTitle className="text-xs font-bold">Today&apos;s Reminders</CardTitle><button onClick={() => nav("notifications")} className="text-[10px] font-bold text-muted hover:underline">View All</button></div>
          <div className="flex items-center justify-center py-6 text-xs font-medium text-faint">No reminders today</div>
        </Card>
        <Card data-motion="reveal" className="p-3.5">
          <div className="mb-2 flex items-center justify-between"><CardTitle className="text-xs font-bold">Alerts &amp; Notifications</CardTitle><button onClick={() => nav("notifications")} className="text-[10px] font-bold text-muted hover:underline">View All</button></div>
          {alerts.length === 0 ? <div className="flex items-center justify-center py-6 text-xs font-medium text-faint">No active alerts</div> : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button onClick={() => nav(a.page)} className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-canvas/60">
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
      </div>
    </div>
  );
}
