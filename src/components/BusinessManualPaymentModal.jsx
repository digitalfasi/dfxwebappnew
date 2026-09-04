import { useState, useCallback } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, SearchInput } from "./ui/input";
import { Select } from "./ui/select";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { customerService } from "../services/customerService";
import { billingService } from "../services/billingService";

// Business sale-payment method enum (backend PaymentMethod).
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

/**
 * Record Manual Payment for an existing BUSINESS sale. This never bills, never
 * recalculates an invoice, and never creates a sale. It searches a customer,
 * lists that customer's outstanding invoices (PARTIAL/PENDING, outstanding > 0),
 * and records a collection against the chosen sale through the Task 1 ledger API
 * (POST /billing/sales/{sale_id}/payments). All money figures stay backend
 * authoritative. Scheme payments are a separate flow and are not touched here.
 */
export default function BusinessManualPaymentModal({ onClose, onRecorded }) {
  // Step 1 — customer search.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState(null); // null = not searched yet
  const [searchError, setSearchError] = useState("");

  // Step 2 — selected customer + their outstanding sales.
  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");

  // Step 3 — selected sale + authoritative ledger + record form.
  const [sale, setSale] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [form, setForm] = useState({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const searchCustomers = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    setCustomers(null);
    try {
      // Backend search matches name / phone / customer_code.
      const list = await customerService.getCustomers({ search: q, limit: 20 });
      setCustomers(list);
    } catch (err) {
      setSearchError(err?.message || "Customer search failed");
    } finally {
      setSearching(false);
    }
  };

  const pickCustomer = useCallback(async (c) => {
    setCustomer(c);
    setSale(null);
    setHistory(null);
    setSalesError("");
    setSalesLoading(true);
    try {
      // Backend-authoritative sales for this customer. Keep only real
      // outstanding invoices: PARTIAL/PENDING and amount_outstanding > 0.
      const { sales: rows } = await billingService.listSales({ customerId: c.id, limit: 100 });
      const eligible = rows.filter(
        (s) => s.outstanding > 0 && (s.status === "Partial" || s.status === "Pending")
      );
      setSales(eligible);
    } catch (err) {
      setSalesError(err?.message || "Could not load customer invoices");
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

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

  const pickSale = (s) => {
    setSale(s);
    setHistory(null);
    setHistoryError("");
    setFormError("");
    setForm({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
    loadHistory(s.id);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting || !sale) return;
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
      // Same authoritative ledger as Task 1 — backend re-derives outstanding/status
      // and rejects overpayment / returned sales. No billing recompute here.
      const updated = await billingService.recordSalePayment(sale.id, {
        amount,
        paymentDate: form.date,
        paymentMethod: form.method,
        referenceNo: form.reference.trim(),
        remarks: form.remarks.trim(),
      });
      setHistory(updated);
      setForm({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
      toast("Payment recorded");
      onRecorded?.();
      // Reflect the new outstanding in the customer's eligible list.
      if (updated.amountOutstanding > 0) {
        setSales((prev) => prev.map((s) => (s.id === sale.id ? { ...s, outstanding: updated.amountOutstanding } : s)));
      } else {
        setSales((prev) => prev.filter((s) => s.id !== sale.id));
      }
    } catch (err) {
      setFormError(err?.message || "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    if (sale) { setSale(null); setHistory(null); return; }
    if (customer) { setCustomer(null); setSales([]); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[92vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-base font-extrabold tracking-tight">Record Manual Payment</h3>
            <p className="mt-0.5 text-xs text-muted">
              {!customer ? "Business sale — collect against an existing invoice" : customer.name}
              {customer && sale ? ` · ${sale.inv}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:bg-canvas hover:text-ink">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* STEP 1 — customer search */}
          {!customer && (
            <>
              <form onSubmit={searchCustomers} className="flex gap-2">
                <SearchInput
                  className="flex-1"
                  placeholder="Customer number, name, or ID…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search customer"
                />
                <Button type="submit" size="sm" disabled={searching || !query.trim()}>{searching ? "Searching…" : "Search"}</Button>
              </form>
              {searchError && <p className="text-xs font-semibold text-danger">{searchError}</p>}
              {customers && customers.length === 0 && !searchError && (
                <p className="rounded-xl border border-line bg-canvas/40 px-3 py-4 text-center text-sm text-muted">No customers found.</p>
              )}
              {customers && customers.length > 0 && (
                <ul className="space-y-2">
                  {customers.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => pickCustomer(c)}
                        className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left hover:border-accent-line hover:bg-accent-soft/40"
                      >
                        <span>
                          <span className="block text-sm font-bold">{c.name}</span>
                          <span className="block text-xs text-muted">{c.code || "—"}{c.phone && c.phone !== "—" ? ` · ${c.phone}` : ""}</span>
                        </span>
                        <span className="text-xs font-semibold text-accent">Select</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* STEP 2 — customer's outstanding invoices */}
          {customer && !sale && (
            <>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Outstanding invoices</div>
              {salesLoading && <div className="py-6 text-center text-sm font-bold">Loading invoices…</div>}
              {!salesLoading && salesError && (
                <div className="py-6 text-center">
                  <div className="font-bold">Couldn’t load invoices</div>
                  <p className="mt-1 text-sm text-muted">{salesError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => pickCustomer(customer)}>Retry</Button>
                </div>
              )}
              {!salesLoading && !salesError && sales.length === 0 && (
                <p className="rounded-xl border border-line bg-canvas/40 px-3 py-4 text-center text-sm text-muted">No outstanding bills/payments found.</p>
              )}
              {!salesLoading && !salesError && sales.length > 0 && (
                <ul className="space-y-2">
                  {sales.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => pickSale(s)}
                        className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left hover:border-accent-line hover:bg-accent-soft/40"
                      >
                        <span>
                          <span className="block font-mono text-xs font-semibold">{s.inv}</span>
                          <span className="block text-xs text-muted">Outstanding {formatINR(s.outstanding)} of {formatINR(s.amount)}</span>
                        </span>
                        <Badge tone={s.status === "Partial" ? "warning" : "danger"} dot>{s.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* STEP 3 — authoritative ledger + record form */}
          {customer && sale && (
            <>
              {historyLoading && <div className="py-8 text-center text-sm font-bold">Loading payment history…</div>}
              {!historyLoading && historyError && (
                <div className="py-8 text-center">
                  <div className="font-bold">Couldn’t load payments</div>
                  <p className="mt-1 text-sm text-muted">{historyError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => loadHistory(sale.id)}>Retry</Button>
                </div>
              )}
              {!historyLoading && !historyError && history && (
                <>
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
                    <Badge tone={PAY_STATUS_TONE[String(history.paymentStatus).toUpperCase()] ?? "neutral"} dot>{history.paymentStatus || "—"}</Badge>
                  </div>

                  {history.amountOutstanding > 0 ? (
                    <form onSubmit={submit} className="space-y-4 border-t border-line pt-5">
                      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Record payment</div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Amount *</span>
                          <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder={`Up to ${formatINR(history.amountOutstanding)}`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
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
                        <Button type="button" variant="outline" size="sm" onClick={back} disabled={submitting}>Back</Button>
                        <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Recording…" : "Record payment"}</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t border-line pt-5 text-center text-sm font-semibold text-muted">No outstanding balance on this invoice.</div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {(customer && !sale) && (
          <div className="flex justify-between border-t border-line px-6 py-3.5">
            <Button variant="outline" size="sm" onClick={back}>Back</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
        {!customer && (
          <div className="flex justify-end border-t border-line px-6 py-3.5">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
