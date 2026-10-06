import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { Select } from "@/_shared/ui/select";
import { SearchInput } from "@/_shared/ui/input";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { fmtDate, grams as fmtGrams, money as fmtMoney, istToday } from "@/_shared/utils";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";
import { passbookService } from "@/_shared/passbookService";
import { paymentService } from "@/modules/payments/paymentService";
import { isWalletScheme, isFreeAmountScheme, NOT_APPLICABLE, SCHEME_TYPE, DIGI_MIN, DIGI_MAX } from "@/modules/plan/scheme/schemeCapabilities";
import { useAuth } from "@/_shared/AuthContext";
import { isShopAdmin } from "@/_shared/moduleAccess";

// Scheme Management — operational customer/enrollment module. Consolidates the
// former Enrollments + Collections screens. All figures (paid, outstanding,
// gold rate, gold weight, payment history) are backend-authoritative and read
// through the existing services. No mock data. No frontend gold valuation.

// "Overdue" is a live condition, not a stored status. The API sends no overdue
// field, so enrollmentService derives overdueDays/overdueAmount from status +
// next_due_date; this filter reads that. (It previously read raw API fields that
// never existed, so the filter always came back empty.)
// Closing a plan writes CLOSED (older records may say CANCELLED); both land
// under "Closed". A filter named "Cancelled" matched nothing a close produced.
const FILTERS = ["All", "Active", "Overdue", "Completed", "Closed", "Redeemed"];
const isClosedStatus = (s) => s === "Closed" || s === "Cancelled";

// Same month arithmetic as the backend's _add_months: same day-of-month,
// clamped to the month's last day (31 Jan + 1 month = 28/29 Feb).
function addMonthsIso(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

// Display only. A late customer's stored next_due_date stays on the missed
// instalment until he pays, so in October it still reads 29 Sept. Show that
// date as "missed", and separately the first instalment date after today.
// Null once every remaining instalment is already in the past.
function upcomingDueDate(joined, monthsPaid, totalMonths, today) {
  if (!joined) return null;
  for (let k = (monthsPaid || 0) + 1; k < (totalMonths || 0); k += 1) {
    const due = addMonthsIso(joined, k);
    if (due > today) return due;
  }
  return null;
}
const ROWS_PER_PAGE = 20;
const isOverdue = (r) => (r.overdueDays || 0) > 0;
const TABS = ["Enrollment Details", "Passbook & Payments", "Remarks"];
// Predefined close-scheme reasons (manual entry still allowed alongside).
const CLOSE_PRESETS = [
  "Customer request",
  "Relocation",
  "Financial difficulty",
  "Switching to another scheme",
  "Duplicate enrollment",
];

// ── Period window ───────────────────────────────────────────────────────────
// The Dashboard's Scheme card is read in windows ("Today's New Enrollments",
// "Today's Collection") and its KPIs link here, so this screen has to be able to
// stand in the same window — otherwise clicking "3 new enrollments today" landed
// on a list of every enrollment the shop has ever taken, with no way to see
// which three it meant. Same window names and the same IST calendar the
// Dashboard uses: the shop's day, never the browser's.
// Same windows, same order and the same names the Dashboard's Scheme card
// uses, plus Last Month (a shop closes its books on one) and All time. A
// window the Dashboard can be standing in must exist here, or its KPI would
// link to a screen that cannot show what the card counted.
const PERIODS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "all", label: "All time" },
];
// This Month, not All time. An enrollment book grows forever, so "everything
// ever" is the one view that answers no question a shop asks at the counter;
// the current month is what it is actually working in.
const DEFAULT_PERIOD = "this_month";
const PERIOD_WORD = {
  today: "today", this_week: "this week", this_month: "this month",
  last_month: "last month", this_year: "this year", custom: "in this range",
};
const PERIOD_PFX = {
  today: "Today's", this_week: "This Week's", this_month: "This Month's",
  last_month: "Last Month's", this_year: "This Year's", custom: "Selected",
};

/** An ISO instant or date → the calendar day it falls on in IST ("YYYY-MM-DD").
 *  Never `toISOString().slice(0,10)` — that is the UTC day, which rolls over
 *  5½ hours late and drops the shop's evening business out of "today". */
