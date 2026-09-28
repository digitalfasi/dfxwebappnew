"use client";
import { useEffect, useMemo, useState } from "react";
import ServerTab from "@/modules/superadmin/Server";
import {
  saService, fmtDateTime, fmtTime, fmtDate, ago, dur, bytes, inr, EVENT_LABEL, END_LABEL,
} from "@/modules/superadmin/saService";
import {
  Card, Kpi, Pill, Icon, Empty, Skel, Pager, Drawer, HourChart, ClientTag, Who, Donut, HealthBanner, SystemMap,
  STATUS_TONE, STATUS_LABEL, ROLE_TONE, usePoll, useNow,
} from "@/modules/superadmin/saUi";

const TABS = [
  { key: "live", label: "Live now", icon: "pulse" },
  { key: "shops", label: "Shops", icon: "shop" },
  { key: "people", label: "People", icon: "users" },
  { key: "sessions", label: "Sessions", icon: "clock" },
  { key: "signins", label: "Sign-ins & security", icon: "shield" },
  { key: "activity", label: "Activity", icon: "list" },
  { key: "system", label: "Server & database", icon: "server" },
];

const EVENT_TONE = { LOGIN_SUCCESS: "live", LOGIN_FAILED: "bad", LOGIN_BLOCKED: "warn", LOGOUT: "mute", LOGOUT_ALL: "mute", TOKEN_REUSE: "bad" };
const EVENT_ICON = { LOGIN_SUCCESS: "key", LOGIN_FAILED: "alert", LOGIN_BLOCKED: "lock", LOGOUT: "out", LOGOUT_ALL: "out", TOKEN_REUSE: "shield" };
const ROLES = ["Admin", "Staff", "Customer", "SuperAdmin"];

export default function Monitoring({ tab, setTab, shopFilter, setShopFilter }) {
  const [live, setLive] = useState(true);
  const [person, setPerson] = useState(null);
  const ov = usePoll(() => saService.overview(), [], { ms: 15000, live });
  const now = useNow(15000);
  const tenants = ov.data?.tenants || [];

  const openShop = (id) => { setShopFilter(id); setTab("people"); };

  return (
    <>
      <div className="sa-row" style={{ justifyContent: "flex-end", margin: "-34px 0 14px", fontSize: 12.5, color: "var(--faint)" }}>
        <span>{ov.at ? <>Updated <span className="mono">{fmtTime(new Date(ov.at).toISOString())}</span>{live ? " · refreshes every 15 s" : " · paused"}</> : "Loading…"}</span>
        <button className="sa-link" onClick={() => setLive((v) => !v)} aria-pressed={live}>{live ? "Pause" : "Resume"}</button>
        <button className="sa-link" onClick={ov.reload}>Refresh now</button>
      </div>

      {ov.error && <div className="sa-alert bad" style={{ marginBottom: 14 }}><Icon name="alert" />{ov.error}</div>}

      {tab === "live" && <LiveTab ov={ov} live={live} now={now} onPerson={setPerson} onShop={openShop} />}
      {tab === "shops" && <ShopsTab tenants={tenants} loading={ov.loading && !ov.data} now={now} onShop={openShop} />}
      {tab === "people" && <PeopleTab tenants={tenants} shop={shopFilter} setShop={setShopFilter} live={live} onPerson={setPerson} />}
      {tab === "sessions" && <SessionsTab tenants={tenants} live={live} onPerson={setPerson} />}
      {tab === "signins" && <SignInsTab tenants={tenants} live={live} onPerson={setPerson} />}
      {tab === "activity" && <ActivityTab tenants={tenants} />}
      {tab === "system" && <ServerTab live={live} />}

      {person && <PersonDrawer id={person} onClose={() => setPerson(null)} />}
    </>
  );
}

