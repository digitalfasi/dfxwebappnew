import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { DigitsInput, Input } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { money } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";
import { goldRateService } from "@/modules/gold-rate/goldRateService";

// Store Defaults (Billing): the owner sets every value his bills are priced
// from. At the counter it all still comes out as ONE making charge:
//   break-even   = the piece's own cost (arrival purity + Tunch) + running cost
//   list making  = break-even + gold profit
// Owner rule 2026-09-30: no extra profit - the gold profit is the whole margin,
// and a discount may give it away down to break-even. GST is compulsory at 3%.

const GST = 3;
const TYPES = [
  { value: "PERCENTAGE", label: "Percentage of gold value" },
  { value: "PER_GRAM", label: "₹ per gram" },
  { value: "FIXED", label: "Fixed ₹ per piece" },
];
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
// "6", "2.5" - a percentage, up to 99.99, two decimals.
const cleanPct = (v) => {
  let s = String(v).replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  if (Number(s) > 99.99) s = "99.99";
  return s;
};
const fmtPct = (x) => `${r2(x)}%`;

function Section({ step, title, hint, children, cols = "sm:grid-cols-2" }) {
  return (
    <Card className="h-full p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-extrabold text-accent-strong ring-1 ring-accent-line">{step}</span>
        <div>
          <h3 className="text-sm font-extrabold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
      </div>
      <div className={`grid items-start gap-4 ${cols}`}>{children}</div>
    </Card>
  );
}