function istDay(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 10);
  const d = new Date(t + 5.5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** The window as an inclusive IST day range, or null for "all time".
 *  Weeks start Monday. Last Month is a CLOSED range - it ends on the last day
 *  of that month, not today - which is why this returns both ends and not just
 *  a start. `custom` carries the Dashboard's own from/to straight through. */
function periodRange(period, custom) {
  if (!period || period === "all") return null;
  if (period === "custom") {
    return custom?.from && custom?.to ? { start: custom.from, end: custom.to } : null;
  }
  const today = istToday();
  const [y, m, d] = today.split("-").map(Number);
  const p = (n) => String(n).padStart(2, "0");
  const iso = (dt) => `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  if (period === "today") return { start: today, end: today };
  if (period === "this_month") return { start: `${y}-${p(m)}-01`, end: today };
  if (period === "this_year") return { start: `${y}-01-01`, end: today };
  if (period === "last_month") {
    const first = new Date(Date.UTC(y, m - 2, 1));          // 1st of last month
    const last = new Date(Date.UTC(y, m - 1, 0));           // day 0 = last day of it
    return { start: iso(first), end: iso(last) };
  }
  const mon = new Date(Date.UTC(y, m - 1, d));
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7)); // back to Monday
  return { start: iso(mon), end: today };
}

function statusTone(s) {
  return s === "Active" ? "info" : s === "Completed" || s === "Redeemed" ? "success" : "danger";
}
// These wrap the shared formatters rather than re-implementing them: local
// copies here printed whole rupees and 3 fixed decimals, so the same figure
// read differently on this screen than on a bill. The only thing added is the
// "—" for an absent value, which the shared helpers render as zero.
const isBlank = (v) => v === null || v === undefined || Number.isNaN(Number(v));
function money(v) {
  return isBlank(v) ? "—" : fmtMoney(v);
}
function grams(v) {
  return isBlank(v) ? "—" : fmtGrams(v);
}
function rate(v) {
  return isBlank(v) ? "—" : `${fmtMoney(v)}/g`;
}

/** A Digi Gold wallet's real finish line: one gram.
 *
 *  It has no duration and no instalment, so there is no date to count down to.
 *  The customer takes his gold the moment the balance reaches the target,
 *  whether that is in two months or two years. The bar is the honest version of
 *  a maturity date - it says how far he has come, not when he is owed. */
function GramGoal({ grams, target }) {
  const g = Number(grams) || 0;
  const t = Number(target) || 1;
  const pct = Math.max(0, Math.min(100, (g / t) * 100));
  const done = g >= t;
  return (
    <div className="min-w-[104px]">
      <div className={`num text-[13px] font-bold leading-tight ${done ? "text-emerald-600" : "text-ink"}`}>
        {g.toFixed(3)} <span className="font-semibold text-muted">/ {t.toFixed(2)} g</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${done ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${done ? "text-emerald-600" : "text-muted"}`}>
        {done ? "Ready to take" : `${Math.round(pct)}% there`}
      </div>
    </div>
  );
}

/** A Digi Gold wallet has no maturity date at all.
 *
 *  The record still carries one — joined + duration, inherited from the days
 *  when every scheme was a 12-month instalment plan — and printing it told the
 *  customer his wallet ends on a date the product will not end it on. He
 *  deposits what he likes for as long as he likes; the finish line is a WEIGHT
 *  (see GramGoal) or nothing at all. Fixed Gold Rate is NOT this: it does run
 *  for its 12 months, and keeps its real maturity date. */
function NoTerm() {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-2.5 py-1"
      title="No maturity date — this plan has no fixed term. The customer keeps it open as long as he likes."
    >
      <span className="text-[15px] font-extrabold leading-none text-accent-strong">∞</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">No end date</span>
    </span>
  );
}

/** How the plan is SOLD, in its own type's terms — never an instalment figure
 *  on a plan the shop sets no instalment for. Replaces the old Installment
 *  column, which printed a dash for two of the three scheme types and so said
 *  nothing at all about what the customer had actually signed up to. */
function PlanCell({ row, deposits }) {
  const t = row.schemeType;
  const wallet = isWalletScheme(t);
  // How far through the plan the customer is, in the unit his plan counts in.
  // A wallet counts deposits against nothing to reach, so its denominator is
  // the only honest one there is: ∞. Fixed Gold Rate counts deposits
  // against its 12 months; Monthly counts instalments against its duration.
  const done = wallet || t === SCHEME_TYPE.FIXED_GOLD_RATE ? deposits : row.paid;
  const term = wallet ? "∞" : row.total || 0;
  const plan = wallet
    ? { value: `₹${DIGI_MIN.toLocaleString("en-IN")} – ₹${DIGI_MAX.toLocaleString("en-IN")}`, unit: "Per deposit", num: true }
    : t === SCHEME_TYPE.FIXED_GOLD_RATE
      ? { value: row.goldPurity ? `${row.goldPurity} rate locked` : "Rate locked", unit: "Any amount", num: false }
      : { value: money(row.installment), unit: "Per month", num: true };
  return (
    <span className="inline-flex flex-col items-start gap-1 leading-tight">
      <span className={`text-[13px] font-bold ${plan.num ? "num" : ""}`}>{plan.value}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{plan.unit}</span>
        {/* The counter sits in a pill so the eye can find it down the column
            whatever length the line above it happens to be. Tabular figures
            keep the slash in the same place on every row. */}
        <span
          className={`num rounded-full border px-1.5 py-px text-[10px] font-bold tabular-nums ${wallet ? "border-accent-line bg-accent-soft text-accent-strong" : "border-line bg-canvas text-ink-soft"}`}
          title={wallet ? "Deposits made — a wallet has no set number to reach" : `Paid ${done} of ${term}`}
        >
          {done}/{term}
        </span>
      </span>
    </span>
  );
}

/** Has this customer paid anything OUTSIDE the selected window? Only then is
 *  a second, lifetime figure worth the line it costs. */
function lifetimeDiffers(row, act) {
  return Math.abs((act?.amount || 0) - (Number(row.totalPaid) || 0)) >= 0.005;
}

/** A wallet customer who has gone quiet. NOT an arrear.
 *
 *  He owes nothing - a wallet has no due date and can never be late - so this
 *  is amber and it is never red. Red would send staff to chase a customer who
 *  owes nothing, and would tell him he is behind when he is not. It says what
 *  is actually true: nobody has seen a deposit from him in a while. */
function QuietNudge({ days }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"
      title="Nothing is owed — a Digi Gold wallet has no due date. This is a reminder that the customer has stopped depositing."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      No deposit{days != null ? ` · ${days}d` : ""}
    </span>
  );
}

