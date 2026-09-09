import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Badge } from "@/_shared/ui/badge";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { reportService } from "@/modules/reports/reportService";
import { customerService } from "@/modules/customers/customerService";

const PERIODS = ["Today", "This Week", "This Month", "This Year", "Custom"];

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n) => (n == null ? null : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);

/** Compact axis money: ₹1.2Cr / ₹3.4L / ₹90k / ₹450. */
function inrShort(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(a % 1e7 ? 1 : 0)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(a % 1e5 ? 1 : 0)}L`;
  if (a >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${Math.round(v)}`;
}
const countShort = (n) => `${Math.round(Number(n || 0))}`;

/** Qualitative reading of a backend-provided growth %. Text only — no maths. */
function trend(n) {
  if (n == null) return { label: "No change data", tone: "neutral" };
  if (n > 0.5) return { label: "Growing", tone: "success" };
  if (n < -0.5) return { label: "Declining", tone: "danger" };
  return { label: "Stable", tone: "neutral" };
}

/** Rounded, human tick values spanning [min,max]. */
function niceScale(min, max, count = 4) {
  if (max <= min) max = min + 1;
  const range = max - min;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { lo, hi, ticks };
}

/* ── Data-driven line chart with real axes, ticks, tooltips ──────────────── */
function LineChart({ points, color = "#c9a84c", tipFormat = (v) => v, axisFormat = (v) => v, unit = "", label }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const W = 660, H = 300, PL = 60, PR = 18, PT = 18, PB = 44;
  if (!points || points.length === 0) {
    return <div className="grid h-64 place-items-center rounded-xl border border-line-soft bg-canvas/40 text-sm font-semibold text-muted">No data for this period</div>;
  }
  const rawMax = Math.max(...points.map((p) => p.value), 0);
  const rawMin = Math.min(...points.map((p) => p.value), 0);
  const { lo, hi, ticks } = niceScale(rawMin, rawMax);
  const span = hi - lo || 1;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const xAt = (i) => (points.length === 1 ? PL + plotW / 2 : PL + plotW * (i / (points.length - 1)));
  const yAt = (v) => PT + plotH - ((v - lo) / span) * plotH;
  const xy = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value), ...p }));
  const lineD = xy.reduce((d, p, i) => d + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`), "");
  const areaD = xy.length > 1 ? `${lineD} L${xy[xy.length - 1].x},${PT + plotH} L${xy[0].x},${PT + plotH} Z` : "";

  // Thin X labels so they never overlap.
  const maxLabels = 7;
  const stepL = Math.ceil(points.length / maxLabels);

  const move = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    let idx = 0, best = Infinity;
    xy.forEach((p, i) => { const d = Math.abs(p.x - rel); if (d < best) { best = d; idx = i; } });
    setHover(idx);
  };

  return (
    <div ref={wrapRef} className="relative w-full" onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label || "trend"}>
        <defs>
          <linearGradient id={`ra-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
        </defs>
        {/* gridlines + Y ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} y1={yAt(t)} x2={W - PR} y2={yAt(t)} stroke="#eae5dc" strokeWidth="1" />
            <text x={PL - 8} y={yAt(t) + 4} textAnchor="end" fontSize="12" fill="#8b7d6b" fontWeight="600">{axisFormat(t)}</text>
          </g>
        ))}
        {areaD && <path d={areaD} fill={`url(#ra-${color.slice(1)})`} />}
        <path d={lineD} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.2} fill={hover === i ? "#a68631" : color} stroke="white" strokeWidth="2" />
        ))}
        {hover !== null && <line x1={xy[hover].x} y1={PT} x2={xy[hover].x} y2={PT + plotH} stroke={color} strokeDasharray="4 4" opacity="0.45" />}
        {/* X labels */}
        {xy.map((p, i) => (i % stepL === 0 || i === xy.length - 1) ? (
          <text key={i} x={p.x} y={H - PB + 20} textAnchor={i === 0 ? "start" : i === xy.length - 1 ? "end" : "middle"} fontSize="12" fill="#8b7d6b" fontWeight="600">{p.label}</text>
        ) : null)}
      </svg>
      {unit && <div className="mt-1 text-center text-[11px] font-semibold text-faint">{unit}</div>}
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold shadow-xl" style={{ left: `${(xy[hover].x / W) * 100}%`, top: 4 }}>
          <div className="text-ink">{tipFormat(xy[hover].value)}</div>
          <div className="text-[11px] font-semibold text-faint">{xy[hover].label}</div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const toneCls = tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "text-ink";
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-extrabold ${toneCls}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs font-semibold text-muted">{sub}</div>}
    </Card>
  );
}