// ── Live now ───────────────────────────────────────────────────────────
function healthOf(d, sys) {
  const bad = [], warn = [], ok = [];
  const db = sys?.database, h = sys?.host;
  if (db && !db.healthy) bad.push("Database is not answering");
  const down = (h?.containers || []).filter((c) => c.state !== "running" || (c.health && c.health !== "healthy"));
  if (down.length) bad.push(`${down.map((c) => c.name).join(", ")} not healthy`);
  const dump = h?.backups?.files?.find((f) => f.name.startsWith("dfx-"));
  const dumpH = dump ? (Date.now() - new Date(dump.at).getTime()) / 3600000 : null;
  if (h && dumpH == null) bad.push("No nightly backup found");
  else if (dumpH > 30) bad.push(`Last backup ${Math.round(dumpH)} h ago`);
  const disk = h?.disk || sys?.machine?.disk;
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : null;
  if (diskPct >= 90) bad.push(`Disk ${diskPct}% full`); else if (diskPct >= 80) warn.push(`Disk ${diskPct}% full`);
  const errs = h?.app_logs?.errors_last_hour || 0;
  if (errs) warn.push(`${errs} server error${errs > 1 ? "s" : ""} in the last hour`);
  if (h?.updates?.reboot_required) warn.push("Server wants a reboot to finish updates");
  if ((d?.today?.failed_logins || 0) >= 10) warn.push(`${d.today.failed_logins} failed sign-ins today`);
  if (d?.today?.token_reuse) warn.push(`${d.today.token_reuse} stolen-token alarm today`);
  if (sys && !h) warn.push("Server agent not reporting");
  else if (h?.age_seconds > 300) warn.push(`Server snapshot ${Math.round(h.age_seconds / 60)} min old`);
  const certDays = h?.certificate?.expires ? Math.round((new Date(h.certificate.expires) - Date.now()) / 86400000) : null;
  if (certDays != null && certDays < 20) warn.push(`SSL certificate expires in ${certDays} days`);
  if (db?.healthy) ok.push("Database healthy");
  if (dumpH != null && dumpH <= 30) ok.push(`Backup ${Math.round(dumpH)} h ago`);
  if (diskPct != null && diskPct < 80) ok.push(`Disk ${diskPct}% used`);
  if (certDays != null && certDays >= 20) ok.push(`SSL valid ${certDays} days`);
  const level = bad.length ? "bad" : warn.length ? "warn" : "ok";
  const title = bad.length ? "Something needs fixing now" : warn.length ? "Running, a few things need attention" : "Everything is running normally";
  return { level, title, points: [...bad, ...warn, ...(level === "ok" ? ok : [])], dumpH, diskPct, certDays, errs };
}

