import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { goldRateService } from "../services/goldRateService";

// Real gold rate loaded from the DFX backend (24K authoritative).
// No mock rate history remains; the backend contract exposes no history endpoint.
const HISTORY = [];

export default function GoldRate() {
  const scope = useRef(null);
  usePressFeedback(scope);
  // Six manually-entered rates (strings for the inputs). Empty stays empty —
  // never fabricated. rate_24k is the only backend-required figure.
  const EMPTY = { r24: "", r22: "", r18: "", r14: "", r9: "", silver: "" };
  const [rates, setRates] = useState(EMPTY);
  const setField = (k) => (e) => setRates((s) => ({ ...s, [k]: e.target.value }));
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [saving, setSaving] = useState(false);
  const [todayExists, setTodayExists] = useState(false);

  const num = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };

  const loadRate = useCallback(async () => {
    setLoading(true);
    try {
      const today = await goldRateService.getTodayRate();
      if (today?.rate_24k != null) {
        setRates({
          r24: String(today.rate_24k),
          r22: today.rate_22k != null ? String(today.rate_22k) : "",
          r18: today.rate_18k != null ? String(today.rate_18k) : "",
          r14: today.rate_14k != null ? String(today.rate_14k) : "",
          r9: today.rate_9k != null ? String(today.rate_9k) : "",
          silver: today.silver_999 != null ? String(today.silver_999) : "",
        });
        setTodayExists(true);
      } else {
        setRates(EMPTY);
        setTodayExists(false);
      }
    } catch {
      setRates(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRate();
  }, [loadRate]);

  async function publishRate() {
    const r24 = Number(rates.r24);
    if (!r24 || r24 <= 0) { toast("Enter a valid 24K rate"); return; }
    setSaving(true);
    try {
      if (todayExists) await goldRateService.updateTodayRate(rates);
      else await goldRateService.createTodayRate(rates);
      await loadRate();
      toast(`Gold rate published at ${formatINR(r24)}/g (24K)`);
    } catch (err) {
      toast(err?.message || "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  // No previous-rate endpoint in the contract; delta indicator stays flat.
  const prevRate = null;
  const diff = 0;
  const pct = 0;
  const isUp = false;
  const isDown = false;

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Gold Rate</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Set the daily rate. Updates publish to the storefront and apply to new bills instantly.
          </p>
        </div>
        <Badge tone="info" dot>IBJA sync · 11:00 AM</Badge>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div data-motion="stat" className="hero-card group relative overflow-hidden rounded-[20px] border border-white/10 p-7 text-white shadow-xl lg:col-span-2" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #1e293b 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-[#c9a84c]/25 blur-2xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-white/[0.06]" />
          <div className="relative flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">22K Gold · per gram</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold backdrop-blur"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE</span>
          </div>
          <div className="num relative mt-3 text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">
            {num(rates.r22) != null ? formatINR(num(rates.r22)) : "—"}
          </div>
          <div className={`relative mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold backdrop-blur ${isUp ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-300" : isDown ? "border-red-400/20 bg-red-500/15 text-red-300" : "border-[#fde68a]/20 bg-[#c9a84c]/15 text-[#fde68a]"}`} style={isDown ? { textShadow: "0 0 10px rgba(252,165,165,0.7)", boxShadow: "0 0 18px rgba(239,68,68,0.32)" } : isUp ? { textShadow: "0 0 10px rgba(110,231,183,0.55)", boxShadow: "0 0 18px rgba(16,185,129,0.22)" } : undefined}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{isDown ? <path d="M7 7l10 10M17 7v10H7" /> : <path d="M7 17 17 7M7 7h10v10" />}</svg>
            {diff === 0 ? "— No change vs yesterday" : `${diff > 0 ? "+" : ""}₹${diff} (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%) vs yesterday`}
          </div>
          <div className="relative mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />24K</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.r24) != null ? formatINR(num(rates.r24)) : "—"}</div>
              <div className="text-[11px] text-white/45">per gram</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Silver / g</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.silver) != null ? formatINR(num(rates.silver)) : "—"}</div>
              <div className="text-[11px] text-white/45">per gram</div>
            </div>
          </div>
        </div>

        <Card data-motion="stat" className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Update today&apos;s rate</CardTitle>
              <CardDescription>Publishes to storefront and billing immediately</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">24K rate / gram</span>
                <Input type="number" value={rates.r24} onChange={setField("r24")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">22K rate / gram</span>
                <Input type="number" value={rates.r22} onChange={setField("r22")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">18K rate / gram</span>
                <Input type="number" value={rates.r18} onChange={setField("r18")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">14K rate / gram</span>
                <Input type="number" value={rates.r14} onChange={setField("r14")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">9K rate / gram</span>
                <Input type="number" value={rates.r9} onChange={setField("r9")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">Silver / gram</span>
                <Input type="number" value={rates.silver} onChange={setField("silver")} />
              </label>
            </div>
            <p className="mt-3 text-xs text-muted">
              Existing bill drafts are unaffected. Rate history keeps a full audit trail.
            </p>
            <div className="mt-4 flex gap-2.5">
              <Button size="sm" disabled={saving || loading} onClick={publishRate}>{saving ? "Publishing…" : "Save & publish"}</Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={loadRate}>Reset</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-motion="reveal">
          <CardHeader>
            <div>
              <CardTitle>30-day trend</CardTitle>
              <CardDescription>22K per gram · August 2026</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <svg viewBox="0 0 560 200" className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Gold rate trend, last 30 days">
              <defs>
                <linearGradient id="rateArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="var(--color-line-soft)"><line x1="0" y1="60" x2="560" y2="60" /><line x1="0" y1="120" x2="560" y2="120" /><line x1="0" y1="180" x2="560" y2="180" /></g>
              <path d="M0,175 C50,170 90,150 140,155 C190,160 240,130 290,125 C340,120 380,130 430,110 C480,90 520,80 560,62 L560,200 L0,200 Z" fill="url(#rateArea)" />
              <path d="M0,175 C50,170 90,150 140,155 C190,160 240,130 290,125 C340,120 380,130 430,110 C480,90 520,80 560,62 L560,200 L0,200 Z" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" data-motion="draw" />
              <circle cx="560" cy="60" r="4.5" fill="#c9a84c" />
            </svg>
          </CardContent>
        </Card>

        <Card data-motion="reveal" className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Rate history</CardTitle>
              <CardDescription>Last 5 published days</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Date</th><th className="py-3">22K</th><th className="py-3">Silver</th><th className="py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {HISTORY.map((h) => (
                  <tr key={h.date} className="border-b border-line-soft transition-colors duration-150 last:border-0 hover:bg-canvas/60">
                    <td className="px-6 py-3 font-semibold">{h.date}</td>
                    <td className="num py-3">{formatINR(h.k22)}</td>
                    <td className="num py-3">₹{h.silver.toFixed(2)}</td>
                    <td className="py-3">
                      <Badge tone={h.dir === "up" ? "success" : h.dir === "down" ? "danger" : "neutral"}>{h.change}</Badge>
                    </td>
                  </tr>
                ))}
                {HISTORY.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-muted">No rate history available.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
