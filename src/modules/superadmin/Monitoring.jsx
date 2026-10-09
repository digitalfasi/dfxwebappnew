"use client";
import { useEffect, useMemo, useState } from "react";
import ServerTab from "@/modules/superadmin/Server";
import {
  saService, fmtDateTime, fmtTime, fmtDate, ago, seenAt, dur, bytes, inr, usedToday, EVENT_LABEL, END_LABEL,
} from "@/modules/superadmin/saService";
import {
  Card, Kpi, Pill, Icon, Empty, Skel, Pager, Drawer, HourChart, ClientTag, Who, HealthBanner, SystemMap,
  STATUS_TONE, STATUS_LABEL, ROLE_TONE, deviceWords, ipTitle, usePoll, useNow, hashParam, scrollToId,
} from "@/modules/superadmin/saUi";

const EVENT_TONE = { LOGIN_SUCCESS: "live", LOGIN_FAILED: "bad", LOGIN_BLOCKED: "warn", LOGOUT: "mute", LOGOUT_ALL: "mute", TOKEN_REUSE: "bad" };
const EVENT_ICON = { LOGIN_SUCCESS: "key", LOGIN_FAILED: "alert", LOGIN_BLOCKED: "lock", LOGOUT: "out", LOGOUT_ALL: "out", TOKEN_REUSE: "shield" };

export default function Monitoring({ tab, setTab, shopFilter, setShopFilter }) {
  const [live, setLive] = useState(true);
  const [person, setPerson] = useState(null);
  const ov = usePoll(() => saService.overview(), [], { ms: 15000, live });
  const now = useNow(15000);
  const tenants = ov.data?.tenants || [];

  const openShop = (id) => { setShopFilter(id); setTab("people"); };

  return (
    <>
      <div className="sa-row sa-updbar" style={{ fontSize: 12.5, color: "var(--faint)" }}>
        <span>{ov.at ? <>Updated <span className="mono">{fmtTime(new Date(ov.at).toISOString())}</span>{live ? " · refreshes every 15 s" : " · paused"}</> : "Loading…"}</span>
        <button className="sa-link" onClick={() => setLive((v) => !v)} aria-pressed={live}>{live ? "Pause" : "Resume"}</button>
        <button className="sa-link" onClick={ov.reload}>Refresh now</button>
      </div>

      {ov.error && <div className="sa-alert bad" style={{ marginBottom: 14 }}><Icon name="alert" />{ov.error}</div>}

      {tab === "live" && <LiveTab ov={ov} live={live} now={now} onPerson={setPerson} onShop={openShop} />}
      {tab === "people" && <PeopleTab tenants={tenants} shop={shopFilter} setShop={setShopFilter} live={live} onPerson={setPerson} />}
      {tab === "sessions" && <SessionsTab tenants={tenants} live={live} onPerson={setPerson} />}
      {tab === "signins" && <SignInsTab tenants={tenants} live={live} onPerson={setPerson} />}
      {tab === "activity" && <ActivityTab tenants={tenants} shop={shopFilter} />}
      {tab === "system" && <ServerTab live={live} />}

      {person && <PersonDrawer id={person} onClose={() => setPerson(null)} />}
    </>
  );
}

// ── Live now ───────────────────────────────────────────────────────────
function healthOf(d, sys, feed) {
  const bad = [], warn = [], ok = [];
  // The 5-minute gold-rate feed: every shop bills at the rate it writes.
  if (feed?.stale) bad.push(`Gold rate feed stopped - no live rate for ${feed.minutes_since_live != null ? `${feed.minutes_since_live} min` : "today"}`);
  const db = sys?.database, h = sys?.host;
  if (db && !db.healthy) bad.push("Database is not answering");
  const down = (h?.containers || []).filter((c) => !/^[0-9a-f]{12}_/.test(c.name) && (c.state !== "running" || (c.health && c.health !== "healthy")));
  const PART = { "dfx-web": "Website", "dfx-backend": "DFX program", "dfx-postgres": "Database" };
  if (down.length) bad.push(`${down.map((c) => PART[c.name] || c.name).join(", ")} not working - tell the tech team`);
  const dump = h?.backups?.files?.find((f) => f.name.startsWith("dfx-"));
  const dumpH = dump ? (Date.now() - new Date(dump.at).getTime()) / 3600000 : null;
  if (h && dumpH == null) bad.push("No nightly safety copy found - tell the tech team");
  else if (dumpH > 30) bad.push(`Last safety copy ${Math.round(dumpH)} h ago - tell the tech team`);
  const disk = h?.disk || sys?.machine?.disk;
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : null;
  if (diskPct >= 90) bad.push(`Storage ${diskPct}% full`); else if (diskPct >= 80) warn.push(`Storage ${diskPct}% full`);
  const errs = h?.app_logs?.errors_last_hour || 0;
  if (errs) warn.push(`${errs} server error${errs > 1 ? "s" : ""} in the last hour`);
  if (h?.updates?.reboot_required) warn.push("Server needs a restart to finish updates - tell the tech team");
  if ((d?.today?.failed_logins || 0) >= 10) warn.push(`${d.today.failed_logins} wrong-password logins today`);
  if (d?.today?.token_reuse) warn.push(`${d.today.token_reuse} copied-login alarm today - check Login problems & safety`);
  if (sys && !h) warn.push("Server health check is not reporting - tell the tech team");
  else if (h?.age_seconds > 300) warn.push(`Server snapshot ${Math.round(h.age_seconds / 60)} min old`);
  const certDays = h?.certificate?.expires ? Math.round((new Date(h.certificate.expires) - Date.now()) / 86400000) : null;
  if (certDays != null && certDays < 20) warn.push(`Website security certificate expires in ${certDays} days - tell the tech team`);
  if (db?.healthy) ok.push("Shop data safe");
  if (dumpH != null && dumpH <= 30) ok.push(`Last safety copy ${Math.round(dumpH)} h ago`);
  if (diskPct != null && diskPct < 80) ok.push(`Storage ${diskPct}% full`);
  if (certDays != null && certDays >= 20) ok.push(`Website security OK (${certDays} days left)`);
  if (feed && !feed.stale) ok.push(feed.market_open ? `Gold rate live${feed.minutes_since_live != null ? ` (${feed.minutes_since_live} min ago)` : ""}` : "Gold rate: market closed, last rate carried");
  const level = bad.length ? "bad" : warn.length ? "warn" : "ok";
  const title = bad.length ? "Something needs fixing now" : warn.length ? "Running, a few things need attention" : "Everything is running normally";
  return { level, title, points: [...bad, ...warn, ...(level === "ok" ? ok : [])], dumpH, diskPct, certDays, errs };
}