function LiveTab({ ov, live, now, onPerson, onShop }) {
  const d = ov.data;
  const online = usePoll(() => saService.sessions({ status: "active", limit: 100 }), [], { ms: 15000, live });
  const sys = usePoll(() => saService.system(), [], { ms: 30000, live });
  if (!d) return <div className="sa-kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="sa-kpi"><Skel h={40} w={40} /><Skel h={30} w="60%" /></div>)}</div>;
  const r = d.live.by_role || {};
  const c = d.live.by_client || {};
  const S = sys.data;
  const hh = healthOf(d, S);
  const H = S?.host;
  const api = (H?.containers || []).find((x) => x.name === "dfx-backend");
  const lastMin = H?.web_traffic?.per_minute?.slice(-5) || [];
  const rpm = lastMin.length ? Math.round(lastMin.reduce((a, x) => a + x.n, 0) / lastMin.length) : null;
  const conns = Object.values(S?.database?.connections || {}).reduce((a, n) => a + n, 0);
  const people = (c.web || 0) + (c.app || 0) + (c.other || 0);
  const nodes = {
    web: { title: "On the website", value: `${c.web || 0} online`, note: "admins, staff, customers", state: c.web ? "live" : "off" },
    app: { title: "On the mobile app", value: `${c.app || 0} online`, note: "customer app", state: c.app ? "live" : "off" },
    gw: { title: "Gateway · nginx", value: rpm != null ? `${rpm} req/min` : "HTTPS on", note: hh.certDays != null ? `SSL valid ${hh.certDays} days` : "secure entry point", state: hh.certDays != null && hh.certDays < 20 ? "warn" : "live" },
    api: { title: "DFX server", value: api ? (api.health === "healthy" ? "Healthy" : api.health || api.state) : S ? "Running" : "…", note: H ? `${hh.errs} errors last hour` : "backend API", state: api && api.health !== "healthy" ? "bad" : hh.errs ? "warn" : "live" },
    db: { title: "Database", value: S?.database ? bytes(S.database.size_bytes) : "…", note: S?.database ? `${conns} connections open` : "", state: S?.database && !S.database.healthy ? "bad" : "live" },
    bk: { title: "Backups", value: hh.dumpH != null ? `${Math.round(hh.dumpH)} h ago` : "—", note: "nightly, 07:45 IST", state: hh.dumpH == null ? (H ? "bad" : "off") : hh.dumpH > 30 ? "bad" : "live" },
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
        <Kpi live hue="live" label="Online right now" value={d.live.total} sub={`active in the last ${d.active_window_minutes} minutes`} />
        <Kpi icon="key" hue="app" label="Signed in" value={d.live.signed_in} sub="haven't signed out yet" />
        <Kpi icon="users" hue="teal" label="Used DFX today" value={d.today.unique_users} sub="different people since midnight" />
        <Kpi icon="check" hue="web" label="Sign-ins today" value={d.today.logins} sub={`${d.today.logouts} signed out`} />
        <Kpi icon="alert" hue={d.today.failed_logins ? "bad" : "ink"} label="Failed sign-ins today" value={d.today.failed_logins} sub={`${d.today.blocked_logins} blocked · ${d.today.token_reuse} token alarms`} />
        <Kpi icon="plus" hue="warn" label="New customers today" value={d.today.new_customers} sub={`${d.accounts.active_tenants} of ${d.accounts.tenants} shops active`} />
      </div>

      <div className="sa-two">
        <Card title="Sign-ins through the day" icon="activity" hue="web" right={<small>India time · today</small>}>
          <HourChart a={d.today.hourly_logins} b={d.today.hourly_failed} aLabel="Sign-ins" bLabel="Failed" height={250} />
        </Card>
        <Card title="Who is online" icon="users" hue="app">
          <div style={{ display: "grid", gap: 16 }}>
            <Donut label="people" size={128} parts={[
              { label: "Shop admins", value: r.Admin || 0, color: "#0FA3B1" },
              { label: "Staff", value: r.Staff || 0, color: "#7B4DEB" },
              { label: "Customers", value: r.Customer || 0, color: "#10A36A" },
              { label: "Super admin", value: r.SuperAdmin || 0, color: "#3563F0" },
            ]} />
            <Donut label="devices" size={128} parts={[
              { label: "Website", value: c.web || 0, color: "#3563F0" },
              { label: "Mobile app", value: c.app || 0, color: "#7B4DEB" },
              ...(c.other ? [{ label: "Other", value: c.other, color: "#B7C0D6" }] : []),
            ]} />
          </div>
        </Card>
      </div>

      <div className="sa-two">
        <Card title="Online right now" icon="pulse" hue="live" pad={false} right={<small>{byPerson.length} people · click a row for their history</small>}>
          <SessionTable rows={byPerson} loading={online.loading && !online.data} onPerson={onPerson} compact now={now}
            empty="Nobody has used DFX in the last few minutes." />
        </Card>
        <Card title="Latest sign-ins" icon="shield" hue="teal" fill>
          <EventFeed items={d.recent_events} now={now} onPerson={onPerson} />
        </Card>
      </div>

      <ShopBoard tenants={d.tenants} now={now} onShop={onShop} />
    </div>
  );
}

