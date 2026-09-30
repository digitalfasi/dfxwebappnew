"use client";
import { useEffect, useState } from "react";
import { saService, fmtDateTime, fmtDate, inr, seenAt } from "@/modules/superadmin/saService";
import { Card, Kpi, Pill, Icon, Empty, Skel, Drawer, usePoll, hashParam, scrollToId } from "@/modules/superadmin/saUi";

const PLANS = ["Starter", "Professional", "Business", "Enterprise"];
// Same rule as the server (password_policy.py): 8+ characters, not a common one.
const WEAK = new Set(["password", "password1", "password123", "12345678", "123456789", "qwerty123", "admin123", "welcome1", "india123", "gold1234", "jewellery"]);
// Blocks only what the server refuses. Weakness is a warning, the SuperAdmin decides.
export function passwordProblem(p, confirm) {
  if (!p || p.length < 6) return "Use at least 6 characters.";
  if (p.length > 72) return "Use 72 characters or fewer.";
  if (confirm !== undefined && p !== confirm) return "The two passwords don't match.";
  return null;
}
export function passwordStrength(p) {
  if (!p) return null;
  let score = 0;
  if (p.length >= 8) score += 1;
  if (p.length >= 12) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  if (WEAK.has(p.trim().toLowerCase())) score = 0;
  return score <= 2 ? { tone: "bad", label: "Weak", tip: "Easy to guess. Allowed, but a strong password is recommended." }
    : score === 3 ? { tone: "warn", label: "Fair", tip: "Add length, a symbol or mixed case to make it strong." }
    : { tone: "live", label: "Strong", tip: "Good password." };
}

function PasswordPair({ idPrefix, value, confirm, onChange, onConfirm, error }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <div className="sa-field">
        <label htmlFor={`${idPrefix}-pw`}>Password<em> *</em></label>
        <div style={{ position: "relative" }}>
          <input id={`${idPrefix}-pw`} className="sa-in" type={show ? "text" : "password"} autoComplete="new-password"
            value={value} onChange={(e) => onChange(e.target.value)} style={{ paddingRight: 44 }} aria-invalid={!!error} />
          <button type="button" className="sa-x" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 2, top: 1, width: 38, height: 38 }}><Icon name="eye" size={16} /></button>
        </div>
        {(() => { const st = passwordStrength(value); return st
          ? <span className="help" style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`sa-pill t-${st.tone}`}>{st.label}</span>{st.tip}</span>
          : <span className="help">At least 6 characters. You tell the admin this password.</span>; })()}
      </div>
      <div className="sa-field">
        <label htmlFor={`${idPrefix}-pw2`}>Confirm password<em> *</em></label>
        <input id={`${idPrefix}-pw2`} className="sa-in" type={show ? "text" : "password"} autoComplete="new-password"
          value={confirm} onChange={(e) => onConfirm(e.target.value)} aria-invalid={!!error} />
        {error ? <span className="err" role="alert">{error}</span> : <span className="help">Type it again.</span>}
      </div>
    </>
  );
}

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// What a shop is on, in words anyone can read. The server decides it
// (superadmin/service.py get_tenants): PAID = no end date, TRIAL = end date
// ahead, EXPIRED = end date passed (locked at the next sign-in), OFF =
// switched off by a Super Admin.
const ACCESS = {
  PAID: { label: "Paid", tone: "live" },
  TRIAL: { label: "Trial", tone: "sky" },
  EXPIRED: { label: "Expired", tone: "bad" },
  OFF: { label: "Switched off", tone: "mute" },
};
const SOON_DAYS = 7;
const isSoon = (t) => t.access === "TRIAL" && t.days_left != null && t.days_left <= SOON_DAYS;
const FILTERS = [
  { k: "", label: "All" },
  { k: "PAID", label: "Paid" },
  { k: "TRIAL", label: "On trial" },
  { k: "SOON", label: `Ending in ${SOON_DAYS} days` },
  { k: "EXPIRED", label: "Expired" },
  { k: "OFF", label: "Switched off" },
];

