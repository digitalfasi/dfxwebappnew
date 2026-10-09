"use client";
import { useEffect, useRef, useState } from "react";
import { saService, fmtDate, inr, seenAt } from "@/modules/superadmin/saService";
import { Card, Pill, Icon, Empty, Skel, PageHead, usePoll, scrollToId } from "@/modules/superadmin/saUi";
import { openShop, QUIET_DAYS } from "@/modules/superadmin/decisions";

// The platform owner's view: money moving through DFX, which shops pay,
// which need a decision. Every figure comes from the backend.
const RANGES = [
  { k: "today", label: "Today" },
  { k: "this_week", label: "This week" },
  { k: "this_month", label: "This month" },
  { k: "this_year", label: "This year" },
];
const ACCESS_TONE = { PAID: "live", TRIAL: "sky", EXPIRED: "bad", OFF: "mute" };
const ACCESS_WORD = { PAID: "Paid", TRIAL: "Trial", EXPIRED: "Expired", OFF: "Switched off" };
const C = { bill: "#0F5E4C", scheme: "#E3A15C", cust: "#8B7BE0", shop: "#6F9BE0", inactive: "#B9C2BF" };

// Indian money, short: ₹4.86 L, ₹3.97 Cr. The full figure is in the tooltip.
export function inrShort(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr(v);
}
const longDate = (iso) => (iso ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "");

function Trend({ cur, prev, label }) {
  if (prev == null) return null;
  let cls = "flat", text = "No change";
  if (!prev && cur) { cls = "up"; text = "New"; }
  else if (prev) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct > 0) { cls = "up"; text = `↑ ${pct}%`; } else if (pct < 0) { cls = "down"; text = `↓ ${Math.abs(pct)}%`; }
  }
  return <div className="trend"><span className={`db-tp ${cls}`}>{text}</span><span>{label}</span></div>;
}

// Tiny bar series for a KPI card: the most recent buckets, one colour.
function SparkBars({ values, color, title }) {
  const v = values.slice(-6);
  const max = Math.max(1, ...v);
  return (
    <svg className="spark" width="46" height="40" viewBox="0 0 46 40" role="img" aria-label={title}>
      <title>{title}</title>
      {v.map((x, i) => {
        const h = Math.max(3, (x / max) * 38);
        return <rect key={i} x={i * 8} y={40 - h} width="5" height={h} rx="1.5" fill={color} opacity={0.35 + (0.65 * (i + 1)) / v.length} />;
      })}
    </svg>
  );
}

