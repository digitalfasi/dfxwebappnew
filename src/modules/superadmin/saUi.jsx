"use client";
import { useEffect, useRef, useState } from "react";

// Shared building blocks for DFX Control. The look lives in saStyles.js.
export { SA_CSS } from "@/modules/superadmin/saStyles";

// ── Icons (one stroke family, 1.75px) ────────────────────────────────────
const P = {
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  shop: "M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M9 20v-6h6v6",
  users: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 19v-1a4 4 0 00-3-3.87M16 3.13A3.5 3.5 0 0116 10",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  out: "M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3",
  refresh: "M20 11a8 8 0 00-14.9-3M4 5v4h4M4 13a8 8 0 0014.9 3M20 19v-4h-4",
  pause: "M8 5v14M16 5v14",
  play: "M7 5l12 7-12 7z",
  web: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  key: "M15 7a4 4 0 11-3.9 4.9L4 19v2H2v-3l7.1-7.1A4 4 0 0115 7zM16 8h.01",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 118 0v4",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  check: "M5 12l5 5L20 7",
  db: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  arrow: "M5 12h14M13 6l6 6-6 6",
  chev: "M6 9l6 6 6-6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  activity: "M4 20V10M10 20V4M16 20v-7M22 20H2",
};
export function Icon({ name, size = 18, stroke = 1.75, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={P[name]} />
    </svg>
  );
}

export function Card({ title, icon, hue = "web", right, children, pad = true, style, fill }) {
  return (
    <section className={`sa-card h-${hue}`} style={style}>
      {(title || right) && (
        <div className="sa-card-h">
          <h3>{icon && <span className="ic"><Icon name={icon} size={15} /></span>}{title}</h3>
          {right}
        </div>
      )}
      {fill ? <div className="sa-fill"><div className="in">{children}</div></div> : pad ? <div className="sa-card-b">{children}</div> : children}
    </section>
  );
}