function StateBlock({ loading, error, empty, onRetry, children }) {
  if (loading) return <div className="rounded-xl border border-line-soft bg-canvas/40 p-10 text-center text-sm font-semibold text-muted">Loading…</div>;
  if (error) return (
    <div className="rounded-xl border border-danger-line bg-danger-soft p-6 text-center">
      <div className="font-bold text-danger">Couldn’t load data</div>
      <p className="mt-1 text-sm text-muted">{error}</p>
      {onRetry && <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>Retry</Button>}
    </div>
  );
  if (empty) return <div className="rounded-xl border border-line-soft bg-canvas/40 p-10 text-center text-sm font-semibold text-muted">No records for this period</div>;
  return children;
}

/* ── AI Insight — clarity-first presentation of REAL fetched numbers ──────── */
function InsightHeading({ children }) {
  return <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">{children}</div>;
}

function AIInsight({ insight }) {
  const { headline, support, attention, action } = insight;
  return (
    <Card data-motion="reveal" className="overflow-hidden border-indigo-100 bg-indigo-50/40 shadow-lg">
      {/* Header — distinct intelligence treatment */}
      <div className="flex items-center gap-2.5 border-b border-indigo-100 px-6 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-100 text-[11px] font-extrabold tracking-wide text-indigo-700">AI</span>
        <div>
          <div className="text-base font-extrabold tracking-tight text-ink">AI Insight</div>
          <div className="text-xs font-semibold text-muted">Based on your current business data</div>
        </div>
      </div>

      {/* Full-width card, readable content laid across the available space */}
      <div className="grid gap-4 p-5 lg:grid-cols-3 lg:gap-5 lg:p-6">
        {/* Primary insight — focal point */}
        <div className="rounded-xl border border-line bg-white p-5 lg:col-span-2">
          <InsightHeading>What is happening</InsightHeading>
          <p className="mt-2 max-w-[60ch] text-lg font-extrabold leading-snug tracking-tight text-ink sm:text-xl">{headline}</p>
          {support && <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted">{support}</p>}
        </div>

        {/* Attention (only when real) + recommended action */}
        <div className="flex flex-col gap-4">
          {attention && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <InsightHeading>Needs attention</InsightHeading>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                {attention.lines.map((l, i) => <div key={i} className="text-lg font-extrabold text-amber-900">{l}</div>)}
              </div>
              {attention.note && <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-amber-900/80">{attention.note}</p>}
            </div>
          )}
          <div className="flex-1 rounded-xl border border-l-4 border-line border-l-indigo-400 bg-white p-4">
            <InsightHeading>Recommended action</InsightHeading>
            <p className="mt-2 max-w-[52ch] text-sm font-medium leading-relaxed text-ink-soft">{action}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ReportsAnalytics() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [mode, setMode] = useState("reports"); // reports | analytics
  const [domain, setDomain] = useState("business"); // business | scheme
  const [period, setPeriod] = useState("This Month");
  const [dateFrom, setDateFrom] = useState("2026-08-01");
  const [dateTo, setDateTo] = useState("2026-08-31");
  const [exporting, setExporting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [goldRate, setGoldRate] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [birthdays, setBirthdays] = useState(null); // null=not loaded, []=none

  const opts = { period, dateFrom, dateTo };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (domain === "business") {
        const [p, tc, gr] = await Promise.all([
          reportService.getPaymentSummary(opts),
          reportService.getTopCustomers(opts, 10),
          reportService.getGoldRateTrend(opts).catch(() => null),
        ]);
        setPayment(p); setTopCustomers(tc); setGoldRate(gr);
      } else {
        const [en, sc] = await Promise.all([
          reportService.getEnrollmentSummary(opts),
          reportService.getSchemeSummary(opts),
        ]);
        setEnrollment(en); setSchemes(sc);
      }
    } catch (err) {
      setError(err?.message || "Could not load reports.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Upcoming birthdays — real customer DOB only, computed once and cached.
  useEffect(() => {
    if (mode !== "analytics" || domain !== "business" || birthdays !== null) return;
    let cancel = false;
    (async () => {
      try {
        const custs = await customerService.getCustomers({ limit: 500 });
        if (cancel) return;
        setBirthdays(upcomingBirthdays(custs));
      } catch {
        if (!cancel) setBirthdays([]);
      }
    })();
    return () => { cancel = true; };
  }, [mode, domain, birthdays]);

  async function handleExport() {
    setExporting(true);
    try {
      if (mode === "analytics") await reportService.exportAnalyticsSummary("excel");
      else await reportService.exportReportsSummary(opts, "excel", 10);
      toast("Export downloaded");
    } catch (err) {
      toast(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const empty = domain === "business" ? !payment : !enrollment;

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      {/* Header */}
      <div data-motion="page-head" className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Reports &amp; Analytics</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            {mode === "reports"
              ? "Factual records for the selected period — revenue, collections, enrollment and scheme data."
              : "Interpretation of the same data — trends, strengths, risks and where to focus."}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={exporting} onClick={handleExport}>{exporting ? "Exporting…" : "Export Excel"}</Button>
      </div>

      {/* Mode tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1" data-motion="toolbar">
        {[["reports", "Reports"], ["analytics", "Analytics"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${mode === k ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{lbl}</button>
        ))}
      </div>

      {/* Domain tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[["business", "Business"], ["scheme", "Scheme"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setDomain(k)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${domain === k ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{lbl}</button>
        ))}
      </div>

      {/* Period selector */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${period === p ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{p}</button>
        ))}
        {payment?.range?.label && domain === "business" && <span className="ml-1 text-xs font-semibold text-muted">Range: <span className="font-bold text-ink">{payment.range.label}</span></span>}
      </div>
      {period === "Custom" && (
        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-xs font-bold">Start<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
          <label className="grid gap-1 text-xs font-bold">End<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
          <Button size="sm" className="self-end" onClick={load}>Apply</Button>
        </Card>
      )}

      <StateBlock loading={loading} error={error} empty={!loading && !error && empty} onRetry={load}>
        {/* ── BUSINESS ─────────────────────────────────────────────── */}
        {domain === "business" && payment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-motion="stat">
              <Kpi label="Total Revenue" value={inr(payment.totalRevenue)} sub={pct(payment.totalRevenueGrowthPercent) && `${pct(payment.totalRevenueGrowthPercent)} vs prev.`} />
              <Kpi label="Outstanding Dues" value={inr(payment.outstandingDues)} tone="danger" sub={pct(payment.outstandingDuesGrowthPercent) && `${pct(payment.outstandingDuesGrowthPercent)} vs prev.`} />
              <Kpi label="Avg Installment" value={inr(payment.avgInstallmentAmount)} />
              <Kpi label="Successful Payments" value={payment.successPaymentCount} tone="info" sub={`${payment.pendingPaymentCount} pending`} />
            </div>

            {mode === "reports" ? (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card data-motion="reveal">
                    <CardHeader><div><CardTitle>Revenue &amp; Collections Trend</CardTitle><CardDescription>Payments received (₹) across the period</CardDescription></div><Badge tone="neutral">{period}</Badge></CardHeader>
                    <CardContent><LineChart points={payment.monthlyTrend.map((p) => ({ label: p.label, value: p.amount }))} tipFormat={inr} axisFormat={inrShort} unit="Amount collected (₹)" label="Revenue trend" /></CardContent>
                  </Card>
                  <Card data-motion="reveal">
                    <CardHeader><div><CardTitle>Gold Rate Trend (24K)</CardTitle><CardDescription>{goldRate?.latestChangePercent != null ? `₹ per gram · latest day-over-day ${pct(goldRate.latestChangePercent)}` : "₹ per gram over the period"}</CardDescription></div></CardHeader>
                    <CardContent><LineChart points={(goldRate?.trend || []).map((p) => ({ label: p.date, value: p.rate }))} color="#a68631" tipFormat={inr} axisFormat={inrShort} unit="Rate (₹/g)" label="Gold rate trend" /></CardContent>
                  </Card>
                </div>

                <Card data-motion="reveal" className="overflow-hidden">
                  <CardHeader><div><CardTitle>Top Customers</CardTitle><CardDescription>Ranked by successful payments in the period</CardDescription></div></CardHeader>
                  <CardContent className="overflow-x-auto px-0 pb-0"><TopCustomersTable rows={topCustomers} /></CardContent>
                </Card>
              </>
            ) : (
              <>
                <AIInsight insight={businessInsight(payment, topCustomers)} />

                <Card data-motion="reveal">
                  <CardHeader><div><CardTitle>Sales Performance Trend</CardTitle><CardDescription>Direction of collections (₹) across the period</CardDescription></div>
                    <Badge tone={trend(payment.totalRevenueGrowthPercent).tone}>{trend(payment.totalRevenueGrowthPercent).label}</Badge></CardHeader>
                  <CardContent><LineChart points={payment.monthlyTrend.map((p) => ({ label: p.label, value: p.amount }))} tipFormat={inr} axisFormat={inrShort} unit="Amount collected (₹)" label="Sales performance" /></CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-motion="reveal">
                  <MetricCard icon="growth" title="Revenue Momentum" tone={trend(payment.totalRevenueGrowthPercent).tone}
                    value={trend(payment.totalRevenueGrowthPercent).label} note={pct(payment.totalRevenueGrowthPercent) ? `${pct(payment.totalRevenueGrowthPercent)} vs previous period` : "Not enough history to compare"} />
                  <MetricCard icon="risk" title="Collection Risk" tone={payment.outstandingDues > 0 ? "danger" : "success"}
                    value={payment.outstandingDues > 0 ? inr(payment.outstandingDues) : "No dues"} note={payment.pendingPaymentCount > 0 ? `${payment.pendingPaymentCount} payment(s) pending` : "All payments settled"} />
                  <MetricCard icon="ticket" title="Avg Ticket Size" tone="neutral"
                    value={inr(payment.avgInstallmentAmount)} note={`Across ${payment.successPaymentCount} transaction(s)`} />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <BirthdayCard data={birthdays} />
                  <Card data-motion="reveal" className="overflow-hidden">
                    <CardHeader><div><CardTitle>Top Customers</CardTitle><CardDescription>Strongest relationships this period</CardDescription></div></CardHeader>
                    <CardContent className="overflow-x-auto px-0 pb-0"><TopCustomersTable rows={topCustomers.slice(0, 5)} compact /></CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SCHEME ───────────────────────────────────────────────── */}
        {domain === "scheme" && enrollment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-motion="stat">
              <Kpi label="Active Enrollments" value={enrollment.activeCount} tone="info" />
              <Kpi label="New This Period" value={enrollment.newEnrollmentsInRange} />
              <Kpi label="Completed" value={enrollment.completedCount} />
              <Kpi label="Retention Rate" value={enrollment.retentionRatePercent != null ? `${enrollment.retentionRatePercent.toFixed(1)}%` : "—"} />
            </div>

            {mode === "reports" ? (
              <>
                <Card data-motion="reveal">
                  <CardHeader><div><CardTitle>New Enrollments Trend</CardTitle><CardDescription>Sign-ups (count) across the period</CardDescription></div><Badge tone="neutral">{period}</Badge></CardHeader>
                  <CardContent><LineChart points={enrollment.dailyTrend.map((p) => ({ label: p.label, value: p.count }))} color="#3b82f6" tipFormat={countShort} axisFormat={countShort} unit="New enrollments (count)" label="Enrollment trend" /></CardContent>
                </Card>

                <Card data-motion="reveal" className="overflow-hidden">
                  <CardHeader><div><CardTitle>Scheme Summary</CardTitle><CardDescription>Active enrollments and collections per scheme</CardDescription></div></CardHeader>
                  <CardContent className="overflow-x-auto px-0 pb-0"><SchemeTable rows={schemes} /></CardContent>
                </Card>
              </>
            ) : (
              <>
                <AIInsight insight={schemeInsight(enrollment, schemes)} />

                <Card data-motion="reveal">
                  <CardHeader><div><CardTitle>Enrollment Momentum</CardTitle><CardDescription>Direction of new sign-ups (count)</CardDescription></div></CardHeader>
                  <CardContent><LineChart points={enrollment.dailyTrend.map((p) => ({ label: p.label, value: p.count }))} color="#3b82f6" tipFormat={countShort} axisFormat={countShort} unit="New enrollments (count)" label="Enrollment momentum" /></CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-motion="reveal">
                  <MetricCard icon="growth" title="Retention" tone={enrollment.retentionRatePercent != null && enrollment.retentionRatePercent >= 70 ? "success" : "neutral"}
                    value={enrollment.retentionRatePercent != null ? `${enrollment.retentionRatePercent.toFixed(1)}%` : "—"} note={enrollment.cancelledCount > 0 ? `${enrollment.cancelledCount} cancelled in range` : "No cancellations in range"} />
                  <MetricCard icon="ticket" title="Pipeline" tone="info"
                    value={`${enrollment.newEnrollmentsInRange} new`} note={`${enrollment.activeCount} active · ${enrollment.completedCount} completed`} />
                  <MetricCard icon="growth" title="Top Scheme" tone="neutral"
                    value={topScheme(schemes)?.schemeName || "—"} note={topScheme(schemes) ? `${topScheme(schemes).activeEnrollments} active · ${inr(topScheme(schemes).totalCollected)}` : "No collections in range"} />
                </div>

                <Card data-motion="reveal" className="overflow-hidden">
                  <CardHeader><div><CardTitle>Top Enrolling Schemes</CardTitle><CardDescription>Ranked by collections (₹) in the period</CardDescription></div></CardHeader>
                  <CardContent className="overflow-x-auto px-0 pb-0"><SchemeTable rows={[...schemes].sort((a, b) => b.totalCollected - a.totalCollected)} /></CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </StateBlock>
    </div>
  );
}

/* ── Deterministic insight builders — real numbers, selective emphasis.
 * Return { headline, support, attention|null, action }. Attention is omitted
 * entirely when nothing genuinely needs it (clarity over density). ─────────── */
function b(x) { return <span className="font-bold text-ink">{x}</span>; }

function businessInsight(p) {
  const g = p.totalRevenueGrowthPercent;
  const noActivity = p.successPaymentCount <= 0 && Number(p.totalRevenue) <= 0;
  // Only compare periods when the % is real AND there is current activity, so
  // "down -100%" against an empty period is never shown.
  const showPct = !noActivity && g != null && Number.isFinite(g) && p.successPaymentCount > 0;
  const dir = g > 0 ? "up" : "down";
  const pctAbs = showPct ? `${Math.abs(g).toFixed(1)}%` : null;

  let headline;
  if (noActivity) headline = "No collections have been recorded this period.";
  else if (showPct && g > 0.5) headline = "Your collections are improving this period.";
  else if (showPct && g < -0.5) headline = "Collections are lower than the previous period.";
  else headline = "Your collections are performing steadily this period.";

  const support = noActivity ? (
    <>There are currently {b("0")} successful payments and {b("₹0")} in recorded revenue.</>
  ) : (
    <>Revenue is {b(inr(p.totalRevenue))} from {b(p.successPaymentCount)} successful payment{p.successPaymentCount === 1 ? "" : "s"}
      {pctAbs ? <>, {dir} {b(pctAbs)} compared with the previous period.</> : "."}</>
  );

  const needAttention = p.outstandingDues > 0 || p.pendingPaymentCount > 0;
  const attention = needAttention ? {
    lines: [
      ...(p.outstandingDues > 0 ? [<>{inr(p.outstandingDues)} outstanding</>] : []),
      ...(p.pendingPaymentCount > 0 ? [<>{p.pendingPaymentCount} payment{p.pendingPaymentCount === 1 ? "" : "s"} pending</>] : []),
    ],
    note: "These pending payments should be followed up to improve cash flow.",
  } : null;

  let action;
  if (noActivity) action = "Review recent sales activity to understand why no collections were recorded this period.";
  else if (p.pendingPaymentCount > 0) action = `Follow up on the ${p.pendingPaymentCount} pending payment${p.pendingPaymentCount === 1 ? "" : "s"} to improve collections.`;
  else if (p.outstandingDues > 0) action = `Prioritise follow-up on the ${inr(p.outstandingDues)} outstanding dues.`;
  else action = "Continue monitoring collections and customer payment activity.";

  return { headline, support, attention, action };
}

function schemeInsight(en, schemes) {
  const lead = topScheme(schemes);
  const ret = en.retentionRatePercent;
  const noActivity = en.newEnrollmentsInRange <= 0 && en.activeCount <= 0 && en.completedCount <= 0;

  let headline;
  if (noActivity) headline = "No scheme activity has been recorded this period.";
  else if (en.newEnrollmentsInRange > 0) headline = "Your schemes are attracting new enrollments this period.";
  else headline = "No new scheme enrollments were recorded this period.";

  const support = noActivity ? (
    <>There are currently {b("0")} active enrollments and {b("0")} new sign-ups.</>
  ) : (
    <>{b(en.newEnrollmentsInRange)} new enrollment{en.newEnrollmentsInRange === 1 ? "" : "s"}, with {b(en.activeCount)} active overall
      {ret != null ? <> and {b(`${ret.toFixed(1)}%`)} retention.</> : "."}
      {lead ? <> {b(lead.schemeName)} leads collections at {b(inr(lead.totalCollected))}.</> : null}</>
  );

  const lowRet = ret != null && ret < 70;
  const needAttention = !noActivity && (en.cancelledCount > 0 || lowRet);
  const attention = needAttention ? {
    lines: [
      ...(en.cancelledCount > 0 ? [<>{en.cancelledCount} cancelled</>] : []),
      ...(lowRet ? [<>{ret.toFixed(1)}% retention</>] : []),
    ],
    note: "Enrollments are at risk of lapsing — reach out before they drop off.",
  } : null;

  let action;
  if (noActivity) action = "Review scheme setup and outreach to understand why no enrollments were recorded this period.";
  else if (needAttention) action = "Send reminders to at-risk customers to keep their enrollments active.";
  else if (lead) action = `Promote ${lead.schemeName} to sustain enrollment growth.`;
  else action = "Continue monitoring enrollments and scheme collections.";

  return { headline, support, attention, action };
}

function topScheme(schemes) {
  if (!schemes?.length) return null;
  return [...schemes].sort((a, b) => b.totalCollected - a.totalCollected)[0];
}

/* ── Upcoming birthdays from real customer DOB ────────────────────────────── */
function upcomingBirthdays(custs) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  for (const c of custs || []) {
    if (!c.dob) continue;
    const d = new Date(c.dob);
    if (isNaN(d)) continue;
    let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
    const days = Math.round((next - today) / 86400000);
    if (days > 45) continue;
    out.push({ name: c.name, code: c.code, phone: c.phone, days, turning: next.getFullYear() - d.getFullYear(),
      date: next.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) });
  }
  return out.sort((a, b) => a.days - b.days).slice(0, 6);
}

function BirthdayCard({ data }) {
  return (
    <Card data-motion="reveal" className="overflow-hidden">
      <CardHeader><div><CardTitle>Upcoming Birthdays</CardTitle><CardDescription>Next 45 days — a reason to reach out</CardDescription></div><span className="text-lg">🎂</span></CardHeader>
      <CardContent className="px-0 pb-0">
        {data == null ? (
          <div className="px-6 py-8 text-center text-sm font-semibold text-muted">Loading…</div>
        ) : data.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm font-semibold text-muted">No birthdays in the next 45 days</div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-6 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong">{(c.name || "?").trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{c.name || "—"}</div>
                  <div className="truncate text-xs text-muted">{c.code || "—"}{c.phone && c.phone !== "—" ? ` · ${c.phone}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-ink">{c.date}</div>
                  <div className="text-[11px] font-semibold text-muted">{c.days === 0 ? "Today" : c.days === 1 ? "Tomorrow" : `in ${c.days} days`}{c.turning ? ` · turns ${c.turning}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Insight metric card with icon + hierarchy ────────────────────────────── */
function MetricIcon({ kind }) {
  const common = { className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" };
  if (kind === "risk") return <svg viewBox="0 0 24 24" {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
  if (kind === "ticket") return <svg viewBox="0 0 24 24" {...common}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
}

function MetricCard({ icon, title, value, note, tone }) {
  const toneCls = tone === "danger" ? "text-danger" : tone === "success" ? "text-emerald-700" : tone === "info" ? "text-info" : "text-ink";
  const iconBg = tone === "danger" ? "bg-danger-soft text-danger" : tone === "success" ? "bg-emerald-50 text-emerald-700" : tone === "info" ? "bg-info/10 text-info" : "bg-accent-soft text-accent-strong";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{title}</div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconBg}`}><MetricIcon kind={icon} /></span>
      </div>
      <div className={`mt-2 text-xl font-extrabold ${toneCls}`}>{value}</div>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </Card>
  );
}

function TopCustomersTable({ rows, compact }) {
  if (!rows?.length) return <div className="px-6 py-10 text-center text-sm font-semibold text-muted">No customer activity in this period</div>;
  return (
    <table className={`w-full ${compact ? "min-w-[520px]" : "min-w-[720px]"} border-collapse text-sm`}>
      <thead><tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-6 py-3">#</th><th className="py-3">Customer</th><th className="py-3">Scheme</th><th className="py-3 text-right">Invested</th>{!compact && <th className="py-3 text-right">Gold (g)</th>}<th className="py-3">Status</th></tr></thead>
      <tbody>
        {rows.map((c, i) => (
          <tr key={i} className="border-b border-line-soft last:border-0 hover:bg-canvas/60">
            <td className="px-6 py-3 font-bold">#{i + 1}</td>
            <td className="py-3 font-bold">{c.customerName || "—"}</td>
            <td className="py-3">{c.schemeName || "—"}</td>
            <td className="num py-3 text-right font-bold">{inr(c.totalInvested)}</td>
            {!compact && <td className="num py-3 text-right">{Number(c.goldWeightGrams || 0).toFixed(2)}</td>}
            <td className="py-3"><Badge tone={c.status === "ACTIVE" ? "info" : c.status === "COMPLETED" ? "success" : "neutral"} dot>{c.status || "—"}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SchemeTable({ rows }) {
  if (!rows?.length) return <div className="px-6 py-10 text-center text-sm font-semibold text-muted">No scheme data in this period</div>;
  return (
    <table className="w-full min-w-[640px] border-collapse text-sm">
      <thead><tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-6 py-3">Scheme</th><th className="py-3">Status</th><th className="py-3 text-right">Active Enrollments</th><th className="py-3 text-right">Collected</th></tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={i} className="border-b border-line-soft last:border-0 hover:bg-canvas/60">
            <td className="px-6 py-3 font-bold">{s.schemeName || "—"}</td>
            <td className="py-3"><Badge tone={s.isActive ? "success" : "neutral"} dot>{s.isActive ? "Active" : "Inactive"}</Badge></td>
            <td className="num py-3 text-right font-bold">{s.activeEnrollments}</td>
            <td className="num py-3 text-right font-bold">{inr(s.totalCollected)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
