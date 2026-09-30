"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/_shared/apiClient";
import { useAuth } from "@/_shared/AuthContext";
import DfxLogo from "@/_shared/DfxLogo";
import LoginBackdrop from "@/_shared/LoginBackdrop";

/**
 * "Start your free trial": GST -> store -> contact person -> password.
 *
 * One request creates the store (POST /auth/trial/register); everything before
 * that is checked on screen AND again on the server. The GSTIN is checked on
 * our own server (format, state code, check character) - there is no outside
 * GST lookup, so the store name is typed, not fetched. Business type is always
 * retail and is not asked. The form is kept for this tab (never the password)
 * so a reload does not lose it.
 */

const STEPS = [
  { key: "gst", title: "GST verification", sub: "Your GSTIN" },
  { key: "store", title: "Store details", sub: "Name & city" },
  { key: "contact", title: "Contact person", sub: "Owner & mobile" },
  { key: "password", title: "Set password", sub: "Secure your login" },
];
const DRAFT_KEY = "dfx:trialDraft";
const EMPTY = { gstin: "", store_name: "", city: "", address: "", pincode: "", contact_name: "", phone: "", email: "" };

// Per-position GSTIN rule: 2 digits, 5 letters, 4 digits, letter, 1-9/A-Z, 'Z', check.
const POS = [/\d/, /\d/, /[A-Z]/, /[A-Z]/, /[A-Z]/, /[A-Z]/, /[A-Z]/, /\d/, /\d/, /\d/, /\d/, /[A-Z]/, /[1-9A-Z]/, /Z/, /[0-9A-Z]/];
const gstBadAt = (g) => g.split("").findIndex((ch, i) => !POS[i]?.test(ch));

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < 8) return { n: 1, label: "Weak", tone: "bg-rose-500", text: "text-rose-600", tip: "Weak password - you can still use it, but 8+ characters with a number and a symbol is safer." };
  if (s <= 2) return { n: 2, label: "Fair", tone: "bg-amber-500", text: "text-amber-600", tip: "Fair. Add a capital letter, a number or a symbol to make it strong." };
  if (s <= 3) return { n: 3, label: "Good", tone: "bg-lime-500", text: "text-lime-700", tip: "Good password." };
  return { n: 4, label: "Strong", tone: "bg-emerald-500", text: "text-emerald-600", tip: "Strong password." };
}

