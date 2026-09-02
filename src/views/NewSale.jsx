import { useState, useRef, useEffect } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { billingService } from "../services/billingService";

export default function NewSale() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [code, setCode] = useState("");
  const [product, setProduct] = useState(null);
  const [goldRate, setGoldRate] = useState(null); // today's 24K gold rate ₹/g (backend)
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    billingService.getTodayGoldRate24k()
      .then(r => { if (alive) setGoldRate(r); })
      .catch(() => { if (alive) setGoldRate(null); });
    return () => { alive = false; };
  }, []);

  const handleLoad = async () => {
    const key = code.trim();
    if (!key) { toast("Enter Product Code"); return; }
    if (loading) return;
    setLoading(true);
    try {
      const quote = await billingService.getSaleQuote(key);
      setProduct(quote);
      toast(`Loaded ${quote.productCode}`);
    } catch (err) {
      setProduct(null);
      toast(err?.message || `No item found for ${key}`);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = () => {
    // No barcode-scanner integration in this build; prefills the example code
    // then runs the same real backend lookup.
    setCode("GN00125");
    setTimeout(handleLoad, 100);
  };

  // Backend-authoritative bill total for the one piece; qty carries no backend
  // meaning (a jewellery piece is unique — one sale = one item).
  const productTotal = product ? product.finalAmount : 0;

  const handleCreateBill = async () => {
    if (!product || creating) return;
    setCreating(true);
    try {
      const sale = await billingService.createSale({ productCode: product.productCode });
      toast(`Sale ${sale.invoiceNumber} — ₹${(sale.finalAmount ?? 0).toLocaleString("en-IN")}`);
      setProduct(null);
      setCode("");
    } catch (err) {
      toast(err?.message || "Could not create bill");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[900px]">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">New Sale</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">Scan or enter Product Code to load jewellery item and create a bill — pricing auto-calculated from today gold rate.</p>
      </div>

      <Card data-motion="reveal" className="p-6">
        <h3 className="text-sm font-extrabold">Scan or enter Product Code</h3>
        <p className="mt-1 text-xs text-muted">Product pricing based on today gold rate <span className="font-mono font-bold text-accent-strong">{goldRate != null ? `₹${goldRate.toLocaleString("en-IN")}/g` : "—"}</span></p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 flex-1 min-w-[220px]">
            <span className="text-xs font-bold">Product Code</span>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. GN00125" onKeyDown={e => e.key === "Enter" && handleLoad()} />
            <span className="text-xs text-muted">Product Code example: GN00125</span>
          </label>
          <Button size="sm" className="bg-accent hover:bg-accent-strong h-10 px-6" disabled={loading} onClick={handleLoad}>{loading ? "Loading…" : "Load"}</Button>
          <Button size="sm" variant="outline" className="h-10" disabled={loading} onClick={handleScan}>Scan</Button>
        </div>

        {product && (
          <div className="mt-6 rounded-xl border border-line bg-canvas/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs font-bold text-muted">{product.productCode}</div>
                <div className="text-base font-extrabold">{product.name}</div>
                <div className="text-xs text-muted">{product.category} · {product.purity} · {product.netGoldWeightGrams} g · {product.vendorName}</div>
              </div>
              <Badge tone="neutral">{goldRate != null ? `Today rate ₹${goldRate.toLocaleString("en-IN")}/g` : "Today rate —"}</Badge>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-white p-3">
                <div className="text-xs text-muted">Net Weight</div>
                <div className="font-bold">{product.netGoldWeightGrams} g</div>
              </div>
              <div className="rounded-xl border border-line bg-white p-3">
                <div className="text-xs text-muted">Qty</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setQty(q => Math.max(1, q-1))}>−</Button>
                  <span className="font-bold w-6 text-center">{qty}</span>
                  <Button size="sm" variant="outline" onClick={() => setQty(q => q+1)}>+</Button>
                </div>
              </div>
              <div className="rounded-xl border border-line bg-white p-3">
                <div className="text-xs text-muted">Estimated Total</div>
                <div className="font-extrabold text-accent-strong">₹{productTotal.toLocaleString("en-IN")}</div>
                <div className="text-xs text-muted">incl. making charges</div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setProduct(null); setCode(""); }}>Clear</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" disabled={creating} onClick={handleCreateBill}>{creating ? "Creating…" : "Create Bill"}</Button>
            </div>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">Tip: Enter codes like GN00125, AUR-22K-BAN-001 — pricing refreshes automatically from today gold rate.</p>
    </div>
  );
}
