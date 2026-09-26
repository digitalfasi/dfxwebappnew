import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { billingService } from "@/modules/billing/billingService";
import { VendorForm } from "@/modules/procurement/purchase-history/Vendors";

// Supplier Directory: the stores the shop buys from, and who to call there.
// Adding and editing suppliers lives here (it used to sit in Purchase History).
// What was bought and what is owed stays in Purchase History.

const phone = (p) => (p ? `+91 ${p}` : "");

export default function SupplierDirectory() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState(null); // null | { supplier: null | row }

  usePageMotion(scope, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSuppliers(await billingService.listVendors());
    } catch (err) {
      setLoadError(err?.message || "Could not load suppliers.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((s) => {
      const hay = [s.code, s.name, s.ownerName, s.ownerPhone, s.contactPerson, s.phone, s.gstNumber, s.email].join(" ").toLowerCase();
      const matchesStatus = statusFilter === "All" || (statusFilter === "Active" ? s.isActive : !s.isActive);
      return (!q || hay.includes(q)) && matchesStatus;
    });
  }, [suppliers, query, statusFilter]);

  const stats = [
    { label: "Suppliers", value: suppliers.length },
    { label: "Active", value: suppliers.filter((s) => s.isActive).length, tone: "text-emerald-700" },
    { label: "With GST", value: suppliers.filter((s) => s.gstNumber).length },
  ];

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Supplier Directory</h2>
          <p className="mt-1 text-sm text-muted">The stores you buy from — owner, the staff who delivers, and their contact details.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => setForm({ supplier: null })}>+ Add Supplier</Button>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3" data-motion="stat">
        {stats.map((k) => (
          <Card key={k.label} className="p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{k.label}</div>
            <div className={`num mt-1 text-lg font-extrabold ${k.tone || ""}`}>{loading ? "…" : k.value}</div>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search code, store, owner, staff, phone or GST" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-w-[220px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter} options={["All", "Active", "Inactive"]} className="w-[140px]" />
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3 min-w-[14rem]">Supplier</th>
                <th className="px-4 py-3 min-w-[11rem]">Owner</th>
                <th className="px-4 py-3 min-w-[11rem]">Supplier Staff</th>
                <th className="px-4 py-3 min-w-[10rem]">GST / Email</th>
                <th className="px-4 py-3 min-w-[6.5rem]">Status</th>
                <th className="px-4 py-3 pr-6 text-right min-w-[6rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !loadError && rows.map((s) => (
                <tr key={s.id} className="border-b border-line-soft last:border-0 transition-colors hover:bg-canvas/60">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 min-w-[2.25rem] place-items-center rounded-lg border border-accent-line bg-accent-soft px-1.5 font-mono text-xs font-extrabold tracking-wide text-accent-strong">{s.code || "—"}</span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-ink">{s.name}</div>
                        <div className="text-[11px] text-muted">Supplier code {s.code || "not set"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-xs font-semibold">{s.ownerName || "—"}</div>
                    <div className="num text-xs text-muted">{phone(s.ownerPhone)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-xs font-semibold">{s.contactPerson || "—"}</div>
                    <div className="num text-xs text-muted">{phone(s.phone)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="num text-xs font-semibold">{s.gstNumber || "No GST"}</div>
                    <div className="truncate text-xs text-muted">{s.email || ""}</div>
                  </td>
                  <td className="px-4 py-3.5"><Badge tone={s.isActive ? "success" : "neutral"} dot>{s.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3.5 pr-6 text-right">
                    <Button size="sm" variant="outline" onClick={() => setForm({ supplier: s })}>Edit</Button>
                  </td>
                </tr>
              ))}
              {loading && (<tr><td colSpan={6} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>)}
              {!loading && loadError && (
                <tr><td colSpan={6} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load suppliers</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-14 text-center">
                  <div className="font-bold">{suppliers.length ? "No suppliers match" : "No suppliers yet"}</div>
                  <p className="mt-1 text-sm text-muted">{suppliers.length ? "Adjust the search or status filter." : "Add the stores you buy gold and jewellery from."}</p>
                  {!suppliers.length && <Button size="sm" className="mt-3" onClick={() => setForm({ supplier: null })}>+ Add Supplier</Button>}
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {form && (
        <VendorForm
          vendor={form.supplier}
          onClose={() => setForm(null)}
          onSaved={async () => { setForm(null); await load(); }}
        />
      )}
    </div>
  );
}
