import { useState, useRef, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  const g = gsap?.default || gsap;
  const st = ScrollTrigger?.default || ScrollTrigger;
  if (g?.registerPlugin && st) { try { g.registerPlugin(st); } catch {} }
}
const _gsap = gsap?.default || gsap;

const PERIODS = ["Today", "This Week", "This Month", "Last Month", "This Year", "Custom"];
const TOP_CUSTOMERS = [
  { rank: 1, name: "Uma Subramanian", scheme: "Diamond Dream Plan", invested: 240000, gold: 32.5, status: "Active" },
  { rank: 2, name: "Vijay Natarajan", scheme: "Gold Flexi Saver", invested: 125000, gold: 17.2, status: "Completed" },
  { rank: 3, name: "Anitha Pillai", scheme: "Swarna Nidhi 11+1", invested: 110000, gold: 15.1, status: "Active" },
  { rank: 4, name: "Rajesh Krishnan", scheme: "Gold Flexi Saver", invested: 98000, gold: 13.4, status: "Active" },
  { rank: 5, name: "Latha Nair", scheme: "Gold Flexi Saver", invested: 85000, gold: 11.8, status: "Overdue" },
];
const TOP_PRODUCTS = [
  { product: "Gold Necklace Set", units: 12, revenue: 1500000, goldWt: 180, profit: 220000 },
  { product: "Diamond Bangle", units: 8, revenue: 680000, goldWt: 85, profit: 120000 },
  { product: "Pearl Pendant", units: 15, revenue: 675000, goldWt: 0, profit: 95000 },
  { product: "22K Gold Ring", units: 20, revenue: 500000, goldWt: 120, profit: 80000 },
];

const REVENUE_MAP = {
  Today: [0.22, 0.32, 0.45, 0.52, 0.61, 0.78, 0.88],
  "This Week": [0.18, 0.28, 0.38, 0.5, 0.62, 0.75, 0.9],
  "This Month": [0.3, 0.42, 0.48, 0.58, 0.68, 0.8, 0.88],
  "Last Month": [0.25, 0.35, 0.4, 0.55, 0.65, 0.72, 0.82],
  "This Year": [0.15, 0.28, 0.38, 0.55, 0.7, 0.82, 0.92],
  Custom: [0.2, 0.3, 0.44, 0.6, 0.66, 0.78, 0.85],
};

function RevenueChart({ period }) {
  const wrapRef = useRef(null);
  const pathRef = useRef(null);
  const areaRef = useRef(null);
  const [hover, setHover] = useState(null);
  const vals = REVENUE_MAP[period] || REVENUE_MAP["This Month"];
  const W = 560, H = 200, P = 24;
  const points = vals.map((v, i) => {
    const x = P + (W - P * 2) * (i / (vals.length - 1));
    const y = H - P - v * (H - P * 2 - 20);
    return { x, y, v };
  });
  const lineD = points.reduce((d, p, i) => d + (i === 0 ? `M${p.x},${p.y}` : ` C${points[i - 1].x + 40},${points[i - 1].y} ${p.x - 40},${p.y} ${p.x},${p.y}`), "");
  const areaD = lineD + ` L${points[points.length - 1].x},${H - P} L${points[0].x},${H - P} Z`;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = _gsap.context(() => {
      if (pathRef.current) {
        const len = pathRef.current.getTotalLength();
        _gsap.set(pathRef.current, { strokeDasharray: len, strokeDashoffset: len });
        _gsap.to(pathRef.current, { strokeDashoffset: 0, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: wrapRef.current, start: "top 85%" } });
      }
      if (areaRef.current) _gsap.fromTo(areaRef.current, { opacity: 0 }, { opacity: 1, duration: 1, delay: 0.3, scrollTrigger: { trigger: wrapRef.current, start: "top 85%" } });
      _gsap.from(".rev-dot", { scale: 0, duration: 0.4, stagger: 0.06, ease: "back.out(1.7)", delay: 0.6, scrollTrigger: { trigger: wrapRef.current, start: "top 85%" } });
    }, wrapRef);
    return () => ctx.revert();
  }, [period]);

  const handleMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scale = rect.width / W;
    const raw = _gsap.utils.mapRange(P * scale, (W - P) * scale, 0, points.length - 1, x);
    const idx = _gsap.utils.clamp(0, points.length - 1, Math.round(raw));
    setHover(idx);
  };

  return (
    <div ref={wrapRef} className="relative" onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" preserveAspectRatio="none" role="img" aria-label={`Revenue trend for ${period}`}>
        <defs>
          <linearGradient id="revArea2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9a84c" stopOpacity="0.22" /><stop offset="100%" stopColor="#c9a84c" stopOpacity="0" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="c" /><feMerge><feMergeNode in="c" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g stroke="#eae5dc" strokeWidth="1" opacity="0.9"><line x1={P} y1="40" x2={W - P} y2="40" /><line x1={P} y1="100" x2={W - P} y2="100" /><line x1={P} y1={H - P} x2={W - P} y2={H - P} /></g>
        <text x={P} y="18" fontSize="10" fill="#8b7d6b" fontWeight="700">₹</text>
        <path d={areaD} ref={areaRef} fill="url(#revArea2)" />
        <path d={lineD} ref={pathRef} fill="none" stroke="#c9a84c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
        {points.map((p, i) => (
          <g key={i} className="rev-dot">
            <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill={hover === i ? "#a68631" : "#c9a84c"} stroke="white" strokeWidth="2" className="transition-all duration-150" />
          </g>
        ))}
        {hover !== null && <line x1={points[hover].x} y1={P} x2={points[hover].x} y2={H - P} stroke="#c9a84c" strokeDasharray="4 4" opacity="0.4" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold shadow-xl" style={{ left: `${(points[hover].x / W) * 100}%`, top: 8 }}>
          <div className="text-muted">₹{Math.round(_gsap.utils.interpolate(40000, 280000, vals[hover])).toLocaleString()}</div>
          <div className="text-[11px] text-faint">{period} · P{hover + 1}</div>
        </div>
      )}
      <div className="mt-1 flex justify-between px-6 text-[11px] font-semibold text-faint"><span>{period === "Today" ? "9am" : period === "This Week" ? "Mon" : "W1"}</span><span>{period === "Today" ? "6pm" : "Now"}</span></div>
    </div>
  );
}