// KPI card — presentation only, matches the existing DFX card language.
// `hint` states the window the figure was measured over, so a card can never
// again be read as "all time" when it is showing today. `danger` was already
// being passed for Overdue and silently dropped, which is why the overdue
// figure rendered in the same ink as the rest.
function KpiCard({ label, value, hint, danger }) {
  return (
    <div className="kpi-corner rounded-2xl border border-line bg-surface p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-accent-line hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="min-h-[2.2em] text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`num mt-1.5 text-xl font-extrabold tracking-tight ${danger ? "text-danger" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-[10px] font-semibold text-faint">{hint}</div>}
    </div>
  );
}

export default function SchemeManagement({ intent, clearIntent } = {}) {
  const scope = useRef(null);
  // Closing an enrollment is the Admin's (server-enforced since 2026-10-06).
  const canClose = isShopAdmin(useAuth().backendRole);
  usePressFeedback(scope);
  const [filter, setFilter] = useState("All");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  // Only ever set from a Dashboard "Custom" window; the tabs here never set it.
  const [customRange, setCustomRange] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [ledger, setLedger] = useState([]);  // every scheme payment, for windowing
  const [summary, setSummary] = useState(null); // backend-authoritative KPI slices
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");

  // Manage Scheme drawer state
  const [manage, setManage] = useState(null);      // selected enrollment row
  const [tab, setTab] = useState(TABS[0]);
  const [balance, setBalance] = useState(null);     // /enrollments/{id}/balance
  const [passbook, setPassbook] = useState(null);   // /passbooks/{id}
  const [payments, setPayments] = useState([]);     // /payments filtered to enrollment
  const [detailLoading, setDetailLoading] = useState(false);
  const [remark, setRemark] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closingScheme, setClosingScheme] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      // The payment ledger comes along because the window figures need it: the
      // enrollment payload carries lifetime total_paid only, so "collected
      // today" can only be read off the payments themselves. Each amount is the
      // server's own; nothing is recomputed, only selected by date. A failed
      // ledger never fails the screen — the enrollments still render.
      const [{ rows: r, summary: s }, pays] = await Promise.all([
        enrollmentService.getEnrollmentsWithSummary(),
        paymentService.getSchemePayments().catch(() => []),
      ]);
      setRows(r);
      setSummary(s);
      setLedger(pays || []);
    } catch (err) {
      setLoadError(err?.message || "Could not load enrollments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  // Arriving from a Dashboard KPI. "3 new enrollments today" has to land on
  // those three, not on the whole book — the intent carries the window (and,
  // for the overdue alert, the status) the card was counting.
  useEffect(() => {
    if (!intent) return;
    // "custom" is not one of the tabs, but the Dashboard can be standing in
    // one — it arrives with its own from/to and is honoured as-is, so the
    // window the admin clicked is the window that opens.
    if (intent.period === "custom" && intent.from && intent.to) {
      setCustomRange({ from: intent.from, to: intent.to });
      setPeriod("custom");
    } else if (intent.period && PERIODS.some((p) => p.value === intent.period)) {
      setPeriod(intent.period);
    }
    if (intent.status && FILTERS.includes(intent.status)) setFilter(intent.status);
    clearIntent?.();
  }, [intent, clearIntent]);

  // ── What happened inside the window ───────────────────────────────────────
  // Two facts per enrollment: money taken in the window, and how many deposits
  // made it up. Both are sums of amounts the backend sent on its own payment
  // rows — the same "select the server's figures, never invent one" rule the
  // overdue total already follows. Only SUCCESS/COMPLETED money is counted.
  const range = periodRange(period, customRange);
  const windowed = !!range;
  const activity = useMemo(() => {
    const m = new Map();
    for (const p of ledger) {
      if (!(p.status === "SUCCESS" || p.status === "COMPLETED")) continue;
      const day = istDay(p.ts);
      if (range && (!day || day < range.start || day > range.end)) continue;
      const key = p.enrollmentId || p.enrollment;
      const cur = m.get(key) || { amount: 0, count: 0 };
      cur.amount += Number(p.amount) || 0;
      cur.count += 1;
      m.set(key, cur);
    }
    return m;
  }, [ledger, range?.start, range?.end]);

  // Lifetime deposit count per enrollment — the numerator of the "n / ∞" a
  // free-amount plan shows in place of an instalment count it does not have.
  const depositCount = useMemo(() => {
    const m = new Map();
    for (const p of ledger) {
      if (!(p.status === "SUCCESS" || p.status === "COMPLETED")) continue;
      const key = p.enrollmentId || p.enrollment;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [ledger]);

  const joinedInWindow = useCallback(
    (r) => {
      if (!range) return true;
      const day = istDay(r.joined);
      return !!day && day >= range.start && day <= range.end;
    },
    [range?.start, range?.end]
  );

  // A window shows what MOVED in it: plans taken out, and plans paid into.
  // Scoping on the joined date alone would have hidden today's ₹90,000 of
  // collections the moment they were made against last month's enrollments.
  const inWindow = useMemo(() => {
    if (!windowed) return rows;
    return rows.filter((r) => joinedInWindow(r) || activity.has(r.id));
  }, [rows, windowed, joinedInWindow, activity]);

  const filtered = useMemo(() => {
    if (filter === "All") return inWindow;
    if (filter === "Overdue") return inWindow.filter(isOverdue);
    if (filter === "Closed") return inWindow.filter((r) => isClosedStatus(r.status));
    return inWindow.filter((r) => r.status === filter);
  }, [inWindow, filter]);

  // Text search over the already-loaded rows — customer or scheme name. A pure display filter for the table; it never touches KPIs
  // (which stay backend-summary/status driven) and computes no financial value.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (r) =>
        (r.customer || "").toLowerCase().includes(q) ||
        (r.scheme || "").toLowerCase().includes(q)
    );
  }, [filtered, query]);

  // Pagination. 20 rows a page, and the page resets whenever the filter or the
  // search changes — otherwise page 4 of a 3-page result renders empty.
  const totalPages = Math.max(1, Math.ceil(searched.length / ROWS_PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const paged = useMemo(
    () => searched.slice((pageSafe - 1) * ROWS_PER_PAGE, pageSafe * ROWS_PER_PAGE),
    [searched, pageSafe]
  );
  useEffect(() => { setPage(1); }, [filter, query, period]);

  // KPI row — read straight from the backend-authoritative `summary` slice for
  // the active filter. The frontend performs NO financial aggregation: it only
  // selects the matching slice (All/Active/Completed/Cancelled) and displays the
  // values the backend already computed. Null when the slice is unavailable.
  // Overdue has no backend summary slice of its own; it borrows the Active
  // slice, since every overdue enrollment is by definition still active.
  // (The KPI money figure is amount still due to maturity, which is why it is
  // labelled Outstanding and not Overdue.)
  const FILTER_TO_SLICE = { All: "all", Active: "active", Overdue: "active", Completed: "completed", Closed: "cancelled" };
  const kpis = summary?.[FILTER_TO_SLICE[filter]] ?? null;
  // The backend's summary slices carry no overdue total - only a per-enrollment
  // overdue_amount, which it computes from the oldest unpaid due date. Summing
  // those is not a recomputation of anything: each figure is the server's, and
  // the list is unpaginated, so the total is exact rather than a page's worth.
  const overdueTotal = rows.reduce((s, r) => s + (Number(r.overdueAmount) || 0), 0);
  const overdueCount = rows.filter((r) => (Number(r.overdueAmount) || 0) > 0).length;

  // ── The four figures, in whichever window is selected ─────────────────────
  // "All time" keeps reading the backend's own summary slice, unchanged. A
  // window is answered from the window: enrollments STARTED in it, money TAKEN
  // in it. Overdue is deliberately never windowed — arrears are a fact about
  // right now, and "overdue this week" is not a thing a shop can act on.
  const newInWindow = windowed ? rows.filter(joinedInWindow).length : null;
  const collectedInWindow = windowed
    ? [...activity.values()].reduce((s, a) => s + a.amount, 0)
    : null;
  const completedInWindow = windowed ? inWindow.filter((r) => r.status === "Completed").length : null;
  const windowLabel = PERIOD_WORD[period] || "";
  const windowPfx = PERIOD_PFX[period] || "";

  // Outstanding is backend-authoritative (enrollment.outstanding_amount). The
  // frontend never computes it — `—` when the live backend hasn't sent it yet.
  function outstanding(r) {
    return r?.outstanding ?? null;
  }

  async function openManage(r) {
    setManage(r);
    setTab(TABS[0]);
    setBalance(null);
    setPassbook(null);
    setPayments([]);
    setRemark(r.remarks || "");
    setCloseReason("");
    setConfirmClose(false);
    setDetailLoading(true);
    try {
      // Payments come from the ledger the list already loaded, not a second
      // fetch of every scheme payment the shop has.
      const [bal, pb] = await Promise.all([
        enrollmentService.getBalance(r.id).catch(() => null),
        passbookService.getAdminPassbook(r.id).catch(() => null),
      ]);
      setBalance(bal);
      setPassbook(pb);
      setPayments(ledger.filter((p) => (p.enrollmentId ? p.enrollmentId === r.id : p.enrollment === r.enrollment)));
    } finally {
      setDetailLoading(false);
    }
  }
  function closeManage() {
    setManage(null);
  }

  // Passbook rows — every gold figure is backend-authoritative. Gold Credited is
  // the ledger gold_weight; Gold Balance is the backend running_gold_weight. No
  // gold is valued or summed in the frontend.
  const passbookRows = useMemo(() => {
    const entries = (passbook?.entries ?? []).slice().sort(
      (a, b) => (a.entryNumber ?? 0) - (b.entryNumber ?? 0)
    );
    return entries.map((e) => ({
      id: e.id,
      date: fmtDate(e.entryDate),
      amount: e.amount,
      goldRate: e.goldRate,
      goldWeight: e.goldWeight,
      goldBalance: e.goldBalance,
    }));
  }, [passbook]);

  // One definition of "closed" for the whole modal: anything not Active is a
  // finished record (Completed, Cancelled, Closed).
  const isClosed = !!manage && manage.status !== "Active";

  const totalPaid = balance?.total_paid ?? manage?.totalPaid ?? null;
  // Contributions actually recorded against this enrollment. Counted from the
  // payment rows the Passbook tab is already showing, so the two tabs cannot
  // disagree - which is exactly what SM-ENR-001 reported.
  const successfulPayments = payments.filter(
    (p) => p.status === "SUCCESS" || p.status === "COMPLETED"
  ).length;
  // Authoritative total gold balance from the passbook summary (backend).
  const goldBalance = passbook?.summary?.total_gold_weight ?? null;
  // A MONEY enrollment redeems the rupees paid in, so the gold its
  // contributions were once valued at is not a balance and must not be shown as
  // one - at the counter a gram figure reads as something the customer can
  // spend. Gold schemes (and anything whose basis is not on record) keep it.
  const redeemsAsMoney = manage?.redemptionBasis === "MONEY";

  async function saveRemark() {
    if (!manage) return;
    setSavingRemark(true);
    try {
      await enrollmentService.updateRemarks(manage.id, remark.trim() || null);
      setRows((prev) => prev.map((x) => (x.id === manage.id ? { ...x, remarks: remark.trim() } : x)));
      setManage((prev) => (prev ? { ...prev, remarks: remark.trim() } : prev));
      toast(`Remarks saved — ${manage.customer}`);
    } catch (err) {
      toast(err?.message || "Could not save remarks");
    } finally {
      setSavingRemark(false);
    }
  }

  // Close an active enrollment. Uses the existing, already-live admin close
  // endpoint (POST /enrollments/{id}/close). Stops future contributions; the
  // paid-in balance is preserved and stays redeemable — never refunds/forfeits.
  // Reason validated, then an in-app confirm (not a browser dialog) gates the
  // irreversible close.
  function requestClose() {
    if (!manage) return;
    if (closeReason.trim().length < 3) { toast("Enter a reason (min 3 chars) to close"); return; }
    setConfirmClose(true);
  }
  async function doClose() {
    if (!manage) return;
    const reason = closeReason.trim();
    setClosingScheme(true);
    try {
      await enrollmentService.closeEnrollment(manage.id, reason);
      const nm = `${manage.customer} · ${manage.scheme}`;
      setConfirmClose(false);
      setCloseReason("");
      closeManage();
      await loadRows();
      toast(`Scheme closed — ${nm}`);
    } catch (err) {
      toast(err?.message || "Could not close scheme");
    } finally {
      setClosingScheme(false);
    }
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Enrollment Management</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">Which customers are enrolled in which schemes, and the current state of each enrollment — passbook, payments and remarks in one place.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRows}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
          Refresh
        </Button>
      </div>

      <div data-motion="reveal" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label={windowed ? `${windowPfx} New Enrollments` : "Active Enrollments"}
          value={loading ? "—" : windowed ? String(newInWindow) : (kpis ? String(kpis.active_enrollments) : "—")}
          hint={windowed ? `Plans started ${windowLabel}` : "Currently running"}
        />
        <KpiCard
          label={windowed ? `Collected ${windowPfx.replace("'s", "")}` : "Total Paid"}
          value={loading ? "—" : windowed ? money(collectedInWindow) : (kpis ? money(kpis.total_paid) : "—")}
          hint={windowed ? `Money taken ${windowLabel}` : "Lifetime, all enrollments"}
        />
        {/* OVERDUE, not "remaining". The remaining contract value of a healthy
            plan is not a number a shop needs on this screen - on a 12-month
            plan with one instalment paid it is eleven months' worth, none of it
            late, and shown beside an Overdue filter it only ever read as money
            owed. What a shop wants to see is who has MISSED an instalment date,
            which the backend already computes (overdue_amount / overdue_days)
            from the oldest unpaid due date. */}
        {/* Never windowed. Arrears are a fact about TODAY — "overdue this week"
            is not a number a shop can act on, and showing one would hide the
            customer who has been late since March the moment a window was
            picked. */}
        <KpiCard
          label={overdueCount ? `Overdue · ${overdueCount}` : "Overdue"}
          value={loading ? "—" : money(overdueTotal)}
          hint="As of today — not filtered"
          danger
        />
        <KpiCard
          label="Completed"
          value={loading ? "—" : windowed ? String(completedInWindow) : (kpis ? String(kpis.completed) : "—")}
          hint={windowed ? `Among plans active ${windowLabel}` : "All time"}
        />
      </div>

      {/* Two rows, two different questions, so neither is mistaken for the
          other: WHEN (the window every figure above is measured over) and WHAT
          STATE (the status chips that have always been here). They used to be
          one wrapping line of pills with nothing to say which pill meant what. */}
      <div data-motion="toolbar" className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">Period</span>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-canvas/60 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { setCustomRange(null); setPeriod(p.value); }}
              aria-pressed={period === p.value}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${period === p.value ? "bg-accent-strong text-white shadow-sm" : "text-muted hover:text-accent-strong"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {windowed && (
          <span className="text-[11px] font-semibold text-muted">
            Showing what moved {windowLabel} — new plans and plans paid into. IST.
          </span>
        )}
      </div>

      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full max-w-xs sm:max-w-sm sm:flex-1"
          placeholder="Search customer or scheme..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search enrollments"
        />
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{f}</button>
        ))}
        {(filter !== "All" || query || period !== DEFAULT_PERIOD) && (
          <button
            type="button"
            onClick={() => { setFilter("All"); setQuery(""); setPeriod(DEFAULT_PERIOD); setCustomRange(null); }}
            className="ml-auto rounded-full border border-danger-line bg-danger-soft px-3.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Customer</th><th className="px-4 py-3">Scheme</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Maturity</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3 text-right">{windowed ? `Paid ${windowPfx.replace("'s", "")}` : "Paid"}</th><th className="px-4 py-3 text-right">Overdue</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right pr-6">Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  {/* In a window the list mixes plans STARTED in it with older
                      plans merely paid into, so the ones the "New Enrollments"
                      card counted are marked — otherwise the count and the
                      list disagree on sight. */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold leading-tight">{r.customer}</span>
                      {windowed && joinedInWindow(r) && (
                        <span className="rounded-full border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-accent-strong">New</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-medium">{r.scheme}</td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{fmtDate(r.joined)}</td>
                  {/* A wallet matures on a WEIGHT, not a date. The date the
                      backend sends for one is joined + 12 months, inherited
                      from the instalment plans every scheme used to be, and it
                      promises the customer something the product does not do.
                      What decides a wallet is the gram. */}
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">
                    {isWalletScheme(r.schemeType) && r.goldGramsTarget
                      ? <GramGoal grams={r.goldGrams} target={r.goldGramsTarget} />
                      : isWalletScheme(r.schemeType)
                        ? <NoTerm />
                        : fmtDate(r.maturity)}
                  </td>
                  {/* Was "Installment", which two of the three scheme types do
                      not have - so the column rendered a dash for them and
                      told the counter nothing about what the customer had
                      actually joined. It now states each plan in its own
                      terms: an instalment for Monthly, the locked purity for
                      Fixed Gold Rate, the deposit range for a wallet. */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <PlanCell row={r} deposits={depositCount.get(r.id) || 0} />
                  </td>
                  {/* A wallet has no instalments to count, so "0/12" was a lie
                      told beside a funded enrollment: Raiyan Abbas had paid
                      Rs 40,000 in and this column read 0/12. months_paid is
                      NULL on a wallet by design (payments/service.py never
                      advances it), so the figure to show is what the wallet
                      actually holds. */}
                  {/* One column, two different facts. A free-amount plan has
                      taken MONEY; an instalment plan has taken a COUNT of
                      months. Both were crammed onto one line with a trailing
                      word - "Rs 40,000.00 in" - which read as a sentence
                      fragment and let the figure collide with the caption. The
                      number now owns the line and the unit sits under it in
                      small caps, so the column scans as one column of numbers
                      whichever kind of plan the row is. */}
                  {/* In a window this column answers the window's question -
                      "how much did this customer pay TODAY" - because that is
                      what a shop clicking "Today's Collection" came to see. A
                      lifetime total under a card labelled Today was the single
                      most confusing thing on the screen. Out of a window it is
                      the lifetime figure it has always been. */}
                  <td className="num px-4 py-3.5 text-right whitespace-nowrap">
                    <span className="inline-flex flex-col items-end leading-tight">
                      {windowed ? (
                        <>
                          <span className={`font-bold ${activity.get(r.id)?.amount ? "text-emerald-600" : "text-muted"}`}>
                            {money(activity.get(r.id)?.amount ?? 0)}
                          </span>
                          {/* Only when the window figure is NOT the whole
                              story. When every payment a customer has made
                              falls inside the window the two are the same
                              number, and printing it twice said nothing. */}
                          {lifetimeDiffers(r, activity.get(r.id)) && (
                            <span className="text-[10px] font-semibold text-muted">of {money(r.totalPaid)} lifetime</span>
                          )}
                        </>
                      ) : (
                        <span className="font-bold">{money(r.totalPaid)}</span>
                      )}
                    </span>
                  </td>
                  {/* Overdue only: an instalment whose due date has passed
                      unpaid. A plan that is simply mid-term owes nothing today
                      and shows a dash, not eleven months of future contract.
                      A wallet can never be overdue - nothing is ever due. */}
                  <td className={`num px-4 py-3.5 text-right whitespace-nowrap ${(r.overdueAmount || 0) > 0 ? "font-bold text-danger" : "font-semibold text-muted"}`}>
                    {isFreeAmountScheme(r.schemeType)
                      ? (isWalletScheme(r.schemeType) && r.quiet
                          ? <QuietNudge days={r.daysQuiet} />
                          : NOT_APPLICABLE)
                      : !(r.overdueAmount > 0)
                        ? NOT_APPLICABLE
                        : <>{money(r.overdueAmount)}<span className="ml-1 text-[11px] font-semibold">· {r.overdueDays}d</span></>}
                  </td>
                  <td className="px-4 py-3.5"><Badge tone={statusTone(r.status)} dot>{r.status}</Badge></td>
                  <td className="px-4 py-3.5 pr-6 text-right">
                    <Button size="sm" variant="outline" onClick={() => openManage(r)}>Manage</Button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={9} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={9} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load enrollments</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadRows}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && searched.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-14 text-center"><div className="font-bold">No enrollments found</div><p className="mt-1 text-sm text-muted">Nothing matches this {query.trim() ? "search" : "filter"}.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {/* Row count + pager. Kept outside the table so the table itself never
          needs its own scroll container. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold text-muted">
          {searched.length === 0
            ? `No enrollments match — ${rows.length} in total`
            : `Showing ${(pageSafe - 1) * ROWS_PER_PAGE + 1}–${Math.min(pageSafe * ROWS_PER_PAGE, searched.length)} of ${searched.length}${searched.length !== rows.length ? ` (filtered from ${rows.length})` : ""}`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span className="num px-2 text-xs font-bold text-muted">Page {pageSafe} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        )}
      </div>

      {manage && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeManage} aria-label="Close" />
          <div className="relative h-full w-full max-w-[720px] overflow-hidden border-l border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-extrabold tracking-tight">Manage Scheme</h3>
                <p className="mt-0.5 text-xs text-muted">{manage.customer} · {manage.scheme}</p>
              </div>
              <button onClick={closeManage} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${tab === t ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}>{t}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              {detailLoading && <div className="py-10 text-center text-sm font-bold text-muted">Loading enrollment…</div>}

              {!detailLoading && tab === "Enrollment Details" && (
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Customer</td><td className="px-4 py-2.5 font-bold">{manage.customer}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Scheme</td><td className="px-4 py-2.5 font-medium">{manage.scheme}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Status</td><td className="px-4 py-2.5"><Badge tone={statusTone(manage.status)} dot>{manage.status}</Badge></td></tr>
                      {/* FDG-002. A Digi Gold wallet takes deposits of any size
                          whenever the customer likes, so there is no instalment
                          to state. The stored figure is left untouched. */}
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Installment</td><td className={`px-4 py-2.5 ${isWalletScheme(manage.schemeType) ? "font-semibold text-muted" : "font-bold"}`}>{isWalletScheme(manage.schemeType) ? NOT_APPLICABLE : money(manage.installment)}</td></tr>
                      {/* A wallet has no term and no maturity date. Fixed Gold
                          Rate does — it runs its 12 months — so only the
                          wallet is exempted here. */}
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Planned Duration</td><td className="px-4 py-2.5 font-medium">{isWalletScheme(manage.schemeType) ? <span className="font-bold text-accent-strong">∞ — no fixed term</span> : `${manage.total} months`}</td></tr>
                      {/* SM-ENR-001. `manage.paid` is MONTHS paid, and the
                          denominator beside it is the plan's duration - so this
                          row was a months counter wearing the word "Payments".
                          On a wallet scheme that reads 0 / 12 next to four
                          SUCCESS payments of Rs 1,00,000, because a wallet has
                          no instalments to complete and months_paid correctly
                          never leaves 0. The number was right; the label was
                          not. Each scheme type now states the figure it
                          actually keeps. */}
                      {isWalletScheme(manage.schemeType) ? (
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Successful Payments</td><td className="px-4 py-2.5 font-bold">{successfulPayments}</td></tr>
                      ) : (
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Months Paid</td><td className="px-4 py-2.5 font-bold">{manage.paid} / {manage.total}</td></tr>
                      )}
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Total Paid</td><td className="px-4 py-2.5 font-bold">{money(totalPaid)}</td></tr>
                      {/* Overdue and Next Due only mean something while the
                          enrollment is still running. On a closed/completed
                          record they read Nil rather than a stale figure. */}
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Overdue</td><td className={`px-4 py-2.5 ${(manage.overdueAmount || 0) > 0 ? "font-bold text-danger" : "font-semibold text-muted"}`}>{isWalletScheme(manage.schemeType) || isClosed || !(manage.overdueAmount > 0) ? NOT_APPLICABLE : `${money(manage.overdueAmount)} · ${manage.overdueDays} days late`}</td></tr>
                      {/* The customer's own terms, frozen when he joined: a
                          Monthly plan redeems the rupees he paid; the two gold
                          schemes redeem what his grams are worth today, which
                          is why the purity he chose matters. Stated here so the
                          counter can explain a balance instead of guessing. */}
                      {manage.goldPurity && (
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Scheme Purity</td><td className="px-4 py-2.5 font-bold">{manage.goldPurity}</td></tr>
                      )}
                      {manage.redemptionBasis && (
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Redeems As</td><td className="px-4 py-2.5 font-medium">{manage.redemptionBasis === "MONEY" ? <>Money — the amount paid in</> : <>Gold — what the grams are worth today</>}</td></tr>
                      )}
                      {!redeemsAsMoney && (
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Current Gold Balance</td><td className="px-4 py-2.5 font-bold text-accent-strong">{grams(goldBalance)}</td></tr>
                      )}
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Joined</td><td className="px-4 py-2.5 font-medium">{fmtDate(manage.joined)}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Maturity</td><td className="px-4 py-2.5 font-medium">{isWalletScheme(manage.schemeType) ? <span className="font-bold text-accent-strong">No maturity date</span> : fmtDate(manage.maturity)}</td></tr>
                      {!isClosed && manage.nextDue && String(manage.nextDue).slice(0, 10) < istToday() ? (
                        <>
                          <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Missed Due</td><td className="px-4 py-2.5 font-bold text-danger">{fmtDate(manage.nextDue)}{manage.overdueDays > 0 ? ` · ${manage.overdueDays} days late` : ""}</td></tr>
                          <tr><td className="px-4 py-2.5 font-semibold text-muted">Upcoming Due</td><td className="px-4 py-2.5 font-medium">{(() => { const up = upcomingDueDate(manage.joined, manage.paid, manage.total, istToday()); return up ? fmtDate(up) : NOT_APPLICABLE; })()}</td></tr>
                        </>
                      ) : (
                        <tr><td className="px-4 py-2.5 font-semibold text-muted">Next Due</td><td className="px-4 py-2.5 font-medium">{isClosed ? "Nil" : fmtDate(manage.nextDue)}</td></tr>
                      )}
                    </tbody>
                  </table>
                  <p className="px-4 py-2 text-xs text-muted">Amounts and dates are fixed when the customer enrolls and can't be edited here.</p>
                </div>
              )}

              {!detailLoading && tab === "Passbook & Payments" && (
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{redeemsAsMoney ? "Passbook — contributions" : "Passbook — gold credited"}</div>
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            <th className="px-4 py-2.5">Date</th><th className="py-2.5 text-right">Payment</th>
                            {redeemsAsMoney ? <th className="py-2.5 pr-4 text-right">Running Total</th> : (
                              <><th className="py-2.5 text-right">Applicable Rate</th><th className="py-2.5 text-right">Gold Credited</th><th className="py-2.5 text-right pr-4">Gold Balance</th></>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {passbookRows.map((e) => (
                            <tr key={e.id} className="border-b border-line-soft last:border-0">
                              <td className="px-4 py-2.5 font-mono text-xs">{e.date}</td>
                              <td className="py-2.5 text-right font-bold">{money(e.amount)}</td>
                              {redeemsAsMoney ? (
                                <td className="py-2.5 pr-4 text-right font-mono font-bold text-ink">{money(passbookRows.slice(0, passbookRows.indexOf(e) + 1).reduce((t, x) => t + (Number(x.amount) || 0), 0))}</td>
                              ) : (
                                <>
                                  <td className="py-2.5 text-right font-mono text-xs">{rate(e.goldRate)}</td>
                                  <td className="py-2.5 text-right font-mono">{grams(e.goldWeight)}</td>
                                  <td className="py-2.5 pr-4 text-right font-mono font-bold text-ink">{grams(e.goldBalance)}</td>
                                </>
                              )}
                            </tr>
                          ))}
                          {passbookRows.length === 0 && (
                            <tr><td colSpan={redeemsAsMoney ? 3 : 5} className="px-4 py-10 text-center text-muted">No passbook entries yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Payment / Collection history</div>
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            <th className="px-4 py-2.5">Date</th><th className="py-2.5">Reference</th><th className="py-2.5">Method</th><th className="py-2.5 text-right">Amount</th><th className="py-2.5 text-right pr-4">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-b border-line-soft last:border-0">
                              <td className="px-4 py-2.5 font-mono text-xs">{p.date}</td>
                              <td className="py-2.5 font-mono text-xs">{p.id}</td>
                              <td className="py-2.5 font-medium">{p.method || "—"}</td>
                              <td className="py-2.5 text-right font-bold">{money(p.amount)}</td>
                              <td className="py-2.5 pr-4 text-right"><Badge tone={p.status === "COMPLETED" || p.status === "SUCCESS" ? "success" : "info"} dot>{p.status || "—"}</Badge></td>
                            </tr>
                          ))}
                          {payments.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No payments recorded for this enrollment yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {!detailLoading && tab === "Remarks" && (
                <div>
                  {/* Two different fields. Closing writes closure_reason; the
                      editor below writes `remarks`. A closed enrollment shows
                      both read-only: there is no live enrollment left to
                      annotate, so offering "Save Remarks" there was wrong. */}
                  {!isClosed && (
                    <>
                      <label className="mb-1.5 block text-xs font-bold">Operational remark</label>
                      <textarea
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        rows={5}
                        placeholder="e.g. Customer requested callback next week"
                        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent-line"
                      />
                      <p className="mt-1.5 text-xs text-muted">Operational note only — persisted on the enrollment. Never affects any financial record.</p>
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" disabled={savingRemark} onClick={saveRemark}>{savingRemark ? "Saving…" : "Save Remarks"}</Button>
                      </div>
                    </>
                  )}

                  {isClosed && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-danger/40 bg-danger/5 p-3.5">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-danger">Why this scheme was closed</div>
                        <p className="mt-1 text-sm font-semibold text-ink">{manage.closureReason || "No reason was recorded."}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {manage.closedAt ? `Closed on ${fmtDate(manage.closedAt)}. ` : ""}Read-only — a closed enrollment cannot be reopened or re-annotated.
                        </p>
                      </div>
                      <div className="rounded-xl border border-line bg-canvas/50 p-3.5">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint">Operational remark</div>
                        <p className="mt-1 text-sm font-semibold text-ink">{manage.remarks || "None recorded."}</p>
                      </div>
                    </div>
                  )}

                  {!isClosed && canClose && (
                    <div className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-danger">Close scheme</div>
                      <p className="mt-1 text-xs text-muted">Stops future contributions. The paid-in balance is preserved and stays redeemable — closing never refunds or forfeits. Cannot be reopened.</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {CLOSE_PRESETS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setCloseReason(r)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${closeReason === r ? "border-danger bg-danger text-white" : "border-line bg-white text-muted hover:border-danger/50 hover:text-danger"}`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={closeReason}
                        onChange={(e) => setCloseReason(e.target.value)}
                        rows={2}
                        placeholder="Pick a reason above or type your own (required)"
                        className="mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-danger"
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" disabled={closingScheme} onClick={requestClose} className="border-danger text-danger hover:bg-danger hover:text-white">Close scheme</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* "Done" rather than "Close": the header already has an X to
                dismiss, and "Close" is the destructive close-the-scheme action
                further down. Three controls reading Close was the confusion. */}
            <div className="border-t border-line p-4 flex justify-end">
              <Button size="sm" variant="outline" onClick={closeManage}>Done</Button>
            </div>

            {confirmClose && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4">
                <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-5 shadow-2xl">
                  <h4 className="text-base font-extrabold">Close scheme?</h4>
                  <p className="mt-1.5 text-sm text-muted">{manage.customer} · {manage.scheme} — contributions stop. Paid balance stays redeemable. Cannot be reopened.</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={closingScheme} onClick={() => setConfirmClose(false)}>Cancel</Button>
                    <Button size="sm" disabled={closingScheme} onClick={doClose} className="border-danger bg-danger text-white hover:bg-danger">{closingScheme ? "Closing…" : "Yes, close"}</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
