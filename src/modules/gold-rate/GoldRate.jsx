import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { formatINR } from "@/_shared/utils";
import { goldRateService } from "@/modules/gold-rate/goldRateService";
import { liveRateService } from "@/modules/gold-rate/liveRateService";
import { LineChart } from "@/_shared/ui/LineChart";

// Purity options for the trend dropdown; keys match the backend rate columns.
const PURITY_OPTS = [
  { key: "rate_24k", label: "24K" },
  { key: "rate_22k", label: "22K" },
  { key: "rate_18k", label: "18K" },
  { key: "rate_14k", label: "14K" },
  { key: "rate_9k", label: "9K" },
  { key: "silver_999", label: "Silver 999" },
];

const cell = (v) => (v != null ? formatINR(v) : "—");
function fmtHistDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// Trend axis label formatters (₹k on Y, day+month on X).
const fmtTrendY = (v) => { const n = Math.round(v); return n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`; };
const fmtTrendX = (iso) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch { return iso; } };

export default function GoldRate() {
  const scope = useRef(null);
  usePressFeedback(scope);
  // Six manually-entered rates (strings for the inputs). Empty stays empty —
  // never fabricated. rate_24k is the only backend-required figure.
  const EMPTY = { r24: "", r22: "", r18: "", r14: "", r9: "", silver: "" };
  const [rates, setRates] = useState(EMPTY);
  // Fields the operator has hand-edited since the last live pull. Auto-refresh
  // updates every other field but never clobbers these.
  const dirty = useRef(new Set());
  const setField = (k) => (e) => {
    dirty.current.add(k);
    setRates((s) => ({ ...s, [k]: e.target.value }));
  };
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [saving, setSaving] = useState(false);
  const [todayExists, setTodayExists] = useState(false);
  // DFX Collector Engine: live rates scraped from KJPL + MJDTA (server-side).
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveErr, setLiveErr] = useState("");
  // Published rate history (newest first) — powers the trend chart + table.
  const [history, setHistory] = useState([]);
  const [histErr, setHistErr] = useState("");
  const [trendKey, setTrendKey] = useState("rate_22k");
  const loadHistory = useCallback(async () => {
    try {
      setHistory(await goldRateService.getHistory(30));
      setHistErr("");
    } catch (err) {
      setHistory([]);
      // Distinguish "nothing published yet" from "could not load" — showing the
      // empty state for a failed request hides a real outage.
      setHistErr(err?.message || "Could not load the rate history.");
    }
  }, []);

  const num = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };

  // Pull live rates from the collector.
  //   "fill"  — initial load: fill only blank fields, never touch a saved rate.
  //   "force" — Fetch live button: replace every field, clear hand-edits.
  //   "auto"  — refresh timer: update every field except ones hand-edited.
  const fetchLive = useCallback(async (mode = "fill") => {
    setLiveLoading(true);
    setLiveErr("");
    try {
      const data = await liveRateService.getLiveRates({ fresh: mode === "force" });
      setLive(data);
      const f = data.form || {};
      const str = (n) => (n != null ? String(n) : "");
      const keys = ["r24", "r22", "r18", "r14", "r9", "silver"];
      setRates((s) => {
        const next = { ...s };
        for (const k of keys) {
          if (f[k] == null) continue;
          const allow = mode === "force" ? true : mode === "fill" ? s[k] === "" : !dirty.current.has(k);
          if (allow) next[k] = str(f[k]);
        }
        return next;
      });
      if (mode === "force") dirty.current.clear();
      return data;
    } catch (err) {
      setLiveErr(err?.message || "Live fetch failed");
      return null;
    } finally {
      setLiveLoading(false);
    }
  }, []);

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
    // Load today's saved rate, then overlay live collector data (fills only the
    // blank fields, and populates the live/GST hints below).
    loadRate().finally(() => fetchLive("fill"));
    loadHistory();
  }, [loadRate, fetchLive, loadHistory]);

  // Auto-refresh every 60s, unconditionally, for as long as the screen is
  // mounted — the whole app keys off these live rates, so it keeps ticking even
  // when the tab is in the background. Paced at ~1 request/min via the 20s
  // server cache, so it stays gentle on the source sites.
  useEffect(() => {
    const REFRESH_MS = 60000;
    const id = setInterval(() => fetchLive("auto"), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

  async function publishRate() {
    const r24 = Number(rates.r24);
    if (!r24 || r24 <= 0) { toast("Enter a valid 24K rate"); return; }
    setSaving(true);
    try {
      if (todayExists) await goldRateService.updateTodayRate(rates);
      else await goldRateService.createTodayRate(rates);
      await loadRate();
      loadHistory();
      toast(`Gold rate published at ${formatINR(r24)}/g (24K)`);
    } catch (err) {
      toast(err?.message || "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  // Hero "vs yesterday" delta: published 22K day-over-day from the history
  // trail. Flat (0) until at least two published days carry a 22K value.
  const h22 = history.filter((h) => h.rate_22k != null);
  const diff = h22.length >= 2 ? Math.round(Number(h22[0].rate_22k) - Number(h22[1].rate_22k)) : 0;
  const pct = diff && h22[1]?.rate_22k ? (diff / Number(h22[1].rate_22k)) * 100 : 0;
  const isUp = diff > 0;
  const isDown = diff < 0;

  // Trend series for the selected purity (oldest→newest for the chart).
  const trendLabel = PURITY_OPTS.find((p) => p.key === trendKey)?.label ?? "";
  const trendSeries = history
    .filter((h) => h[trendKey] != null)
    .slice()
    .reverse()
    .map((h) => ({ x: h.effective_date, y: Number(h[trendKey]) }));
  // History rows for the SELECTED purity (same dropdown as the trend), with
  // day-over-day change of that purity — keeps history + trend in sync and
  // needs no horizontal scroll.
  const histRows = history.map((h, i) => {
    const older = history[i + 1];
    const cur = h[trendKey], prev = older ? older[trendKey] : null;
    const chg = cur != null && prev != null ? Number(cur) - Number(prev) : null;
    return { date: h.effective_date, val: cur, chg };
  });

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Gold Rate</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Set the daily rate. Updates publish to the storefront and apply to new bills instantly.
          </p>
        </div>
        <Badge tone={liveErr ? "danger" : "info"} dot>
          {liveErr ? "Live source offline" : live?.fetchedAt ? "Live Sync" : "Connecting to live…"}
        </Badge>
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
          {live?.rates?.gold_22k?.withGst != null && (
            <div className="num relative mt-1 text-[13px] font-semibold text-white/60">
              incl. GST {formatINR(live.rates.gold_22k.withGst)}
            </div>
          )}
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
                {live?.rates?.gold_22k?.withGst != null && (
                  <span className="text-[11px] text-muted">
                    Without GST {formatINR(live.rates.gold_22k.withoutGst)} · With GST {formatINR(live.rates.gold_22k.withGst)}
                  </span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">18K rate / gram</span>
                <Input type="number" value={rates.r18} onChange={setField("r18")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">14K rate / gram</span>
                <Input type="number" value={rates.r14} onChange={setField("r14")} />
                {live?.rates?.gold_14k?.derived && (
                  <span className="text-[11px] text-muted">Derived · 24K × 14/24</span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">9K rate / gram</span>
                <Input type="number" value={rates.r9} onChange={setField("r9")} />
                {live?.rates?.gold_9k?.derived && (
                  <span className="text-[11px] text-muted">Derived · 24K × 9/24</span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">Silver / gram</span>
                <Input type="number" value={rates.silver} onChange={setField("silver")} />
              </label>
            </div>
            <p className="mt-3 text-xs text-muted">
              Existing bill drafts are unaffected. Rate history keeps a full audit trail.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Button size="sm" disabled={saving || loading} onClick={publishRate}>{saving ? "Publishing…" : "Save & publish"}</Button>
              <Button size="sm" variant="outline" disabled={liveLoading || saving} onClick={() => fetchLive("force")}>
                {liveLoading ? "Refreshing…" : "Refresh now"}
              </Button>
              {liveErr ? (
                <span className="text-[11px] text-red-500">Live: {liveErr}</span>
              ) : live?.fetchedAt ? (
                <span className="text-[11px] text-muted">
                  Live Sync · auto 60s · {new Date(live.fetchedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card data-motion="reveal">
          <CardHeader>
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Rate trend</CardTitle>
                <CardDescription>Last {trendSeries.length} published days · {trendLabel}</CardDescription>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-faint">Purity</span>
                <select
                  value={trendKey}
                  onChange={(e) => setTrendKey(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink outline-none transition-colors hover:border-accent-line focus:border-accent-line"
                  aria-label="Trend purity"
                >
                  {PURITY_OPTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <LineChart
              series={trendSeries}
              accent="#c9a84c"
              gradId="grTrend"
              className="h-56"
              scale="fit"
              W={600} H={240} x0={54} x1={586} yTop={16} yBot={210}
              pointR={3} strokeWidth={2.5}
              yLabelDx={8} yLabelSize={10} xLabelDy={18} xLabelSize={10}
              fmtY={fmtTrendY} fmtX={fmtTrendX}
              ariaLabel="Gold rate trend"
              empty="Not enough history yet — publish on more days to see the trend."
            />
          </CardContent>
        </Card>

        <Card data-motion="reveal" className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Rate history</CardTitle>
              <CardDescription>Last {history.length} published days · {trendLabel} · ₹/gram</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="h-56 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-y border-line bg-canvas text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    <th className="px-6 py-3">Date</th>
                    <th className="py-3 text-right">{trendLabel}</th>
                    <th className="py-3 pr-6 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((h) => {
                    const up = h.chg != null && h.chg > 0;
                    const down = h.chg != null && h.chg < 0;
                    return (
                      <tr key={h.date} className="border-b border-line-soft transition-colors duration-150 last:border-0 hover:bg-canvas/60">
                        <td className="px-6 py-3 font-semibold">{fmtHistDate(h.date)}</td>
                        <td className="num py-3 text-right font-bold">{cell(h.val)}</td>
                        <td className="py-3 pr-6 text-right">
                          {h.chg == null
                            ? <span className="text-muted">—</span>
                            : <Badge tone={up ? "success" : down ? "danger" : "neutral"}>{up ? "+" : ""}{formatINR(h.chg)}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                  {history.length === 0 && (
                    <tr><td colSpan={3} className="px-6 py-10 text-center text-sm">
                      {histErr
                        ? <span className="font-semibold text-danger">{histErr}</span>
                        : <span className="text-muted">No rate history yet — publish a rate to start the trail.</span>}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
