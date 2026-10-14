import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { toast } from "@/_shared/toast";
import { formatINR as formatWholeINR } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";

const formatINR = (v, opts = {}) =>
  formatWholeINR(v, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts });

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function QuotationsHistory({ onNavigate }) {
  const scope = useRef(null);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState(null);

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await billingService.listQuotations({ page, limit: 100 });
      setQuotations(res.quotations || []);
      setTotal(res.total || 0);
    } catch (err) {
      setLoadError(err?.message || "Could not load quotations");
      setQuotations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(
      (item) =>
        item.quotationNumber?.toLowerCase().includes(q) ||
        item.customerName?.toLowerCase().includes(q) ||
        item.customerPhone?.toLowerCase().includes(q) ||
        item.productName?.toLowerCase().includes(q) ||
        item.productCode?.toLowerCase().includes(q)
    );
  }, [quotations, query]);

  const handleDownload = async (item) => {
    setBusyId(`dl-${item.id}`);
    try {
      await billingService.downloadQuotationPdf(item.id, item.quotationNumber);
      toast(`Downloaded ${item.quotationNumber}.pdf`);
    } catch (err) {
      toast(err?.message || "Could not download quotation PDF");
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenPdf = async (item) => {
    setBusyId(`open-${item.id}`);
    try {
      await billingService.openQuotationPdf(item.id);
    } catch (err) {
      toast(err?.message || "Could not open quotation PDF");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={scope} className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Quotations
          </h2>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Past price estimates and sample bills issued to customers. Nothing is sold on a quotation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate("new-sale")}
              className="gap-1.5"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Quotation
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={load} disabled={loading} title="Refresh list">
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-md">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quotation #, customer, phone, or product..."
            aria-label="Search quotations"
          />
        </div>
        <div className="text-xs font-semibold text-muted">
          Showing {filtered.length} of {total} quotations
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden border border-line bg-surface shadow-sm">
        {loading && quotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="mt-3 text-xs font-semibold text-muted">Loading quotations...</p>
          </div>
        ) : loadError ? (
          <div className="p-8 text-center">
            <p className="text-sm font-bold text-danger">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load} className="mt-3">
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas text-muted">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </div>
            <div className="mt-3 text-sm font-bold text-ink">
              {query ? "No matching quotations" : "No quotations yet"}
            </div>
            <p className="mt-1 max-w-sm text-xs text-muted">
              {query
                ? "Try searching for a different quotation number, customer name, or phone number."
                : "Create sample bills or estimates in New Sale by clicking the 'Quotation' button."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
                  <th>Quotation No.</th>
                  <th>Date &amp; Time</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Item / Product</th>
                  <th className="text-right">Estimated Total</th>
                  <th className="text-right !pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors duration-150 hover:bg-canvas/50 [&>td]:px-4 [&>td]:py-3.5 [&>td]:align-middle"
                  >
                    <td>
                      <div className="font-mono text-xs font-extrabold text-accent-strong">
                        {item.quotationNumber}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-muted">Estimate</span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted font-medium">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td>
                      <div className="font-bold text-ink">{item.customerName}</div>
                      {item.note && (
                        <div className="text-[11px] text-muted truncate max-w-[200px]" title={item.note}>
                          {item.note}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-muted">
                      {item.customerPhone}
                    </td>
                    <td>
                      <div className="font-semibold text-ink line-clamp-1">{item.productName}</div>
                      <div className="font-mono text-[11px] text-muted">{item.productCode}</div>
                    </td>
                    <td className="text-right">
                      <div className="num font-extrabold text-ink text-sm">
                        {formatINR(item.finalAmount)}
                      </div>
                      {item.schemeAmountTotal > 0 && (
                        <div className="text-[10px] font-bold text-emerald-700">
                          Scheme: -{formatINR(item.schemeAmountTotal)}
                        </div>
                      )}
                    </td>
                    <td className="text-right !pr-5">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPdf(item)}
                          disabled={busyId === `open-${item.id}`}
                          className="h-8 gap-1 px-2.5 text-xs"
                          title="Open PDF to view or print"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          View / Print
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(item)}
                          disabled={busyId === `dl-${item.id}`}
                          className="h-8 w-8 p-0"
                          title="Download PDF"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