function ShopBoard({ tenants, now, onShop }) {
  const active = [...tenants].filter((t) => t.signed_in || t.users_today || t.logins_today || t.sales_today)
    .sort((a, b) => b.live_now - a.live_now || b.users_today - a.users_today);
  return (
    <Card title="Shops active today" icon="shop" hue="warn" pad={false}
      right={<small>{active.length} of {tenants.length} shops · click a shop to see its people</small>}>
      {active.length ? <ShopTable rows={active} now={now} onShop={onShop} compact />
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
            <span>{[e.tenant_name || (e.role === "SuperAdmin" ? "Platform" : null), e.role, e.client === "app" ? "App" : e.client === "web" ? "Web" : null, e.ip].filter(Boolean).join(" · ")}{e.reason ? ` · ${e.reason}` : ""}</span>
          </div>
          <time title={fmtDateTime(e.at)}>{ago(e.at, now)}</time>
        </div>
      ))}
    </div>
  );
}

// ── Shops ──────────────────────────────────────────────────────────────
function ShopsTab({ tenants, loading, now, onShop }) {
  const [q, setQ] = useState("");
  const rows = tenants.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.slug.includes(q.toLowerCase()));
  const quiet = tenants.filter((t) => t.status === "Active" && (t.admin_idle_days == null || t.admin_idle_days >= 3));
  return (
    <div className="sa-grid">
      {quiet.length > 0 && (
        <div className="sa-alert warn"><Icon name="alert" />
          <div><b>{quiet.length} active shop{quiet.length > 1 ? "s" : ""} with no admin sign-in for 3+ days:</b> {quiet.map((t) => t.name).join(", ")}</div>
        </div>
      )}
      <Card pad={false}>
        <div className="sa-filters">
          <input className="sa-in" placeholder="Search shops" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shops" />
          <span className="sa-dim" style={{ fontSize: 13 }}>{rows.length} shops · today = IST day</span>
        </div>
        {loading ? <div className="sa-card-b"><Skel h={120} /></div> : <ShopTable rows={rows} now={now} onShop={onShop} />}
      </Card>
    </div>
  );
}