const I = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></>,
  store: <><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" /><path d="M3 10l1.6-5.2A1 1 0 0 1 5.6 4h12.8a1 1 0 0 1 1 .8L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" /><path d="M10 20v-5h4v5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 7.1 4.7a2 2 0 0 0 2.2 0L20 8" /></>,
  lock: <><rect x="4" y="10" width="16" height="10" rx="3" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M9.4 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 9 7s-1.2 3.6-3.1 5M6.1 7.6C3.8 9 2.5 10.7 2.5 12c0 2.5 4 7 9.5 7 1.2 0 2.4-.2 3.5-.6" />,
  arrowR: <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" />,
  arrowL: <path d="M20 12H5m0 0 5.5-5.5M5 12l5.5 5.5" />,
  shield: <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8Zm0 0s1.5-4.5 4-3.5S15 8 12 8Z" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4" />,
};
const Svg = ({ d, className = "h-4 w-4", sw = 1.8 }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const Spinner = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity=".25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const inputCls = (bad) =>
  `w-full rounded-xl border bg-white py-2.5 pl-11 pr-4 text-[0.92rem] text-ink outline-none transition placeholder:text-faint/80 focus:ring-4 ${
    bad ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15" : "border-line hover:border-accent/50 focus:border-accent focus:ring-accent/15"
  }`;

function Field({ id, label, required, optional, icon, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1 text-[0.8rem] font-semibold text-ink">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
        {optional ? <span className="ml-1 text-[0.7rem] font-medium text-faint">Optional</span> : null}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center text-faint"><Svg d={icon} /></span>
        ) : null}
        {children}
      </div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600"><Svg d={I.alert} className="h-3.5 w-3.5" />{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export default function TrialSignup({ onBack }) {
  const { signInWithTokens } = useAuth();
  // The draft for this tab, read once before the first render. Reading it in
  // an effect let the save effect write the empty form over it first.
  const [draft] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
  });
  const [step, setStep] = useState(() => (draft?.f && draft.step ? Math.min(draft.step, 3) : 0));
  const [f, setF] = useState(() => (draft?.f ? { ...EMPTY, ...draft.f } : EMPTY));
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);
  const [honey, setHoney] = useState("");
  const [gst, setGst] = useState(() => draft?.gst || null); // server result for f.gstin
  const [gstBusy, setGstBusy] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [entering, setEntering] = useState(false);
  const firstRef = useRef(null);

  // Keep the draft for this tab (never the password).
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f, gst, step })); } catch { /* ignore */ }
  }, [f, gst, step]);
  useEffect(() => { firstRef.current?.focus(); }, [step]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (err[k] || err.form) setErr((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

  // ── GST ────────────────────────────────────────────────────────────────
  const g = f.gstin;
  const badAt = gstBadAt(g);
  const gstVerified = gst && gst.gstin === g && gst.available;

  async function verifyGst(value = g) {
    if (value.length !== 15 || gstBadAt(value) !== -1) {
      setErr({ gstin: value.length !== 15 ? `GSTIN is 15 characters - ${15 - value.length} more to go` : "Character " + (gstBadAt(value) + 1) + " looks wrong - check the GSTIN on your GST certificate" });
      return false;
    }
    setGstBusy(true);
    setErr({});
    try {
      const res = await apiClient.post("/auth/trial/check-gst", { gstin: value });
      setGst(res.data);
      if (!res.data.available) { setErr({ gstin: "taken" }); return false; }
      return true;
    } catch (e) {
      setGst(null);
      setErr({ gstin: e?.message || "Could not check this GSTIN" });
      return false;
    } finally {
      setGstBusy(false);
    }
  }
  function onGstChange(e) {
    const v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
    setF((x) => ({ ...x, gstin: v }));
    setErr({});
    if (gst && gst.gstin !== v) setGst(null);
    if (v.length === 15 && gstBadAt(v) === -1) verifyGst(v);
  }

  // ── Validation per step ────────────────────────────────────────────────
  const phoneDigits = f.phone.replace(/\D/g, "");
  function validate(s) {
    const e = {};
    if (s === 1) {
      if (f.store_name.trim().length < 2) e.store_name = "Enter your store or business name";
      if (f.city.trim().length < 2) e.city = "Enter your city";
      if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = "PIN code is 6 digits";
    }
    if (s === 2) {
      if (f.contact_name.trim().length < 2) e.contact_name = "Enter the contact person's full name";
      if (!/^[6-9]\d{9}$/.test(phoneDigits)) e.phone = "Enter a 10-digit mobile number starting 6, 7, 8 or 9";
      if (!f.email.trim()) e.email = "Enter your email - you will sign in with it";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "That email doesn't look right";
    }
    if (s === 3) {
      if (pw.length < 6) e.pw = "Use at least 6 characters";
      else if (pw !== pw2) e.pw2 = "Passwords don't match";
      if (!terms) e.terms = "Please accept the terms to continue";
    }
    setErr(e);
    return Object.keys(e).length === 0;
  }

  async function next() {
    if (step === 0) {
      if (!gstVerified && !(await verifyGst())) return;
      setStep(1);
      return;
    }
    if (!validate(step)) return;
    if (step < 3) setStep(step + 1);
    else submit();
  }

  async function submit() {
    setBusy(true);
    setErr({});
    try {
      const res = await apiClient.post("/auth/trial/register", {
        gstin: f.gstin, store_name: f.store_name.trim(), city: f.city.trim(),
        address: f.address.trim() || null, pincode: f.pincode || null,
        contact_name: f.contact_name.trim(), phone: phoneDigits, email: f.email.trim().toLowerCase(),
        password: pw, accept_terms: terms, website: honey || null,
      });
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDone(res.data);
    } catch (e) {
      const m = e?.message || "Could not create your account. Please try again.";
      if (/GSTIN/i.test(m)) { setStep(0); setErr({ gstin: m }); }
      else if (/mobile/i.test(m)) { setStep(2); setErr({ phone: m }); }
      else if (/email/i.test(m)) { setStep(2); setErr({ email: m }); }
      else setErr({ form: m });
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    setEntering(true);
    try {
      await signInWithTokens(done.access_token, done.refresh_token);
      if (typeof window !== "undefined") window.location.hash = "/dashboard";
    } catch {
      setEntering(false);
      onBack?.();
    }
  }

  const st = useMemo(() => strength(pw), [pw]);
  const onKey = (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { e.preventDefault(); next(); } };

  // ── Success ────────────────────────────────────────────────────────────
  if (done) {
    const ends = new Date(done.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    return (
      <Shell>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="dfx-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200/40" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <Svg d={I.check} className="h-7 w-7" sw={2.6} />
            </span>
          </div>
          <h2 className="mt-6 text-[1.7rem] font-semibold tracking-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
            {done.store_name} is ready
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted">Your free trial has started. Every feature is open - billing, stock, schemes, customers and reports.</p>

          <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-[1fr_1.7fr_1.1fr]">
            {[
              { k: "Trial ends", v: ends },
              { k: "Sign in with", v: done.login },
              { k: "Store ID", v: done.tenant_id, mono: true },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-line-soft bg-surface/70 px-3.5 py-3">
                <div className="text-[0.66rem] font-bold uppercase tracking-wider text-faint">{x.k}</div>
                <div className={`mt-1 break-all text-[0.86rem] font-semibold text-ink ${x.mono ? "font-mono text-[0.78rem]" : ""}`} title={x.v}>{x.v}</div>
              </div>
            ))}
          </div>

          <button type="button" onClick={enter} disabled={entering}
            className="group mt-8 inline-flex items-center gap-2.5 rounded-xl bg-ink-deep px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-ink-deep/20 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-80">
            {entering ? <><Spinner /> Opening…</> : <>Open my dashboard <Svg d={I.arrowR} className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
          </button>
        </div>
      </Shell>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 max-sm:hidden inline-flex [@media(max-height:820px)]:hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-emerald-700">
          <Svg d={I.gift} className="h-3 w-3" sw={2} /> Free trial · No card needed
        </span>
        <span className="[@media(max-height:700px)]:hidden max-sm:scale-90 max-sm:[@media(max-height:780px)]:hidden"><DfxLogo size={38} /></span>
        <h1 className="mt-3 max-sm:[@media(max-height:780px)]:mt-0 text-[1.6rem] font-semibold leading-tight tracking-tight text-ink [@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:text-[1.35rem]" style={{ fontFamily: "var(--font-display)" }}>
          Create your store account
        </h1>
        <p className="mt-1 text-sm text-muted [@media(max-height:700px)]:hidden max-sm:[@media(max-height:780px)]:hidden">Set up in 2 minutes and start billing today</p>
      </div>

      {/* Stepper */}
      <ol className="mt-5 grid grid-cols-4 gap-2 [@media(max-height:820px)]:mt-3">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "now" : "todo";
          return (
            <li key={s.key} className="relative">
              <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)}
                className="flex w-full flex-col items-center gap-2 text-center disabled:cursor-default sm:flex-row sm:text-left">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 [@media(max-height:700px)]:h-7 [@media(max-height:700px)]:w-7 [@media(max-height:700px)]:text-xs ${
                  state === "done" ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                    : state === "now" ? "bg-ink-deep text-white shadow-md shadow-ink-deep/25 ring-4 ring-ink-deep/10"
                    : "border border-line bg-white text-faint"}`}>
                  {state === "done" ? <Svg d={I.check} className="h-4 w-4" sw={2.6} /> : i + 1}
                </span>
                <span className="min-w-0 max-sm:[@media(max-height:700px)]:hidden">
                  <span className={`block text-[0.74rem] font-semibold leading-tight sm:text-[0.8rem] ${state === "todo" ? "text-faint" : "text-ink"}`}>{s.title}</span>
                  <span className="hidden text-[0.68rem] text-faint sm:block [@media(max-height:700px)]:sm:hidden">{s.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full bg-gradient-to-r from-ink-deep to-accent transition-all duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
      </div>

      <form noValidate onKeyDown={onKey} onSubmit={(e) => { e.preventDefault(); next(); }}
        className="mt-4 rounded-2xl border border-line-soft bg-surface/60 p-4 sm:px-6 sm:py-5 [@media(max-height:820px)]:mt-3 [@media(max-height:820px)]:sm:py-4">
        {/* Honeypot: invisible to people, filled by bots. Not named like any
            real field (it was "website", which phone browsers autofilled - and
            real owners were turned away as bots). */}
        <input type="text" name="dfx_hp_x7" id="dfx_hp_x7" tabIndex={-1} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" value={honey} onChange={(e) => setHoney(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />

        <div key={step} className="dfx-slide">
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-ink">Company GST number</h2>
              <p className="mt-1 text-[0.82rem] text-muted max-sm:hidden [@media(max-height:820px)]:hidden">Enter the 15-character GSTIN printed on your GST registration certificate.</p>

              <label htmlFor="gstin" className="mb-1.5 mt-5 flex items-center gap-1 text-[0.8rem] font-semibold text-ink">GSTIN <span className="text-rose-500">*</span></label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center text-faint"><Svg d={I.shield} /></span>
                  <input id="gstin" ref={firstRef} value={g} onChange={onGstChange} placeholder="27AAPFU0939F1ZV"
                    autoComplete="off" spellCheck={false} inputMode="text" maxLength={15}
                    className={`${inputCls(err.gstin || badAt !== -1)} !pr-14 font-mono text-[1rem] uppercase tracking-[0.14em] sm:tracking-[0.18em] max-sm:text-[0.92rem] max-sm:tracking-[0.03em]`} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[0.7rem] text-faint">{g.length}/15</span>
                </div>
                <button type="button" onClick={() => verifyGst()} disabled={gstBusy || gstVerified}
                  className={`inline-flex min-w-[6.5rem] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                    gstVerified ? "bg-emerald-500" : "bg-ink-deep hover:brightness-110"} disabled:cursor-default`}>
                  {gstBusy ? <Spinner /> : gstVerified ? <><Svg d={I.check} sw={2.6} /> Verified</> : "Verify"}
                </button>
              </div>

              {err.gstin === "taken" ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.82rem] text-amber-800">
                  <Svg d={I.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>A store with this GSTIN is already on DFX. <button type="button" onClick={onBack} className="font-semibold underline underline-offset-2">Sign in instead</button>, or contact DFX support.</span>
                </div>
              ) : err.gstin ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-600"><Svg d={I.alert} className="h-3.5 w-3.5" />{err.gstin}</p>
              ) : gstVerified ? (
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2 text-[0.82rem] font-semibold text-emerald-700"><Svg d={I.check} sw={2.4} /> Valid GSTIN</div>
                  <div className="text-[0.8rem] text-ink"><span className="text-faint">State · </span>{gst.state} ({gst.state_code})</div>
                  <div className="text-[0.8rem] text-ink"><span className="text-faint">PAN · </span><span className="font-mono">{gst.pan}</span></div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">We check it the moment all 15 characters are in.</p>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-ink">Store details</h2>
              <p className="mt-1 text-[0.82rem] text-muted max-sm:hidden [@media(max-height:820px)]:hidden">This is the name your customers see on bills and in the app.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field id="store_name" label="Store / business name" required icon={I.store} error={err.store_name}>
                    <input id="store_name" ref={firstRef} value={f.store_name} onChange={set("store_name")} maxLength={100}
                      placeholder="e.g. Sri Lakshmi Jewellers" className={inputCls(err.store_name)} />
                  </Field>
                </div>
                {/* Phones: City | PIN, the state as a line of text, then the full
                    address - so no field is too narrow for its own text. From sm
                    up: City | State, Address | PIN. */}
                <div className="max-sm:order-1">
                  <Field id="city" label="City" required icon={I.pin} error={err.city}>
                    <input id="city" value={f.city} onChange={set("city")} maxLength={60} placeholder="e.g. Chennai" className={inputCls(err.city)} />
                  </Field>
                </div>
                <div className="max-sm:hidden">
                  <Field id="state" label="State" icon={I.shield} hint="Taken from your GSTIN">
                    <input id="state" value={gst?.state || ""} readOnly className={`${inputCls(false)} cursor-not-allowed bg-line-soft/40 text-muted`} />
                  </Field>
                </div>
                {gst?.state ? (
                  <p className="col-span-2 -mt-1 text-xs text-muted sm:hidden max-sm:order-3">
                    State: <span className="font-semibold text-ink">{gst.state}</span> · from your GSTIN
                  </p>
                ) : null}
                <div className="max-sm:order-4 max-sm:col-span-2">
                  <Field id="address" label="Shop address" optional icon={I.store}>
                    <input id="address" value={f.address} onChange={set("address")} maxLength={300} placeholder="Door no., street, area" className={inputCls(false)} />
                  </Field>
                </div>
                <div className="max-sm:order-2">
                  <Field id="pincode" label="PIN code" optional icon={I.pin} error={err.pincode}>
                    <input id="pincode" value={f.pincode} inputMode="numeric" maxLength={6}
                      onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ""); set("pincode")(e); }}
                      placeholder="600001" className={inputCls(err.pincode)} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-ink">Contact person</h2>
              <p className="mt-1 text-[0.82rem] text-muted max-sm:hidden [@media(max-height:820px)]:hidden">The owner or manager. This person becomes the store&apos;s admin.</p>
              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field id="contact_name" label="Full name" required icon={I.user} error={err.contact_name}>
                    <input id="contact_name" ref={firstRef} value={f.contact_name} onChange={set("contact_name")} maxLength={100}
                      placeholder="e.g. Ramesh Kumar" autoComplete="name" className={inputCls(err.contact_name)} />
                  </Field>
                </div>
                <Field id="phone" label="Mobile number" required error={err.phone} hint="For bills and store contact">
                  <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-[0.92rem] font-semibold text-ink/70">+91</span>
                  <input id="phone" value={f.phone} inputMode="numeric" maxLength={10} autoComplete="tel-national"
                    onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); set("phone")(e); }}
                    placeholder="98765 43210" className={`${inputCls(err.phone)} !pl-14 tracking-wide`} />
                </Field>
                <Field id="email" label="Email" required icon={I.mail} error={err.email} hint="You'll sign in with this email">
                  <input id="email" type="email" value={f.email} onChange={set("email")} maxLength={255}
                    placeholder="you@store.com" autoComplete="email" className={inputCls(err.email)} />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-ink">Set your password</h2>
              <p className="mt-1 text-[0.82rem] text-muted max-sm:hidden [@media(max-height:820px)]:hidden">You&apos;ll sign in with your email and this password.</p>
              <div className="mt-4 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 max-sm:mt-3">
                <Field id="pw" label="Password" required icon={I.lock} error={err.pw}>
                  <input id="pw" ref={firstRef} type={showPw ? "text" : "password"} value={pw} maxLength={72} autoComplete="new-password"
                    onChange={(e) => { setPw(e.target.value); setErr({}); }} placeholder="Min. 6 characters" className={`${inputCls(err.pw)} !pr-12`} />
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-center text-faint hover:text-ink">
                    <Svg d={showPw ? I.eyeOff : I.eye} className="h-[18px] w-[18px]" />
                  </button>
                </Field>
                <Field id="pw2" label="Confirm password" required icon={I.lock} error={err.pw2}>
                  <input id="pw2" type={showPw ? "text" : "password"} value={pw2} maxLength={72} autoComplete="new-password"
                    onChange={(e) => { setPw2(e.target.value); setErr({}); }} placeholder="Type it again" className={inputCls(err.pw2)} />
                  {pw2 && pw === pw2 ? <span className="absolute inset-y-0 right-3 flex items-center text-emerald-500"><Svg d={I.check} sw={2.6} /></span> : null}
                </Field>
              </div>

              {pw ? (
                <div className="mt-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 rounded-full transition-colors duration-300 ${n <= st.n ? st.tone : "bg-line-soft"}`} />)}
                  </div>
                  <p className={`mt-1.5 text-xs font-semibold ${st.text}`}>{st.label} · <span className="font-normal text-muted">{st.tip}</span></p>
                </div>
              ) : null}

              {/* Review before creating */}
              <div className="mt-4 divide-y divide-line-soft rounded-xl border border-line-soft bg-white [@media(max-height:820px)]:mt-3">
                {[
                  { k: "GSTIN", v: f.gstin, s: 0, mono: true },
                  { k: "Store", v: `${f.store_name} · ${f.city}${gst?.state ? `, ${gst.state}` : ""}`, s: 1 },
                  { k: "Contact", v: `${f.contact_name} · +91 ${phoneDigits}`, s: 2 },
                  { k: "Login", v: f.email.trim().toLowerCase(), s: 2 },
                ].map((r) => (
                  <div key={r.k} className="flex items-center gap-3 px-4 py-2 max-sm:px-3 max-sm:py-1.5 [@media(max-height:700px)]:py-1.5">
                    <span className="w-16 shrink-0 text-[0.7rem] font-bold uppercase tracking-wider text-faint max-sm:w-[3.4rem] max-sm:text-[0.6rem] max-sm:tracking-wide">{r.k}</span>
                    <span className={`min-w-0 flex-1 truncate text-[0.84rem] text-ink max-sm:text-[0.78rem] ${r.mono ? "font-mono tracking-wider max-sm:tracking-normal" : ""}`} title={r.v}>{r.v}</span>
                    <button type="button" onClick={() => setStep(r.s)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent-strong hover:underline">
                      <Svg d={I.edit} className="h-3.5 w-3.5" /><span className="max-sm:sr-only">Edit</span>
                    </button>
                  </div>
                ))}
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[0.82rem] text-ink">
                <input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErr({}); }}
                  className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--color-ink-deep)]" />
                <span>I agree to the DFX Terms of Service and Privacy Policy<span className="max-sm:hidden">, and confirm the GST details are my business&apos;s</span>.</span>
              </label>
              {err.terms ? <p className="mt-1.5 text-xs font-semibold text-rose-600">{err.terms}</p> : null}
            </div>
          )}
        </div>

        {err.form ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5 text-xs font-semibold text-danger">
            <Svg d={I.alert} className="h-4 w-4 shrink-0" />{err.form}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3 [@media(max-height:820px)]:mt-4">
          {step > 0 ? (
            <button type="button" onClick={() => { setErr({}); setStep(step - 1); }}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/30">
              <Svg d={I.arrowL} /> Back
            </button>
          ) : <span />}
          <button type="submit" disabled={busy || gstBusy}
            className="group inline-flex min-w-[9rem] items-center justify-center gap-2 rounded-xl bg-ink-deep px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-ink-deep/20 transition hover:-translate-y-0.5 hover:brightness-110 disabled:translate-y-0 disabled:opacity-80">
            {busy ? <><Spinner /> Creating your store…</> : step === 3 ? <><span className="whitespace-nowrap"><span className="max-sm:hidden">Start your free trial</span><span className="sm:hidden">Start free trial</span></span> <Svg d={I.arrowR} className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
              : <>Continue <Svg d={I.arrowR} className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-muted [@media(max-height:820px)]:mt-3">
        Already have an account?{" "}
        <button type="button" onClick={onBack} className="font-semibold text-accent-strong hover:underline">Sign in</button>
      </p>
    </Shell>
  );
}

/** Same photographic ground as the sign-in page, with a wider card. */
function Shell({ children }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-canvas">
      <style>{`
        @keyframes dfxSlide { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
        @keyframes dfxPop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes dfxRise2 { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .dfx-slide { animation: dfxSlide .35s cubic-bezier(.2,.8,.2,1) both; }
        .dfx-pop { animation: dfxPop .55s cubic-bezier(.2,.8,.2,1) both; }
        .dfx-rise2 { animation: dfxRise2 .6s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
      <LoginBackdrop veil="from-white/75 via-white/45 to-white/15" />
      <main className="relative z-10 flex min-h-dvh items-start justify-center px-4 py-5 sm:items-center sm:py-6 [@media(max-height:820px)]:py-3 [@media(max-height:700px)]:py-2">
        <div className="dfx-rise2 w-full max-w-[46rem] rounded-[1.75rem] border border-white/50 bg-white/85 p-5 shadow-[0_24px_70px_-30px_rgba(30,41,59,0.45)] backdrop-blur-xl sm:px-8 sm:py-7 [@media(max-height:820px)]:sm:py-5">
          {children}
        </div>
      </main>
    </div>
  );
}
