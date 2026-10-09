"use client";
import { useState } from "react";
import { saService, fmtDate, inr, seenAt } from "@/modules/superadmin/saService";
import { Card, Kpi, Pill, Icon, Empty, Skel, usePoll } from "@/modules/superadmin/saUi";

// The platform owner's view: money moving through DFX, which shops pay,
// which trials need a decision and which shops are going quiet.
const RANGES = [
  { k: "today", label: "Today" },
  { k: "this_week", label: "This week" },
  { k: "this_month", label: "This month" },
  { k: "this_year", label: "This year" },
];
const QUIET_DAYS = 7;
const ACCESS_TONE = { PAID: "live", TRIAL: "sky", EXPIRED: "bad", OFF: "mute" };
const ACCESS_WORD = { PAID: "Paid", TRIAL: "Trial", EXPIRED: "Expired", OFF: "Switched off" };

// Indian money, short: ₹4.86 L, ₹3.97 Cr. The full figure is in the tooltip.
export function inrShort(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr(v);
}

const openShop = (id) => { window.location.hash = `#/control/shops?open=${encodeURIComponent(id)}`; };

export default function Dashboard() {
  const [range, setRange] = useState("this_month");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(null);
  const dash = usePoll(() => saService.dashboard(range), [range], { live: false });
  const list = usePoll(() => saService.tenants(), [], { live: false });
  const ov = usePoll(() => saService.overview(), [], { ms: 60000 });
  const d = dash.data;
  const shops = list.data || [];
  const seen = Object.fromEntries((ov.data?.tenants || []).map((t) => [t.id, t]));
  const rangeWord = RANGES.find((r) => r.k === range)?.label.toLowerCase();

  const paid = shops.filter((t) => t.access === "PAID");
  const trials = shops.filter((t) => t.access === "TRIAL");
  const perf = d?.shop_performance || [];
  const perfById = Object.fromEntries(perf.map((s) => [s.tenant_id, s]));
  const platformTotal = perf.reduce((n, s) => n + s.sales_amount + s.scheme_amount, 0);

  const exportNow = async () => {
    setExporting(true); setExportErr(null);
    try { await saService.exportDashboard(range); } catch (e) { setExportErr(e?.message || "Could not create the file."); }
    finally { setExporting(false); }
  };

  return (
    <div className="sa-grid">
      <div className="sa-filters" style={{ padding: 0, justifyContent: "space-between" }}>
        <div className="sa-seg" role="tablist" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.k} role="tab" aria-selected={range === r.k} onClick={() => setRange(r.k)}>{r.label}</button>
          ))}
        </div>
        <div className="sa-row" style={{ gap: 8 }}>
          {d && <span className="sa-dim" style={{ fontSize: 12.5 }}>{fmtDate(d.range.date_from)} – {fmtDate(d.range.date_to)} · India time</span>}
          <button className="sa-btn ghost sm" onClick={exportNow} disabled={exporting}><Icon name="archive" size={14} />{exporting ? "Preparing…" : "Export summary (Excel)"}</button>
        </div>
      </div>
      {exportErr && <div className="sa-alert bad" role="alert"><Icon name="alert" />{exportErr}</div>}
      {dash.error && <div className="sa-alert bad" role="alert"><Icon name="alert" />{dash.error}</div>}

      <div className="sa-kpis">
        <Kpi icon="check" hue="web" label="Billed in shops" value={d ? inrShort(d.sales_amount) : "—"}
          sub={d ? `${d.sales_count.toLocaleString("en-IN")} bill${d.sales_count === 1 ? "" : "s"}${d.sales_count ? ` · avg ${inrShort(d.sales_amount / d.sales_count)}` : ""}` : ""} />
        <Kpi icon="archive" hue="warn" label="Scheme money" value={d ? inrShort(d.scheme_amount) : "—"}
          sub="instalments collected into gold schemes" />
        <Kpi icon="users" hue="teal" label="New customers" value={d ? d.new_customers.toLocaleString("en-IN") : "—"}
          sub={d ? `${d.total_customers.toLocaleString("en-IN")} customers on DFX in total` : ""} />
        <Kpi go="#/control/shops?filter=PAID" icon="shop" hue="live" label="Paying shops" value={list.data ? paid.length : "—"}
          sub={list.data ? `of ${shops.length} shops · ${trials.length} on trial` : ""} />
      </div>

      <div className="sa-two">
        <Card title="Money through DFX" icon="activity" hue="web" right={<small>{rangeWord} · all shops</small>}>
          {!d ? <Skel h={220} /> : <MoneyChart points={d.sales_trend} />}
        </Card>
        <Card title="Needs your decision" icon="alert" hue="warn" fill>
          {!list.data ? <Skel h={220} /> : <Decisions shops={shops} seen={seen} perfById={perfById} range={range} />}
        </Card>
      </div>

      <Card title={`Shops by business · ${rangeWord}`} icon="shop" hue="app" pad={false}
        right={<small>bills + scheme money · click a shop to manage it</small>}>
        {!d || !list.data ? <div className="sa-card-b"><Skel h={160} /></div> : (
          <League shops={shops} perfById={perfById} platformTotal={platformTotal} seen={seen} />
        )}
      </Card>

      <div className="sa-split">
        <Card title="Shops joining DFX" icon="plus" hue="teal" right={<small>{rangeWord}</small>}>
          {!d ? <Skel h={120} /> : !d.growth_trend.length ? <Empty title={`No new shops ${rangeWord}`} /> : (
            <div style={{ display: "grid", gap: 8 }}>
              {d.growth_trend.map((g) => (
                <div key={g.period_label} className="sa-row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                  <span>{g.period_label}</span><b className="mono">+{g.new_tenants}</b>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Newest shops" icon="clock" hue="web" pad={false}>
          {!d ? <div className="sa-card-b"><Skel h={120} /></div> : !d.recent_tenants.length ? <Empty title="No shops yet" /> : (
            <div className="sa-tbl"><table><tbody>
              {d.recent_tenants.map((t) => {
                const s = shops.find((x) => x.id === t.id);
                return (
                  <tr key={t.id} className="click" onClick={() => openShop(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openShop(t.id)}>
                    <td className="who"><b>{t.name}</b><span>Joined {fmtDate(t.created_at)}</span></td>
                    <td>{s && <Pill dot tone={ACCESS_TONE[s.access]}>{ACCESS_WORD[s.access] || "—"}</Pill>}</td>
                    <td className="r" style={{ color: "var(--acc)" }}><Icon name="arrow" size={16} /></td>
                  </tr>
                );
              })}
            </tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Bills and scheme money per day (per month for a year), one scale.
function MoneyChart({ points }) {
  if (!points.length) return <Empty title="No money recorded in this period">Bills and scheme instalments appear here as shops record them.</Empty>;
  const max = Math.max(1, ...points.map((p) => Math.max(p.sales_amount, p.scheme_amount)));
  const W = 640, H = 220, padL = 52, padB = 26, top = 10;
  const bw = (W - padL) / points.length;
  const y = (v) => top + (H - padB - top) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const every = Math.ceil(points.length / 8);
  return (
    <div>
      <div className="sa-legend" style={{ marginBottom: 8 }}>
        <span><i style={{ background: "var(--acc)" }} />Billed</span>
        <span><i style={{ background: "var(--gold)" }} />Scheme money</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420, display: "block" }} role="img"
          aria-label={`Billed and scheme money per ${points.length > 12 ? "day" : "period"}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--rule2)" strokeDasharray={t ? "3 4" : "0"} />
              <text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--faint)">{inrShort(t)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = padL + i * bw;
            const w = Math.min(22, bw * 0.36);
            return (
              <g key={p.period_label}>
                <rect x={x + bw / 2 - w - 1} y={y(p.sales_amount)} width={w} height={Math.max(0, H - padB - y(p.sales_amount))} rx="3" fill="var(--acc)">
                  <title>{`${p.period_label} — billed ${inr(p.sales_amount)} (${p.sales_count} bill${p.sales_count === 1 ? "" : "s"})`}</title>
                </rect>
                <rect x={x + bw / 2 + 1} y={y(p.scheme_amount)} width={w} height={Math.max(0, H - padB - y(p.scheme_amount))} rx="3" fill="var(--gold)">
                  <title>{`${p.period_label} — scheme money ${inr(p.scheme_amount)}`}</title>
                </rect>
                {i % every === 0 && <text x={x + bw / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--faint)">{p.period_label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Every shop that needs the platform owner to act, most urgent first.
function Decisions({ shops, seen, perfById, range }) {
  const rows = [];
  shops.forEach((t) => {
    if (t.access === "EXPIRED") rows.push({ t, rank: 0, tone: "bad", what: "Trial ended", why: `Locked at next login · ended ${fmtDate(t.trial_ends_at)}` });
    else if (t.access === "TRIAL" && t.days_left != null && t.days_left <= 7) rows.push({ t, rank: 1, tone: "warn", what: t.days_left <= 1 ? "Trial ends tomorrow" : `Trial ends in ${t.days_left} days`, why: `Make permanent or extend · ${fmtDate(t.trial_ends_at)}` });
    else if (t.access === "PAID" || t.access === "TRIAL") {
      const s = seen[t.id];
      if (s && s.admin_idle_days != null && s.admin_idle_days >= QUIET_DAYS) {
        rows.push({ t, rank: 2, tone: "warn", what: "Going quiet", why: `Owner last seen ${seenAt(s.last_admin_seen_at)}` });
      } else if (range !== "today" && !perfById[t.id]) {
        rows.push({ t, rank: 3, tone: "mute", what: "No business recorded", why: "No bill, scheme payment or new customer in this period" });
      }
    }
  });
  rows.sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name));
  if (!rows.length) return <Empty title="Nothing waiting">No trial is ending, no shop has gone quiet.</Empty>;
  return (
    <div className="sa-feed">
      {rows.map((r) => (
        <div key={r.t.id} className="click" style={{ cursor: "pointer" }} role="button" tabIndex={0}
          onClick={() => openShop(r.t.id)} onKeyDown={(e) => e.key === "Enter" && openShop(r.t.id)}>
          <span className={`sa-ico t-${r.tone}`}><Icon name={r.rank <= 1 ? "clock" : "alert"} size={14} /></span>
          <div className="txt"><b>{r.t.name}</b> <span style={{ display: "inline", color: "var(--muted)" }}>{r.what.toLowerCase()}</span><span>{r.why}</span></div>
          <time style={{ color: "var(--acc)" }}><Icon name="arrow" size={15} /></time>
        </div>
      ))}
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
                <div className="sa-bar" style={{ flex: 1 }}><i style={{ width: `${share}%` }} /></div>
                <span className="mono" style={{ fontSize: 12, minWidth: 34, textAlign: "right" }}>{share}%</span>
              </div>
            </td>
            <td>{s?.last_admin_seen_at
              ? <span style={{ color: s.admin_idle_days >= QUIET_DAYS ? "var(--warn)" : undefined }}>{seenAt(s.last_admin_seen_at)}</span>
              : <span className="sa-dim">Never</span>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
