"use client";
import { useState } from "react";
import { saService, fmtDateTime, fmtTime, fmtDate, ago, seenAt, dur, bytes } from "@/modules/superadmin/saService";
import { Card, Kpi, Pill, Icon, Empty, Skel, usePoll, hashParam, scrollToId } from "@/modules/superadmin/saUi";
import { DataExplorer } from "@/modules/superadmin/DevTools";

const SECTIONS = [
  ["overview", "Overview"], ["security", "Security"], ["traffic", "Traffic"],
  ["logs", "Logs"], ["database", "Database"], ["server", "Server"],
];
const KIND_TONE = {
  "SQL injection": "bad", "Code injection": "bad", "Path traversal": "bad", "Password guessing": "bad",
  "Scanner probe": "warn", "Automated client": "app", "Rate limited": "sky",
};

// "Automated client" = a script or tool (curl, Python...) calling the API.
// Most of those are ours - the gold-rate job on this server (127.0.0.1) and
// health checks - so they are listed, never counted as attacks.
const AUTO = "Automated client";
const isAttack = (kinds) => (Array.isArray(kinds) ? kinds : Object.keys(kinds || {})).some((x) => x !== AUTO);
const breakIns = (t) => ["SQL injection", "Code injection", "Path traversal", "Password guessing"].reduce((n, x) => n + ((t?.by_kind || {})[x] || 0), 0);
const attackCount = (t) => (t ? Math.max(0, (t.total || 0) - ((t.by_kind || {})[AUTO] || 0)) : 0);

export default function ServerTab({ live }) {
  const [sec, setSec] = useState(() => (SECTIONS.some(([k]) => k === hashParam("sec")) ? hashParam("sec") : "overview"));
  const res = usePoll(() => saService.system(), [], { ms: 30000, live });
  const ev = usePoll(() => saService.events({ limit: 1 }), [], { ms: 60000, live });
  const d = res.data;
  if (!d) return <Card><Skel h={220} /></Card>;
  const h = d.host;
  return (
    <div className="sa-grid">
      <div className="sa-seg" role="tablist" aria-label="Server sections">
        {SECTIONS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sec === k} onClick={() => setSec(k)}>
            {l}{k === "security" && breakIns(h?.threats) ? <span className="cnt bad">{breakIns(h.threats)}</span> : null}
            {k === "logs" && h?.app_logs?.errors_last_hour ? <span className="cnt bad">{h.app_logs.errors_last_hour}</span> : null}
          </button>
        ))}
        <span className="sa-dim" style={{ marginLeft: "auto", fontSize: 12.5, alignSelf: "center" }}>
          {h ? <>Server figures updated {ago(h.generated_at)}{h.as_root ? "" : " · partial (agent not running as root)"}</> : "Server agent not reporting"}
        </span>
      </div>
      {!h && <div className="sa-alert info"><Icon name="alert" />The server agent is not reporting yet, so only database and app figures are shown.</div>}
      {h && !h.as_root && (sec === "security" || sec === "traffic") && (
        <div className="sa-alert info"><Icon name="alert" />
          <div>Attack detection, traffic, fail2ban and firewall need the server agent to run as root. Install it once:
            <code className="mono" style={{ display: "block", marginTop: 6, fontSize: 12 }}>sudo cp /opt/dfx-backend/host-status.sh /usr/local/bin/dfx-host-status && sudo chmod 755 /usr/local/bin/dfx-host-status && echo '* * * * * root /usr/local/bin/dfx-host-status &gt;/dev/null 2&gt;&amp;1' | sudo tee /etc/cron.d/dfx-host-status</code></div>
        </div>
      )}
      {sec === "overview" && <Overview d={d} h={h} setSec={setSec} />}
      {sec === "security" && <Security h={h} counts={ev.data?.summary_24h?.counts || {}} failedTop={ev.data?.summary_24h?.top_failed_ips || []} />}
      {sec === "traffic" && <Traffic t={h?.web_traffic} setSec={setSec} />}
      {sec === "logs" && <Logs h={h} setSec={setSec} />}
      {sec === "database" && <Database db={d.database || {}} setSec={setSec} />}
      {sec === "server" && <ServerInfo d={d} h={h} />}
    </div>
  );
}

