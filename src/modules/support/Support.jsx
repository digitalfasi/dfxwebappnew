import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { fmtDate } from "@/_shared/utils";
import {
  supportService, TICKET_STATUSES, TICKET_PRIORITIES,
  statusLabel, priorityLabel, STATUS_TONE, PRIORITY_TONE,
} from "@/modules/support/supportService";

// Support console. Every ticket, message, status and priority here is real
// backend state (app/modules/support) — customers raise tickets in the mobile
// app and an admin answers them on this screen.
//
// Only what the backend actually supports is offered: read the thread, change
// status/priority, reply. There is no ticket assignment, no internal-note
// channel and no satisfaction rating in the API, so this screen does not
// pretend to have them.

const ALL = "All";
const fmtWhen = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return fmtDate(iso); }
};

export default function Support() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);

  // The open ticket, always the DETAIL response (list rows carry no thread).
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  usePageMotion(scope, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTickets(await supportService.listTickets());
    } catch (err) {
      setLoadError(err?.message || "Could not load support tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Categories are free text on the customer side, so the filter is built from
  // the tickets that actually exist rather than a hardcoded list that drifts.
  const categories = useMemo(
    () => [ALL, ...[...new Set(tickets.map((t) => t.category).filter(Boolean))].sort()],
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchesQ = !q
        || t.ticketNumber.toLowerCase().includes(q)
        || t.subject.toLowerCase().includes(q)
        || t.customerName.toLowerCase().includes(q)
        || (t.customerEmail || "").toLowerCase().includes(q);
      return matchesQ
        && (statusFilter === ALL || t.status === statusFilter)
        && (priorityFilter === ALL || t.priority === priorityFilter)
        && (categoryFilter === ALL || t.category === categoryFilter);
    });
  }, [tickets, query, statusFilter, priorityFilter, categoryFilter]);

  // Counts over the real ticket set — a display rollup, nothing derived.
  const counts = useMemo(() => {
    const c = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, URGENT: 0 };
    tickets.forEach((t) => {
      if (c[t.status] != null) c[t.status] += 1;
      if (t.priority === "URGENT" && (t.status === "OPEN" || t.status === "IN_PROGRESS")) c.URGENT += 1;
    });
    return c;
  }, [tickets]);

  const openTicket = async (row) => {
    setSelected(row);          // show what we have immediately
    setReply("");
    setDetailLoading(true);
    try {
      setSelected(await supportService.getTicket(row.id));
    } catch (err) {
      toast(err?.message || "Could not load the ticket thread");
    } finally {
      setDetailLoading(false);
    }
  };

  // Writes straight through; the row and the open panel both take the ticket
  // the backend returns, so nothing on screen can drift from what was saved.
  const applyUpdate = async (patch) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await supportService.updateTicket(selected.id, patch);
      setSelected((prev) => ({ ...updated, messages: prev?.messages ?? [] }));
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated, messages: t.messages } : t)));
      toast(patch.status ? `Status set to ${statusLabel(patch.status)}` : `Priority set to ${priorityLabel(patch.priority)}`);
    } catch (err) {
      toast(err?.message || "Could not update the ticket");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!selected || !text) return;
    setBusy(true);
    try {
      const msg = await supportService.replyToTicket(selected.id, text);
      setSelected((prev) => ({ ...prev, messages: [...(prev.messages ?? []), msg] }));
      setReply("");
      toast("Reply sent to the customer");
    } catch (err) {
      toast(err?.message || "Could not send the reply");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1240px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Support Dashboard</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">Tickets raised by customers in the app. Read the conversation, set status and priority, and reply — the customer sees your reply in their app.</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
      </div>

      {loadError && (
        <Card data-motion="reveal" className="mb-4 border-danger/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-danger">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        </Card>
      )}

      <div data-motion="reveal" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Open", counts.OPEN, "danger"],
          ["In Progress", counts.IN_PROGRESS, "warning"],
          ["Resolved", counts.RESOLVED, "success"],
          ["Urgent & unresolved", counts.URGENT, "danger"],
        ].map(([label, value, tone]) => (
          <Card key={label} className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
            <div className={`mt-1 text-2xl font-extrabold ${tone === "danger" && value > 0 ? "text-danger" : ""}`}>{loading ? "—" : value}</div>
          </Card>
        ))}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold">Customer Support Requests</h3>
          <span className="text-xs text-muted">{filtered.length} of {tickets.length} tickets</span>
        </div>
        <div className="grid gap-2 border-b border-line px-6 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ticket no., subject, customer…" />
          <Select value={statusFilter} onValueChange={setStatusFilter} options={[ALL, ...TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label }))]} />
          <Select value={priorityFilter} onValueChange={setPriorityFilter} options={[ALL, ...TICKET_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]} />
          <Select value={categoryFilter} onValueChange={setCategoryFilter} options={categories} />
        </div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Loading tickets…</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              {tickets.length === 0 ? "No support tickets yet. Tickets appear here as soon as a customer raises one in the app." : "No ticket matches these filters."}
            </p>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Ticket</th><th className="py-3">Customer</th><th className="py-3">Category</th><th className="py-3">Priority</th><th className="py-3">Status</th><th className="py-3">Updated</th><th className="py-3 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-mono text-xs text-muted">{t.ticketNumber}</div>
                      <div className="font-bold">{t.subject}</div>
                    </td>
                    <td className="py-3.5">
                      <div className="text-xs font-semibold">{t.customerName || "—"}</div>
                      <div className="text-xs text-muted">{t.customerEmail || "—"}</div>
                    </td>
                    <td className="py-3.5 text-xs">{t.category || "—"}</td>
                    <td className="py-3.5"><Badge tone={PRIORITY_TONE[t.priority] || "neutral"}>{priorityLabel(t.priority)}</Badge></td>
                    <td className="py-3.5"><Badge tone={STATUS_TONE[t.status] || "neutral"} dot>{statusLabel(t.status)}</Badge></td>
                    <td className="py-3.5 text-xs text-muted">{fmtWhen(t.updatedAt)}</td>
                    <td className="py-3.5 pr-6 text-right"><Button size="sm" variant="outline" onClick={() => openTicket(t)}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative w-full max-w-[760px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
              <div>
                <div className="font-mono text-xs text-muted">{selected.ticketNumber}</div>
                <h3 className="text-base font-extrabold">{selected.subject}</h3>
                <p className="mt-0.5 text-xs text-muted">
                  {selected.customerName || "—"}{selected.customerEmail ? ` · ${selected.customerEmail}` : ""} · {selected.category || "—"} · raised {fmtWhen(selected.createdAt)}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Status</span>
                  <Select
                    value={selected.status}
                    onValueChange={(v) => { if (v !== selected.status) applyUpdate({ status: v }); }}
                    options={TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Priority</span>
                  <Select
                    value={selected.priority}
                    onValueChange={(v) => { if (v !== selected.priority) applyUpdate({ priority: v }); }}
                    options={TICKET_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
                    disabled={busy}
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted">Status and priority save the moment you change them.</p>

              <div className="rounded-xl border border-line bg-canvas/40 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">What the customer wrote</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{selected.description || "—"}</p>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Conversation</div>
                {detailLoading ? (
                  <p className="mt-2 text-sm text-muted">Loading the thread…</p>
                ) : (selected.messages ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No replies yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selected.messages.map((m) => (
                      <div key={m.id} className="rounded-xl border border-line px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-xs font-bold">{m.senderName || "—"}</span>
                          <span className="text-[11px] text-muted">{fmtWhen(m.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{m.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Reply to the customer</span>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    placeholder="Type your reply…"
                    className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
                  />
                </label>
                <p className="mt-1 text-[11px] text-muted">The customer receives this in their app. There is no private/internal note — anything sent here is visible to them.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" disabled={busy || !reply.trim()} onClick={sendReply}>{busy ? "Sending…" : "Send Reply"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