function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`grid content-start gap-1.5 ${className}`}>
      <span className="text-xs font-bold">{label}</span>
      {children}
      {error ? <span className="text-[11px] font-semibold text-danger">{error}</span> : hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

// A percentage box with the % sign inside it.
function PctInput({ value, onChange, error, ariaLabel }) {
  return (
    <div className="relative">
      <Input value={value} onChange={(e) => onChange(cleanPct(e.target.value))} inputMode="decimal" error={error || undefined} aria-label={ariaLabel} className="num pr-9" />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">%</span>
    </div>
  );
}

const ReadOnly = ({ children, tone = "" }) => (
  <div className={`num flex h-10 items-center rounded-xl border border-line bg-canvas/60 px-3.5 text-sm font-bold ${tone}`}>{children}</div>
);

export default function PricingSettings() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [saved, setSaved] = useState(null);
  const [f, setF] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [rate22, setRate22] = useState(null);
  // Target full price for the example piece - typed, it sets the making.
  const [target, setTarget] = useState("");
  // Which field moved last, for the "linked" note under the others.
  const [moved, setMoved] = useState(null);
  usePageMotion(scope, [!!f]);

  const load = async () => {
    setLoadError("");
    try {
      const d = await billingService.getStoreDefaults();
      const v = {
        ...d,
        runningCost: d.runningCost === "" || d.runningCost == null ? "4" : String(d.runningCost),
        goldProfitBand: d.goldProfitBand == null ? "3" : String(d.goldProfitBand),
        makingValue: String(d.makingValue ?? 6),
        wastageValue: d.wastageValue === "" || d.wastageValue == null ? "0" : String(d.wastageValue),
      };
      // Percentage making IS the gold profit now - kept equal so the saved
      // base and the band can never disagree.
      if (v.makingType === "PERCENTAGE") v.makingValue = v.goldProfitBand;
      setSaved(v); setF(v); setMoved(null); setTarget("");
    } catch (err) { setLoadError(err?.message || "Could not load store defaults."); }
  };
  useEffect(() => {
    load();
    goldRateService.getTodayRate({ carryForward: true })
      .then((r) => {
        const r22 = Number(r?.rate_22k), r24 = Number(r?.rate_24k);
        setRate22(r22 > 0 ? r22 : r24 > 0 ? r2(r24 * 22 / 24) : null);
      })
      .catch(() => setRate22(null));
  }, []);

  const pct = f?.makingType === "PERCENTAGE";
  const making = num(f?.makingValue);
  const goldProfit = num(f?.goldProfitBand);
  const running = num(f?.runningCost);
  // Tunch comes from each piece; the preview prices before it.
  const tunch = 0;
  const gold = rate22 ? r2(10 * rate22) : null;

  const setMaking = (v) => { setF((p) => ({ ...p, makingValue: v })); setMoved("making"); setTarget(""); };
  // Percentage making = the gold profit, one number.
  const setGoldProfit = (v) => {
    setF((p) => (pct ? { ...p, goldProfitBand: v, makingValue: v } : { ...p, goldProfitBand: v }));
    setMoved("goldProfit"); setTarget("");
  };
  const setRunning = (v) => { setF((p) => ({ ...p, runningCost: v })); setMoved("running"); setTarget(""); };

  // A typed full price for the 10 g example works back to the making % -
  // exactly how the counter turns a customer price into a making charge.
  const onTarget = (raw) => {
    const clean = raw.replace(/[^\d.]/g, "");
    setTarget(clean);
    if (!gold || !clean) return;
    const pctNeeded = r2(((Number(clean) / (1 + GST / 100)) / gold - 1) * 100 - tunch - running);
    if (pctNeeded >= 0 && pctNeeded <= 99.99) { setF((p) => ({ ...p, makingValue: String(pctNeeded), goldProfitBand: String(pctNeeded) })); setMoved("target"); }
  };
  const targetInfo = useMemo(() => {
    if (!target || !gold) return null;
    const floor = r2(gold * (1 + (tunch + running) / 100) * (1 + GST / 100));
    const t = Number(target);
    if (t < floor) return { error: `Below break-even ${money(floor)} — that price is a loss.` };
    const needed = r2(((t / (1 + GST / 100)) / gold - 1) * 100 - tunch - running);
    if (needed > 99.99) return { error: "That needs a making charge above 99%." };
    return { note: `Gold profit set to ${fmtPct(needed)}.` };
  }, [target, gold, tunch, running]);

  const errors = {
    goldProfit: pct && !String(f?.goldProfitBand ?? "").trim() ? "Enter the gold profit." : "",
    making: !pct && !String(f?.makingValue ?? "").trim() ? "Enter the making value." : "",
  };
  const blocked = Object.values(errors).some(Boolean) || !!targetInfo?.error;
  const dirty = !!(f && saved && JSON.stringify(f) !== JSON.stringify(saved));


  // The worked example: a 10 g 22K piece at today's rate.
  const ex = useMemo(() => {
    if (!f || !pct || !gold) return null;
    const rows = [
      { key: "be", label: "Break-even", note: "Tunch + running cost — below this is a loss", p: tunch + running, tone: "text-amber-700", dot: "bg-amber-500" },
      { key: "ls", label: "Full price (list)", note: "+ gold profit — what the counter starts at", p: tunch + running + goldProfit, tone: "text-emerald-700", dot: "bg-emerald-500" },
    ];
    return rows.map((r) => {
      const mk = r2(gold * r.p / 100);
      return { ...r, making: mk, total: r2((gold + mk) * (1 + GST / 100)) };
    });
  }, [f, pct, gold, tunch, running, goldProfit]);

  const reset = () => { setF(saved); setMoved(null); setTarget(""); };
  const save = async () => {
    if (blocked) { toast(errors.goldProfit || errors.making || targetInfo?.error); return; }
    setSaving(true);
    try {
      await billingService.updateStoreDefaults({ ...f, tax: GST, pricingMode: "AUTO" });
      setSaved(f); setMoved(null); setTarget("");
      toast("Store defaults saved — new bills use them now");
    } catch (err) { toast(err?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Store Defaults</h2>
          <p className="mt-1 text-sm text-muted">Your making charge, profit and costs. Every new bill is priced from these — change them any time.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs font-semibold text-amber-700">Unsaved changes</span>}
          <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={reset}>Reset</Button>
          <Button size="sm" disabled={!f || !dirty || saving || blocked} className="bg-accent hover:bg-accent-strong" onClick={save}>{saving ? "Saving…" : "Save settings"}</Button>
        </div>
      </div>

      {loadError && (
        <Card className="p-6 text-center">
          <div className="font-bold text-danger">Couldn’t load store defaults</div>
          <p className="mt-1 text-sm text-muted">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}
      {!f && !loadError && <Card className="p-10 text-center text-sm font-bold text-muted">Loading…</Card>}

      {f && (
        <div className="grid gap-5" data-motion="reveal">
          {/* Row 1: the margin and its live effect, side by side, same height. */}
          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Section step="1" title="Making charge & profit" hint="Your gold profit is the making charge above break-even.">
              <Field label="Charged as">
                <Select value={f.makingType} onValueChange={(v) => { setF((p) => ({ ...p, makingType: v })); setMoved(null); }} options={TYPES} />
              </Field>
              {pct ? (
                <>
                  <Field label="Gold profit" error={errors.goldProfit} hint="Added on top of break-even. A discount may give it away down to break-even.">
                    <PctInput value={f.goldProfitBand} onChange={setGoldProfit} error={errors.goldProfit} ariaLabel="Gold profit %" />
                  </Field>
                  {/* How every bill is priced, in one line. */}
                  <div className="sm:col-span-2 rounded-xl border border-line bg-canvas/40 px-4 py-3 text-xs">
                    <div className="font-bold">Every bill = break-even + gold profit</div>
                    <p className="mt-1 text-muted">Break-even is the piece&apos;s own cost (arrival purity + Tunch + purchase charges) plus running cost {fmtPct(running)}. Anything above it is profit; below it is a loss.</p>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Making value (₹)" hint={f.makingType === "PER_GRAM" ? "Charged per gram of gold." : "Charged per piece."}>
                    <DigitsInput value={f.makingValue} onValueChange={setMaking} maxDigits={7} />
                  </Field>
                  <Field label="Gold profit" hint="Kept on every bill, as a % of the gold value.">
                    <PctInput value={f.goldProfitBand} onChange={setGoldProfit} ariaLabel="Gold profit %" />
                  </Field>
                </>
              )}
            </Section>

            {/* Live preview - only what decides a bill. Tunch is each piece's
                own, so these are the prices before it. */}
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-accent-line bg-accent-soft/40 px-5 py-3.5">
                <h3 className="text-sm font-extrabold text-accent-strong">Preview · 10 g 22K</h3>
                <p className="num mt-0.5 text-[11px] text-muted">
                  {gold ? <>Gold {money(gold)} at {money(rate22)}/g · </> : null}before the piece&apos;s own Tunch
                </p>
              </div>
              {!pct ? (
                <p className="px-5 py-4 text-xs text-muted">The preview works with percentage making.</p>
              ) : !ex ? (
                <p className="px-5 py-4 text-xs text-muted">Publish today’s gold rate to see the preview.</p>
              ) : (
                <div className="flex flex-1 flex-col px-5 py-4">
                  <div className="space-y-1.5">
                    {ex.map((r) => (
                      <div key={r.key} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${r.key === "ls" ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-canvas/40"}`}>
                        <span className="min-w-0">
                          <span className={`flex items-center gap-2 text-sm font-bold ${r.tone}`}><span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />{r.label}</span>
                          <span className="num ml-4 block text-[11px] font-semibold text-muted">making Tunch + {fmtPct(r.p)}</span>
                        </span>
                        <span className="num shrink-0 font-mono text-sm font-extrabold">{money(r.total)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted">Incl. 3% GST. Anything above break-even is profit; a discount can go down to break-even.</p>
                  <label className="mt-auto grid gap-1.5 border-t border-line pt-3.5">
                    <span className="text-xs font-bold">Set by full price <span className="font-normal text-muted">— before Tunch</span></span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">₹</span>
                      <Input value={target} onChange={(e) => onTarget(e.target.value)} inputMode="decimal" placeholder={String(ex[ex.length - 1].total)} error={targetInfo?.error || undefined} className="num pl-8" aria-label="Target full price" />
                    </div>
                    {(targetInfo?.error || targetInfo?.note) && (
                      <span className={`text-[11px] ${targetInfo?.error ? "font-semibold text-danger" : "text-emerald-700"}`}>{targetInfo.error || targetInfo.note}</span>
                    )}
                  </label>
                </div>
              )}
            </Card>
          </div>

          {/* Row 2: every cost and charge on one line. */}
          <Section step="2" title="Costs, wastage & GST" hint="Added on top of the making value so every bill first covers what the piece cost you." cols="sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Running cost" hint={moved === "running" ? `Break-even is now Tunch + ${fmtPct(running)}.` : "Rent, wages, power."}>
              <PctInput value={f.runningCost} onChange={setRunning} ariaLabel="Running cost %" />
            </Field>
            <Field label="Tunch" hint="Each piece's own, from its purchase.">
              <ReadOnly tone="text-muted font-semibold">Per piece</ReadOnly>
            </Field>
            <Field label="Wastage charged as">
              <Select value={f.wastageType} onValueChange={(v) => setF((p) => ({ ...p, wastageType: v }))} options={TYPES} />
            </Field>
            <Field label={f.wastageType === "PERCENTAGE" ? "Wastage value" : "Wastage value (₹)"} hint="0 = no wastage line.">
              {f.wastageType === "PERCENTAGE"
                ? <PctInput value={f.wastageValue} onChange={(v) => setF((p) => ({ ...p, wastageValue: v }))} ariaLabel="Wastage %" />
                : <DigitsInput value={f.wastageValue} onValueChange={(v) => setF((p) => ({ ...p, wastageValue: v }))} maxDigits={7} />}
            </Field>
            <Field label="GST" hint="Compulsory on every bill.">
              <ReadOnly>
                <span>3%</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Fixed</span>
              </ReadOnly>
            </Field>
          </Section>
        </div>
      )}
    </div>
  );
}