function EnrollmentChart() {
  const wrapRef = useRef(null);
  const active = [0.1, 0.22, 0.32, 0.45, 0.52, 0.68, 0.82];
  const completed = [0.05, 0.12, 0.2, 0.28, 0.35, 0.42, 0.48];
  const cancelled = [0.02, 0.04, 0.06, 0.08, 0.09, 0.11, 0.13];
  const retention = [0.08, 0.15, 0.22, 0.3, 0.38, 0.46, 0.55];
  const W = 560, H = 200, P = 24;
  const mkPoints = (arr) => arr.map((v, i) => ({ x: P + (W - P * 2) * (i / (arr.length - 1)), y: H - P - v * (H - P * 2 - 20), v }));
  const mkD = (pts) => pts.reduce((d, p, i) => d + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`), "");
  const series = [
    { key: "Active", color: "#3b82f6", vals: active },
    { key: "Completed", color: "#10b981", vals: completed },
    { key: "Cancelled", color: "#b91c1c", vals: cancelled },
    { key: "Retention", color: "#f59e0b", vals: retention },
  ];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = _gsap.context(() => {
      _gsap.from(".en-line", { strokeDasharray: (i, el) => el.getTotalLength(), strokeDashoffset: (i, el) => el.getTotalLength(), duration: 1, stagger: 0.12, ease: "power2.out", scrollTrigger: { trigger: wrapRef.current, start: "top 85%" } });
      _gsap.from(".en-dot", { scale: 0, duration: 0.3, stagger: 0.04, delay: 0.5 });
    }, wrapRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={wrapRef}>
      <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold">
        {series.map(s => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.key}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" preserveAspectRatio="none" role="img" aria-label="Enrollment analytics">
        <g stroke="#eae5dc"><line x1={P} y1="40" x2={W - P} y2="40" /><line x1={P} y1="100" x2={W - P} y2="100" /><line x1={P} y1={H - P} x2={W - P} y2={H - P} /></g>
        {series.map(s => {
          const pts = mkPoints(s.vals);
          return <path key={s.key} d={mkD(pts)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" className="en-line" />;
        })}
        {series[0].vals.map((_, i) => {
          const pt = mkPoints(active)[i];
          return <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="#3b82f6" stroke="white" strokeWidth="1.5" className="en-dot" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between px-6 text-[11px] font-semibold text-faint"><span>Week 1</span><span>Now</span></div>
    </div>
  );
}

export default function ReportsAnalytics() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);
  const [period, setPeriod] = useState("This Month");
  const [custom, setCustom] = useState(false);
  const [metric, setMetric] = useState("Revenue");
  const [start, setStart] = useState("2026-08-01");
  const [end, setEnd] = useState("2026-08-25");

  const summary = useMemo(() => {
    if (period === "Today") return { revenue: 125000, enrollments: 3, dues: 45000, passbooks: 42 };
    if (period === "This Week") return { revenue: 850000, enrollments: 12, dues: 180000, passbooks: 45 };
    if (period === "Last Month") return { revenue: 3200000, enrollments: 38, dues: 520000, passbooks: 41 };
    if (period === "This Year") return { revenue: 18500000, enrollments: 210, dues: 2514000, passbooks: 45 };
    return { revenue: 2400000, enrollments: 28, dues: 320000, passbooks: 45 };
  }, [period]);

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Reports & Analytics</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">Revenue, collections, enrollment analytics and top-customer reporting — all for the selected period.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast("Excel exported")}>Excel</Button>
          <Button variant="outline" size="sm" disabled>Export PDF (Soon)</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        {PERIODS.map(p => (
          <button key={p} onClick={() => { setPeriod(p); setCustom(p === "Custom"); }} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${period === p ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{p}</button>
        ))}
        <span className="ml-2 text-xs font-semibold text-muted">Selected: <span className="font-bold text-ink">{period}{custom ? " — Custom range" : ""}</span></span>
      </div>
      {custom && (
        <Card className="mb-4 p-4 flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs font-bold">Start<input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
          <label className="grid gap-1 text-xs font-bold">End<input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
          <Button size="sm" className="self-end" onClick={() => toast(`Custom period ${start} → ${end}`)}>Apply</Button>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-motion="stat">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Revenue</div><div className="num mt-1 text-2xl font-extrabold">₹{summary.revenue.toLocaleString()}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">New Enrollments</div><div className="num mt-1 text-2xl font-extrabold text-info">{summary.enrollments}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Outstanding Dues</div><div className="num mt-1 text-2xl font-extrabold text-danger">₹{summary.dues.toLocaleString()}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Active Passbooks</div><div className="num mt-1 text-2xl font-extrabold">{summary.passbooks}</div></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-motion="reveal">
          <CardHeader>
            <div><CardTitle>Revenue & Scheme Collections Trend</CardTitle><CardDescription>Performance across the selected period — {period}</CardDescription></div>
            <Badge tone="neutral">{period}</Badge>
          </CardHeader>
          <CardContent>
            <RevenueChart period={period} />
          </CardContent>
        </Card>

        <Card data-motion="reveal">
          <CardHeader>
            <div><CardTitle>Enrollment Analytics</CardTitle><CardDescription>New enrollments over time — Status mix</CardDescription></div>
          </CardHeader>
          <CardContent>
            <EnrollmentChart />
          </CardContent>
        </Card>
      </div>

      <Card data-motion="reveal" className="mt-4 overflow-hidden">
        <CardHeader>
          <div><CardTitle>Top High-Value Scheme Customers</CardTitle><CardDescription>Highest total gold accumulated and installment consistency</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => toast("Table exported")}>Export Table</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead><tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-6 py-3">Rank</th><th className="py-3">Customer Name</th><th className="py-3">Primary Scheme</th><th className="py-3">Total Invested</th><th className="py-3">Accumulated Gold</th><th className="py-3">Status</th></tr></thead>
            <tbody>
              {TOP_CUSTOMERS.map(c => (
                <tr key={c.rank} className="border-b border-line-soft last:border-0 hover:bg-canvas/60">
                  <td className="px-6 py-3 font-bold">#{c.rank}</td>
                  <td className="py-3 font-bold">{c.name}</td>
                  <td className="py-3">{c.scheme}</td>
                  <td className="num py-3 font-bold">₹{c.invested.toLocaleString()}</td>
                  <td className="num py-3">{c.gold} g</td>
                  <td className="py-3"><Badge tone={c.status === "Active" ? "info" : c.status === "Completed" ? "success" : "danger"} dot>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card data-motion="reveal" className="mt-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-bold">Top Products</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-bold">Start date<input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
            <label className="grid gap-1 text-xs font-bold">End date<input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm" /></label>
            <Button size="sm" onClick={() => toast(`Products ${start} → ${end}`)}>Apply</Button>
            <Button size="sm" variant="outline" onClick={() => toast("CSV exported")}>CSV Export</Button>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {["Revenue","Quantity","Gold Weight","Profit"].map(t => (
            <button key={t} onClick={() => setMetric(t)} className={`rounded-full border px-3 py-1 text-xs font-bold ${metric === t ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead><tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2">Product</th><th className="py-2">Units</th><th className="py-2">Revenue</th><th className="py-2">Gold Wt (g)</th><th className="py-2">Profit</th></tr></thead>
            <tbody>
              {TOP_PRODUCTS.map(p => (
                <tr key={p.product} className="border-b border-line-soft last:border-0 hover:bg-canvas/60">
                  <td className="px-4 py-3 font-bold">{p.product}</td>
                  <td className="py-3">{metric === "Quantity" ? <span className="font-extrabold text-info">{p.units}</span> : p.units}</td>
                  <td className="py-3">{metric === "Revenue" ? <span className="font-extrabold text-accent-strong">₹{p.revenue.toLocaleString()}</span> : `₹${p.revenue.toLocaleString()}`}</td>
                  <td className="py-3">{metric === "Gold Weight" ? <span className="font-extrabold">{p.goldWt}</span> : p.goldWt}</td>
                  <td className="py-3">{metric === "Profit" ? <span className="font-extrabold text-emerald-700">₹{p.profit.toLocaleString()}</span> : `₹${p.profit.toLocaleString()}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
