"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/_shared/AuthContext";
import DfxLogo from "@/_shared/DfxLogo";
import TrialSignup from "@/_shared/TrialSignup";

/**
 * Minimum auth boundary for the new UI. Renders children only when a session
 * exists (via AuthContext); otherwise shows the sign-in page wired to the
 * existing DFX backend. No domain screens are modified.
 *
 * The layout is the dfx-sign-in-hub design: a photographic ground, a glass card
 * centred over it, and the DFX lettermark above the form. What it is NOT is the
 * design's form logic, which was a simulated submit with a 900ms timer. Three
 * things are deliberately ours rather than the design's:
 *
 *   - the identifier field stays type="text" with NO email pattern. The server
 *     accepts an email OR a phone number (auth/service.py matches User.email ==
 *     username, or a phone), and an email input refuses a phone number before a
 *     single request is sent. A staff member created with a phone and no email
 *     could not sign in at all. The server decides what is a valid identifier.
 *   - the password field has no 6-character minimum. A client-side length rule
 *     here cannot know the server's policy and can only reject a password that
 *     would have worked.
 *
 * There is no "Forgot password?" here: the owner does not use it on this screen.
 * The backend endpoint (POST /auth/forgot-password) is untouched and still
 * works, so putting the control back is a matter of restoring this block and
 * authService.requestPasswordReset - it is not a feature that had to be rebuilt.
 */