function ShopTable({ rows, now, onShop, compact }) {
  if (!rows?.length) return <Empty title="No shops">Create one in the Tenants module.</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr>
          <th>Shop</th><th>Status</th><th className="r">Online</th><th className="r">Signed in</th><th className="r">Used today</th>
          <th className="r">Sign-ins</th><th className="r">Failed</th>
          {!compact && <><th className="r">Admins</th><th className="r">Staff</th><th className="r">Customers</th></>}
          <th className="r">Sales today</th><th>Admin last seen</th>{!compact && <th>Last activity</th>}
        </tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="click" onClick={() => onShop(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onShop(t.id)}>
              <td className="who"><b>{t.name}</b><span className="mono">{t.slug}</span></td>
              <td><Pill dot tone={t.status === "Active" ? "live" : "bad"}>{t.status}</Pill></td>
              <td className="r">{t.live_now > 0 ? <Pill tone="live" dot>{t.live_now}</Pill> : <span className="sa-dim">0</span>}</td>
              <td className="r">{t.signed_in}</td>
              <td className="r">{t.users_today}</td>
              <td className="r">{t.logins_today}</td>
              <td className="r">{t.failed_today ? <Pill tone="bad">{t.failed_today}</Pill> : <span className="sa-dim">0</span>}</td>
              {!compact && <><td className="r">{t.admins}</td><td className="r">{t.staff}</td><td className="r">{t.customers}</td></>}
              <td className="r"><b>{t.sales_today}</b> <span className="sa-dim">· {inr(t.sales_today_amount)}</span></td>
              <td>{t.last_admin_seen_at
                ? <span title={fmtDateTime(t.last_admin_seen_at)} style={{ color: t.admin_idle_days >= 3 ? "var(--warn)" : undefined }}>{ago(t.last_admin_seen_at, now)}</span>
                : <span className="sa-dim">not since tracking began</span>}</td>
              {!compact && <td className="sa-muted">{t.last_activity_at ? ago(t.last_activity_at, now) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── People ─────────────────────────────────────────────────────────────
function PeopleTab({ tenants, shop, setShop, live, onPerson }) {
  const [role, setRole] = useState("");
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
  return (
    <Card pad={false}>
      <div className="sa-filters">
        <input className="sa-in" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <ShopSelect tenants={tenants} value={shop} onChange={setShop} />
        <select className="sa-sel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="sa-sel" value={presence} onChange={(e) => setPresence(e.target.value)} aria-label="Presence">
          <option value="">Anyone</option><option value="online">Online now</option><option value="idle">Signed in, idle</option>
          <option value="offline">Signed out</option><option value="never">Not seen since tracking began</option>
        </select>
      </div>
      {res.loading && !d ? <div className="sa-card-b"><Skel h={160} /></div> : !d?.items?.length ? <Empty title="No people match">Try a different shop, role or search.</Empty> : (
        <div className="sa-tbl">
          <table>
            <thead><tr><th>Person</th><th>Shop</th><th>Role</th><th>Status</th><th>Last seen</th><th>Last sign-in</th>
              <th className="r">Time today</th><th className="r">Sign-ins today</th><th className="r">Sessions 7d</th></tr></thead>
            <tbody>
              {d.items.map((u) => (
                <tr key={u.id} className="click" onClick={() => onPerson(u.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPerson(u.id)}>
                  <td><Who name={u.name} role={u.role} sub={`${[u.email, u.phone].filter(Boolean).join(" · ") || "no contact on file"}${u.is_active ? "" : " · account disabled"}`} /></td>
                  <td>{u.tenant_name || <span className="sa-dim">Platform</span>}</td>
                  <td><Pill tone={ROLE_TONE[u.role]}>{u.role}</Pill></td>
                  <td><Pill dot tone={STATUS_TONE[u.presence]}>{STATUS_LABEL[u.presence]}</Pill></td>
                  <td title={fmtDateTime(u.last_seen_at)}>{u.last_seen_at ? ago(u.last_seen_at, now) : <span className="sa-dim">—</span>}</td>
                  <td className="sa-muted">{fmtDateTime(u.last_login_at)}</td>
                  <td className="r">{u.today_seconds ? dur(u.today_seconds) : <span className="sa-dim">—</span>}</td>
                  <td className="r">{u.sessions_today}</td>
                  <td className="r">{u.sessions_7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
    </Card>
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
function SessionsTab({ tenants, live, onPerson }) {
  const [f, setF] = useState({ status: "open", tenant_id: "", role: "", client: "", date_from: "", date_to: "", q: "" });
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 350); return () => clearTimeout(t); }, [f.q]);
  useEffect(() => setPage(1), [f.status, f.tenant_id, f.role, f.client, f.date_from, f.date_to, qd]);
  const res = usePoll(() => saService.sessions({ ...f, q: qd, page, limit: 50 }),
    [f.status, f.tenant_id, f.role, f.client, f.date_from, f.date_to, qd, page], { ms: 20000, live });
  const now = useNow(20000);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card pad={false}>
      <div className="sa-filters">
        <input className="sa-in" placeholder="Search person or IP" value={f.q} onChange={set("q")} aria-label="Search sessions" />
        <select className="sa-sel" value={f.status} onChange={set("status")} aria-label="Status">
          <option value="open">Signed in now</option><option value="active">Online (last 5 min)</option><option value="idle">Idle</option>
          <option value="ended">Signed out</option><option value="expired">Expired</option><option value="all">All sessions</option>
        </select>
        <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
        <select className="sa-sel" value={f.role} onChange={set("role")} aria-label="Role">
          <option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="sa-sel" value={f.client} onChange={set("client")} aria-label="Device">
          <option value="">Web + app</option><option value="web">Web only</option><option value="app">Mobile app only</option>
        </select>
        <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" />
        <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" />
      </div>
      <SessionTable rows={res.data?.items} loading={res.loading && !res.data} onPerson={onPerson} now={now}
        empty="No sessions match these filters." />
      {res.data && <Pager page={res.data.page} limit={res.data.limit} total={res.data.total} onPage={setPage} />}
    </Card>
  );
}

function SessionTable({ rows, loading, onPerson, compact, now, empty, hidePerson }) {
  if (loading) return <div className="sa-card-b"><Skel h={140} /></div>;
  if (!rows?.length) return <Empty title="Nothing here">{empty}</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr>
          {!hidePerson && <th>Person</th>}{!compact && !hidePerson && <th>Shop</th>}<th>Status</th><th>Device</th>
          {!compact && <th>Signed in</th>}<th>Last seen</th>{!compact && <th>Ended</th>}<th className="r">Duration</th>
          {!compact && <th>IP · browser</th>}
        </tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={hidePerson ? "" : "click"} onClick={() => !hidePerson && onPerson?.(s.user_id)}>
              {!hidePerson && <td><Who name={s.user_name} role={s.role} sub={compact ? `${s.tenant_name || "Platform"} · ${s.role}` : [s.user_email, s.user_phone].filter(Boolean).join(" · ") || s.role} /></td>}
              {!compact && !hidePerson && <td>{s.tenant_name || <span className="sa-dim">Platform</span>}</td>}
              <td><Pill dot tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Pill></td>
              <td><ClientTag client={s.client} device={s.device} /></td>
              {!compact && <td title={fmtDateTime(s.started_at)}>{fmtDateTime(s.started_at)}{s.login_method === "google" ? <span className="sa-dim"> · Google</span> : s.login_method === "resumed" ? <span className="sa-dim"> · resumed</span> : null}</td>}
              <td title={fmtDateTime(s.last_seen_at)}>{ago(s.last_seen_at, now)}</td>
              {!compact && <td className="sa-muted">{s.ended_at ? `${fmtTime(s.ended_at)} · ${END_LABEL[s.end_reason] || s.end_reason}` : s.status === "expired" ? "2-day limit" : "—"}</td>}
              <td className="r">{dur(s.duration_seconds)}{s.sessions > 1 && <div className="sa-dim" style={{ fontSize: 11.5, fontFamily: "inherit" }}>{s.sessions} devices</div>}</td>
              {!compact && <td><span className="mono" style={{ fontSize: 12.5 }}>{s.ip || "—"}</span><div className="sa-dim" style={{ fontSize: 12 }}>{s.browser}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sign-ins & security ────────────────────────────────────────────────
function SignInsTab({ tenants, live, onPerson }) {
  const [f, setF] = useState({ event: "", tenant_id: "", date_from: "", date_to: "", q: "" });
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
        <Kpi icon="key" hue="live" label="Sign-ins · 24 h" value={c.LOGIN_SUCCESS || 0} sub="successful" />
        <Kpi icon="alert" hue={c.LOGIN_FAILED ? "bad" : "ink"} label="Failed · 24 h" value={c.LOGIN_FAILED || 0} sub="wrong password or unknown account" />
        <Kpi icon="lock" hue="warn" label="Blocked · 24 h" value={c.LOGIN_BLOCKED || 0} sub="disabled account or suspended shop" />
        <Kpi icon="shield" hue={c.TOKEN_REUSE ? "bad" : "app"} label="Stolen-token alarms · 24 h" value={c.TOKEN_REUSE || 0} sub="all that person's sessions were cut" />
      </div>
      <div className="sa-split">
        <Card title="Most failed attempts by IP · 24 h" icon="alert">
          <RankList rows={d?.summary_24h?.top_failed_ips} k="ip" mono />
        </Card>
        <Card title="Most failed attempts by login · 24 h" icon="users">
          <RankList rows={d?.summary_24h?.top_failed_identifiers} k="identifier" />
        </Card>
      </div>
      <Card pad={false}>
        <div className="sa-filters">
          <input className="sa-in" placeholder="Search login, IP, name or reason" value={f.q} onChange={set("q")} aria-label="Search events" />
          <select className="sa-sel" value={f.event} onChange={set("event")} aria-label="Event">
            <option value="">All events</option>
            <option value="LOGIN_SUCCESS">Signed in</option>
            <option value="LOGIN_FAILED,LOGIN_BLOCKED,TOKEN_REUSE">Problems only</option>
            <option value="LOGIN_FAILED">Failed sign-in</option><option value="LOGIN_BLOCKED">Blocked sign-in</option>
            <option value="LOGOUT,LOGOUT_ALL">Signed out</option><option value="TOKEN_REUSE">Stolen-token alarm</option>
          </select>
          <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
          <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" />
          <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" />
        </div>
        <EventTable rows={d?.items} loading={res.loading && !d} onPerson={onPerson} />
        {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

function RankList({ rows, k, mono, noTime }) {
  if (!rows?.length) return <Empty title="Nothing in the last 24 hours">No failed sign-ins.</Empty>;
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
        <thead><tr><th>When (IST)</th><th>Event</th>{!hidePerson && <th>Account</th>}{!hidePerson && <th>Shop</th>}<th>Device</th><th>IP · browser</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={e.user_id && !hidePerson ? "click" : ""} onClick={() => e.user_id && !hidePerson && onPerson?.(e.user_id)}>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.at)}</td>
              <td><Pill tone={EVENT_TONE[e.event]}>{EVENT_LABEL[e.event] || e.event}</Pill></td>
              {!hidePerson && <td><Who name={e.user_name || e.identifier || "Unknown account"} role={e.role} sub={e.user_name ? (e.identifier || e.role) : "no matching account"} /></td>}
              {!hidePerson && <td>{e.tenant_name || <span className="sa-dim">{e.role === "SuperAdmin" ? "Platform" : "—"}</span>}</td>}
              <td>{e.client ? <ClientTag client={e.client} device={e.device} /> : "—"}</td>
              <td><span className="mono" style={{ fontSize: 12.5 }}>{e.ip || "—"}</span><div className="sa-dim" style={{ fontSize: 12 }}>{e.browser}</div></td>
              <td className="sa-muted wrap" style={{ maxWidth: 280 }}>{e.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Activity ───────────────────────────────────────────────────────────
function ActivityTab({ tenants }) {
  const [f, setF] = useState({ tenant_id: "", action: "", date_from: "", date_to: "", q: "" });
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 350); return () => clearTimeout(t); }, [f.q]);
  useEffect(() => setPage(1), [f.tenant_id, f.action, f.date_from, f.date_to, qd]);
  const res = usePoll(() => saService.activity({ ...f, q: qd, page, limit: 50 }),
    [f.tenant_id, f.action, f.date_from, f.date_to, qd, page], { ms: 30000, live: false });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const d = res.data;
  return (
    <Card pad={false}>
      <div className="sa-filters">
        <input className="sa-in" placeholder="Search action, person or record" value={f.q} onChange={set("q")} aria-label="Search activity" />
        <ShopSelect tenants={tenants} value={f.tenant_id} onChange={(v) => setF((s) => ({ ...s, tenant_id: v }))} />
        <select className="sa-sel" value={f.action} onChange={set("action")} aria-label="Action">
          <option value="">All actions</option>{(d?.actions || []).map((a) => <option key={a} value={a}>{prettyAction(a)}</option>)}
        </select>
        <input className="sa-sel" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" />
        <input className="sa-sel" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" />
        <button className="sa-btn ghost sm" onClick={res.reload}><Icon name="refresh" size={14} />Refresh</button>
      </div>
      <ActivityTable rows={d?.items} loading={res.loading && !d} open={open} setOpen={setOpen} />
      {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
    </Card>
  );
}

const prettyAction = (a) => (a || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function ActivityTable({ rows, loading, open, setOpen, hideActor }) {
  if (loading) return <div className="sa-card-b"><Skel h={140} /></div>;
  if (!rows?.length) return <Empty title="No activity">Nothing recorded for these filters.</Empty>;
  return (
    <div className="sa-tbl">
      <table>
        <thead><tr><th>When (IST)</th>{!hideActor && <th>Who</th>}<th>Shop</th><th>Action</th><th>Record</th></tr></thead>
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
        {!hideActor && <td><Who name={a.actor_name} role={a.actor_role} sub={a.actor_role} /></td>}
        <td>{a.tenant_name || <span className="sa-dim">Platform</span>}</td>
        <td><b style={{ fontWeight: 600 }}>{prettyAction(a.action)}</b></td>
        <td className="sa-muted"><span>{a.target_entity}</span> <span className="mono" style={{ fontSize: 12 }}>{a.target_id || ""}</span>{has && <span className="sa-dim"> · {open ? "hide" : "details"}</span>}</td>
      </tr>
      {open && (
        <tr><td colSpan={hideActor ? 4 : 5} style={{ background: "var(--tint)" }}>
          <div className="sa-split">
            {a.before && <div><b style={{ fontSize: 12 }}>Before</b><pre className="sa-json">{pretty(a.before)}</pre></div>}
            {a.after && <div><b style={{ fontSize: 12 }}>After</b><pre className="sa-json">{pretty(a.after)}</pre></div>}
          </div>
        </td></tr>
      )}
    </>
  );
}

function pretty(s) {
  try { return JSON.stringify(typeof s === "string" ? JSON.parse(s) : s, null, 2); } catch { return String(s); }
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
      sub={u ? [u.role, u.tenant_name || "Platform", u.email || u.phone].filter(Boolean).join(" · ") : ""}
      actions={<select className="sa-sel" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
        <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>}>
      {!d ? <Skel h={200} /> : (
        <>
          <div className="sa-kpis">
            <Kpi hue={current ? "live" : "ink"} live={current?.status === "active"} icon={current ? undefined : "clock"} label="Right now"
              value={current ? STATUS_LABEL[current.status] : "Signed out"}
              sub={current ? `${current.client === "app" ? "App" : "Web"} · since ${fmtTime(current.started_at)}` : `last seen ${ago(d.sessions[0]?.last_seen_at, now)}`} />
            <Kpi icon="clock" hue="web" label="Time on platform · 14 days" value={dur(total14)} sub={`${d.sessions.length} sessions in ${days} days`} />
            <Kpi icon="users" hue={u.is_active ? "teal" : "bad"} label="Account" value={u.is_active ? "Active" : "Disabled"} sub={`created ${fmtDate(u.created_at)}`} />
          </div>
          <Card title="Daily time (IST)" icon="activity">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(14,1fr)", gap: 6, alignItems: "end", height: 120 }}>
              {d.daily.map((x) => (
                <div key={x.date} title={`${fmtDate(x.date)} — ${dur(x.seconds)}, ${x.sessions} sign-ins`} style={{ display: "grid", gap: 4, justifyItems: "center", height: "100%", alignContent: "end" }}>
                  <div style={{ width: "100%", height: `${Math.max(3, (x.seconds / maxDay) * 92)}px`, borderRadius: 5,
                    background: x.seconds ? "linear-gradient(180deg,#4F6BF0,#2F4BD8)" : "var(--rule2)" }} />
                  <span className="sa-dim" style={{ fontSize: 10 }}>{new Date(x.date).getDate()}</span>
                </div>
              ))}
            </div>
          </Card>
          <div className="sa-tabs" role="tablist" style={{ marginBottom: 0 }}>
            {[["sessions", `Sessions (${d.sessions.length})`], ["events", `Sign-in log (${d.events.length})`], ["activity", `Actions (${d.activity.length})`]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <Card pad={false}>
            {tab === "sessions" && <SessionTable rows={d.sessions} hidePerson now={now} empty="No sessions in this period." />}
            {tab === "events" && <EventTable rows={d.events} hidePerson />}
            {tab === "activity" && <ActivityTable rows={d.activity} open={open} setOpen={setOpen} hideActor />}
          </Card>
        </>
      )}
    </Drawer>
  );
}
