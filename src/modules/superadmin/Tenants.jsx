"use client";
import { useEffect, useState } from "react";
import { saService, fmtDateTime, fmtDate, inr } from "@/modules/superadmin/saService";
import { Card, Kpi, Pill, Icon, Empty, Skel, Drawer, usePoll } from "@/modules/superadmin/saUi";

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

export default function Tenants({ onWatch }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const list = usePoll(() => saService.tenants(status || undefined), [status], { live: false });
  const dash = usePoll(() => saService.dashboard(), [], { live: false });
  const rows = (list.data || []).filter((t) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [t.name, t.slug, t.admin_name, t.admin_email, t.admin_phone].some((v) => (v || "").toLowerCase().includes(s));
  });
  const d = dash.data;
  const reload = () => { list.reload(); dash.reload(); };

  return (
    <div className="sa-grid">
      <div className="sa-kpis">
        <Kpi icon="shop" hue="web" label="Shops on the platform" value={d?.total_tenants ?? "—"} sub={d ? `${d.active_tenants} active` : ""} />
        <Kpi icon="users" hue="live" label="Customers, all shops" value={d?.total_customers ?? "—"} />
        <Kpi icon="list" hue="app" label="Scheme enrolments" value={d?.total_enrollments ?? "—"} sub={d ? `${d.total_schemes} schemes` : ""} />
        <Kpi icon="check" hue="warn" label="Scheme payments" value={d ? inr(d.total_payment_amount) : "—"} sub={d ? `${d.total_payments} payments` : ""} />
      </div>

      <Card pad={false}>
        <div className="sa-filters" style={{ justifyContent: "space-between" }}>
          <div className="sa-row" style={{ flex: "1 1 auto" }}>
            <input className="sa-in" placeholder="Search shop, admin, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shops" />
            <select className="sa-sel" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </div>
          <button className="sa-btn" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New shop</button>
        </div>
        {list.loading && !list.data ? <div className="sa-card-b"><Skel h={160} /></div> : !rows.length ? (
          <Empty title="No shops yet">Create the first shop with “New shop”.</Empty>
        ) : (
          <div className="sa-tbl"><table>
            <thead><tr><th>Shop</th><th>Status</th><th>Admin</th><th>Admin account</th><th>Contact</th><th>Created</th><th /></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id} className="click" onClick={() => setOpenId(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(t.id)}>
                <td className="who"><b>{t.name}</b><span className="mono">{t.slug}</span></td>
                <td><Pill dot tone={t.status === "Active" ? "live" : "bad"}>{t.status}</Pill></td>
                <td className="who"><b>{t.admin_name || "—"}</b><span>{t.admin_email || ""}</span></td>
                <td>{t.admin_is_active == null ? <span className="sa-dim">No admin</span> : <Pill tone={t.admin_is_active ? "live" : "bad"}>{t.admin_is_active ? "Enabled" : "Disabled"}</Pill>}</td>
                <td className="mono sa-muted" style={{ fontSize: 12.5 }}>{t.admin_phone || "—"}</td>
                <td className="sa-muted">{fmtDate(t.created_at)}</td>
                <td className="r"><span className="sa-row" style={{ justifyContent: "flex-end", color: "var(--acc)" }}>Open <Icon name="arrow" size={14} /></span></td>
              </tr>
            ))}</tbody>
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
            <Kpi icon="shop" hue={tenant.status === "Active" ? "live" : "bad"} label="Shop status" value={tenant.status} sub={tenant.status === "Active" ? "people can sign in" : "sign-in is blocked"} />
            <Kpi icon="clock" hue={trialLeft != null && trialLeft < 7 ? "warn" : "web"} label="Access" value={trialLeft == null ? "No end date" : trialLeft >= 0 ? `${trialLeft} days left` : "Trial ended"}
              sub={tenant.subscription ? `${tenant.subscription.plan} · ${tenant.subscription.status}` : "no subscription"} />
            <Kpi icon="users" hue="teal" label="Customers" value={st?.total_customers ?? "—"} sub={st ? `${st.active_enrollments} active enrolments` : ""} />
          </div>

          <Card title="Shop and admin" icon="shop">
            <dl className="sa-kv">
              <dt>Admin</dt><dd>{tenant.admin_name || "—"}</dd>
              <dt>Admin email</dt><dd>{tenant.admin_email || "—"}</dd>
              <dt>Admin mobile</dt><dd className="mono">{tenant.admin_phone || "—"}</dd>
              <dt>Admin account</dt><dd>{tenant.admin_is_active == null ? "No admin" : <Pill tone={tenant.admin_is_active ? "live" : "bad"}>{tenant.admin_is_active ? "Enabled" : "Disabled"}</Pill>}</dd>
              <dt>Brand colour</dt><dd>{tenant.brand_color ? <span className="sa-row" style={{ justifyContent: "flex-end" }}><i style={{ width: 14, height: 14, borderRadius: 4, background: tenant.brand_color, display: "inline-block" }} /><span className="mono">{tenant.brand_color}</span></span> : "—"}</dd>
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
            <Card title="Plan and access" icon="clock">
              <div className="sa-form">
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
                }), "Plan and access saved.")}>Save plan</button>
              </div>
            </Card>
          )}

          <Card title="Controls" icon="shield">
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
                    <div style={{ flex: "1 1 240px" }}><b style={{ display: "block" }}>Set a new password</b>
                      <span className="sa-muted" style={{ fontSize: 13 }}>You choose {tenant.admin_name}'s password. Tell them yourself; it is never emailed.</span></div>
                    {!pwOpen && <button className="sa-btn sm" onClick={() => { setPwOpen(true); setPw({ a: "", b: "", out: true, err: null }); }}>Set password</button>}
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
              {tenant.admin_email && (
                <Control title="Email a reset link" text={`The admin picks their own password from a link sent to ${tenant.admin_email}.`} btn="Send link" disabled={busy}
                  onClick={() => setConfirm({
                    text: `Send a password reset link to ${tenant.admin_email}?`,
                    run: () => act(async () => {
                      const r = await saService.resetAdminPassword(id);
                      if (!r.reset_email_sent) throw new Error("The reset was created but the email could not be sent (email is not set up on this server).");
                    }, "Reset link sent."),
                  })} />
              )}
              {confirm && (
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
