import { useState, useCallback, useMemo } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, SearchInput } from "./ui/input";
import { Select } from "./ui/select";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { customerService } from "../services/customerService";
import { enrollmentService } from "../services/enrollmentService";
import { paymentService } from "../services/paymentService";

// Scheme manual-payment method enum (backend PaymentMethod for /payments/manual).
const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
];
// Backend accepts only 1 / 3 / 6 installments per manual transaction; an advance
// (3/6) requires amount == monthly_amount * months_covered exactly.
const ADVANCE_OPTIONS = [1, 3, 6];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

/**
 * Record Manual Payment for a SCHEME enrollment (customer-first). This never
 * enrols, never redeems, and never recomputes scheme balances. Flow: search a
 * customer, list that customer's ACTIVE enrollments (GET /enrollments?customer_id),
 * load the backend-authoritative balance (GET /enrollments/{id}/balance), then
 * record a contribution through the existing scheme engine (POST /payments/manual).
 * Every rupee/month figure shown here is backend-derived; the client-side checks
 * are UX hints — the backend re-validates the months multiple and maturity cap
 * on submit. Business sale payments are a separate flow and are not touched here.
 */
export default function SchemeManualPaymentModal({ onClose, onRecorded }) {
  // Step 1 — customer search.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState(null); // null = not searched yet
  const [searchError, setSearchError] = useState("");

  // Step 2 — selected customer + their active enrollments.
  const [customer, setCustomer] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState("");

  // Step 3 — selected enrollment + authoritative balance + record form.
  const [enrollment, setEnrollment] = useState(null);
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [form, setForm] = useState({ months: 1, method: "CASH", date: todayIso(), remarks: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const searchCustomers = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (q.length < 2) { setSearchError("Enter at least 2 characters."); return; }
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
    setEnrollment(null);
    setBalance(null);
    setEnrollError("");
    setEnrollLoading(true);
    try {
      // Backend-authoritative enrollments for this customer; keep ACTIVE only.
      const rows = await enrollmentService.getEnrollments(c.id);
      setEnrollments(rows.filter((e) => e.status === "Active"));
    } catch (err) {
      setEnrollError(err?.message || "Could not load enrollments");
      setEnrollments([]);
    } finally {
      setEnrollLoading(false);
    }
  }, []);

  const loadBalance = useCallback(async (enrollmentId) => {
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const b = await enrollmentService.getBalance(enrollmentId);
      setBalance(b);
    } catch (err) {
      setBalanceError(err?.message || "Could not load enrollment balance");
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const pickEnrollment = (e) => {
    setEnrollment(e);
    setBalance(null);
    setBalanceError("");
    setFormError("");
    setForm({ months: 1, method: "CASH", date: todayIso(), remarks: "" });
    loadBalance(e.id);
  };

  // Backend-derived coverage numbers (never recomputed here).
  const monthly = balance?.monthly_amount ?? 0;
  const remainingMonths = balance ? Math.max(0, (balance.duration_months ?? 0) - (balance.months_paid ?? 0)) : 0;
  const canContribute = !!balance?.can_contribute && remainingMonths > 0;
  // Only advance sizes that fit inside the remaining contractual months.
  const monthChoices = useMemo(
    () => ADVANCE_OPTIONS.filter((n) => n <= remainingMonths),
    [remainingMonths]
  );
  // Amount is fixed by the scheme: monthly x months_covered (backend requires exact equality).
  const amount = monthly * form.months;

  const submit = async (e) => {
    e.preventDefault();
    if (submitting || !balance) return;
    setFormError("");
    if (!canContribute) {
      setFormError("This enrollment cannot accept contributions.");
      return;
    }
    if (!monthChoices.includes(form.months)) {
      setFormError("Selected advance exceeds the remaining contractual months.");
      return;
    }
    if (!(amount > 0)) {
      setFormError("Invalid amount for this enrollment.");
      return;
    }
    if (!form.date) {
      setFormError("Select a payment date.");
      return;
    }
    setSubmitting(true);
    try {
      // Existing scheme engine. Backend re-derives coverage and rejects
      // over-maturity / non-matching amounts. No balance recompute here.
      await paymentService.recordManualPayment({
        enrollmentId: balance.enrollment_id,
        amount,
        method: form.method,
        paymentDate: form.date,
        monthsCovered: form.months,
        remarks: form.remarks.trim() || undefined,
      });
      toast(`Payment of ${formatINR(amount)} recorded for ${balance.enrollment_number}`);
      onRecorded?.();
      onClose();
    } catch (err) {
      setFormError(err?.message || "Could not record payment");
      // Refresh the balance so the UI reflects true backend state after a failure.
      try { setBalance(await enrollmentService.getBalance(balance.enrollment_id)); } catch { /* keep prior */ }
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    if (enrollment) { setEnrollment(null); setBalance(null); return; }
    if (customer) { setCustomer(null); setEnrollments([]); return; }
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
              {!customer ? "Scheme contribution — collect against an enrollment" : customer.name}
              {customer && enrollment ? ` · ${enrollment.scheme}` : ""}
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
                  placeholder="Customer number, ID, mobile, or name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search customer"
                />
                <Button type="submit" size="sm" disabled={searching || query.trim().length < 2}>{searching ? "Searching…" : "Search"}</Button>
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

          {/* STEP 2 — customer's active enrollments */}
          {customer && !enrollment && (
            <>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Active schemes</div>
              {enrollLoading && <div className="py-6 text-center text-sm font-bold">Loading schemes…</div>}
              {!enrollLoading && enrollError && (
                <div className="py-6 text-center">
                  <div className="font-bold">Couldn’t load schemes</div>
                  <p className="mt-1 text-sm text-muted">{enrollError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => pickCustomer(customer)}>Retry</Button>
                </div>
              )}
              {!enrollLoading && !enrollError && enrollments.length === 0 && (
                <p className="rounded-xl border border-line bg-canvas/40 px-3 py-4 text-center text-sm text-muted">This customer has no active scheme enrollments.</p>
              )}
              {!enrollLoading && !enrollError && enrollments.length > 0 && (
                <ul className="space-y-2">
                  {enrollments.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => pickEnrollment(e)}
                        className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left hover:border-accent-line hover:bg-accent-soft/40"
                      >
                        <span>
                          <span className="block text-sm font-bold">{e.scheme}</span>
                          <span className="block text-xs text-muted">
                            {formatINR(e.installment)}/mo · {e.paid}/{e.total} paid
                          </span>
                          <span className="block font-mono text-[11px] text-muted">{e.enrollment}</span>
                        </span>
                        <Badge tone="success" dot>{e.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* STEP 3 — authoritative balance + record form */}
          {customer && enrollment && (
            <>
              {balanceLoading && <div className="py-8 text-center text-sm font-bold">Loading enrollment balance…</div>}
              {!balanceLoading && balanceError && (
                <div className="py-8 text-center">
                  <div className="font-bold">Couldn’t load balance</div>
                  <p className="mt-1 text-sm text-muted">{balanceError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => loadBalance(enrollment.id)}>Retry</Button>
                </div>
              )}
              {!balanceLoading && !balanceError && balance && (
                <>
                  <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{balance.scheme_name}</span>
                      <Badge tone="success" dot>{balance.status}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">{balance.enrollment_number}</div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <span className="text-muted">Monthly</span><span className="num text-right font-bold">{formatINR(monthly)}</span>
                      <span className="text-muted">Duration</span><span className="num text-right font-bold">{balance.duration_months} mo</span>
                      <span className="text-muted">Months paid</span><span className="num text-right font-bold">{balance.months_paid}/{balance.duration_months}</span>
                      <span className="text-muted">Remaining months</span><span className="num text-right font-bold">{remainingMonths}</span>
                      <span className="text-muted">Total paid</span><span className="num text-right font-bold">{formatINR(balance.total_paid ?? 0)}</span>
                      <span className="text-muted">Available balance</span><span className="num text-right font-bold">{formatINR(balance.available_balance ?? 0)}</span>
                      <span className="text-muted">Next due</span><span className="text-right font-bold">{fmtDate(balance.next_due_date)}</span>
                    </div>
                  </div>

                  {canContribute && monthChoices.length > 0 ? (
                    <form onSubmit={submit} className="space-y-4 border-t border-line pt-5">
                      <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Record contribution</div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Advance (months) *</span>
                          <Select
                            value={String(form.months)}
                            onValueChange={(v) => setForm({ ...form, months: Number(v) })}
                            options={monthChoices.map((n) => ({ value: String(n), label: n === 1 ? "1 month (regular)" : `${n} months (advance)` }))}
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Method *</span>
                          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })} options={PAY_METHODS} />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Amount (₹)</span>
                          <Input value={formatINR(amount)} readOnly disabled />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Payment date *</span>
                          <Input type="date" value={form.date} max={todayIso()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                        </label>
                        <label className="grid gap-1.5 sm:col-span-2">
                          <span className="text-xs font-bold">Remarks</span>
                          <Input placeholder="e.g. Counter cash collection — verified by manager" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                        </label>
                      </div>
                      <p className="text-[11px] text-muted">
                        Amount is fixed at {formatINR(monthly)} × months. Backend derives coverage from the amount and rejects non-matching amounts or payments past maturity.
                      </p>
                      {formError && <p role="alert" className="text-xs font-semibold text-danger">{formError}</p>}
                      <div className="flex justify-end gap-2.5">
                        <Button type="button" variant="outline" size="sm" onClick={back} disabled={submitting}>Back</Button>
                        <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Recording…" : "Record payment"}</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t border-line pt-5 text-center text-sm font-semibold text-muted">
                      {remainingMonths === 0
                        ? "Fully covered — this enrollment has reached its contractual maturity."
                        : "This enrollment cannot accept contributions."}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {(customer && !enrollment) && (
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
