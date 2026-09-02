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
      {/* Brand panel — fills the viewport, gold accent, no wasted space. */}
      <aside className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(201,168,76,0.28) 0%, rgba(30,41,59,0) 55%), radial-gradient(100% 100% at 100% 100%, rgba(201,168,76,0.16) 0%, rgba(30,41,59,0) 50%)" }}
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-base font-extrabold text-ink shadow-lg">DX</div>
          <span className="text-lg font-extrabold tracking-tight text-white">DFX Solution</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white xl:text-5xl">
            The operating system for modern <span className="text-accent">jewellery</span> businesses.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            Live bullion rates, schemes, billing and customer insights — unified in one secure, multi-tenant platform.
          </p>
        </div>
        <div className="relative flex items-center gap-6 text-xs font-semibold text-white/50">
          <span>Bank-grade security</span>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <span>Real-time data</span>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <span>Multi-tenant</span>
        </div>
      </aside>

      {/* Form panel — vertically centered, comfortable width, balanced spacing. */}
      <main className="flex items-center justify-center bg-canvas px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-sm font-extrabold text-ink shadow">DX</div>
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