function PlanCell({ t }) {
  const a = ACCESS[t.access] || { label: "—", tone: "mute" };
  const soon = isSoon(t);
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <Pill dot tone={soon ? "warn" : a.tone}>{a.label}</Pill>
      <span style={{ fontSize: 12.5, color: soon || t.access === "EXPIRED" ? "var(--bad)" : "var(--muted)", fontWeight: soon ? 700 : 500 }}>
        {t.access === "PAID" ? `${t.plan || "—"} · no end date`
          : t.access === "TRIAL" ? `${t.days_left === 1 ? "1 day" : `${t.days_left} days`} left · ends ${fmtDate(t.trial_ends_at)}`
          : t.access === "EXPIRED" ? `Ended ${fmtDate(t.trial_ends_at)} · locked at next login`
          : "Nobody at this shop can log in"}
      </span>
    </div>
  );
}

export default function Tenants({ onWatch }) {
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.k === hashParam("filter")) ? hashParam("filter") : ""));
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const list = usePoll(() => saService.tenants(), [], { live: false });
  // Today's numbers per shop come from the live board, refreshed every 30 s.
  const ov = usePoll(() => saService.overview(), [], { ms: 30000 });
  const today = Object.fromEntries((ov.data?.tenants || []).map((t) => [t.id, t]));
  const all = list.data || [];
  const count = (k) => all.filter((t) => (k === "SOON" ? isSoon(t) : !k || t.access === k)).length;
  const rows = all
    .filter((t) => (filter === "SOON" ? isSoon(t) : !filter || t.access === filter))
    .filter((t) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return [t.name, t.slug, t.admin_name, t.admin_email, t.admin_phone].some((v) => (v || "").toLowerCase().includes(s));
    })
    // Most urgent first: expired, then trials by days left, then the rest by name.
    .sort((x, y) => {
      const rank = (t) => (t.access === "EXPIRED" ? 0 : t.access === "TRIAL" ? 1 : t.access === "PAID" ? 2 : 3);
      return rank(x) - rank(y) || (x.days_left ?? 1e9) - (y.days_left ?? 1e9) || x.name.localeCompare(y.name);
    });
  const soon = all.filter(isSoon);
  const expired = all.filter((t) => t.access === "EXPIRED");
  const salesN = Object.values(today).reduce((n, t) => n + (t.sales_today || 0), 0);
  const salesAmt = Object.values(today).reduce((n, t) => n + (t.sales_today_amount || 0), 0);
  const customers = Object.values(today).reduce((n, t) => n + (t.customers || 0), 0);
  const activeToday = Object.values(today).filter((t) => t.users_today > 0).length;
  const reload = () => { list.reload(); ov.reload(); };

  return (
    <div className="sa-grid">
      <div className="sa-kpis">
        <Kpi go={() => { setFilter(""); scrollToId("shop-list"); }} icon="shop" hue="web" label="Shops" value={list.data ? all.length : "—"}
          sub={list.data ? `${count("PAID")} paid · ${count("TRIAL")} on trial · ${count("EXPIRED") + count("OFF")} closed` : ""} />
        <Kpi go={() => { setFilter("SOON"); scrollToId("shop-list"); }} icon="clock" hue="warn" tone={soon.length || expired.length ? "warn" : undefined} label={`Access ending in ${SOON_DAYS} days`}
          value={list.data ? soon.length : "—"} sub={expired.length ? `${expired.length} already expired` : "shops that need a decision"} />
        <Kpi go="#/control/monitor/live" icon="activity" hue="live" label="Shops that used DFX today" value={ov.data ? activeToday : "—"} sub={ov.data ? `of ${all.length} shops` : ""} />
        <Kpi go={() => scrollToId("shop-list")} icon="check" hue="app" label="Sales today, all shops" value={ov.data ? inr(salesAmt) : "—"} sub={ov.data ? `${salesN} bill${salesN === 1 ? "" : "s"} · ${customers} customers in total` : ""} />
      </div>

      {(soon.length > 0 || expired.length > 0) && (
        <div className="sa-alert warn" role="status"><Icon name="alert" />
          <div>
            {soon.length > 0 && <div><b>{soon.length} shop{soon.length > 1 ? "s" : ""} will be locked out soon</b> - they can't log in after their trial ends: {soon.map((t) => `${t.name} (${fmtDate(t.trial_ends_at)})`).join(", ")}.</div>}
            {expired.length > 0 && <div><b>Expired:</b> {expired.map((t) => t.name).join(", ")}.</div>}
            <div className="sa-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Open a shop and press <b>Make permanent</b> for a paying shop, or <b>Extend 30 days</b>.</div>
          </div>
        </div>
      )}

      <Card pad={false} id="shop-list">
        <div className="sa-filters" style={{ justifyContent: "space-between" }}>
          <div className="sa-seg" role="tablist" aria-label="Filter shops">
            {FILTERS.map((f) => (
              <button key={f.k || "all"} role="tab" aria-selected={filter === f.k} onClick={() => setFilter(f.k)}>
                {f.label}<span className={`cnt${(f.k === "SOON" || f.k === "EXPIRED") && count(f.k) ? " bad" : ""}`}>{count(f.k)}</span>
              </button>
            ))}
          </div>
          <div className="sa-row">
            <input className="sa-in" placeholder="Search shop, owner, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shops" style={{ minWidth: 240 }} />
            <button className="sa-btn" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New shop</button>
          </div>
        </div>
        {list.error && <div className="sa-alert bad" style={{ margin: 14 }}><Icon name="alert" />{list.error}</div>}
        {list.loading && !list.data ? <div className="sa-card-b"><Skel h={160} /></div> : !rows.length ? (
          <Empty title={all.length ? "No shops match" : "No shops yet"}>{all.length ? "Try another filter or search." : "Create the first shop with “New shop”."}</Empty>
        ) : (
          <div className="sa-tbl"><table>
            <thead><tr>
              <th>Shop</th><th>Plan &amp; access</th><th>Owner</th>
              <th>People</th><th className="r">Sales today</th><th>Last used</th><th aria-label="Open" />
            </tr></thead>
            <tbody>{rows.map((t) => {
              const d = today[t.id] || {};
              return (
                <tr key={t.id} className="click" onClick={() => setOpenId(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(t.id)}>
                  <td className="who"><b>{t.name}</b><span>Joined {fmtDate(t.created_at)}</span></td>
                  <td><PlanCell t={t} /></td>
                  <td className="who">
                    <b>{t.admin_name || <span className="sa-dim">No owner account</span>}</b>
                    <span className="mono" style={{ fontSize: 12 }}>{t.admin_phone || ""}</span>
                    <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={t.admin_email || ""}>{t.admin_email || (t.admin_phone ? "" : "—")}</span>
                    {t.admin_is_active === false && <span style={{ color: "var(--bad)" }}>Owner login disabled</span>}
                  </td>
                  <td className="who"><b>{d.customers ?? "—"} customers</b><span>{d.staff ?? 0} staff</span></td>
                  <td className="r">{d.sales_today ? <><b>{inr(d.sales_today_amount)}</b><div className="sa-dim" style={{ fontSize: 12 }}>{d.sales_today} bill{d.sales_today === 1 ? "" : "s"}</div></> : <span className="sa-dim" style={{ fontFamily: "inherit" }}>No sales</span>}</td>
                  <td>
                    {d.live_now > 0 ? <Pill dot tone="live">{d.live_now} live now</Pill>
                      : d.last_activity_at ? <span title={fmtDateTime(d.last_activity_at)}>{seenAt(d.last_activity_at)}</span>
                      : <span className="sa-dim">Never</span>}
                  </td>
                  <td className="r" style={{ color: "var(--acc)" }}><Icon name="arrow" size={16} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      {creating && <CreateTenant onClose={() => setCreating(false)} onDone={reload} />}
      {openId && <TenantDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} onWatch={onWatch} />}
    </div>
  );
}

// ── Create a shop ──────────────────────────────────────────────────────
function CreateTenant({ onClose, onDone }) {
  const [f, setF] = useState({
    business_name: "", subdomain: "", business_address: "", business_phone: "", contact_email: "", gst_number: "",
    admin_name: "", admin_email: "", admin_phone: "", plan: "Professional", trial_days: 14, brand_color: "",
    admin_password: "", admin_password2: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState("");

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((s) => ({ ...s, [k]: v, ...(k === "business_name" && !slugTouched ? { subdomain: slugify(v) } : {}) }));
    setFieldErr((s) => ({ ...s, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (f.business_name.trim().length < 2) e.business_name = "Enter the shop name.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.subdomain)) e.subdomain = "Lowercase letters, numbers and single hyphens only.";
    if (f.business_address.trim().length < 5) e.business_address = "Enter the full address.";
    if (!/^[6-9]\d{9}$/.test(f.business_phone.replace(/\D/g, "").slice(-10))) e.business_phone = "Enter a 10-digit Indian mobile number.";
    if (f.admin_name.trim().length < 2) e.admin_name = "Enter the admin's name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.admin_email)) e.admin_email = "Enter a valid email. It becomes the admin's login.";
    if (f.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact_email)) e.contact_email = "Enter a valid email or leave it empty.";
    if (f.brand_color && !/^#[0-9A-Fa-f]{6}$/.test(f.brand_color)) e.brand_color = "Use a hex colour like #2C6FBD.";
    const pw = passwordProblem(f.admin_password, f.admin_password2);
    if (pw) e.admin_password = pw;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setFieldErr(e);
    if (Object.keys(e).length) {
      document.getElementById(`ct-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true); setErr(null);
    try {
      const { admin_password2, ...rest } = f; // eslint-disable-line no-unused-vars
      const body = { ...rest, trial_days: Number(f.trial_days) || 0 };
      ["contact_email", "gst_number", "admin_phone", "brand_color"].forEach((k) => { if (!body[k]) delete body[k]; });
      const res = await saService.provision(body);
      setDone(res);
      onDone();
    } catch (e2) {
      setErr(e2?.message || "Could not create the shop.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); } catch { /* select manually */ }
  };

  if (done) {
    return (
      <Drawer title={`${done.tenant.name} is ready`} sub="Share the login with the shop's admin." onClose={onClose}>
        <div className="sa-alert ok"><Icon name="check" />Shop, main branch, subscription and admin account were created together.</div>
        <Card title="Admin sign-in" icon="key">
          <div style={{ display: "grid", gap: 12 }}>
            <div className="sa-field"><label>Login (email)</label>
              <div className="sa-secret"><span>{done.admin.email}</span><button className="sa-btn ghost sm" onClick={() => copy(done.admin.email, "e")}><Icon name="copy" size={14} />{copied === "e" ? "Copied" : "Copy"}</button></div></div>
            {done.temporary_password ? (
              <div className="sa-field"><label>Temporary password</label>
                <div className="sa-secret"><span>{done.temporary_password}</span><button className="sa-btn ghost sm" onClick={() => copy(done.temporary_password, "p")}><Icon name="copy" size={14} />{copied === "p" ? "Copied" : "Copy"}</button></div></div>
            ) : (
              <div className="sa-field"><label>Password</label>
                <div className="sa-secret"><span>The password you set</span></div>
                <span className="help">Not stored in plain text anywhere, so it can't be shown again. Change it any time from the shop.</span></div>
            )}
            <div className="sa-field"><label>Activation link</label>
              <div className="sa-secret"><span style={{ fontSize: 12 }}>{done.activation_link}</span><button className="sa-btn ghost sm" onClick={() => copy(done.activation_link, "l")}><Icon name="copy" size={14} />{copied === "l" ? "Copied" : "Copy"}</button></div>
              <span className="help">Valid until {fmtDateTime(done.activation_link_expires_at)}. {done.onboarding_email_sent ? "Also emailed to the admin." : "The onboarding email could not be sent, so share it yourself."}</span></div>
          </div>
        </Card>
        <Card title="What was created" icon="shop">
          <dl className="sa-kv">
            <dt>Shop</dt><dd>{done.tenant.name} <span className="mono sa-dim">({done.tenant.slug})</span></dd>
            <dt>Branch</dt><dd>{done.branch.name}</dd>
            <dt>Plan</dt><dd>{done.subscription.plan} · {done.subscription.status}</dd>
            <dt>Trial ends</dt><dd>{done.subscription.trial_ends_at ? fmtDate(done.subscription.trial_ends_at) : "No end date"}</dd>
          </dl>
        </Card>
        <div className="sa-row" style={{ justifyContent: "flex-end" }}><button className="sa-btn" onClick={onClose}>Done</button></div>
      </Drawer>
    );
  }

  const F = ({ k, label, req, type = "text", help, full, ...rest }) => (
    <div className={`sa-field${full ? " full" : ""}`}>
      <label htmlFor={`ct-${k}`}>{label}{req && <em> *</em>}</label>
      <input id={`ct-${k}`} className="sa-in" type={type} value={f[k]} onChange={set(k)} aria-invalid={!!fieldErr[k]} {...rest} />
      {fieldErr[k] ? <span className="err" role="alert">{fieldErr[k]}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );

  return (
    <Drawer title="New shop" sub="Creates the shop, its main branch, a subscription and the shop admin in one step." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 16 }}>
        <fieldset className="sa-fs"><legend>Business</legend>
          <div className="sa-form">
            {F({ k: "business_name", label: "Shop name", req: true, full: true, autoComplete: "organization" })}
            <div className="sa-field">
              <label htmlFor="ct-subdomain">Shop ID (slug)<em> *</em></label>
              <input id="ct-subdomain" className="sa-in mono" value={f.subdomain} aria-invalid={!!fieldErr.subdomain}
                onChange={(e) => { setSlugTouched(true); set("subdomain")(e); }} />
              {fieldErr.subdomain ? <span className="err" role="alert">{fieldErr.subdomain}</span> : <span className="help">Unique. Made from the name; you can change it.</span>}
            </div>
            {F({ k: "business_phone", label: "Shop mobile", req: true, type: "tel", inputMode: "numeric", help: "Also used for the main branch." })}
            {F({ k: "business_address", label: "Address", req: true, full: true, autoComplete: "street-address" })}
            {F({ k: "contact_email", label: "Shop email", type: "email" })}
            {F({ k: "gst_number", label: "GSTIN", help: "Optional. 15 characters." })}
          </div>
        </fieldset>
        <fieldset className="sa-fs"><legend>Shop admin</legend>
          <div className="sa-form">
            {F({ k: "admin_name", label: "Admin name", req: true, autoComplete: "name" })}
            {F({ k: "admin_email", label: "Admin email (login)", req: true, type: "email", help: "Must not be used by any other account." })}
            {F({ k: "admin_phone", label: "Admin mobile", type: "tel", inputMode: "numeric" })}
            <div className="sa-field" />
            <PasswordPair idPrefix="ct" value={f.admin_password} confirm={f.admin_password2} error={fieldErr.admin_password}
              onChange={(v) => { setF((s) => ({ ...s, admin_password: v })); setFieldErr((s) => ({ ...s, admin_password: undefined })); }}
              onConfirm={(v) => { setF((s) => ({ ...s, admin_password2: v })); setFieldErr((s) => ({ ...s, admin_password: undefined })); }} />
          </div>
        </fieldset>
        <fieldset className="sa-fs"><legend>Plan</legend>
          <div className="sa-form">
            <div className="sa-field"><label htmlFor="ct-plan">Plan</label>
              <select id="ct-plan" className="sa-sel" value={f.plan} onChange={set("plan")}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></div>
            {F({ k: "trial_days", label: "Trial days", type: "number", min: 0, max: 365, help: "0 = no trial limit. Change later any time." })}
            {F({ k: "brand_color", label: "Brand colour", placeholder: "#2C6FBD", help: "Optional hex colour." })}
          </div>
        </fieldset>
        {err && <div className="sa-alert bad" role="alert"><Icon name="alert" />{err}</div>}
        <div className="sa-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="sa-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="sa-btn" disabled={busy}>{busy ? "Creating…" : "Create shop"}</button>
        </div>
      </form>
    </Drawer>
  );
}

// ── One shop ───────────────────────────────────────────────────────────
function TenantDrawer({ id, onClose, onChanged, onWatch }) {
  const t = usePoll(() => saService.tenant(id), [id], { live: false });
  const s = usePoll(() => saService.statistics(id), [id], { live: false });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sub, setSub] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ a: "", b: "", out: true, err: null });
  const tenant = t.data;
  const st = s.data;
  // The plan buttons sit at the top; the Controls card asks at the bottom.
  const confirmInControls = !!confirm && !confirm.top;

  useEffect(() => {
    if (tenant?.subscription) {
      setSub({ plan: tenant.subscription.plan, access_mode: tenant.subscription.trial_ends_at ? "TRIAL" : "INDEFINITE", trial_days: 30 });
    }
  }, [tenant?.subscription?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: "ok", text: ok }); t.reload(); onChanged(); }
    catch (e) { setMsg({ tone: "bad", text: e?.message || "That did not work." }); }
    finally { setBusy(false); setConfirm(null); }
  };

  const trialLeft = tenant?.subscription?.trial_ends_at
    ? Math.ceil((new Date(tenant.subscription.trial_ends_at).getTime() - Date.now()) / 86400000) : null;

  return (
    <Drawer title={tenant?.name || "Loading…"} sub={tenant ? `${tenant.slug} · created ${fmtDate(tenant.created_at)}` : ""} onClose={onClose}
      actions={tenant && <button className="sa-btn ghost sm" onClick={() => { onWatch(id); onClose(); }}><Icon name="pulse" size={14} />Watch activity</button>}>
      {!tenant ? <Skel h={220} /> : (
        <>
          {msg && <div className={`sa-alert ${msg.tone}`} role="status"><Icon name={msg.tone === "ok" ? "check" : "alert"} />{msg.text}</div>}
          <div className="sa-kpis">
            <Kpi go={() => scrollToId("td-controls")} icon="shop" hue={tenant.status === "Active" && !(trialLeft != null && trialLeft < 0) ? "live" : "bad"} label="Shop status"
              value={tenant.status !== "Active" ? "Switched off" : trialLeft != null && trialLeft < 0 ? "Locking" : "Open"}
              sub={tenant.status !== "Active" ? "nobody can log in" : trialLeft != null && trialLeft < 0 ? "trial ended - locked at the next login" : "people can log in"} />
            <Kpi go={() => scrollToId("td-plan-card")} icon="clock" hue={trialLeft != null && trialLeft < 7 ? "warn" : "web"} label="Access" value={trialLeft == null ? "Paid · no end date" : trialLeft >= 0 ? `${trialLeft} days left` : "Trial ended"}
              sub={tenant.subscription ? `${tenant.subscription.plan} · ${tenant.subscription.status}` : "no subscription"} />
            <Kpi go={() => { onWatch(id); onClose(); }} icon="users" hue="teal" label="Customers" value={st?.total_customers ?? "—"} sub={st ? `${st.active_enrollments} active enrolments` : ""} />
          </div>

          <Card title="Shop and admin" icon="shop">
            <dl className="sa-kv">
              <dt>Admin</dt><dd>{tenant.admin_name || "—"}</dd>
              <dt>Admin email</dt><dd>{tenant.admin_email || "—"}</dd>
              <dt>Admin mobile</dt><dd className="mono">{tenant.admin_phone || "—"}</dd>
              <dt>Admin account</dt><dd>{tenant.admin_is_active == null ? "No admin" : <Pill tone={tenant.admin_is_active ? "live" : "bad"}>{tenant.admin_is_active ? "Enabled" : "Disabled"}</Pill>}</dd>
              <dt>Last updated</dt><dd>{fmtDateTime(tenant.updated_at)}</dd>
            </dl>
          </Card>

          {st && (
            <Card title="Business so far" icon="activity">
              <dl className="sa-kv">
                <dt>Scheme revenue</dt><dd>{inr(st.total_revenue)}</dd>
                <dt>Outstanding dues</dt><dd>{inr(st.outstanding_dues)}</dd>
                <dt>Gold collected</dt><dd>{Number(st.total_gold_accumulated_grams || 0).toFixed(3)} g</dd>
                <dt>Active schemes</dt><dd>{st.active_schemes}</dd>
                <dt>Enrolments</dt><dd>{st.active_enrollments} active · {st.completed_enrollments} completed · {st.cancelled_enrollments} cancelled</dd>
              </dl>
            </Card>
          )}

          {sub && (
            <Card id="td-plan-card" title="Plan and access" icon="clock">
              <div className="sa-row" style={{ justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: "1 1 260px" }}>
                  <b style={{ display: "block" }}>{tenant.subscription?.trial_ends_at ? `Trial - ends ${fmtDate(tenant.subscription.trial_ends_at)}` : "Paid - no end date"}</b>
                  <span className="sa-muted" style={{ fontSize: 13 }}>{tenant.subscription?.plan} plan. Quick actions, or set it exactly below.</span>
                </div>
                <div className="sa-row" style={{ gap: 8 }}>
                  {tenant.subscription?.trial_ends_at && (
                    <button className="sa-btn sm" disabled={busy} onClick={() => setConfirm({
                      top: true, text: `Make ${tenant.name} permanent? Its access will have no end date.`,
                      run: () => act(() => saService.setSubscription(id, { plan: tenant.subscription.plan, access_mode: "INDEFINITE" }), "Done - this shop no longer expires."),
                    })}><Icon name="check" size={14} />Make permanent</button>
                  )}
                  <button className="sa-btn ghost sm" disabled={busy} onClick={() => setConfirm({
                    top: true, text: `Give ${tenant.name} 30 more days from today?`,
                    run: () => act(() => saService.setSubscription(id, { plan: tenant.subscription.plan, access_mode: "TRIAL", trial_days: 30 }), "Trial extended by 30 days from today."),
                  })}><Icon name="clock" size={14} />Extend 30 days</button>
                </div>
              </div>
              {confirm?.top && (
                <div className="sa-alert info" role="alertdialog" style={{ marginBottom: 14 }}>
                  <Icon name="alert" />
                  <div style={{ display: "grid", gap: 10, flex: 1 }}>
                    <b>{confirm.text}</b>
                    <div className="sa-row">
                      <button className="sa-btn sm" disabled={busy} onClick={confirm.run}>{busy ? "Working…" : "Yes, do it"}</button>
                      <button className="sa-btn ghost sm" onClick={() => setConfirm(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="sa-form" style={{ borderTop: "1px solid var(--rule2)", paddingTop: 14 }}>
                <div className="sa-field"><label htmlFor="td-plan">Plan</label>
                  <select id="td-plan" className="sa-sel" value={sub.plan} onChange={(e) => setSub((x) => ({ ...x, plan: e.target.value }))}>
                    {[...new Set([sub.plan, ...PLANS])].map((p) => <option key={p}>{p}</option>)}</select></div>
                <div className="sa-field"><label htmlFor="td-mode">Access</label>
                  <select id="td-mode" className="sa-sel" value={sub.access_mode} onChange={(e) => setSub((x) => ({ ...x, access_mode: e.target.value }))}>
                    <option value="INDEFINITE">No end date</option><option value="TRIAL">Trial for a set number of days</option></select></div>
                {sub.access_mode === "TRIAL" && (
                  <div className="sa-field"><label htmlFor="td-days">Days from today</label>
                    <input id="td-days" className="sa-in" type="number" min={1} max={3650} value={sub.trial_days}
                      onChange={(e) => setSub((x) => ({ ...x, trial_days: e.target.value }))} />
                    <span className="help">Also re-opens an expired trial.</span></div>
                )}
              </div>
              <div className="sa-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <button className="sa-btn" disabled={busy} onClick={() => act(() => saService.setSubscription(id, {
                  plan: sub.plan, access_mode: sub.access_mode, ...(sub.access_mode === "TRIAL" ? { trial_days: Number(sub.trial_days) } : {}),
                }), "Plan and access saved.")}>Save exact plan</button>
              </div>
            </Card>
          )}

          <Card id="td-controls" title="Controls" icon="shield">
            <div style={{ display: "grid", gap: 12 }}>
              <Control title={tenant.status === "Active" ? "Suspend this shop" : "Re-activate this shop"}
                text={tenant.status === "Active" ? "Everyone at this shop is blocked at their next sign-in or refresh (within 30 minutes)." : "People at this shop can sign in again."}
                btn={tenant.status === "Active" ? "Suspend" : "Activate"} danger={tenant.status === "Active"} disabled={busy}
                onClick={() => setConfirm({
                  text: tenant.status === "Active" ? `Suspend ${tenant.name}? Its admin, staff and customers will lose access.` : `Re-activate ${tenant.name}?`,
                  danger: tenant.status === "Active",
                  run: () => act(() => saService.setStatus(id, tenant.status === "Active" ? "Inactive" : "Active"),
                    tenant.status === "Active" ? "Shop suspended." : "Shop re-activated."),
                })} />
              {tenant.admin_is_active != null && (
                <Control title={tenant.admin_is_active ? "Disable the admin account" : "Enable the admin account"}
                  text={tenant.admin_is_active ? "Blocks this admin at once, including sessions already open." : "The admin can sign in again."}
                  btn={tenant.admin_is_active ? "Disable admin" : "Enable admin"} danger={tenant.admin_is_active} disabled={busy}
                  onClick={() => setConfirm({
                    text: tenant.admin_is_active ? `Disable ${tenant.admin_name}'s account?` : `Enable ${tenant.admin_name}'s account?`,
                    danger: tenant.admin_is_active,
                    run: () => act(() => saService.setAdminStatus(id, !tenant.admin_is_active),
                      tenant.admin_is_active ? "Admin account disabled." : "Admin account enabled."),
                  })} />
              )}
              {tenant.admin_is_active != null && (
                <div style={{ border: "1px solid var(--rule2)", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 12 }}>
                  <div className="sa-row" style={{ justifyContent: "space-between" }}>
                    <div style={{ flex: "1 1 240px" }}><b style={{ display: "block" }}>Admin password</b>
                      <span className="sa-muted" style={{ fontSize: 13 }}>Set it yourself and tell {tenant.admin_name}, or email them a link{tenant.admin_email ? ` (${tenant.admin_email})` : ""} to choose their own.</span></div>
                    {!pwOpen && (
                      <div className="sa-row" style={{ gap: 8 }}>
                        <button className="sa-btn sm" onClick={() => { setPwOpen(true); setPw({ a: "", b: "", out: true, err: null }); }}>Set password</button>
                        {tenant.admin_email && (
                          <button className="sa-btn ghost sm" disabled={busy} onClick={() => setConfirm({
                            text: `Send a password reset link to ${tenant.admin_email}?`,
                            run: () => act(async () => {
                              const r = await saService.resetAdminPassword(id);
                              if (!r.reset_email_sent) throw new Error("The reset was created but the email could not be sent.");
                            }, "Reset link sent."),
                          })}>Email reset link</button>
                        )}
                      </div>
                    )}
                  </div>
                  {pwOpen && (
                    <form className="sa-form" noValidate onSubmit={(e) => {
                      e.preventDefault();
                      const problem = passwordProblem(pw.a, pw.b);
                      if (problem) { setPw((x) => ({ ...x, err: problem })); return; }
                      act(async () => { await saService.setAdminPassword(id, pw.a, pw.out); setPwOpen(false); },
                        pw.out ? "Password changed. The admin was signed out of every device." : "Password changed.");
                    }}>
                      <PasswordPair idPrefix="td" value={pw.a} confirm={pw.b} error={pw.err}
                        onChange={(v) => setPw((x) => ({ ...x, a: v, err: null }))} onConfirm={(v) => setPw((x) => ({ ...x, b: v, err: null }))} />
                      <label className="sa-row" style={{ gap: 8, fontSize: 13, gridColumn: "1/-1", cursor: "pointer" }}>
                        <input type="checkbox" checked={pw.out} onChange={(e) => setPw((x) => ({ ...x, out: e.target.checked }))} />
                        Sign the admin out of every device now
                      </label>
                      <div className="sa-row" style={{ gridColumn: "1/-1", justifyContent: "flex-end" }}>
                        <button type="button" className="sa-btn ghost sm" onClick={() => setPwOpen(false)}>Cancel</button>
                        <button type="submit" className="sa-btn sm" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
              {confirm && confirmInControls && (
                <div className={`sa-alert ${confirm.danger ? "bad" : "info"}`} role="alertdialog">
                  <Icon name="alert" />
                  <div style={{ display: "grid", gap: 10, flex: 1 }}>
                    <b>{confirm.text}</b>
                    <div className="sa-row">
                      <button className={`sa-btn sm${confirm.danger ? " danger" : ""}`} disabled={busy} onClick={confirm.run}>{busy ? "Working…" : "Yes, do it"}</button>
                      <button className="sa-btn ghost sm" onClick={() => setConfirm(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </Drawer>
  );
}

function Control({ title, text, btn, onClick, danger, disabled }) {
  return (
    <div className="sa-row" style={{ justifyContent: "space-between", border: "1px solid var(--rule2)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ flex: "1 1 240px" }}><b style={{ display: "block" }}>{title}</b><span className="sa-muted" style={{ fontSize: 13 }}>{text}</span></div>
      <button className={`sa-btn sm${danger ? " danger" : " ghost"}`} onClick={onClick} disabled={disabled}>{btn}</button>
    </div>
  );
}