function LiveTab({ ov, live, now, onPerson, onShop }) {
  const d = ov.data;
  const online = usePoll(() => saService.sessions({ status: "active", limit: 100 }), [], { ms: 15000, live });
  const sys = usePoll(() => saService.system(), [], { ms: 30000, live });
  const feed = usePoll(() => saService.rateFeed(), [], { ms: 60000, live });
  if (!d) return <div className="sa-kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sa-kpi"><Skel h={40} w={40} /><Skel h={30} w="60%" /></div>)}</div>;
  const r = d.live.by_role || {};
  const c = d.live.by_client || {};
  const S = sys.data;
  const hh = healthOf(d, S, feed.data);
  const H = S?.host;
  const api = (H?.containers || []).find((x) => x.name === "dfx-backend");
  const lastMin = H?.web_traffic?.per_minute?.slice(-5) || [];
  const rpm = lastMin.length ? Math.round(lastMin.reduce((a, x) => a + x.n, 0) / lastMin.length) : null;
  const conns = Object.values(S?.database?.connections || {}).reduce((a, n) => a + n, 0);
  const people = (c.web || 0) + (c.app || 0) + (c.other || 0);
  const nodes = {
    web: { title: "On the website", value: `${c.web || 0} online`, note: "shop owners, staff, customers", state: c.web ? "live" : "off" },
    app: { title: "On the mobile app", value: `${c.app || 0} online`, note: "customers on their phones", state: c.app ? "live" : "off" },
    gw: { title: "Secure front door", value: rpm != null ? `${rpm} calls/min` : "Secure", note: hh.certDays != null ? `security certificate: ${hh.certDays} days left` : "every visit passes here", state: hh.certDays != null && hh.certDays < 20 ? "warn" : "live" },
    api: { title: "DFX server", value: api ? (api.health === "healthy" ? "Healthy" : api.health || api.state) : S ? "Running" : "…", note: H ? `${hh.errs} errors in the last hour` : "the DFX program", state: api && api.health !== "healthy" ? "bad" : hh.errs ? "warn" : "live" },
    db: { title: "Database", value: S?.database ? bytes(S.database.size_bytes) : "…", note: S?.database ? "all shop data is stored here" : "", state: S?.database && !S.database.healthy ? "bad" : "live" },
    bk: { title: "Backups", value: hh.dumpH != null ? `${Math.round(hh.dumpH)} h ago` : "—", note: "safety copy of all data, every night 07:45", state: hh.dumpH == null ? (H ? "bad" : "off") : hh.dumpH > 30 ? "bad" : "live" },
  };
  // One row per person: their most recent session, with how many are open.
  const byPerson = [];
  const seen = {};
  (online.data?.items || []).forEach((x) => {
    if (seen[x.user_id]) { seen[x.user_id].sessions += 1; return; }
    seen[x.user_id] = { ...x, sessions: 1 };
    byPerson.push(seen[x.user_id]);
  });
  const up = S?.database?.healthy !== false;
  const flows = {
    web: c.web || 0,
    app: c.app || 0,
    gw: people ? Math.min(4, people) : up ? "hb" : 0,
    api: people ? Math.min(4, people) : up ? "hb" : 0,
    bk: hh.dumpH != null && hh.dumpH <= 30 ? "hb" : 0,
  };

  return (
    <div className="sa-grid">
      <HealthBanner level={hh.level} title={hh.title} points={hh.points}
        side={<span className="sa-dim" style={{ fontSize: 12.5 }}>{S ? `checked ${ago(S.server_time, now)}` : "checking…"}</span>} />

      <Card title="Live system" icon="pulse" hue="live" right={<small>updates every 15 seconds</small>}>
        <SystemMap nodes={nodes} flows={flows} />
      </Card>

      <div className="sa-kpis">
        <Kpi go={"#/control/monitor/sessions?status=active"} live hue="live" label="Live now" value={d.live.total} sub="DFX open in a browser or the app right now" />
        <Kpi go={"#/control/monitor/people?role=all"} icon="users" hue="teal" label="People today" value={d.today.unique_users} sub="different people since midnight" />
        <Kpi go={"#/control/shops"} icon="shop" hue="app" label="Shops open today" value={(d.tenants || []).filter(usedToday).length} sub={`of ${d.accounts.tenants} shops used DFX`} />
        <Kpi go={"#/control/monitor/signins?event=LOGIN_SUCCESS"} icon={d.today.failed_logins || d.today.token_reuse ? "alert" : "check"} hue="web" tone={d.today.token_reuse ? "bad" : d.today.failed_logins ? "warn" : undefined}
          label="Logins today" value={d.today.logins}
          sub={d.today.token_reuse ? `${d.today.token_reuse} security alarm${d.today.token_reuse > 1 ? "s" : ""} - see Sign-ins`
            : `${d.today.failed_logins} failed · ${d.today.blocked_logins} blocked`} />
        <Kpi go={"#/control/monitor/people?role=Customer"} icon="plus" hue="warn" label="New customers today" value={d.today.new_customers} sub="joined any shop" />
      </div>

      <Card title="Who is using DFX right now" icon="pulse" hue="live" pad={false} right={<small>{byPerson.length} people · click a row for their history</small>}>
        <SessionTable rows={byPerson} loading={online.loading && !online.data} onPerson={onPerson} compact now={now}
          empty="Nobody has used DFX in the last few minutes." />
      </Card>

      <div className="sa-two">
        <Card title="Logins through the day" icon="activity" hue="web" right={<small>India time · today</small>}>
          <HourChart a={d.today.hourly_logins} b={d.today.hourly_failed} aLabel="Logins" bLabel="Failed" height={250} />
        </Card>
        <Card title="Latest logins and logouts" icon="shield" hue="teal" fill>
          <EventFeed items={d.recent_events} now={now} onPerson={onPerson} />
        </Card>
      </div>

      <ShopBoard tenants={d.tenants} now={now} onShop={onShop} />
    </div>
  );
}