// ── Overview: is anything under pressure? ───────────────────────────────
function Overview({ d, h, setSec }) {
  const db = d.database || {};
  const m = d.machine || {};
  const disk = h?.disk || m.disk;
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : null;
  const mem = m.memory || {};
  const memPct = mem.MemTotal ? Math.round(((mem.MemTotal - mem.MemAvailable) / mem.MemTotal) * 100) : null;
  const load = Number((h?.load || m.load || [])[0] || 0);
  const cpuPct = m.cpus ? Math.min(100, Math.round((load / m.cpus) * 100)) : null;
  const conns = Object.values(db.connections || {}).reduce((s, n) => s + n, 0);
  const dump = h?.backups?.files?.find((f) => f.name.startsWith("dfx-"));
  const dumpH = dump ? Math.round((Date.now() - new Date(dump.at).getTime()) / 3600000) : null;
  const certDays = h?.certificate?.expires ? Math.round((new Date(h.certificate.expires) - Date.now()) / 86400000) : null;
  const heavy = [...(h?.containers || [])].sort((a, b) => parseFloat(b.stats?.mem_pct || 0) - parseFloat(a.stats?.mem_pct || 0));
  return (
    <>
      <div className="sa-kpis six">
        <Kpi go={() => setSec("server")} icon="activity" hue={cpuPct >= 85 ? "bad" : cpuPct >= 60 ? "warn" : "live"} label="CPU load" value={cpuPct != null ? `${cpuPct}%` : "—"} sub={`${load.toFixed(2)} on ${m.cpus || "?"} cores`} />
        <Kpi go={() => setSec("server")} icon="server" hue={memPct >= 90 ? "bad" : memPct >= 75 ? "warn" : "web"} label="Memory" value={memPct != null ? `${memPct}%` : "—"} sub={mem.MemTotal ? `${bytes(mem.MemTotal - mem.MemAvailable)} of ${bytes(mem.MemTotal)}` : ""} />
        <Kpi go={() => setSec("server")} icon="archive" hue={diskPct >= 90 ? "bad" : diskPct >= 80 ? "warn" : "app"} label="Disk" value={diskPct != null ? `${diskPct}%` : "—"} sub={disk ? `${bytes(disk.free)} free` : ""} />
        <Kpi go={() => setSec("database")} icon="db" hue={db.healthy ? "teal" : "bad"} label="Database" value={db.healthy ? bytes(db.size_bytes) : "Down"} sub={`${conns} of ${db.max_connections || "?"} connections`} />
        <Kpi go={() => { setSec("server"); setTimeout(() => scrollToId("srv-backups"), 50); }} icon="archive" hue={dumpH == null || dumpH > 30 ? "bad" : "live"} label="Last backup" value={dumpH != null ? `${dumpH} h ago` : "—"} sub="runs nightly 07:45 IST" />
        <Kpi go={() => setSec("server")} icon="lock" hue={certDays != null && certDays < 20 ? "bad" : "live"} label="SSL certificate" value={certDays != null ? `${certDays} days` : "—"} sub={h?.certificate?.expires ? `until ${fmtDate(h.certificate.expires)}` : ""} />
      </div>
      {h && (
        <Card title="What is using the machine" icon="box" hue="web" pad={false} right={<small>heaviest first · live snapshot</small>}>
          <div className="sa-tbl"><table>
            <thead><tr><th>Service</th><th>State</th><th className="r">CPU</th><th>Memory</th><th className="r">Restarts</th><th>Up since</th></tr></thead>
            <tbody>{heavy.map((c) => {
              const mp = parseFloat(c.stats?.mem_pct || 0);
              return (
                <tr key={c.name}>
                  <td><b>{({ "dfx-backend": "Backend API", "dfx-web": "Web app", "dfx-postgres": "Database" })[c.name] || c.name}</b> <span className="mono sa-dim" style={{ fontSize: 12 }}>{c.name}</span></td>
                  <td><Pill dot tone={c.state !== "running" ? "bad" : c.health && c.health !== "healthy" ? "bad" : "live"}>{c.state !== "running" ? c.state : c.health || "running"}</Pill></td>
                  <td className="r">{c.stats?.cpu || "—"}</td>
                  <td style={{ minWidth: 200 }}><div className="sa-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <div className={`sa-bar${mp >= 60 ? " warn" : ""}`} style={{ flex: 1 }}><i style={{ width: `${Math.min(100, mp * 3)}%` }} /></div>
                    <span className="mono" style={{ fontSize: 12 }}>{(c.stats?.mem || "").split(" / ")[0] || "—"}</span></div></td>
                  <td className="r">{c.restarts || 0}</td>
                  <td className="sa-muted">{c.started_at ? fmtDateTime(c.started_at) : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      )}
    </>
  );
}

// ── Security: who is attacking and how ──────────────────────────────────
function Security({ h, counts, failedTop }) {
  const t = h?.threats;
  const k = t?.by_kind || {};
  const attacks = attackCount(t);
  const attackers = (t?.top_sources || []).filter((s) => isAttack(s.kinds));
  const scripts = (t?.top_sources || []).filter((s) => !isAttack(s.kinds));
  const recent = (t?.recent || []).filter((e) => isAttack(e.kinds));
  const injections = (k["SQL injection"] || 0) + (k["Code injection"] || 0) + (k["Path traversal"] || 0);
  return (
    <>
      <div className="sa-kpis six">
        <Kpi go={() => scrollToId("sec-attacks")} icon="shield" hue={attacks ? "warn" : "live"} tone={injections ? "bad" : undefined} label="Attack attempts · 24 h" value={t ? attacks : "—"}
          sub={t ? (attacks ? "scanners and break-in tries" : "nothing tried to break in") : "needs root agent"} />
        <Kpi go={() => scrollToId("sec-attacks")} icon="db" hue={injections ? "bad" : "ink"} label="Break-in tricks" value={t ? injections : "—"} sub="SQL / code injection, path tricks" />
        <Kpi go={() => scrollToId("sec-recent")} icon="alert" hue={k["Scanner probe"] ? "warn" : "ink"} label="Scanner probes" value={t ? k["Scanner probe"] || 0 : "—"} sub="looking for .env, wp-admin, .git" />
        <Kpi go={"#/control/monitor/signins?event=LOGIN_FAILED"} icon="key" hue={counts.LOGIN_FAILED ? "warn" : "ink"} label="Failed logins · 24 h" value={counts.LOGIN_FAILED || 0} sub={`${counts.LOGIN_BLOCKED || 0} blocked`} />
        <Kpi go={() => scrollToId("sec-fail2ban")} icon="lock" hue="teal" label="Banned right now" value={h?.fail2ban ? h.fail2ban.reduce((s, j) => s + Number(j.currently_banned || 0), 0) : "—"} sub="IPs blocked by fail2ban" />
        <Kpi go={() => scrollToId("sec-scripts")} icon="box" hue="ink" label="Scripts & tools" value={t ? k[AUTO] || 0 : "—"} sub="not attacks - mostly our own jobs" />
      </div>
      {t && attacks > 0 && !injections && (
        <div className="sa-alert info"><Icon name="alert" />
          <div>Every public website gets these. They were refused or found nothing ({t.blocked_share ?? 0}% refused outright) - no action needed unless one IP keeps going.</div>
        </div>
      )}

      <Card id="sec-attacks" title="Attack attempts - who tried" icon="shield" hue={attacks ? "warn" : "live"} pad={false} right={<small>last 24 hours · most active first</small>}>
        {!t ? <Empty title="Needs the root agent">nginx logs are readable by root only.</Empty> : !attackers.length ? <Empty title="No attack attempts in the last 24 hours" /> : (
          <div className="sa-tbl"><table>
            <thead><tr><th>Source IP</th><th>What they tried</th><th className="r">Requests</th><th>Last seen</th><th>Tool / browser</th></tr></thead>
            <tbody>{attackers.map((s) => (
              <tr key={s.ip}>
                <td className="mono">{s.ip}</td>
                <td className="wrap"><div className="sa-row" style={{ gap: 6 }}>{Object.entries(s.kinds).map(([kk, n]) => <Pill key={kk} tone={KIND_TONE[kk] || "mute"}>{kk} · {n}</Pill>)}</div></td>
                <td className="r">{s.count}</td>
                <td className="sa-muted">{seenAt(s.last)}</td>
                <td className="sa-dim" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={s.ua}>{s.ua || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {scripts.length > 0 && (
        <Card id="sec-scripts" title="Scripts & tools calling the server" icon="box" hue="web" pad={false} right={<small>normal - listed so you can spot a stranger</small>}>
          <div className="sa-tbl"><table>
            <thead><tr><th>Source IP</th><th>Who it is</th><th className="r">Requests</th><th>Last seen</th><th>Tool</th></tr></thead>
            <tbody>{scripts.map((s) => (
              <tr key={s.ip}>
                <td className="mono">{s.ip}</td>
                <td>{s.ip === "127.0.0.1" || s.ip === "::1" ? <b>This server (gold-rate job)</b> : <span className="sa-muted">A script - yours if you ran curl or Python</span>}</td>
                <td className="r">{s.count}</td>
                <td className="sa-muted">{seenAt(s.last)}</td>
                <td className="sa-dim" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={s.ua}>{s.ua || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      <div className="sa-two">
        <Card id="sec-recent" title="Latest attack attempts" icon="alert" hue="warn" fill>
          {!recent.length ? <Empty title="Nothing in the last 24 hours" /> : (
            <div className="sa-feed">{recent.map((e, i) => (
              <div key={i}>
                <span className={`sa-ico t-${e.kinds.some((x) => KIND_TONE[x] === "bad") ? "bad" : "warn"}`}><Icon name="alert" size={14} /></span>
                <div className="txt"><b className="mono" style={{ fontSize: 12.5, fontWeight: 500, wordBreak: "break-all" }}>{e.request}</b>
                  <span>{e.kinds.join(", ")} · {e.ip} · answered {e.status}</span></div>
                <time>{fmtTime(e.at)}</time>
              </div>
            ))}</div>
          )}
        </Card>
        <div className="sa-grid">
          <Card id="sec-fail2ban" title="Blocked by fail2ban" icon="lock" hue="teal">
            {!h?.fail2ban ? <Empty title="Needs the root agent" /> : h.fail2ban.map((j) => (
              <div key={j.name} className="sa-row" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--rule2)" }}>
                <span className="mono" style={{ fontSize: 13 }}>{j.name}</span>
                <span style={{ fontSize: 12.5 }}><b className="mono" style={{ color: Number(j.currently_banned) ? "var(--bad)" : "var(--ink)" }}>{j.currently_banned}</b> <span className="sa-dim">banned now · {j.total_banned} total</span></span>
              </div>
            ))}
          </Card>
          <Card title="Failed logins by IP · 24 h" icon="key" hue="bad">
            {!failedTop.length ? <Empty title="None in 24 hours" /> : failedTop.slice(0, 6).map((r) => (
              <div key={r.ip} className="sa-row" style={{ justifyContent: "space-between", padding: "5px 0" }}>
                <span className="mono" style={{ fontSize: 13 }}>{r.ip}</span><b className="mono">{r.count}</b>
              </div>
            ))}
          </Card>
          <Card title="SSH to the server · 24 h" icon="server" hue="web">
            <div className="sa-row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>Successful <b className="mono">{h?.ssh?.accepted_24h ?? "—"}</b></span>
              <span>Failed <b className="mono" style={{ color: h?.ssh?.failed_24h ? "var(--bad)" : undefined }}>{h?.ssh?.failed_24h ?? "—"}</b></span>
              <span>On now <b className="mono">{h?.server_users_now?.length ?? 0}</b></span>
            </div>
            {(h?.ssh?.recent_accepted || []).slice(0, 4).map((a, i) => (
              <div key={i} className="sa-row" style={{ justifyContent: "space-between", fontSize: 12.5, marginTop: 8 }}>
                <span><b>{a.user}</b> <span className="mono sa-dim">{a.ip}</span></span><span className="sa-dim">{fmtDateTime(a.at)}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

// ── Traffic ─────────────────────────────────────────────────────────────
function Traffic({ t, setSec }) {
  if (!t) return <Card><Empty title="Traffic needs the root agent">nginx logs are readable by root only.</Empty></Card>;
  const max = Math.max(1, ...t.per_minute.map((x) => x.n));
  const s = t.status_last_hour;
  return (
    <>
      <div className="sa-kpis">
        <Kpi go={() => scrollToId("trf-chart")} icon="web" hue="web" label="Requests · last hour" value={t.requests_last_hour.toLocaleString("en-IN")} sub={`${bytes(t.bytes_last_hour)} sent`} />
        <Kpi go={() => scrollToId("trf-chart")} icon="activity" hue="teal" label="Requests · 24 h" value={t.requests_24h.toLocaleString("en-IN")} />
        <Kpi go={() => scrollToId("trf-chart")} icon="check" hue="live" label="Answered OK · last hour" value={`${Math.round(((s["2xx"] || 0) + (s["3xx"] || 0)) * 100 / Math.max(1, t.requests_last_hour))}%`} sub={`${s["4xx"] || 0} refused (4xx)`} />
        <Kpi go={() => setSec("logs")} icon="alert" hue={t.server_errors_24h ? "bad" : "ink"} label="Server errors (5xx) · 24 h" value={t.server_errors_24h} />
      </div>
      <Card id="trf-chart" title="Requests per minute" icon="activity" hue="web" right={<small>last 60 minutes</small>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(60,1fr)", gap: 2, alignItems: "end", height: 110 }}>
          {t.per_minute.map((x) => <div key={x.t} title={`${x.t} UTC · ${x.n}`} style={{ height: `${Math.max(3, (x.n / max) * 106)}px`, background: "linear-gradient(180deg,#5B7CFF,#3563F0)", borderRadius: 2, opacity: x.n ? 1 : 0.2 }} />)}
        </div>
      </Card>
      <div className="sa-split">
        <Card title="Busiest endpoints · last hour" icon="list" hue="app"><Rank rows={t.top_paths_last_hour} k="path" /></Card>
        <Card title="Busiest IPs · last hour" icon="users" hue="teal"><Rank rows={t.top_ips_last_hour} k="ip" /></Card>
      </div>
    </>
  );
}

function Rank({ rows, k }) {
  if (!rows?.length) return <Empty title="No requests" />;
  const max = Math.max(...rows.map((r) => r.count));
  return <div style={{ display: "grid", gap: 9 }}>{rows.map((r) => (
    <div key={r[k]} style={{ display: "grid", gap: 4 }}>
      <div className="sa-row" style={{ justifyContent: "space-between", fontSize: 12.5, flexWrap: "nowrap" }}>
        <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r[k]}</span><b className="mono">{r.count}</b></div>
      <div className="sa-bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></div>
    </div>))}</div>;
}

// ── Logs: one line per entry, open for detail ───────────────────────────
const LOG_RX = /^\[([^\]]+)\]\s*\[(\w+)\]\s*\[([^\]]+)\]:\s*(.*)$/;
function Logs({ h, setSec }) {
  const [open, setOpen] = useState(null);
  const L = h?.app_logs;
  if (!L) return <Card><Empty title="Logs need the server agent" /></Card>;
  const rows = [...(L.recent_errors || []).map((l) => ["ERROR", l]), ...(L.recent_warnings || []).map((l) => ["WARNING", l])]
    .map(([lvl, line], i) => {
      const m = line.match(LOG_RX);
      return { i, lvl: m?.[2] || lvl, at: m?.[1] || "", src: m?.[3] || "", msg: m?.[4] || line };
    }).sort((a, b) => (b.at > a.at ? 1 : -1));
  return (
    <>
      <div className="sa-kpis">
        <Kpi go={() => scrollToId("log-lines")} icon="alert" hue={L.errors_last_hour ? "bad" : "live"} label="Errors · last hour" value={L.errors_last_hour} sub="real faults in the backend" />
        <Kpi go={() => scrollToId("log-lines")} icon="alert" hue={L.warnings_last_hour ? "warn" : "live"} label="Warnings · last hour" value={L.warnings_last_hour} sub="refused or unusual requests" />
        <Kpi go={() => scrollToId("log-nginx")} icon="server" hue="ink" label="nginx errors" value={h.nginx_errors ? h.nginx_errors.length : "—"} sub={h.nginx_errors ? "recent lines" : "needs root agent"} />
      </div>
      <Card id="log-lines" title="Backend log · last hour" icon="list" hue="ink" pad={false} right={<small>click a line for the full text</small>}>
        {!rows.length ? <Empty title="Nothing logged in the last hour" /> : (
          <div className="sa-tbl"><table>
            <thead><tr><th>Time (UTC)</th><th>Level</th><th>Where</th><th>Message</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.i} className="click" onClick={() => setOpen(open === r.i ? null : r.i)}>
                <td className="mono" style={{ fontSize: 12 }}>{r.at.slice(11, 19) || "—"}</td>
                <td><Pill tone={r.lvl === "ERROR" || r.lvl === "CRITICAL" ? "bad" : "warn"}>{r.lvl.toLowerCase()}</Pill></td>
                <td className="mono sa-dim" style={{ fontSize: 12 }}>{r.src}</td>
                <td className={open === r.i ? "wrap mono" : "mono"} style={{ fontSize: 12, maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis" }}>{r.msg}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {h.nginx_errors?.length > 0 && <Card id="log-nginx" title="nginx error log" icon="server" hue="ink"><pre className="sa-log">{h.nginx_errors.join("\n")}</pre></Card>}
    </>
  );
}

// ── Database ────────────────────────────────────────────────────────────
function Database({ db, setSec }) {
  const conns = Object.values(db.connections || {}).reduce((s, n) => s + n, 0);
  return (
    <>
      <div className="sa-kpis">
        <Kpi go={() => setSec("overview")} icon="db" hue={db.healthy ? "live" : "bad"} label="Status" value={db.healthy ? "Healthy" : "Down"} sub={(db.version || "").split(" on ")[0]} />
        <Kpi go={() => scrollToId("db-tables")} icon="archive" hue="teal" label="Size" value={bytes(db.size_bytes)} sub={`${db.table_count ?? "—"} tables`} />
        <Kpi go={() => setSec("overview")} icon="activity" hue={conns / (db.max_connections || 100) > 0.7 ? "warn" : "web"} label="Connections" value={`${conns} / ${db.max_connections ?? "—"}`} sub={Object.entries(db.connections || {}).map(([k, v]) => `${v} ${k}`).join(" · ")} />
        <Kpi go={() => setSec("server")} icon="clock" hue="app" label="Running since" value={db.started_at ? ago(db.started_at) : "—"} sub={`migration ${db.migration || "—"}`} />
      </div>
      <DataExplorer />
    </>
  );
}

// ── Server: OS, services, backups, jobs ─────────────────────────────────
function ServerInfo({ d, h }) {
  const up = h?.updates || {};
  return (
    <>
      <div className="sa-split">
        <Card title="Machine" icon="server" hue="web">
          <dl className="sa-kv">
            <dt>OS</dt><dd>{h?.os || "—"}</dd>
            <dt>Kernel</dt><dd className="mono">{h?.kernel || "—"}</dd>
            <dt>Up for</dt><dd>{(h?.uptime || "").replace(/^up /, "") || dur(d.machine?.uptime_seconds)}</dd>
            <dt>CPU cores</dt><dd>{d.machine?.cpus ?? "—"}</dd>
            <dt>Updates waiting</dt><dd>{up.upgradable ?? "—"}{up.security ? ` · ${up.security} security` : ""}</dd>
            <dt>Reboot needed</dt><dd>{up.reboot_required ? <Pill dot tone="warn">Yes</Pill> : <Pill dot tone="live">No</Pill>}</dd>
          </dl>
        </Card>
        <Card title="Services" icon="shield" hue="live">
          <dl className="sa-kv">{Object.entries(h?.services || {}).map(([k, v]) => (
            [<dt key={`${k}t`} className="mono">{k}</dt>, <dd key={`${k}d`}><Pill dot tone={v === "active" ? "live" : "bad"}>{v || "unknown"}</Pill></dd>]
          ))}</dl>
        </Card>
        <Card title="Deployed code" icon="box" hue="app">
          <dl className="sa-kv">
            <dt>Backend</dt><dd><span className="mono">{h?.code?.backend?.commit || "—"}</span> <span className="sa-dim">{h?.code?.backend?.date ? fmtDate(h.code.backend.date) : ""}</span></dd>
            <dt>Web app</dt><dd><span className="mono">{h?.code?.web?.commit || "—"}</span> <span className="sa-dim">{h?.code?.web?.date ? fmtDate(h.code.web.date) : ""}</span></dd>
            <dt>Environment</dt><dd>{d.app?.environment}</dd>
            <dt>API workers</dt><dd>{d.app?.workers}</dd>
            <dt>Session limit</dt><dd>{d.app?.session_days} days</dd>
          </dl>
        </Card>
      </div>
      <div className="sa-two">
        <Card id="srv-backups" title="Backups" icon="archive" hue="warn" pad={false} right={<small>{h?.backups?.count ?? 0} files · {bytes(h?.backups?.total_bytes)}</small>}>
          <div className="sa-tbl"><table>
            <thead><tr><th>File</th><th>Kind</th><th className="r">Size</th><th>Taken</th></tr></thead>
            <tbody>{(h?.backups?.files || []).slice(0, 10).map((f) => (
              <tr key={f.name}><td className="mono" style={{ fontSize: 12 }}>{f.name}</td>
                <td><Pill tone={f.name.startsWith("media") ? "app" : f.name.startsWith("pre-") ? "warn" : "pri"}>{f.name.startsWith("media") ? "Images" : f.name.startsWith("pre-") ? "Before deploy" : "Nightly DB"}</Pill></td>
                <td className="r">{bytes(f.bytes)}</td><td className="sa-muted">{fmtDateTime(f.at)}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <Card title="Scheduled jobs" icon="clock" hue="teal">
          <div style={{ display: "grid", gap: 8 }}>{(h?.cron || []).map((c) => <code key={c} className="sa-json" style={{ margin: 0 }}>{c}</code>)}</div>
        </Card>
      </div>
    </>
  );
}
