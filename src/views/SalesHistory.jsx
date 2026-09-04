import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { billingService } from "../services/billingService";

const TABS = [
  { key: "all", label: "All bills" },
  { key: "paid", label: "Paid" },
  { key: "partial", label: "Partial" },
  { key: "pending", label: "Pending" },
  { key: "returned", label: "Returned" },
  { key: "canceled", label: "Canceled" },
];

const STATUS_TONE = { Paid: "success", Partial: "warning", Pending: "danger", Returned: "info", Canceled: "neutral" };

const PAGE_LIMIT = 100; // backend caps /billing/sales at limit<=100

// Backend payment_method enum -> label for the Record Payment form.
const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

const PAY_STATUS_TONE = { PAID: "success", PARTIAL: "warning", PENDING: "danger" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatPaymentDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatWeight(grams) {
  const n = Number(grams);
  return `${Number.isFinite(n) ? n.toFixed(3) : "0.000"} g`;
}

function formatSaleDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SalesHistory() {
  const scope = useRef(null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(null);

  // Invoice detail / Record Payment panel state.
  const [selected, setSelected] = useState(null); // the sale row
  const [history, setHistory] = useState(null); // backend payment ledger
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [form, setForm] = useState({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { sales, total: count } = await billingService.listSales({ limit: PAGE_LIMIT });
      setBills(sales);
      setTotal(count);
    } catch (err) {
      setLoadError(err?.message || "Could not load sales history");
      setBills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      const matchesTab = tab === "all" || b.status.toLowerCase() === tab;
      const matchesQuery = !q || [b.inv, b.customer, String(b.amount)].join(" ").toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [bills, tab, query]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await billingService.exportSalesXlsx({ search: query.trim() });
      toast("Sales history exported");
    } catch (err) {
      toast(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const loadHistory = useCallback(async (saleId) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const h = await billingService.getSalePayments(saleId);
      setHistory(h);
    } catch (err) {
      setHistoryError(err?.message || "Could not load payment history");
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openDetail = (b) => {
    setSelected(b);
    setHistory(null);
    setHistoryError("");
    setFormError("");
    setForm({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
    loadHistory(b.id);
  };

  const closeDetail = () => {
    if (submitting) return;
    setSelected(null);
    setHistory(null);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (submitting || !selected) return;
    setFormError("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a valid amount greater than 0.");
      return;
    }
    if (!form.date) {
      setFormError("Select a payment date.");
      return;
    }
    setSubmitting(true);
    try {
      // Backend re-derives outstanding/status and rejects overpayment/returned sales.
      const updated = await billingService.recordSalePayment(selected.id, {
        amount,
        paymentDate: form.date,
        paymentMethod: form.method,
        referenceNo: form.reference.trim(),
        remarks: form.remarks.trim(),
      });
      setHistory(updated);
      setForm({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
      toast("Payment recorded");
      // Refresh the list so table outstanding/status reflect backend truth.
      load();
    } catch (err) {
      setFormError(err?.message || "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async (b) => {
    if (printing) return;
    setPrinting(b.id);
    try {
      await billingService.downloadInvoicePdf(b.id, b.inv);
      toast(`${b.inv} invoice downloaded`);
    } catch (err) {
      toast(err?.message || "Could not download invoice");
    } finally {
      setPrinting(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Sales History</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Every bill raised at the counter — filter by status, search, and reprint invoices.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" size="sm" disabled={exporting} onClick={handleExport}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V3m0 12-4-4m4 4 4-4" /><path d="M2 17l.62 2.48A2 2 0 0 0 4.56 21h14.88a2 2 0 0 0 1.94-1.52L22 17" />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button size="sm" onClick={() => toast("New sale started")}>New sale</Button>
        </div>
      </div>

      <div data-motion="toolbar" className="mb-4">
        <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Filter bills by status">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold transition-colors duration-150 ${
                tab === t.key
                  ? "border-accent text-accent-strong"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <SearchInput
          className="w-full max-w-md"
          placeholder="Search invoice, customer, or amount..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sales"
        />
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Invoice</th><th className="py-3">Customer</th><th className="py-3">Items</th>
                <th className="py-3">Weight</th><th className="py-3">Amount</th><th className="py-3">Method</th>
                <th className="py-3">Date</th><th className="py-3">Status</th><th className="py-3 text-right">Print</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => openDetail(b)}
                  className="cursor-pointer border-b border-line-soft transition-colors duration-150 last:border-0 hover:bg-canvas/60"
                >
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold">{b.inv}</td>
                  <td className="py-3.5 font-bold">{b.customer}</td>
                  <td className="num py-3.5 text-muted">{b.items} item{b.items > 1 ? "s" : ""}</td>
                  <td className="num py-3.5">{formatWeight(b.grossWeightGrams)}</td>
                  <td className="num py-3.5 font-bold">{formatINR(b.amount)}</td>
                  <td className="py-3.5 text-muted">{b.method}</td>
                  <td className="py-3.5 text-muted">{formatSaleDate(b.saleTimestamp)}</td>
                  <td className="py-3.5"><Badge tone={STATUS_TONE[b.status]} dot>{b.status}</Badge></td>
                  <td className="py-3.5 text-right">
                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft hover:text-accent disabled:opacity-50"
                      onClick={(e) => { e.stopPropagation(); handlePrint(b); }}
                      disabled={printing === b.id}
                      aria-label={`Print ${b.inv}`}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">Loading bills…</div>
            </div>
          )}
          {!loading && loadError && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">Couldn’t load sales</div>
              <p className="mt-1 text-sm text-muted">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={load}>Retry</Button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">No bills found</div>
              <p className="mt-1 text-sm text-muted">Try a different invoice, customer, or amount.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted">
        <span>Showing {rows.length} of {total.toLocaleString("en-IN")} bills</span>
        <span>Page 1 of {totalPages}</span>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeDetail} aria-label="Close" />
          <div className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold">Invoice {selected.inv}</h3>
                <p className="mt-0.5 text-xs text-muted">{selected.customer}</p>
              </div>
              <button onClick={closeDetail} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Close">✕</button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {historyLoading && <div className="py-8 text-center text-sm font-bold">Loading payment history…</div>}

              {!historyLoading && historyError && (
                <div className="py-8 text-center">
                  <div className="font-bold">Couldn’t load payments</div>
                  <p className="mt-1 text-sm text-muted">{historyError}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => loadHistory(selected.id)}>Retry</Button>
                </div>
              )}

              {!historyLoading && !historyError && history && (
                <>
                  {/* Backend-authoritative money figures. */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Total</div>
                      <div className="num mt-0.5 text-sm font-bold">{formatINR(history.finalAmount)}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Paid</div>
                      <div className="num mt-0.5 text-sm font-bold">{formatINR(history.amountPaid)}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Outstanding</div>
                      <div className="num mt-0.5 text-sm font-bold">{formatINR(history.amountOutstanding)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted">Status</span>
                    <Badge tone={PAY_STATUS_TONE[String(history.paymentStatus).toUpperCase()] ?? "neutral"} dot>
                      {history.paymentStatus || "—"}
                    </Badge>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted">Payment history</div>
                    {history.payments.length === 0 ? (
                      <p className="rounded-xl border border-line bg-canvas/40 px-3 py-4 text-center text-sm text-muted">No payments recorded yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {history.payments.map((p) => (
                          <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                            <div>
                              <div className="num text-sm font-bold">{formatINR(p.amount)}</div>
                              <div className="mt-0.5 text-xs text-muted">
                                {p.methodLabel} · {formatPaymentDate(p.paymentDate)}
                                {p.referenceNo ? ` · Ref ${p.referenceNo}` : ""}
                              </div>
                              {p.remarks && <div className="mt-0.5 text-xs text-muted">{p.remarks}</div>}
                            </div>
                            {p.recordedByName && <div className="shrink-0 text-right text-[11px] text-faint">{p.recordedByName}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Record Payment — only when the sale still has an outstanding balance. */}
                  {history.amountOutstanding > 0 ? (
                    <form onSubmit={handleRecordPayment} className="space-y-4 border-t border-line pt-5">
                      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Record payment</div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Amount *</span>
                          <Input
                            type="number" step="0.01" min="0" inputMode="decimal"
                            placeholder={`Up to ${formatINR(history.amountOutstanding)}`}
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Method *</span>
                          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })} options={PAY_METHODS} />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Payment date *</span>
                          <Input type="date" value={form.date} max={todayIso()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Reference no.</span>
                          <Input placeholder="Txn / cheque ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                        </label>
                        <label className="grid gap-1.5 sm:col-span-2">
                          <span className="text-xs font-bold">Remarks</span>
                          <Input placeholder="Optional note" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                        </label>
                      </div>
                      {formError && <p role="alert" className="text-xs font-semibold text-danger">{formError}</p>}
                      <div className="flex justify-end gap-2.5">
                        <Button type="button" variant="outline" size="sm" onClick={closeDetail} disabled={submitting}>Close</Button>
                        <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Recording…" : "Record payment"}</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t border-line pt-5 text-center text-sm font-semibold text-muted">
                      No outstanding balance on this invoice.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