function ShopBoard({ tenants, now, onShop }) {
  // "Today" means someone used the shop today - a login left open from
  // yesterday is not activity.
  const active = [...tenants].filter(usedToday)
    .sort((a, b) => b.live_now - a.live_now || b.users_today - a.users_today);
  return (
    <Card title="Shops active today" icon="shop" hue="warn" pad={false}
      right={<small>{active.length} of {tenants.length} shops · click a shop to see its people</small>}>
      {active.length ? <ShopTable rows={active} now={now} onShop={onShop} />
        : <Empty title="No shop activity yet today">Shops appear here as soon as someone signs in or makes a sale.</Empty>}
    </Card>
  );
}

function EventFeed({ items, now, onPerson }) {
  if (!items?.length) return <Empty title="No events yet">Sign-ins and sign-outs appear here as they happen.</Empty>;
  return (
    <div className="sa-feed">
      {items.map((e) => (
        <div key={e.id}>
          <span className={`sa-ico t-${EVENT_TONE[e.event] || "mute"}`}><Icon name={EVENT_ICON[e.event] || "key"} size={15} /></span>
          <div className="txt">
            <b style={{ cursor: e.user_id ? "pointer" : "default" }} onClick={() => e.user_id && onPerson(e.user_id)}>
              {e.user_name || e.identifier || "Unknown account"}
            </b>{" "}
            <span style={{ display: "inline", color: "var(--muted)" }}>{(EVENT_LABEL[e.event] || e.event).toLowerCase()}</span>
            <span>{[e.tenant_name || (e.role === "SuperAdmin" ? "DFX platform" : null), ROLE_WORD[e.role] || e.role, e.client === "app" ? "Mobile app" : e.client === "web" ? "Website" : null].filter(Boolean).join(" · ")}{e.reason ? ` · ${e.reason}` : ""}</span>
          </div>
          <time title={fmtDateTime(e.at)}>{seenAt(e.at)}</time>
        </div>
      ))}
    </div>
  );
}

