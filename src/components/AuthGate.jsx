"use client";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

/**
 * Minimum auth boundary for the new UI. Renders children only when a session
 * exists (via AuthContext); otherwise shows a premium full-viewport login wired
 * to the existing DFX backend (Email + Password only). No domain screens or
 * existing design tokens are modified.
 */
export default function AuthGate({ children }) {
  const { isAuthenticated, loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err?.message || "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (isAuthenticated) return children;

  return (
    <div className="grid h-screen w-full lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — living jewellery hero: drifting aurora light, panning
          grid, shimmering gold headline and floating flecks. */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14"
        style={{ background: "linear-gradient(160deg, #0d1220 0%, #151d30 45%, #1d2436 100%)" }}
      >
        <style>{`
          @keyframes dfxAuroraA { 0%,100% { transform: translate3d(-8%,-6%,0) scale(1); }   50% { transform: translate3d(10%,8%,0) scale(1.25); } }
          @keyframes dfxAuroraB { 0%,100% { transform: translate3d(6%,10%,0) scale(1.15); } 50% { transform: translate3d(-10%,-8%,0) scale(0.9); } }
          @keyframes dfxAuroraC { 0%,100% { transform: translate3d(0,4%,0) scale(1); }      50% { transform: translate3d(-6%,-10%,0) scale(1.2); } }
          @keyframes dfxGridPan  { 0% { background-position: 0 0, 0 0; } 100% { background-position: 46px 46px, 46px 46px; } }
          @keyframes dfxShimmer  { 0% { background-position: -180% 0; } 100% { background-position: 180% 0; } }
          @keyframes dfxFloat    { 0%,100% { transform: translateY(0); opacity: .25; } 50% { transform: translateY(-26px); opacity: .85; } }
          @keyframes dfxSweep    { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
          @media (prefers-reduced-motion: reduce) {
            .dfx-anim { animation: none !important; }
          }
        `}</style>

        {/* Drifting aurora light — gold, amber, deep teal */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="dfx-anim absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full blur-[90px]"
            style={{ background: "radial-gradient(circle, rgba(201,168,76,0.55) 0%, rgba(201,168,76,0) 70%)", animation: "dfxAuroraA 22s ease-in-out infinite" }} />
          <div className="dfx-anim absolute -bottom-1/4 -right-1/4 h-[75%] w-[75%] rounded-full blur-[100px]"
            style={{ background: "radial-gradient(circle, rgba(231,201,107,0.34) 0%, rgba(231,201,107,0) 70%)", animation: "dfxAuroraB 27s ease-in-out infinite" }} />
          <div className="dfx-anim absolute bottom-0 left-1/4 h-[55%] w-[55%] rounded-full blur-[90px]"
            style={{ background: "radial-gradient(circle, rgba(45,116,110,0.36) 0%, rgba(45,116,110,0) 70%)", animation: "dfxAuroraC 31s ease-in-out infinite" }} />
        </div>

        {/* Slowly panning grid */}
        <div
          className="dfx-anim pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "46px 46px, 46px 46px",
            animation: "dfxGridPan 14s linear infinite",
            maskImage: "radial-gradient(120% 90% at 30% 20%, #000 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 30% 20%, #000 40%, transparent 100%)",
          }}
        />

        {/* Floating gold flecks */}
        <div className="pointer-events-none absolute inset-0">
          {[
            { l: "12%", t: "24%", s: 3, d: "0s", u: "7s" },
            { l: "78%", t: "18%", s: 2, d: "1.4s", u: "9s" },
            { l: "62%", t: "62%", s: 4, d: "0.7s", u: "8s" },
            { l: "28%", t: "76%", s: 2, d: "2.1s", u: "10s" },
            { l: "88%", t: "48%", s: 3, d: "1.1s", u: "11s" },
            { l: "44%", t: "36%", s: 2, d: "2.8s", u: "9.5s" },
          ].map((p, i) => (
            <span
              key={i}
              className="dfx-anim absolute rounded-full bg-accent"
              style={{ left: p.l, top: p.t, height: p.s, width: p.s, animation: `dfxFloat ${p.u} ease-in-out ${p.d} infinite` }}
            />
          ))}
        </div>

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#e7c96b] via-accent to-[#b8963f] text-[13px] font-extrabold tracking-tight text-[#1b2030] shadow-lg shadow-accent/30">
            DFX
          </div>
          <div className="leading-tight">
            <div className="text-lg font-extrabold tracking-tight text-white">DFX Solution</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Jewellery OS</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live · Secure · Multi-tenant
          </span>
          <h2 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-white xl:text-[52px]">
            The operating system for modern{" "}
            <span
              className="dfx-anim bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(100deg, #b8963f 0%, #e7c96b 35%, #fff6d8 50%, #e7c96b 65%, #b8963f 100%)",
                backgroundSize: "220% 100%",
                animation: "dfxShimmer 6s linear infinite",
              }}
            >
              jewellery
            </span>{" "}
            businesses.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/65">
            Live bullion rates, schemes, billing and customer insights — unified in one secure, multi-tenant platform.
          </p>

          {/* Live-rate glass card with a light sweep */}
          <div className="relative mt-8 max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/30 backdrop-blur-md">
            <div
              className="dfx-anim pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-18deg]"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)", animation: "dfxSweep 5.5s ease-in-out infinite" }}
            />
            <div className="relative flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-white/85">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                Live Gold Rate
              </span>
              <span className="text-[11px] font-semibold text-white/40">per gram</span>
            </div>
            <div className="relative mt-3 grid grid-cols-3 gap-3">
              {[{ k: "24K", v: "₹15,764" }, { k: "22K", v: "₹14,130" }, { k: "18K", v: "₹11,900" }].map((r) => (
                <div key={r.k} className="rounded-xl border border-white/5 bg-black/25 px-3 py-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-white/45">{r.k}</div>
                  <div className="num mt-0.5 text-sm font-extrabold text-accent">{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="relative grid max-w-md gap-3">
          {[
            { t: "Bank-grade security", d: "Encrypted, role-based, audit-ready" },
            { t: "Real-time bullion", d: "Live market rates, auto-synced" },
            { t: "Schemes & billing", d: "Enrollments, invoices, collections" },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <span>
                <span className="block text-sm font-bold text-white">{f.t}</span>
                <span className="block text-xs text-white/45">{f.d}</span>
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* Form panel — vertically centered, comfortable width, balanced spacing. */}
      <main className="flex items-center justify-center bg-canvas px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#e7c96b] via-accent to-[#b8963f] text-[11px] font-extrabold tracking-tight text-[#1b2030] shadow">DFX</div>
            <span className="text-lg font-extrabold tracking-tight text-ink">DFX Solution</span>
          </div>

          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to your DFX workspace to continue.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-ink-soft">Email</span>
              <Input
                type="email"
                placeholder="you@company.com"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-ink-soft">Password</span>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <p className="text-xs font-semibold text-danger">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={busy} size="lg" className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-faint">
            © {new Date().getFullYear()} DFX Solution. Secure business platform.
          </p>
        </div>
      </main>
    </div>
  );
}