export default function AuthGate({ children }) {
  const { isAuthenticated, loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // "#/register" opens the free-trial sign-up, so the link can be shared.
  const [signup, setSignup] = useState(false);
  useEffect(() => {
    const sync = () => setSignup(window.location.hash.startsWith("#/register"));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const openSignup = () => { window.location.hash = "/register"; };
  const closeSignup = () => { window.location.hash = "/dashboard"; };

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your email or phone, and your password.");
      return;
    }
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
  if (signup) return <TrialSignup onBack={closeSignup} />;

  const fieldBase =
    "w-full rounded-xl border border-line bg-white/70 py-2.5 pl-11 text-[0.9rem] text-ink outline-none transition-all duration-300 placeholder:text-faint/80 hover:border-accent/50 hover:bg-white/90 focus:-translate-y-px focus:border-accent focus:bg-white focus:shadow-md focus:shadow-accent/10 focus:ring-4 focus:ring-accent/15";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-canvas">
      <style>{`
        /* A slow pan and push on the photograph - 40s, so it is felt rather
           than watched. Scaled past 100% first, or the edges would show. */
        @keyframes dfxDrift {
          0%   { transform: scale(1.08) translate3d(0, 0, 0); }
          50%  { transform: scale(1.14) translate3d(-1.6%, -1.2%, 0); }
          100% { transform: scale(1.08) translate3d(0, 0, 0); }
        }
        /* Warm light moving across the scene, as though the sun were shifting. */
        @keyframes dfxGlow {
          0%,100% { opacity: .30; transform: translate3d(-6%, -3%, 0) scale(1); }
          50%     { opacity: .55; transform: translate3d(6%, 4%, 0) scale(1.15); }
        }
        /* The card arrives - it does not blink into place. */
        @keyframes dfxRise {
          from { opacity: 0; transform: translateY(18px) scale(.985); }
          to   { opacity: 1; transform: none; }
        }
        /* Each row of the form follows the card, a beat apart. */
        @keyframes dfxFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        /* A champagne sheen crossing the Sign In button on hover. */
        @keyframes dfxSheen {
          from { transform: translateX(-140%) skewX(-18deg); }
          to   { transform: translateX(260%) skewX(-18deg); }
        }
        .dfx-drift   { animation: dfxDrift 40s ease-in-out infinite; }
        .dfx-glow    { animation: dfxGlow 18s ease-in-out infinite; }
        .dfx-rise    { animation: dfxRise .7s cubic-bezier(.2,.8,.2,1) both; }
        .dfx-step    { animation: dfxFadeUp .55s cubic-bezier(.2,.8,.2,1) both; }
        .dfx-sheen::after {
          content: ""; position: absolute; top: 0; bottom: 0; width: 45%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
          transform: translateX(-140%) skewX(-18deg); pointer-events: none;
        }
        .dfx-sheen:hover::after { animation: dfxSheen .85s ease-out; }

        /* Nothing above is information. Someone who asked their system for less
           movement gets a page that is completely still and equally usable. */
        @media (prefers-reduced-motion: reduce) {
          .dfx-drift, .dfx-glow, .dfx-rise, .dfx-step { animation: none !important; }
          .dfx-rise, .dfx-step { opacity: 1 !important; transform: none !important; }
          .dfx-sheen:hover::after { animation: none !important; }
        }
      `}</style>

      {/* Background scene */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/login-bg.jpg"
        alt=""
        aria-hidden="true"
        className="dfx-drift absolute inset-0 h-full w-full object-cover will-change-transform"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/85 via-white/55 to-white/25" />
      {/* The moving light, under the vignette so it never washes the card out. */}
      <div
        className="dfx-glow pointer-events-none absolute inset-0 will-change-transform"
        style={{
          background:
            "radial-gradient(45% 40% at 30% 35%, rgba(201,168,76,0.35), transparent 70%)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_35%,rgba(45,38,28,0.28)_100%)]" />

      {/* Centred card */}
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-6 sm:py-8 [@media(max-height:760px)]:py-4">
        <div className="w-full max-w-[26.5rem]">
          <div className="dfx-rise rounded-[1.75rem] border border-white/45 bg-white/80 p-6 shadow-[0_24px_70px_-30px_rgba(30,41,59,0.45)] backdrop-blur-xl transition-shadow duration-500 hover:shadow-[0_30px_85px_-28px_rgba(30,41,59,0.55)] sm:px-9 sm:py-8 [@media(max-height:760px)]:py-6">
            <div className="flex flex-col items-center text-center">
              <span className="dfx-step mb-4 inline-flex [@media(max-height:640px)]:hidden items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent-strong [animation-delay:80ms]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                Trusted jewellery platform
              </span>
              <span className="dfx-step [animation-delay:120ms]">
                <DfxLogo size={44} />
              </span>

              <h1
                className="dfx-step mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight text-ink [animation-delay:200ms] [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:text-[1.55rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Welcome Back
              </h1>
              <p className="dfx-step mt-1.5 text-sm text-muted [animation-delay:260ms]">
                Sign in to access your DFX account
              </p>
            </div>

              <form noValidate onSubmit={onSubmit} className="mt-6 space-y-3 [@media(max-height:760px)]:mt-4">
                {/* Identifier — email OR phone, decided by the server. */}
                <div className="dfx-step [animation-delay:320ms]">
                  <label htmlFor="username" className="sr-only">
                    Email address or phone number
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center text-faint">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
                        <path d="m4 8 7.1 4.7a2 2 0 0 0 2.2 0L20 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      placeholder="Email address or phone"
                      value={username}
                      autoFocus
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError("");
                      }}
                      className={`${fieldBase} pr-4`}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="dfx-step [animation-delay:380ms]">
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center text-faint">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="4" y="10" width="16" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      className={`${fieldBase} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-center text-faint transition-all duration-200 hover:scale-110 hover:text-accent-strong active:scale-95"
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M9.4 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 9 7s-1.2 3.6-3.1 5M6.1 7.6C3.8 9 2.5 10.7 2.5 12c0 2.5 4 7 9.5 7 1.2 0 2.4-.2 3.5-.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Whatever the server said, said plainly. */}
                {error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <p className="text-xs font-semibold text-danger">{error}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="dfx-sheen dfx-step group relative mt-1 flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-ink-deep px-4 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-ink-deep/20 transition-all duration-300 [animation-delay:480ms] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink-deep/30 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 active:translate-y-0 active:shadow-md disabled:cursor-not-allowed disabled:opacity-85 disabled:hover:translate-y-0"
                >
                  {busy ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      Signing In…
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg
                        className="transition-transform group-hover:translate-x-1"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>
              </form>

            <div className="dfx-step mt-4 rounded-xl border border-accent-line bg-accent-soft/60 px-4 py-2.5 text-center [animation-delay:540ms] [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:py-2">
              <p className="text-[0.8rem] text-ink/75">New jewellery store on DFX?</p>
              <button type="button" onClick={openSignup}
                className="group mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline">
                Create account · Start your free trial
                <svg className="transition-transform group-hover:translate-x-0.5" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* What the product does, inside the card and hung off the form
                rather than floating below it. It was an outer panel that read
                as a stray object at the foot of the page - and it said security
                a third time, after the rule above it and the sentence under
                that. Those two are gone; these three points carry it, and the
                card is a single object again. */}
            <div className="mt-5 border-t border-line-soft pt-4 [@media(max-height:760px)]:hidden">
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    label: "Live bullion rates",
                    icon: <path d="M3 17l5-6 4 4 4-6 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
                  },
                  {
                    label: "Billing & schemes",
                    icon: (
                      <>
                        <rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </>
                    ),
                  },
                  {
                    label: "Bank-grade security",
                    icon: (
                      <>
                        <rect x="4" y="10" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </>
                    ),
                  },
                ].map((f) => (
                  <div key={f.label} className="flex flex-col items-center gap-1.5 px-1 text-center">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-accent-strong" fill="none" aria-hidden="true">
                      {f.icon}
                    </svg>
                    <span className="text-[0.64rem] font-semibold leading-tight text-ink/65">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}