// ── Shops ──────────────────────────────────────────────────────────────
function ShopTable({ rows, now, onShop }) {
  if (!rows?.length) return <Empty title="No shop has used DFX yet today">Shops appear here as soon as someone logs in.</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr>
          <th>Shop</th><th className="r">Live now</th><th className="r">People today</th><th className="r">Logins</th>
          <th className="r">Failed logins</th><th className="r">Sales today</th><th>Owner last seen</th>
        </tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="click" onClick={() => onShop(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onShop(t.id)}>
              <td className="who"><b>{t.name}</b>{t.status !== "Active" && <span style={{ color: "var(--bad)" }}>Switched off</span>}</td>
              <td className="r">{t.live_now > 0 ? <Pill tone="live" dot>{t.live_now}</Pill> : <span className="sa-dim">0</span>}</td>
              <td className="r">{t.users_today}</td>
              <td className="r">{t.logins_today}</td>
              <td className="r">{t.failed_today ? <Pill tone="bad">{t.failed_today}</Pill> : <span className="sa-dim">0</span>}</td>
              <td className="r">{t.sales_today ? <><b>{inr(t.sales_today_amount)}</b> <span className="sa-dim">· {t.sales_today}</span></> : <span className="sa-dim">No sales</span>}</td>
              <td>{t.last_admin_seen_at
                ? <span title={fmtDateTime(t.last_admin_seen_at)} style={{ color: t.admin_idle_days >= 3 ? "var(--warn)" : undefined }}>{seenAt(t.last_admin_seen_at)}</span>
                : <span className="sa-dim">Never</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── People ─────────────────────────────────────────────────────────────
const PEOPLE_GROUPS = [
  { k: "Team", label: "Shop team", hint: "owners, staff and super admins" },
  { k: "Customer", label: "Customers", hint: "mobile app customers" },
  { k: "", label: "Everyone", hint: "" },
];
const PRESENCE = [
  { k: "", label: "All", n: "all" },
  { k: "online", label: "Using now", n: "online" },
  { k: "idle", label: "Inactive", n: "idle" },
  { k: "offline", label: "Logged out", n: "offline" },
  { k: "never", label: "Never logged in", n: "never" },
];

function PeopleTab({ tenants, shop, setShop, live, onPerson }) {
  const [role, setRole] = useState(() => { const r = hashParam("role"); return r === "all" ? "" : r || "Team"; });
  const [presence, setPresence] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setQd(q), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [shop, role, presence, qd]);
  const res = usePoll(() => saService.users({ tenant_id: shop, role, presence, q: qd, page, limit: 50 }),
    [shop, role, presence, qd, page], { ms: 30000, live });
  const now = useNow(30000);
  const d = res.data;
  const n = d?.counts || {};
  return (
    <div className="sa-grid">
      <div className="sa-seg" role="tablist" aria-label="Who">
        {PEOPLE_GROUPS.map((g) => (
          <button key={g.k || "all"} role="tab" aria-selected={role === g.k} onClick={() => setRole(g.k)} title={g.hint}>{g.label}</button>
        ))}
      </div>
      <Card pad={false}>
        <div className="sa-filters" style={{ justifyContent: "space-between" }}>
          <div className="sa-seg" role="tablist" aria-label="Status">
            {PRESENCE.map((p) => (
              <button key={p.k || "all"} role="tab" aria-selected={presence === p.k} onClick={() => setPresence(p.k)}>
                {p.label}<span className={`cnt${!n[p.n] ? " zero" : ""}`}>{n[p.n] ?? "–"}</span>
              </button>
            ))}
          </div>
          <div className="sa-row">
            <input className="sa-in" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
            <ShopSelect tenants={tenants} value={shop} onChange={setShop} />
          </div>
        </div>
        <div className="sa-dim" style={{ fontSize: 12.5, padding: "0 16px 10px" }}>
          <b>Using now</b> = DFX is open on their screen right now. <b>Inactive</b> = they closed DFX without pressing Log out, so they are still logged in. <b>Logged out</b> = they pressed Log out. Click a person to see every login.
        </div>
        {res.loading && !d ? <div className="sa-card-b"><Skel h={160} /></div> : !d?.items?.length ? <Empty title="Nobody here">Try another group, status, shop or search.</Empty> : (
          <div className="sa-tbl">
            <table>
              <thead><tr><th>Person</th><th>Shop</th><th>Role</th><th>Status</th><th>Last used DFX</th><th className="r" title="How long DFX was open on their screen today - a window left open counts too">DFX open today</th></tr></thead>
              <tbody>
                {d.items.map((u) => (
                  <tr key={u.id} className="click" onClick={() => onPerson(u.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPerson(u.id)}>
                    <td><Who name={u.name} role={u.role} sub={[u.phone, u.email].filter(Boolean).join(" · ") || "no contact on file"} />
                      {!u.is_active && <div style={{ color: "var(--bad)", fontSize: 12, marginLeft: 42 }}>Account disabled</div>}</td>
                    <td>{u.tenant_name || <span className="sa-dim">DFX platform</span>}</td>
                    <td><Pill tone={ROLE_TONE[u.role]}>{u.role === "Admin" ? "Owner" : u.role === "SuperAdmin" ? "Super admin" : u.role}</Pill></td>
                    <td><Pill dot tone={STATUS_TONE[u.presence]}>{STATUS_LABEL[u.presence]}</Pill></td>
                    <td>{u.last_seen_at
                      ? <><span title={fmtDateTime(u.last_seen_at)}>{u.presence === "online" ? "Right now" : seenAt(u.last_seen_at)}</span><div className="sa-dim" style={{ fontSize: 12 }}>last login {fmtDateTime(u.last_login_at)}</div></>
                      : <span className="sa-dim">—</span>}</td>
                    <td className="r">{u.today_seconds || u.sessions_today
                      ? <><b>{dur(u.today_seconds)}</b><div className="sa-dim" style={{ fontSize: 12, fontFamily: "inherit" }}>{u.sessions_today} login{u.sessions_today === 1 ? "" : "s"}</div></>
                      : <span className="sa-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

function ShopSelect({ tenants, value, onChange }) {
  return (
    <select className="sa-sel" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Shop">
      <option value="">All shops</option>
      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

// ── Sessions ───────────────────────────────────────────────────────────
const SESSION_STATUS = [
  { k: "active", label: "Using now" },
  { k: "idle", label: "Inactive" },
  { k: "ended", label: "Logged out" },
  { k: "expired", label: "Auto logged out" },
  { k: "all", label: "All" },
];

function SessionsTab({ tenants, live, onPerson }) {
  const [f, setF] = useState({ status: hashParam("status") || "active", tenant_id: "", role: "", client: "", date_from: "", date_to: "", q: "" });
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 350); return () => clearTimeout(t); }, [f.q]);
  useEffect(() => setPage(1), [f.status, f.tenant_id, f.role, f.client, f.date_from, f.date_to, qd]);
  const res = usePoll(() => saService.sessions({ ...f, q: qd, page, limit: 50 }),
    [f.status, f.tenant_id, f.role, f.client, f.date_from, f.date_to, qd, page], { ms: 20000, live });
  const now = useNow(20000);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = res.data?.counts || {};
  return (
    <Card pad={false}>
      <div className="sa-filters" style={{ justifyContent: "space-between" }}>
        <div className="sa-seg" role="tablist" aria-label="Status">
          {SESSION_STATUS.map((o) => (
            <button key={o.k} role="tab" aria-selected={f.status === o.k} onClick={() => setF((s) => ({ ...s, status: o.k }))}>
              {o.label}<span className={`cnt${!n[o.k] ? " zero" : ""}`}>{n[o.k] ?? "–"}</span>
            </button>
          ))}
        </div>
        <div className="sa-row">
          <input className="sa-in" placeholder="Search person or IP" value={f.q} onChange={set("q")} aria-label="Search sessions" />
          <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
          <select className="sa-sel" value={f.role} onChange={set("role")} aria-label="Who">
            <option value="">Everyone</option><option value="Team">Shop team</option><option value="Customer">Customers</option>
          </select>
          <select className="sa-sel" value={f.client} onChange={set("client")} aria-label="Device">
            <option value="">Website + app</option><option value="web">Website only</option><option value="app">Mobile app only</option>
          </select>
          <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" title="From" />
          <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" title="To" />
        </div>
      </div>
      <div className="sa-dim" style={{ fontSize: 12.5, padding: "0 16px 10px" }}>
        Each row is one login. <b>Using now</b> = DFX is open on their screen. <b>Inactive</b> = they closed DFX without logging out; if they don't come back within 2 days, DFX logs them out by itself (<b>Auto logged out</b>). The same person can have several rows if they logged in on more than one device or browser. Point at a device to see its internet address.
      </div>
      <SessionTable rows={res.data?.items} loading={res.loading && !res.data} onPerson={onPerson} now={now}
        empty={f.status === "active" ? "Nobody is using DFX right now." : "No sessions match these filters."} />
      {res.data && <Pager page={res.data.page} limit={res.data.limit} total={res.data.total} onPage={setPage} />}
    </Card>
  );
}

const lengthOf = (sec) => (!sec || sec < 60 ? "under 1 min" : dur(sec));

function SessionTable({ rows, loading, onPerson, compact, now, empty, hidePerson }) {
  if (loading) return <div className="sa-card-b"><Skel h={140} /></div>;
  if (!rows?.length) return <Empty title="Nothing here">{empty}</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr>
          {!hidePerson && <th>Person</th>}<th>Status</th><th>Logged in</th><th>Logged out</th>
          {!compact && <th>Device</th>}<th className="r">Time spent</th>
        </tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={hidePerson ? "" : "click"} onClick={() => !hidePerson && onPerson?.(s.user_id)}>
              {!hidePerson && <td><Who name={s.user_name} role={s.role} sub={`${s.tenant_name || "DFX platform"} · ${ROLE_WORD[s.role] || s.role}`} /></td>}
              <td><Pill dot tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Pill></td>
              <td>{fmtDateTime(s.started_at)}{s.login_method === "google" ? <span className="sa-dim"> · with Google</span> : null}</td>
              <td className="wrap">{s.ended_at ? <>{fmtDateTime(s.ended_at)}{s.end_reason && s.end_reason !== "logout" ? <div className="sa-dim" style={{ fontSize: 12 }}>{END_LABEL[s.end_reason] || s.end_reason}</div> : null}</>
                : s.status === "active" ? <b style={{ color: "var(--live)" }}>Still using DFX</b>
                : s.status === "expired" ? <span className="sa-dim">Automatically, after 2 days unused</span>
                : <span className="sa-dim">Not yet - last used {seenAt(s.last_seen_at)}</span>}</td>
              {!compact && <td title={ipTitle(s.ip)}><ClientTag client={s.client} device={s.device} />
                <div className="sa-dim" style={{ fontSize: 12, marginTop: 3 }}>{deviceWords(s)}</div></td>}
              <td className="r">{lengthOf(s.duration_seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sign-ins & security ────────────────────────────────────────────────
function SignInsTab({ tenants, live, onPerson }) {
  const [f, setF] = useState({ event: hashParam("event") || "", tenant_id: "", date_from: "", date_to: "", q: "" });
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 350); return () => clearTimeout(t); }, [f.q]);
  useEffect(() => setPage(1), [f.event, f.tenant_id, f.date_from, f.date_to, qd]);
  const res = usePoll(() => saService.events({ ...f, q: qd, page, limit: 50 }),
    [f.event, f.tenant_id, f.date_from, f.date_to, qd, page], { ms: 20000, live });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const d = res.data;
  const c = d?.summary_24h?.counts || {};
  return (
    <div className="sa-grid">
      <div className="sa-kpis">
        <Kpi go={() => { setF((s) => ({ ...s, event: "LOGIN_SUCCESS" })); scrollToId("signin-events"); }} icon="key" hue="live" label="Logins · last 24 h" value={c.LOGIN_SUCCESS || 0} sub="successful" />
        <Kpi go={() => { setF((s) => ({ ...s, event: "LOGIN_FAILED" })); scrollToId("signin-events"); }} icon="alert" hue={c.LOGIN_FAILED ? "bad" : "ink"} label="Failed logins · 24 h" value={c.LOGIN_FAILED || 0} sub="wrong password or unknown login" />
        <Kpi go={() => { setF((s) => ({ ...s, event: "LOGIN_BLOCKED" })); scrollToId("signin-events"); }} icon="lock" hue="warn" label="Blocked logins · 24 h" value={c.LOGIN_BLOCKED || 0} sub="account disabled or shop switched off" />
        <Kpi go={() => { setF((s) => ({ ...s, event: "TOKEN_REUSE" })); scrollToId("signin-events"); }} icon="shield" hue={c.TOKEN_REUSE ? "bad" : "app"} label="Security alarms · 24 h" value={c.TOKEN_REUSE || 0}
          sub={c.TOKEN_REUSE ? "a copied login was used - that person was logged out everywhere" : "no copied logins detected"} />
      </div>
      <div className="sa-split">
        <Card title="Failed logins by network (IP address) · 24 h" icon="alert">
          <RankList rows={d?.summary_24h?.top_failed_ips} k="ip" mono />
        </Card>
        <Card title="Failed logins by login name (email or phone) · 24 h" icon="users">
          <RankList rows={d?.summary_24h?.top_failed_identifiers} k="identifier" />
        </Card>
      </div>
      <Card pad={false} id="signin-events">
        <div className="sa-filters" style={{ justifyContent: "space-between" }}>
          <div className="sa-seg" role="tablist" aria-label="Show">
            {[["", "Everything"], ["LOGIN_FAILED,LOGIN_BLOCKED,TOKEN_REUSE", "Problems only"], ["LOGIN_SUCCESS", "Logins"],
              ["LOGIN_FAILED", "Failed"], ["LOGIN_BLOCKED", "Blocked"], ["LOGOUT,LOGOUT_ALL", "Logouts"], ["TOKEN_REUSE", "Security alarms"]].map(([k, label]) => (
              <button key={k || "all"} role="tab" aria-selected={f.event === k} onClick={() => setF((s) => ({ ...s, event: k }))}>{label}</button>
            ))}
          </div>
          <div className="sa-row">
            <input className="sa-in" placeholder="Search email, phone, name or IP" value={f.q} onChange={set("q")} aria-label="Search events" />
            <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
            <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" title="From" />
            <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" title="To" />
          </div>
        </div>
        <EventTable rows={d?.items} loading={res.loading && !d} onPerson={onPerson} />
        {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

function RankList({ rows, k, mono, noTime }) {
  if (!rows?.length) return <Empty title="Nothing in the last 24 hours">No failed logins.</Empty>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r) => (
        <div key={r[k] || "none"} style={{ display: "grid", gap: 4 }}>
          <div className="sa-row" style={{ justifyContent: "space-between", fontSize: 13 }}>
            <span className={mono ? "mono" : ""} style={{ overflowWrap: "anywhere" }}>{r[k] || "—"}</span>
            <span><b className="mono">{r.count}</b>{!noTime && r.last_at && <span className="sa-dim"> · last {fmtTime(r.last_at)}</span>}</span>
          </div>
          <div className={`sa-bar${r.count >= 10 ? " bad" : r.count >= 5 ? " warn" : ""}`}><i style={{ width: `${(r.count / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function EventTable({ rows, loading, onPerson, hidePerson }) {
  if (loading) return <div className="sa-card-b"><Skel h={140} /></div>;
  if (!rows?.length) return <Empty title="No events">Nothing matches these filters.</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr><th>When</th><th>What happened</th>{!hidePerson && <th>Who</th>}<th>Device</th><th>Reason</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={e.user_id && !hidePerson ? "click" : ""} onClick={() => e.user_id && !hidePerson && onPerson?.(e.user_id)}>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.at)}</td>
              <td><Pill tone={EVENT_TONE[e.event]}>{EVENT_LABEL[e.event] || e.event}</Pill></td>
              {!hidePerson && <td><Who name={e.user_name || e.identifier || "Unknown login"} role={e.role}
                sub={e.user_name ? `${e.tenant_name || (e.role === "SuperAdmin" ? "DFX platform" : "—")} · ${ROLE_WORD[e.role] || e.role}` : "no account uses this login"} /></td>}
              <td title={ipTitle(e.ip)}>{e.client ? <ClientTag client={e.client} device={e.device} /> : "—"}
                <div className="sa-dim" style={{ fontSize: 12, marginTop: 3 }}>{deviceWords(e)}</div></td>
              <td className="sa-muted wrap" style={{ maxWidth: 260 }}>{e.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Activity ───────────────────────────────────────────────────────────
// Every action the audit log records, in words a shop owner would use.
const ACTION_LABEL = {
  GOLDRATE_UPDATE: "Changed today's gold rate", GOLDRATE_CREATE: "Set today's gold rate", GOLDRATE_BACK_TO_LIVE: "Put the gold rate back on live",
  CUSTOMER_CREATE: "Added a customer", CUSTOMER_UPDATE: "Edited a customer",
  ENROLLMENT_CREATE: "Enrolled a customer in a scheme", ENROLLMENT_REMARKS_UPDATE: "Edited scheme remarks", SCHEME_ENROLLMENT_CLOSE: "Closed a scheme enrolment",
  PAYMENT_CREATE_MANUAL: "Recorded a scheme payment", PAYMENT_UPDATE: "Changed a scheme payment",
  SCHEME_CREATE: "Created a scheme", SCHEME_UPDATE: "Edited a scheme", SCHEME_DEACTIVATE: "Switched off a scheme",
  SALE_CREATE: "Made a sale", RAW_GOLD_SALE_CREATE: "Sold raw gold", INVENTORY_BULK_PURCHASE: "Bought stock (bulk)", RAW_GOLD_BULK_PURCHASE: "Bought raw gold",
  INVENTORY_ITEM_CREATE: "Added a stock item", INVENTORY_ITEM_IMAGE_UPLOAD: "Added a stock photo",
  INVENTORY_CATEGORY_CREATE: "Added a stock category", INVENTORY_CATEGORY_DELETE: "Deleted a stock category", INVENTORY_SUBCATEGORY_CREATE: "Added a stock sub-category",
  PRODUCT_CREATE: "Added a catalogue product", PRODUCT_UPDATE: "Edited a catalogue product", PRODUCT_DEACTIVATE: "Hid a catalogue product",
  PRODUCT_IMAGE_UPLOAD: "Added a product photo", PRODUCT_IMAGE_SET_PRIMARY: "Changed a product's main photo", PRODUCT_PUBLISH_FROM_INVENTORY: "Published stock to the catalogue",
  PROMOTION_CREATE: "Created a promotion", PROMOTION_UPDATE: "Edited a promotion", PROMOTION_DELETE: "Deleted a promotion",
  PROMOTION_IMAGE_UPLOAD: "Added a promotion image", PROMOTION_VIDEO_UPLOAD: "Added a promotion video",
  STAFF_CREATE: "Added a staff member", STAFF_DELETE: "Removed a staff member", BRANCH_CREATE: "Added a branch",
  TENANT_CREATE: "Created a shop", TENANT_ADMIN_CREATE: "Created the shop owner's login", TENANT_DISABLE: "Switched off a shop", TENANT_PROFILE_UPDATE: "Edited the shop profile",
  SUBSCRIPTION_CREATE: "Started the shop's plan", SUBSCRIPTION_AUTO_EXPIRE: "Trial ended - shop locked",
  PASSWORD_RESET_REQUESTED: "Asked for a password reset", EMAIL_VERIFICATION_REQUESTED: "Asked for an email check", OTP_REQUEST: "Asked for a login code",
  WISHLIST_ADD: "Added to wishlist", WISHLIST_REMOVE: "Removed from wishlist", UAT_TEST_CUSTOMER_DELETE: "Deleted a test customer",
};
const prettyAction = (a) => ACTION_LABEL[a] || (a || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase());
const ROLE_WORD = { Admin: "Owner", SuperAdmin: "Super admin", System: "Automatic", "Self sign-up": "Free-trial sign-up" };

function ActivityTab({ tenants, shop }) {
  const [f, setF] = useState({ tenant_id: shop || "", action: "", date_from: "", date_to: "", q: "", people_only: true });
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 350); return () => clearTimeout(t); }, [f.q]);
  useEffect(() => setPage(1), [f.tenant_id, f.action, f.date_from, f.date_to, qd, f.people_only]);
  const res = usePoll(() => saService.activity({ ...f, people_only: f.people_only ? "true" : undefined, q: qd, page, limit: 50 }),
    [f.tenant_id, f.action, f.date_from, f.date_to, qd, page, f.people_only], { ms: 30000, live: false });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const d = res.data;
  const actions = [...(d?.actions || [])].sort((x, y) => prettyAction(x).localeCompare(prettyAction(y)));
  return (
    <Card pad={false}>
      <div className="sa-filters" style={{ justifyContent: "space-between" }}>
        <div className="sa-seg" role="tablist" aria-label="Whose changes">
          <button role="tab" aria-selected={f.people_only} onClick={() => setF((s) => ({ ...s, people_only: true }))}>Changes by people</button>
          <button role="tab" aria-selected={!f.people_only} onClick={() => setF((s) => ({ ...s, people_only: false }))}>Include automatic gold-rate updates</button>
        </div>
        <div className="sa-row">
          <input className="sa-in" placeholder="Search person or action" value={f.q} onChange={set("q")} aria-label="Search activity" />
          <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
          <select className="sa-sel" value={f.action} onChange={set("action")} aria-label="Action">
            <option value="">Every kind of change</option>{actions.map((x) => <option key={x} value={x}>{prettyAction(x)}</option>)}
          </select>
          <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" title="From" />
          <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" title="To" />
        </div>
      </div>
      <div className="sa-dim" style={{ fontSize: 12.5, padding: "0 16px 10px" }}>Everything people changed in any shop, newest first. Click a row to see exactly what changed.</div>
      <ActivityTable rows={d?.items} loading={res.loading && !d} open={open} setOpen={setOpen} />
      {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
    </Card>
  );
}

function ActivityTable({ rows, loading, open, setOpen, hideActor }) {
  if (loading) return <div className="sa-card-b"><Skel h={140} /></div>;
  if (!rows?.length) return <Empty title="No activity">Nothing recorded for these filters.</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr><th>When</th>{!hideActor && <th>Who</th>}<th>What they did</th><th>Shop</th><th /></tr></thead>
        <tbody>
          {rows.map((a) => (
            <FragmentRow key={a.id} a={a} open={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} hideActor={hideActor} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ a, open, toggle, hideActor }) {
  const has = a.before || a.after;
  return (
    <>
      <tr className={has ? "click" : ""} onClick={has ? toggle : undefined}>
        <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.at)}</td>
        {!hideActor && <td><Who name={a.actor_name} role={a.actor_role} sub={ROLE_WORD[a.actor_role] || a.actor_role} /></td>}
        <td><b style={{ fontWeight: 600 }}>{prettyAction(a.action)}</b></td>
        <td>{a.tenant_name || <span className="sa-dim">DFX platform</span>}</td>
        <td style={{ color: "var(--acc)", whiteSpace: "nowrap", textAlign: "right", fontWeight: 600, fontSize: 13 }}>{has ? (open ? "Hide" : "What changed") : ""}</td>
      </tr>
      {open && (
        <tr><td colSpan={hideActor ? 4 : 5} style={{ background: "var(--tint)" }}>
          <ChangeList before={parse(a.before)} after={parse(a.after)} />
          <div className="sa-dim" style={{ fontSize: 11.5, marginTop: 8 }}>Record <span className="mono">{a.target_id || "—"}</span></div>
        </td></tr>
      )}
    </>
  );
}

function parse(s) {
  if (!s) return null;
  try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return { value: String(s) }; }
}
const fieldName = (k) => k.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
const show = (v) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Before -> after as plain lines, changed fields first, instead of raw JSON.
function ChangeList({ before, after }) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  if (!keys.length) return <span className="sa-dim">No details were recorded.</span>;
  const changed = (k) => before && after && show(before[k]) !== show(after[k]);
  keys.sort((x, y) => Number(changed(y)) - Number(changed(x)));
  return (
    <dl className="sa-kv" style={{ margin: 0 }}>
      {keys.map((k) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{fieldName(k)}</dt>
          <dd style={{ textAlign: "left" }}>
            {before && after && changed(k)
              ? <><span className="sa-dim" style={{ textDecoration: "line-through" }}>{show(before[k])}</span> → <b>{show(after[k])}</b></>
              : show((after || before)[k])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── One person's timeline ──────────────────────────────────────────────
function PersonDrawer({ id, onClose }) {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState("sessions");
  const [open, setOpen] = useState(null);
  const res = usePoll(() => saService.userTimeline(id, days), [id, days], { ms: 30000, live: true });
  const now = useNow(30000);
  const d = res.data;
  const u = d?.user;
  const maxDay = useMemo(() => Math.max(1, ...(d?.daily || []).map((x) => x.seconds)), [d]);
  const current = d?.sessions?.find((s) => s.status === "active" || s.status === "idle");
  const total14 = (d?.daily || []).reduce((s, x) => s + x.seconds, 0);

  return (
    <Drawer title={u?.name || "Loading…"} onClose={onClose}
      sub={u ? [ROLE_WORD[u.role] || u.role, u.tenant_name || "DFX platform", u.email || u.phone].filter(Boolean).join(" · ") : ""}
      actions={<select className="sa-sel" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
        <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>}>
      {!d ? <Skel h={200} /> : (
        <>
          <div className="sa-kpis">
            <Kpi go={() => scrollToId("person-sessions")} hue={current ? "live" : "ink"} live={current?.status === "active"} icon={current ? undefined : "clock"} label="Right now"
              value={current ? STATUS_LABEL[current.status] : "Logged out"}
              sub={current ? `${current.client === "app" ? "Mobile app" : "Website"} · logged in at ${fmtTime(current.started_at)}` : `last used DFX ${seenAt(d.sessions[0]?.last_seen_at)}`} />
            <Kpi go={() => scrollToId("person-sessions")} icon="clock" hue="web" label="DFX open · last 14 days" value={dur(total14)} sub={`${d.sessions.length} logins in ${days} days`} />
            <Kpi go={() => scrollToId("person-sessions")} icon="users" hue={u.is_active ? "teal" : "bad"} label="Can log in?" value={u.is_active ? "Yes" : "No - blocked"} sub={`account made ${fmtDate(u.created_at)}`} />
          </div>
          <Card title="DFX open per day (India time)" icon="activity">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(14,1fr)", gap: 6, alignItems: "end", height: 120 }}>
              {d.daily.map((x) => (
                <div key={x.date} title={`${fmtDate(x.date)} — ${dur(x.seconds)}, ${x.sessions} sign-ins`} style={{ display: "grid", gap: 4, justifyItems: "center", height: "100%", alignContent: "end" }}>
                  <div style={{ width: "100%", height: `${Math.max(3, (x.seconds / maxDay) * 92)}px`, borderRadius: 5,
                    background: x.seconds ? "var(--acc)" : "var(--rule2)" }} />
                  <span className="sa-dim" style={{ fontSize: 10 }}>{new Date(x.date).getDate()}</span>
                </div>
              ))}
            </div>
          </Card>
          <div id="person-sessions" className="sa-tabs" role="tablist" style={{ marginBottom: 0, scrollMarginTop: 20 }}>
            {[["sessions", `Logins (${d.sessions.length})`], ["events", `Login attempts (${d.events.length})`], ["activity", `Changes made (${d.activity.length})`]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <Card pad={false}>
            {tab === "sessions" && <SessionTable rows={d.sessions} hidePerson now={now} empty="No logins in this period." />}
            {tab === "events" && <EventTable rows={d.events} hidePerson />}
            {tab === "activity" && <ActivityTable rows={d.activity} open={open} setOpen={setOpen} hideActor />}
          </Card>
        </>
      )}
    </Drawer>
  );
}