// hue: live | web | app | warn | bad | teal | ink
export function Kpi({ label, value, sub, live, icon = "activity", hue = "web", tone }) {
  const h = tone === "bad" ? "bad" : tone === "warn" ? "warn" : hue;
  return (
    <div className={`sa-kpi h-${h}`}>
      <span className="chip">{live ? <span className="sa-pulse" /> : <Icon name={icon} size={19} />}</span>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export const initialsOf = (name) => (name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const ROLE_HUE = { SuperAdmin: "web", Admin: "teal", Staff: "app", Customer: "live" };
export function Who({ name, sub, role }) {
  return (
    <div className="who">
      <span className={`sa-ini h-${ROLE_HUE[role] || "ink"}`}>{initialsOf(name)}</span>
      <div><b>{name || "Unknown"}</b>{sub && <span>{sub}</span>}</div>
    </div>
  );
}

export function Pill({ tone = "mute", children, dot, box }) {
  return <span className={`sa-pill t-${tone}${box ? " box" : ""}`}>{dot && <i />}{children}</span>;
}

export const STATUS_TONE = { active: "live", online: "live", idle: "warn", ended: "mute", expired: "mute", offline: "mute", never: "mute" };
export const STATUS_LABEL = { active: "Online", online: "Online", idle: "Idle", ended: "Signed out", expired: "Expired", offline: "Offline", never: "Not seen yet" };
export const ROLE_TONE = { SuperAdmin: "pri", Admin: "sky", Staff: "app", Customer: "mute" };

export function ClientTag({ client, device }) {
  if (client === "app") return <Pill tone="app"><Icon name="phone" size={12} />App</Pill>;
  if (client === "web") return <Pill tone="sky"><Icon name={device === "phone" ? "phone" : "web"} size={12} />{device === "phone" ? "Web · phone" : "Web"}</Pill>;
  return <Pill>Other</Pill>;
}

export function Empty({ title, children }) {
  return <div className="sa-empty"><b>{title}</b>{children}</div>;
}

export function Skel({ h = 16, w = "100%" }) {
  return <div className="sa-skel" style={{ height: h, width: w }} />;
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  return (
    <div className="sa-pager">
      <span className="num">{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : "0 results"}</span>
      <div className="sa-row">
        <button className="sa-btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="num">Page {page} of {pages}</span>
        <button className="sa-btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sa-drawer-bg" onClick={onClose} />
      <aside className="sa-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sa-drawer-h">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <div className="sa-row">{actions}<button className="sa-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        </div>
        <div className="sa-drawer-b">{children}</div>
      </aside>
    </>
  );
}

// 24 IST hours, two series. Drawn to one scale with a faint grid.
export function HourChart({ a = [], b = [], aLabel, bLabel, height = 150 }) {
  const max = Math.max(1, ...a, ...b);
  const W = 720, H = height, padL = 28, padB = 22, top = 8;
  const bw = (W - padL) / 24;
  const y = (v) => top + (H - padB - top) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max];
  const nowH = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false })) % 24;
  return (
    <div>
      <div className="sa-legend" style={{ marginBottom: 8 }}>
        <span><i style={{ background: "var(--acc)" }} />{aLabel}</span>
        <span><i style={{ background: "#F2A93B" }} />{bLabel}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 480, display: "block" }} role="img"
          aria-label={`${aLabel} per hour today: peak ${Math.max(0, ...a)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#E8ECF4" strokeDasharray={t ? "3 4" : "0"} />
              <text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#8792AA">{t}</text>
            </g>
          ))}
          {Array.from({ length: 24 }).map((_, h) => {
            const x = padL + h * bw;
            const va = a[h] || 0, vb = b[h] || 0;
            return (
              <g key={h}>
                {h === nowH && <rect x={x} y={top} width={bw} height={H - padB - top} fill="#EAF0FF" rx="6" />}
                <rect x={x + bw * 0.16} y={y(va)} width={bw * 0.34} height={Math.max(0, H - padB - y(va))} rx="3" fill="#3563F0">
                  <title>{`${String(h).padStart(2, "0")}:00 — ${va} ${aLabel.toLowerCase()}`}</title>
                </rect>
                <rect x={x + bw * 0.52} y={y(vb)} width={bw * 0.34} height={Math.max(0, H - padB - y(vb))} rx="3" fill="#F2A93B">
                  <title>{`${String(h).padStart(2, "0")}:00 — ${vb} ${bLabel.toLowerCase()}`}</title>
                </rect>
                {h % 3 === 0 && <text x={x + bw / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="#8792AA">{String(h).padStart(2, "0")}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Split bar: parts that add up to one whole (web vs app, roles).
export function SplitBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", background: "var(--rule2)" }}>
        {total > 0 && parts.map((p) => p.value > 0 && (
          <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {parts.map((p) => (
          <div key={p.label} className="sa-row" style={{ justifyContent: "space-between", fontSize: 13 }}>
            <span className="sa-row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: "inline-block" }} />{p.label}</span>
            <b className="num">{p.value}{total ? <span className="sa-dim" style={{ fontWeight: 400 }}> · {Math.round((p.value / total) * 100)}%</span> : null}</b>
          </div>
        ))}
      </div>
    </div>
  );
}


// Ring chart: parts of one whole, total in the middle.
export function Donut({ parts, label, size = 150 }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 54, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${label}: ${total}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#EEF1F7" strokeWidth="16" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" strokeLinecap="butt">
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="600" fill="#0E1630" style={{ fontFamily: "Fira Code, monospace" }}>{total}</text>
        <text x="70" y="88" textAnchor="middle" fontSize="11" fill="#8A93AB">{label}</text>
      </svg>
      <div style={{ display: "grid", gap: 8, flex: "1 1 140px", minWidth: 140 }}>
        {parts.map((p) => (
          <div key={p.label} className="sa-row" style={{ justifyContent: "space-between", fontSize: 13, gap: 8 }}>
            <span className="sa-row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: "inline-block" }} />{p.label}</span>
            <b className="mono">{p.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HealthBanner({ level, title, points, side }) {
  return (
    <div className={`sa-health ${level}`} role="status">
      <span className="orb"><Icon name={level === "ok" ? "check" : "alert"} size={22} stroke={2.2} /></span>
      <div><b>{title}</b>{points?.length > 0 && <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>}</div>
      {side && <div className="side">{side}</div>}
    </div>
  );
}

// The live system, drawn: people -> gateway -> server -> database -> backups.
// Moving dots mean traffic is flowing on that link right now.
const MAP_NODES = {
  web: { x: 10, y: 22, w: 250, h: 84, hue: "#3563F0", bg: "#EAF0FF", icon: "web" },
  app: { x: 10, y: 150, w: 250, h: 84, hue: "#7B4DEB", bg: "#F1EBFF", icon: "phone" },
  gw: { x: 350, y: 86, w: 250, h: 84, hue: "#0FA3B1", bg: "#E2F6F8", icon: "shield" },
  api: { x: 690, y: 86, w: 250, h: 84, hue: "#3563F0", bg: "#EAF0FF", icon: "server" },
  db: { x: 1030, y: 22, w: 250, h: 84, hue: "#10A36A", bg: "#E5F7EF", icon: "db" },
  bk: { x: 1030, y: 150, w: 250, h: 84, hue: "#D9820B", bg: "#FFF4E0", icon: "archive" },
};
const MAP_LINKS = [
  ["web", "M260,64 C305,64 305,128 350,128"],
  ["app", "M260,192 C305,192 305,128 350,128"],
  ["gw", "M600,128 L690,128"],
  ["api", "M940,128 C985,128 985,64 1030,64"],
  ["bk", "M1155,106 L1155,150"],
];

// flows[k]: a number = people moving on that link now (fast, bright);
// "hb" = the system's own heartbeat (health checks, slow); 0 = idle.
export function SystemMap({ nodes, flows }) {
  // The moving map is how live traffic is read, so it animates even when the
  // OS asks for reduced motion (Windows "Animation effects: off").
  const reduce = false;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <svg className="sa-map" viewBox="0 0 1290 250" width="100%" style={{ minWidth: 820, maxHeight: 250, display: "block", margin: "0 auto" }} role="img"
          aria-label="Live system map: people, gateway, server, database and backups">
          <defs>
            <filter id="saSh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#10183F" floodOpacity=".07" /></filter>
            <filter id="saGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {MAP_LINKS.map(([k, d]) => {
            const f = flows[k] || 0;
            const people = typeof f === "number" && f > 0;
            const hb = f === "hb";
            const col = nodes[k]?.state === "bad" ? "#E5484D" : MAP_NODES[k].hue;
            const cars = people ? Math.min(4, f + 1) : hb ? 1 : 0;
            const dur = people ? Math.max(1.1, 2.2 - f * 0.2) : 4;
            return (
              <g key={k}>
                <path d={d} className="bed" />
                <path d={d} className="ties" />
                <path d={d} className="rail" stroke={people || hb ? col : "#C7CEDD"} strokeOpacity={people ? 0.55 : hb ? 0.35 : 1} strokeDasharray={people || hb ? undefined : "3 7"} />
                {Array.from({ length: cars }).map((_, n) => (
                  <path key={`f${n}`} d={d} pathLength="100" className="train" stroke={col} filter="url(#saGlow)"
                    strokeDasharray={people ? "9 91" : "5 95"} style={{ "--d": `${dur}s`, animationDelay: `${-(dur / cars) * n}s, ${-0.2 * n}s` }} />
                ))}
                {people && k !== "bk" && (
                  <path d={d} pathLength="100" className="train back" stroke={col} strokeDasharray="5 95" style={{ "--d": `${dur * 1.3}s` }} />
                )}
              </g>
            );
          })}
          {Object.entries(MAP_NODES).map(([k, nd]) => {
            const d = nodes[k] || {};
            const ring = d.state === "bad" ? "#E5484D" : d.state === "warn" ? "#D9820B" : d.state === "off" ? "#B7C0D6" : nd.hue;
            const alive = d.state === "live" || d.state === "warn" || d.state === "bad";
            return (
              <g key={k} transform={`translate(${nd.x},${nd.y})`}>
                <g filter="url(#saSh)">
                  <rect width={nd.w} height={nd.h} rx="16" fill="#fff" stroke={ring} strokeWidth={d.state === "bad" || d.state === "warn" ? 2 : 1.3} strokeOpacity={d.state === "off" ? 0.6 : 0.85} />
                </g>
                {alive && !reduce && (
                  <rect width={nd.w} height={nd.h} rx="16" fill="none" stroke={ring} strokeWidth="2" opacity="0">
                    <animate attributeName="opacity" values="0;.45;0" dur={d.state === "bad" ? "1.1s" : "2.6s"} repeatCount="indefinite" />
                  </rect>
                )}
                <rect x="14" y="18" width="48" height="48" rx="13" fill={nd.bg} />
                <g transform="translate(26,30)" color={nd.hue}><Icon name={nd.icon} size={24} /></g>
                <text x="76" y="34" fontSize="13" fill="#5B6480" fontWeight="600">{d.title}</text>
                <text x="76" y="56" fontSize="18" fill="#0E1630" className="v">{d.value}</text>
                <text x="76" y="73" fontSize="12" fill={d.state === "bad" ? "#B42A2F" : d.state === "warn" ? "#9A5A04" : "#8A93AB"}>{d.note}</text>
                <circle cx={nd.w - 18} cy="18" r="4.5" fill={ring} />
                {alive && !reduce && (
                  <circle cx={nd.w - 18} cy="18" r="4.5" fill="none" stroke={ring} strokeWidth="2">
                    <animate attributeName="r" values="4.5;12" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".8;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="sa-legend" style={{ justifyContent: "center", marginTop: 6 }}>
        <span><i style={{ background: "#3563F0", borderRadius: 99 }} />Fast blinking trains: people using DFX right now (thin ones are answers coming back)</span>
        <span><i style={{ background: "#9FB3F5", borderRadius: 99 }} />One slow train: the server's own heartbeat</span>
        <span><i style={{ background: "#C7CEDD", borderRadius: 99 }} />Dotted: nobody on this route</span>
        <span><i style={{ background: "#E5484D", borderRadius: 99 }} />Red box: needs attention</span>
      </div>
    </div>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// Poll a loader every `ms` while `live` is on and the tab is visible.
export function usePoll(loader, deps, { ms = 15000, live = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true, at: null });
  const saved = useRef(loader);
  saved.current = loader;
  const run = useRef(null);
  run.current = async (quiet) => {
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await saved.current();
      setState({ data, error: null, loading: false, at: Date.now() });
    } catch (e) {
      setState((s) => ({ ...s, error: e?.message || "Could not load", loading: false }));
    }
  };
  useEffect(() => { run.current(false); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") run.current(true); }, ms);
    return () => clearInterval(t);
  }, [live, ms]);
  return { ...state, reload: () => run.current(false) };
}
