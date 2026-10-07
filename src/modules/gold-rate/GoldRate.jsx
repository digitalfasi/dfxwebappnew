import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { Select } from "@/_shared/ui/select";
import { Input } from "@/_shared/ui/input";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { formatINR } from "@/_shared/utils";
import { goldRateService } from "@/modules/gold-rate/goldRateService";
import { liveRateService } from "@/modules/gold-rate/liveRateService";
import { LineChart } from "@/_shared/ui/LineChart";
import { purityLabel } from "@/_shared/purity";
import { useAuth } from "@/_shared/AuthContext";
import { isShopAdmin } from "@/_shared/moduleAccess";

// Purity options for the trend dropdown. `key` is the backend rate COLUMN and
// is never a purity value — do not feed these keys to _shared/purity.js, and do
// not replace them with its labels. Only the display text carries the fineness.
const PURITY_OPTS = [
  { key: "rate_24k", label: purityLabel("24K") },
  { key: "rate_22k", label: purityLabel("22K") },
  { key: "rate_18k", label: purityLabel("18K") },
  { key: "rate_14k", label: purityLabel("14K") },
  { key: "rate_9k", label: purityLabel("9K") },
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
  // Staff read the rate; only an Admin overrides it.
  const canEdit = isShopAdmin(useAuth().backendRole);
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
  // Rates are automatic (owner rule 2026-09-30): LIVE / CARRIED come from the
  // feed, MANUAL is this shop's own override. The form only shows for an
  // override; otherwise the card just says what the live rate is.
  const [todaySource, setTodaySource] = useState(null);
  const [todayUpdated, setTodayUpdated] = useState(null);
  const [overriding, setOverriding] = useState(false);
  const manualMode = canEdit && (overriding || todaySource === "MANUAL");
  // DFX Collector Engine: live rates scraped from KJPL + MJDTA (server-side).
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveErr, setLiveErr] = useState("");
  // Published rate history (newest first) — powers the trend chart + table.
  const [history, setHistory] = useState([]);
  const [histErr, setHistErr] = useState("");
  // 24K is the default view everywhere on this screen: it is the only
  // backend-required figure, it is the rate a purchase is always priced at,
  // and every other purity is derived from it.
  const [trendKey, setTrendKey] = useState("rate_24k");
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
  // A rupee per-gram rate in US$ at the live USD-INR rate ("$162.33"), or null.
  const usd = (v) => {
    const n = num(v), fx = live?.usd?.inrPerUsd;
    return n != null && fx > 0 ? `$${(n / fx).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  };

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
        setTodaySource(today.source || "LIVE");
        setTodayUpdated(today.updated_at || null);
      } else {
        setRates(EMPTY);
        setTodayExists(false);
        setTodaySource(null);
        setTodayUpdated(null);
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
  // Automatic mode shows the PUBLISHED rate, so it re-reads today's rate; the
  // override form keeps pulling the live source as a guide.
  useEffect(() => {
    const REFRESH_MS = 60000;
    const id = setInterval(() => {
      fetchLive("auto");
      if (!manualMode) { loadRate(); loadHistory(); }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchLive, loadRate, loadHistory, manualMode]);

  async function publishRate() {
    const r24 = Number(rates.r24);
    if (!r24 || r24 <= 0) { toast("Enter a valid 24K rate"); return; }
    setSaving(true);
    try {
      if (todayExists) await goldRateService.updateTodayRate(rates);
      else await goldRateService.createTodayRate(rates);
      await loadRate();
      setOverriding(false);
      loadHistory();
      toast(`Your rate is set: ${formatINR(r24)}/g (24K). The live feed will leave it alone today.`);
    } catch (err) {
      toast(err?.message || "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  async function goLive() {
    setSaving(true);
    try {
      await goldRateService.backToLive();
      setOverriding(false);
      dirty.current.clear();
      await loadRate();
      loadHistory();
      toast("Back to live — today's rate follows the market again");
    } catch (err) {
      toast(err?.message || "Could not switch back to live");
    } finally {
      setSaving(false);
    }
  }

  // Hero "vs yesterday" delta: published 24K day-over-day from the history
  // trail. Flat (0) until at least two published days carry a 24K value.
  // 24K, not 22K: it is the only figure the backend requires on a publish, so
  // it is the one that is always there to compare.
  const h24 = history.filter((h) => h.rate_24k != null);
  const diff = h24.length >= 2 ? Math.round(Number(h24[0].rate_24k) - Number(h24[1].rate_24k)) : 0;
  const pct = diff && h24[1]?.rate_24k ? (diff / Number(h24[1].rate_24k)) * 100 : 0;
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
            Updated automatically from the live market. Billing and the storefront always use today&apos;s rate.
          </p>
        </div>
        <Badge tone={liveErr ? "danger" : "info"} className={liveErr ? "" : "border-accent-line bg-accent-soft text-accent-strong"} dot>
          {liveErr ? "Live source offline" : live?.fetchedAt ? "Live Sync" : "Connecting to live…"}
        </Badge>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div data-motion="stat" className="hero-card group relative overflow-hidden rounded-[20px] border border-white/10 p-7 text-white shadow-xl lg:col-span-2" style={{ background: 'linear-gradient(135deg, #26221d 0%, #12100e 55%, #221d17 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-[#c9a84c]/25 blur-2xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-white/[0.06]" />
          <div className="relative flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{purityLabel("24K")} Gold · per gram</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold backdrop-blur"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE</span>
          </div>
          {/* Rupee / dollar side by side. The dollar is today's rupee rate at
              the live USD-INR rate - shown for reference, never billed. */}
          <div className="num relative mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-extrabold tracking-tight text-white drop-shadow-sm">
            <span className="text-5xl">{num(rates.r24) != null ? formatINR(num(rates.r24)) : "—"}</span>
            {usd(rates.r24) && (
              <>
                <span className="text-4xl font-light text-white/30">/</span>
                <span className="text-4xl text-[#fde68a]">{usd(rates.r24)}</span>
              </>
            )}
          </div>
          <div className="relative mt-1 text-[13px] font-semibold text-white/60">
            The rate every purchase is priced at{live?.usd?.inrPerUsd > 0 && <span className="num text-white/45"> · $1 = ₹{live.usd.inrPerUsd.toFixed(2)}</span>}
          </div>
          <div className={`relative mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold backdrop-blur ${isUp ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-400" : isDown ? "border-red-400/40 bg-red-500/15 text-red-400" : "border-[#fde68a]/20 bg-[#c9a84c]/15 text-[#fde68a]"}`} style={isDown ? { boxShadow: "0 0 16px rgba(239,68,68,0.25)" } : isUp ? { boxShadow: "0 0 16px rgba(16,185,129,0.22)" } : undefined}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{isDown ? <path d="M7 7l10 10M17 7v10H7" /> : <path d="M7 17 17 7M7 7h10v10" />}</svg>
            {diff === 0 ? "— No change vs yesterday" : `${diff > 0 ? "+" : "−"}₹${Math.abs(diff)} (${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%) vs yesterday`}
          </div>
          <div className="relative mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{purityLabel("22K")}</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.r22) != null ? formatINR(num(rates.r22)) : "—"}{usd(rates.r22) && <span className="text-[#fde68a]"><span className="font-light text-white/30"> / </span>{usd(rates.r22)}</span>}</div>
              <div className="num text-[11px] text-white/45">{live?.rates?.gold_22k?.withGst != null ? `incl. GST ${formatINR(live.rates.gold_22k.withGst)}` : "per gram"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Silver / g</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.silver) != null ? formatINR(num(rates.silver)) : "—"}{usd(rates.silver) && <span className="text-[#fde68a]"><span className="font-light text-white/30"> / </span>{usd(rates.silver)}</span>}</div>
              <div className="text-[11px] text-white/45">per gram</div>
            </div>
          </div>
        </div>

        <Card data-motion="stat" className="lg:col-span-3">
          {!manualMode ? (
            <>
              <CardHeader>
                <div>
                  <CardTitle>{todaySource === "MANUAL" ? "Today's rate is set by your shop" : "Today's rate is automatic"}</CardTitle>
                  <CardDescription>{todaySource === "MANUAL" ? "Your Admin set today's rate by hand." : "Updated from the live market every 5 minutes — nothing to save or publish."}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                  todaySource === "CARRIED" ? "border-accent-line bg-[#fbf1f1] text-ink-soft" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                  <span className={`inline-flex items-center gap-1.5 font-bold ${todaySource === "CARRIED" ? "text-accent-strong" : ""}`}>
                    <span className={`h-2 w-2 rounded-full ${todaySource === "CARRIED" ? "bg-accent" : "animate-pulse bg-emerald-500"}`} />
                    {todaySource === "CARRIED" ? "Market closed — last live rate carried forward" : todaySource === "MANUAL" ? "Set by your shop" : todaySource ? "Live" : "Waiting for the first live rate"}
                  </span>
                  {todayUpdated && <span className="text-[12px] opacity-80">Last updated {new Date(todayUpdated).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
                  {todaySource === "CARRIED" && <span className="text-[12px] opacity-80">Live updates resume when the market opens (Mon–Fri, 9:05 AM)</span>}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {[["24K", "r24"], ["22K", "r22"], ["18K", "r18"], ["14K", "r14"], ["9K", "r9"], ["Silver", "silver"]].map(([label, key]) => (
                    <div key={key} className="rounded-xl border border-line bg-canvas/40 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{label} / g</div>
                      <div className="num mt-0.5 text-[15px] font-extrabold">{num(rates[key]) != null ? formatINR(num(rates[key])) : "—"}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">Billing and the storefront use this rate.{canEdit ? " Want your own rate today? Override it — the live feed will leave it alone until you switch back." : " Only an Admin can change it."}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {canEdit && <Button size="sm" variant="outline" disabled={loading} onClick={() => { dirty.current.clear(); setOverriding(true); }}>Override today&apos;s rate</Button>}
                  {liveErr ? <span className="text-[11px] text-red-500">Live source: {liveErr}</span> : null}
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <div>
                  <CardTitle>{todaySource === "MANUAL" ? "Your own rate for today" : "Override today's rate"}</CardTitle>
                  <CardDescription>
                    {todaySource === "MANUAL" ? "The live feed is paused for your shop today. Go back to live any time." : "Set your own rate. The live feed will not change it until you go back to live."}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 items-start gap-x-4 gap-y-3.5 sm:grid-cols-2">
                  {[
                    ["24K rate / gram", "r24"],
                    ["22K rate / gram", "r22"],
                    ["18K rate / gram", "r18"],
                    ["14K rate / gram", "r14"],
                    ["9K rate / gram", "r9"],
                    ["Silver / gram", "silver"],
                  ].map(([label, key]) => (
                    <label key={key} className="grid gap-1.5">
                      <span className="h-4 text-[11px] font-bold uppercase leading-4 tracking-[0.07em]">{label}</span>
                      <Input type="number" inputMode="decimal" value={rates[key]} onChange={setField(key)} />
                    </label>
                  ))}
                </div>
                {live?.rates?.gold_22k?.withGst != null && (
                  <p className="mt-3 text-[11px] text-muted">
                    Live 22K right now — without GST {formatINR(live.rates.gold_22k.withoutGst)} · with GST {formatINR(live.rates.gold_22k.withGst)}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <Button size="sm" disabled={saving || loading} onClick={publishRate}>{saving ? "Saving…" : "Save my rate"}</Button>
                  {todaySource === "MANUAL" ? (
                    <Button size="sm" variant="outline" disabled={saving} onClick={goLive}>Back to live</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => { setOverriding(false); loadRate(); }}>Cancel</Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={liveLoading || saving} onClick={() => fetchLive("force")}>
                    {liveLoading ? "Filling…" : "Fill with live rate"}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:items-stretch">
        <Card data-motion="reveal">
          <CardHeader>
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Rate trend</CardTitle>
                <CardDescription>Last {trendSeries.length} published days · {trendLabel}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-faint">Purity</span>
                <Select
                  value={trendKey}
                  onValueChange={setTrendKey}
                  options={PURITY_OPTS.map((p) => ({ value: p.key, label: p.label }))}
                  className="w-[132px]"
                  triggerClassName="h-9 min-h-[36px] text-xs font-bold"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <LineChart
              series={trendSeries}
              accent="#9f1d35"
              gradId="grTrend"
              className="h-56"
              scale="fit"
              W={600} H={240} x0={54} x1={586} yTop={16} yBot={210}
              pointR={3} strokeWidth={2.5}
              yLabelDx={8} yLabelSize={10} xLabelDy={18} xLabelSize={10}
              fmtY={fmtTrendY} fmtX={fmtTrendX}
              fmtTip={(v) => `${formatINR(v)}/g`}
              ariaLabel="Gold rate trend"
              empty="Not enough history yet — publish on more days to see the trend."
            />
          </CardContent>
        </Card>

        <Card data-motion="reveal" className="overflow-hidden lg:flex lg:flex-col">
          <CardHeader>
            <div>
              <CardTitle>Rate history</CardTitle>
              <CardDescription>Last {history.length} published days · {trendLabel} · ₹/gram</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="relative px-0 pb-0 lg:min-h-0 lg:flex-1">
            <div className="h-56 overflow-y-auto lg:absolute lg:inset-0 lg:h-auto">
              {/* Sticky on the CELLS, not the row: a sticky <tr> in a collapsed
                  table is not reliably pinned, so scrolled rows showed above and
                  through the header. The rule under it is a shadow so it moves
                  with the header instead of staying with the table. */}
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-canvas [&>th]:shadow-[inset_0_-1px_0_var(--color-line),inset_0_1px_0_var(--color-line)]">
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
                      <tr key={h.date} className="transition-colors duration-150 hover:bg-canvas/60 [&>td]:border-b [&>td]:border-line-soft [&:last-child>td]:border-0">
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