// Small line chart for the bottom cards.
function SparkLine({ values, color, title }) {
  const W = 120, H = 52, p = 4;
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((x, i) => [p + (i * (W - 2 * p)) / (values.length - 1), H - p - (x / max) * (H - 2 * p)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ flex: "none" }}>
      <title>{title}</title>
      <path d={`${d} L${last[0]},${H - p} L${pts[0][0]},${H - p} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
    </svg>
  );
}

export default function Dashboard({ decisions = [], shopsPoll, live }) {
  const [range, setRange] = useState("this_month");
  const [custom, setCustom] = useState(null);
  const [picker, setPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(null);
  const dash = usePoll(() => saService.dashboard(custom ? { date_from: custom.from, date_to: custom.to } : range),
    [range, custom?.from, custom?.to], { live: false });
  const d = dash.data;
  const shops = shopsPoll?.data || [];
  const seen = Object.fromEntries((live?.tenants || []).map((t) => [t.id, t]));
  const perf = d?.shop_performance || [];
  const perfById = Object.fromEntries(perf.map((s) => [s.tenant_id, s]));
  const platformTotal = perf.reduce((n, s) => n + s.sales_amount + s.scheme_amount, 0);
  const trend = d?.sales_trend || [];
  const prev = d?.previous;
  const cmp = d?.compare_label;
  const count = (k) => shops.filter((t) => (k === "INACTIVE" ? t.access === "EXPIRED" || t.access === "OFF" : t.access === k)).length;
  const rangeName = custom ? "Custom range" : RANGES.find((r) => r.k === range)?.label;

  const exportNow = async () => {
    setExporting(true); setExportErr(null);
    try { await saService.exportDashboard(range); } catch (e) { setExportErr(e?.message || "Could not create the file."); }
    finally { setExporting(false); }
  };

  return (
    <div className="sa-grid" style={{ gap: 18 }}>
      <PageHead eyebrow="Superadmin" title="Dashboard"
        sub="Overview of money collected, shops activity, customers and items that need your attention."
        actions={<>
          <RangePicker d={d} open={picker} setOpen={setPicker} custom={custom}
            onApply={(from, to) => { setCustom({ from, to }); setPicker(false); }}
            onClear={() => { setCustom(null); setPicker(false); }} />
          <button className="sa-btn" onClick={exportNow} disabled={exporting || !!custom}
            title={custom ? "Export follows Today / This week / This month / This year" : undefined}>
            <Icon name="download" size={16} />{exporting ? "Preparing…" : "Export summary (Excel)"}
          </button>
        </>} />

      <div className="sa-seg db-period" role="tablist" aria-label="Period" style={{ marginTop: -6 }}>
        {RANGES.map((r) => (
          <button key={r.k} role="tab" aria-selected={!custom && range === r.k} onClick={() => { setCustom(null); setRange(r.k); }}>{r.label}</button>
        ))}
      </div>
      {exportErr && <div className="sa-alert bad" role="alert"><Icon name="alert" />{exportErr}</div>}
      {dash.error && <div className="sa-alert bad" role="alert"><Icon name="alert" />{dash.error}</div>}

      <div className="db-kpis">
        <div className="db-kpi k-bill">
          <span className="ic"><Icon name="wallet" size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl">Billed in shops</div>
            <div className="val" title={d ? inr(d.sales_amount) : undefined}>{d ? inrShort(d.sales_amount) : <Skel h={30} w={110} />}</div>
            {d && <Trend cur={d.sales_amount} prev={prev?.sales_amount} label={cmp} />}
            {d && <div className="sub">{d.sales_count.toLocaleString("en-IN")} bill{d.sales_count === 1 ? "" : "s"}{d.sales_count ? <> · avg <b>{inrShort(d.sales_amount / d.sales_count)}</b></> : null}</div>}
          </div>
          {d && <SparkBars values={trend.map((p) => p.sales_amount)} color={C.bill} title="Billed, latest days" />}
        </div>
        <div className="db-kpi k-scheme">
          <span className="ic"><Icon name="coins" size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl">Scheme money</div>
            <div className="val" title={d ? inr(d.scheme_amount) : undefined}>{d ? inrShort(d.scheme_amount) : <Skel h={30} w={110} />}</div>
            {d && <Trend cur={d.scheme_amount} prev={prev?.scheme_amount} label={cmp} />}
            {d && <div className="sub">instalments collected into gold schemes</div>}
          </div>
          {d && <SparkBars values={trend.map((p) => p.scheme_amount)} color={C.scheme} title="Scheme money, latest days" />}
        </div>
        <div className="db-kpi k-cust">
          <span className="ic"><Icon name="users" size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl">New customers</div>
            <div className="val">{d ? d.new_customers.toLocaleString("en-IN") : <Skel h={30} w={60} />}</div>
            {d && <Trend cur={d.new_customers} prev={prev?.new_customers} label={cmp} />}
            {d && <div className="sub">{d.total_customers.toLocaleString("en-IN")} customers on DFX in total</div>}
          </div>
          {d && <SparkBars values={trend.map((p) => p.new_customers)} color={C.cust} title="New customers, latest days" />}
        </div>
        <div className="db-kpi k-shop" role="link" tabIndex={0} style={{ cursor: "pointer" }} title="Open paying shops"
          onClick={() => { window.location.hash = "#/control/shops?filter=PAID"; }}
          onKeyDown={(e) => { if (e.key === "Enter") window.location.hash = "#/control/shops?filter=PAID"; }}>
          <span className="ic"><Icon name="store" size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl">Paying shops</div>
            <div className="val">{shopsPoll?.data ? count("PAID") : <Skel h={30} w={40} />}</div>
            {/* No history of plans is kept, so there is no honest "vs last month" here. */}
            {shopsPoll?.data && <div className="sub">of {shops.length} shops · {count("TRIAL")} on trial</div>}
          </div>
          {shopsPoll?.data && <SparkBars values={[count("OFF"), count("EXPIRED"), count("TRIAL"), count("PAID")]} color={C.shop}
            title={`Switched off ${count("OFF")}, expired ${count("EXPIRED")}, trial ${count("TRIAL")}, paying ${count("PAID")}`} />}
        </div>
      </div>

      <div className="db-main">
        <div className="sa-card">
          <div className="db-chart-h">
            <h3><span className="ic"><Icon name="chart" size={20} /></span><span>Money through DFX<small>Billed amount and scheme money across all shops</small></span></h3>
            <span className="db-chip"><Icon name="calendar" size={15} style={{ color: "var(--muted)" }} />{rangeName} · All shops</span>
          </div>
          <div className="db-chart">
            <div className="sa-legend" style={{ marginBottom: 6 }}>
              <span><i style={{ background: C.bill }} />Billed</span>
              <span><i style={{ background: C.scheme }} />Scheme money</span>
            </div>
            {!d ? <Skel h={240} /> : <MoneyChart points={trend} />}
          </div>
        </div>
        <div className="sa-card">
          <div className="db-dec-h">
            <h3><span className="ic"><Icon name="bell" size={18} /></span>Needs your decision</h3>
            {decisions.length > 0 && <span className="db-badge">{decisions.length} pending</span>}
          </div>
          {!shopsPoll?.data ? <div className="sa-card-b"><Skel h={220} /></div>
            : !decisions.length ? <Empty title="Nothing waiting">No trial is ending and no shop has gone quiet.</Empty>
            : (
              <div className="db-dec">
                {decisions.map((r) => (
                  <button key={r.t.id} onClick={() => openShop(r.t.id)}>
                    <span className={`ring${r.tone === "warn" ? " warn" : ""}`}><Icon name={r.rank <= 1 ? "clock" : "alert"} size={16} /></span>
                    <div style={{ minWidth: 0 }}><b>{r.t.name}</b> <span className="what">{r.what}</span><span className="why">{r.why}</span></div>
                    <Icon name="arrow" size={16} className="go" />
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="db-row3">
        <ShopsOverview shops={shops} loaded={!!shopsPoll?.data} count={count} />
        <div className="sa-card">
          <div className="db-card-h">
            <h3><span className="ic"><Icon name="users" size={18} /></span>New customers</h3>
            <button className="db-view" onClick={() => { window.location.hash = "#/control/monitor/people?role=Customer"; }}>View all <Icon name="arrow" size={14} /></button>
          </div>
          <div className="db-card-b">
            {!d ? <Skel h={70} /> : (
              <div className="db-mini">
                <div className="db-kpi" style={{ all: "unset", display: "block" }}>
                  <div className="num">{d.new_customers.toLocaleString("en-IN")}</div>
                  <Trend cur={d.new_customers} prev={prev?.new_customers} label={cmp} />
                </div>
                <SparkLine values={trend.map((p) => p.new_customers)} color={C.bill} title="New customers per day" />
              </div>
            )}
          </div>
        </div>
        <div className="sa-card">
          <div className="db-card-h">
            <h3><span className="ic amber"><Icon name="coins" size={18} /></span>Collection status</h3>
            <button className="db-view" onClick={() => scrollToId("db-league")}>View details <Icon name="arrow" size={14} /></button>
          </div>
          <div className="db-card-b">
            {!d ? <Skel h={70} /> : (
              <div className="db-mini">
                <div>
                  <div className="num" title={inr(d.scheme_amount)}>{inrShort(d.scheme_amount)}</div>
                  <small>Scheme money collected · {d.scheme_payments_count} instalment{d.scheme_payments_count === 1 ? "" : "s"}</small>
                  {d.scheme_pending_amount > 0 && <small style={{ color: "var(--warn-ink)", marginTop: 2 }}>{inrShort(d.scheme_pending_amount)} paid online, awaiting the bank</small>}
                </div>
                <SparkLine values={trend.map((p) => p.scheme_amount)} color={C.scheme} title="Scheme money per day" />
              </div>
            )}
          </div>
        </div>
      </div>

      <Card id="db-league" title={`Shops by business · ${rangeName.toLowerCase()}`} icon="store" hue="web" pad={false}
        right={<small>bills + scheme money · click a shop to manage it</small>}>
        {!d || !shopsPoll?.data ? <div className="sa-card-b"><Skel h={160} /></div> : (
          <League shops={shops} perfById={perfById} platformTotal={platformTotal} seen={seen} />
        )}
      </Card>
    </div>
  );
}

function RangePicker({ d, open, setOpen, custom, onApply, onClear }) {
  const ref = useRef(null);
  const [from, setFrom] = useState(custom?.from || "");
  const [to, setTo] = useState(custom?.to || "");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  useEffect(() => {
    if (!open) return undefined;
    setFrom(custom?.from || d?.range.date_from || ""); setTo(custom?.to || d?.range.date_to || "");
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = !from || !to || from > to;
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="sa-range" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Choose dates">
        <Icon name="calendar" size={16} style={{ color: "var(--muted)" }} />
        {d ? <>{fmtDate(d.range.date_from)} – {fmtDate(d.range.date_to)} <em>· India time</em></> : "…"}
        <Icon name="chev" size={14} style={{ color: "var(--muted)" }} />
      </button>
      {open && (
        <div className="sa-pop" role="dialog" aria-label="Choose dates" style={{ width: 300 }}>
          <div className="sa-pop-h">Choose dates</div>
          <div style={{ display: "grid", gap: 10, padding: 14 }}>
            <div className="sa-field"><label htmlFor="db-from">From</label><input id="db-from" className="sa-in" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="sa-field"><label htmlFor="db-to">To</label><input id="db-to" className="sa-in" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} /></div>
            {from && to && from > to && <span className="sa-field"><span className="err">The start date is after the end date.</span></span>}
            <div className="sa-row" style={{ justifyContent: "flex-end" }}>
              {custom && <button className="sa-btn ghost sm" onClick={onClear}>Back to this month</button>}
              <button className="sa-btn sm" disabled={bad} onClick={() => onApply(from, to)}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Billed and scheme money per day (per month for a year), on one scale.
function MoneyChart({ points }) {
  const [tip, setTip] = useState(null);
  const wrap = useRef(null);
  if (!points.some((p) => p.sales_amount || p.scheme_amount)) {
    return <Empty title="No money recorded in this period">Bills and scheme instalments appear here as shops record them.</Empty>;
  }
  const monthly = (points[0]?.period_label || "").length > 6;
  const max = Math.max(1, ...points.map((p) => Math.max(p.sales_amount, p.scheme_amount)));
  const W = 760, H = 250, padL = 62, padB = 30, top = 12;
  const bw = (W - padL) / points.length;
  const y = (v) => top + (H - padB - top) * (1 - v / max);
  const every = Math.ceil(points.length / 12);
  const w = Math.max(4, Math.min(28, bw * 0.3));
  const show = (i, el) => {
    const box = wrap.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const p = points[i];
    const barTop = r.top + (r.height * (y(Math.max(p.sales_amount, p.scheme_amount)) - top)) / (H - padB - top);
    if (box) setTip({ i, x: Math.min(Math.max(r.left - box.left + r.width / 2, 90), box.width - 90), y: Math.max(64, barTop - box.top - 8) });
  };
  const tp = tip && points[tip.i];
  return (
    <div ref={wrap} style={{ position: "relative" }} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img"
        aria-label={`Billed and scheme money per ${monthly ? "month" : "day"}. Highest billed ${inrShort(Math.max(...points.map((p) => p.sales_amount)))}.`}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#E8EDEA" strokeDasharray={t ? "4 4" : "0"} />
            <text x={padL - 10} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#66736F">{inrShort(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * bw;
          return (
            <g key={p.date || p.period_label}>
              {i > 0 && <line x1={x} x2={x} y1={top} y2={H - padB} stroke="#F0F3F1" strokeDasharray="4 4" />}
              {tip?.i === i && <rect x={x + 2} y={top} width={bw - 4} height={H - padB - top} rx="6" fill="#F3F6F4" />}
              <rect x={x + bw / 2 - w - 1.5} y={y(p.sales_amount)} width={w} height={H - padB - y(p.sales_amount)} rx="2" fill={C.bill} />
              <rect x={x + bw / 2 + 1.5} y={y(p.scheme_amount)} width={w} height={H - padB - y(p.scheme_amount)} rx="2" fill={C.scheme} />
              {!p.sales_amount && !p.scheme_amount && <rect x={x + bw / 2 - w - 1.5} y={H - padB - 2} width={w * 2 + 3} height="2" rx="1" fill="#DCE3DF" />}
              {(i % every === 0) && <text x={x + bw / 2} y={H - 9} fontSize="11" textAnchor="middle" fill="#66736F">{p.period_label}</text>}
              <rect x={x} y={top} width={bw} height={H - padB - top} fill="transparent" tabIndex={0} style={{ outline: "none" }}
                aria-label={`${p.period_label}: billed ${inr(p.sales_amount)}, scheme money ${inr(p.scheme_amount)}`}
                onMouseEnter={(e) => show(i, e.currentTarget)} onFocus={(e) => show(i, e.currentTarget)} onBlur={() => setTip(null)} />
            </g>
          );
        })}
      </svg>
      {tp && (
        <div className="db-tip" style={{ left: tip.x, top: tip.y }}>
          <b>{!monthly && tp.date ? longDate(tp.date) : tp.period_label}</b>
          <div><span><i style={{ background: C.bill }} />Billed</span><em>{inrShort(tp.sales_amount)}</em></div>
          <div><span><i style={{ background: C.scheme }} />Scheme</span><em>{inrShort(tp.scheme_amount)}</em></div>
          {tp.sales_count > 0 && <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11.5 }}>{tp.sales_count} bill{tp.sales_count === 1 ? "" : "s"}</div>}
        </div>
      )}
    </div>
  );
}

function ShopsOverview({ shops, loaded, count }) {
  const [tab, setTab] = useState("ALL");
  const total = shops.length || 1;
  const parts = [
    { k: "PAID", label: "Paying", n: count("PAID"), color: C.bill },
    { k: "TRIAL", label: "Trial", n: count("TRIAL"), color: C.scheme },
    { k: "INACTIVE", label: "Inactive", n: count("INACTIVE"), color: C.inactive },
  ];
  const names = tab === "ALL" ? [] : shops.filter((t) => (tab === "INACTIVE" ? t.access === "EXPIRED" || t.access === "OFF" : t.access === tab));
  const shopsHash = { PAID: "PAID", TRIAL: "TRIAL", INACTIVE: "EXPIRED" };
  return (
    <div className="sa-card">
      <div className="db-card-h">
        <h3><span className="ic"><Icon name="store" size={18} /></span>Shops overview</h3>
        <div className="sa-seg sm" role="tablist" aria-label="Shops by access">
          {[{ k: "ALL", label: `All (${shops.length})` }, ...parts.map((p) => ({ k: p.k, label: `${p.label} (${p.n})` }))].map((x) => (
            <button key={x.k} role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className="db-card-b">
        {!loaded ? <Skel h={60} /> : (
          <>
            <div className="db-split" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}>
              {parts.map((p) => p.n > 0 && <i key={p.k} title={`${p.label}: ${p.n}`} style={{ width: `${(p.n / total) * 100}%`, background: p.color, opacity: tab === "ALL" || tab === p.k ? 1 : 0.25 }} />)}
            </div>
            {tab === "ALL" ? (
              <div className="db-legend">
                {parts.map((p) => <span key={p.k}><i style={{ background: p.color }} />{p.label}<em>{p.n}</em></span>)}
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {names.slice(0, 6).map((t) => (
                  <button key={t.id} className="sa-btn ghost sm" onClick={() => openShop(t.id)}>{t.name}</button>
                ))}
                {!names.length && <span className="sa-dim" style={{ fontSize: 13 }}>No shops here.</span>}
                {names.length > 6 && <button className="db-view" onClick={() => { window.location.hash = `#/control/shops?filter=${shopsHash[tab]}`; }}>+{names.length - 6} more <Icon name="arrow" size={14} /></button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function League({ shops, perfById, platformTotal, seen }) {
  const rows = shops
    .filter((t) => t.access !== "OFF" || perfById[t.id])
    .map((t) => ({ t, p: perfById[t.id] || { sales_count: 0, sales_amount: 0, scheme_amount: 0, new_customers: 0 } }))
    .sort((a, b) => (b.p.sales_amount + b.p.scheme_amount) - (a.p.sales_amount + a.p.scheme_amount) || a.t.name.localeCompare(b.t.name));
  if (!rows.length) return <Empty title="No shops yet" />;
  return (
    <div className="sa-tbl"><table>
      <thead><tr>
        <th className="r">#</th><th>Shop</th><th>Access</th><th className="r">Bills</th><th className="r">Billed</th>
        <th className="r">Scheme money</th><th className="r">New customers</th><th>Share of DFX</th><th>Owner last seen</th>
      </tr></thead>
      <tbody>{rows.map(({ t, p }, i) => {
        const total = p.sales_amount + p.scheme_amount;
        const share = platformTotal ? Math.round((total / platformTotal) * 100) : 0;
        const s = seen[t.id];
        return (
          <tr key={t.id} className="click" onClick={() => openShop(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openShop(t.id)}>
            <td className="r sa-dim">{total ? i + 1 : "—"}</td>
            <td className="who"><b>{t.name}</b><span>{t.plan || "—"} plan</span></td>
            <td><Pill dot tone={ACCESS_TONE[t.access]}>{ACCESS_WORD[t.access] || "—"}</Pill></td>
            <td className="r">{p.sales_count || <span className="sa-dim">0</span>}</td>
            <td className="r" title={inr(p.sales_amount)}>{p.sales_amount ? <b>{inrShort(p.sales_amount)}</b> : <span className="sa-dim">—</span>}</td>
            <td className="r" title={inr(p.scheme_amount)}>{p.scheme_amount ? inrShort(p.scheme_amount) : <span className="sa-dim">—</span>}</td>
            <td className="r">{p.new_customers || <span className="sa-dim">0</span>}</td>
            <td style={{ minWidth: 140 }}>
              <div className="sa-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <div className="sa-bar" style={{ flex: 1 }}><i style={{ width: `${share}%`, background: C.bill }} /></div>
                <span className="num" style={{ fontSize: 12, minWidth: 34, textAlign: "right" }}>{share}%</span>
              </div>
            </td>
            <td>{s?.last_admin_seen_at
              ? <span style={{ color: s.admin_idle_days >= QUIET_DAYS ? "var(--warn-ink)" : undefined }}>{seenAt(s.last_admin_seen_at)}</span>
              : <span className="sa-dim">Never</span>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
