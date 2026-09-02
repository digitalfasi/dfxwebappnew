import { useState, useRef, useMemo } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

const CATEGORIES = ["Payments","Schemes","Enrollments","Gold Rate","Catalogue","Orders/Sales","Inventory","Account/KYC","Branch","App/Technical Issue","Other"];
const PRIORITIES = ["Low","Medium","High","Urgent"];
const STATUSES = ["Open","In Progress","Waiting for Customer","Resolved","Closed"];
const STAFF = ["Asha","Manoj Chettiar","Priya","Unassigned"];

const INITIAL_TICKETS = [
  { id: "TKT-2026-001", customer: "Priya Raj", phone: "9876543210", email: "priya@ex.com", subject: "Payment not reflected", category: "Payments", description: "UPI ₹5,000 debited but not credited to scheme ENR-260828-50AAB0.", priority: "High", status: "Open", assigned: "Asha", created: "2026-08-10", updated: "2026-08-11", resolved: "—", customerReply: "Please confirm once credited.", staffReply: "Checking with finance.", notes: "Follow up today", attachments: ["receipt.pdf"], history: ["Created: 10 Aug", "Assigned to Asha: 10 Aug", "Customer reply: 11 Aug"], satisfaction: "—", activeSchemes: "Monthly Gold Saving Plan", enrollments: "ENR-260828-50AAB0", payments: "₹12,000 paid", orders: "—", prevTickets: "0" },
  { id: "TKT-2026-002", customer: "Ramesh Kumar", phone: "8123456789", email: "ramesh@ex.com", subject: "KYC rejected", category: "Account/KYC", description: "KYC documents pending verification.", priority: "Urgent", status: "In Progress", assigned: "Manoj Chettiar", created: "2026-08-12", updated: "2026-08-13", resolved: "—", customerReply: "Shared Aadhaar again.", staffReply: "Forwarded to KYC team.", notes: "High priority", attachments: [], history: ["Created: 12 Aug"], satisfaction: "—", activeSchemes: "—", enrollments: "—", payments: "—", orders: "—", prevTickets: "1" },
  { id: "TKT-2026-003", customer: "Uma Subramanian", phone: "9090909090", email: "uma@ex.com", subject: "Gold rate mismatch", category: "Gold Rate", description: "Rate shown ₹15,460/g differs from invoice.", priority: "Medium", status: "Waiting for Customer", assigned: "Priya", created: "2026-08-09", updated: "2026-08-09", resolved: "—", customerReply: "—", staffReply: "Shared rate chart.", notes: "Waiting for confirmation", attachments: ["rate.png"], history: ["Created: 09 Aug"], satisfaction: "—", activeSchemes: "Gold Flexi Saver", enrollments: "ENR-250619-BAF1B1", payments: "₹45,000", orders: "INV-2026-0842", prevTickets: "2" },
  { id: "TKT-2026-004", customer: "Suresh Babu", phone: "9003101122", email: "suresh@ex.com", subject: "Maturity amount query", category: "Schemes", description: "Final maturity calculation doubt for 11-month plan.", priority: "Low", status: "Resolved", assigned: "Asha", created: "2026-08-05", updated: "2026-08-07", resolved: "2026-08-07", customerReply: "Thanks, clarified.", staffReply: "Shared maturity breakup.", notes: "Resolved with explanation", attachments: [], history: ["Created: 05 Aug","Resolved: 07 Aug"], satisfaction: "★★★★★", activeSchemes: "Monthly Gold Saving Plan", enrollments: "ENR-260828-50AAB0", payments: "₹12,000", orders: "—", prevTickets: "0" },
  { id: "TKT-2026-005", customer: "Anitha Pillai", phone: "9841022334", email: "anitha@ex.com", subject: "App login issue", category: "App/Technical Issue", description: "Cannot login after OTP.", priority: "High", status: "Closed", assigned: "Manoj Chettiar", created: "2026-08-01", updated: "2026-08-04", resolved: "2026-08-04", customerReply: "Issue closed, working now.", staffReply: "Reset auth token.", notes: "Closed after fix", attachments: [], history: ["Created: 01 Aug","Closed: 04 Aug"], satisfaction: "★★★★☆", activeSchemes: "—", enrollments: "—", payments: "—", orders: "—", prevTickets: "3" },
  { id: "TKT-2026-006", customer: "Kavitha R", phone: "9080711223", email: "kavitha@ex.com", subject: "Catalogue image missing", category: "Catalogue", description: "Chain product image not loading.", priority: "Medium", status: "Open", assigned: "Unassigned", created: "2026-08-14", updated: "2026-08-14", resolved: "—", customerReply: "—", staffReply: "—", notes: "", attachments: ["screenshot.jpg"], history: ["Created: 14 Aug"], satisfaction: "—", activeSchemes: "—", enrollments: "—", payments: "—", orders: "—", prevTickets: "0" },
];

const FAQ_INITIAL = [
  { id: 1, q: "How is maturity amount calculated?", a: "Base = monthly × months + bonus %; shown in enrollment details.", published: true },
  { id: 2, q: "Payment not reflected?", a: "Allow 24h for UPI/Cheque reconciliation, check with Payments → Scheme Payment History.", published: false },
];

export default function Support() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [tickets, setTickets] = useState(INITIAL_TICKETS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [staffFilter, setStaffFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTicket, setNewTicket] = useState({ customer: "", phone: "", email: "", subject: "", category: "Payments", description: "", priority: "Medium" });
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [faqs, setFaqs] = useState(FAQ_INITIAL);
  const [newFaq, setNewFaq] = useState({ q: "", a: "" });
  const [supportContact, setSupportContact] = useState({ phone: "1800-103-4422", email: "support@aurum.com", hours: "10am–7pm IST", whatsapp: "98765 00011" });

  const stats = useMemo(() => {
    const open = tickets.filter(t => t.status === "Open").length;
    const pending = tickets.filter(t => t.status === "In Progress" || t.status === "Waiting for Customer").length;
    const resolved = tickets.filter(t => t.status === "Resolved").length;
    const closed = tickets.filter(t => t.status === "Closed").length;
    const urgent = tickets.filter(t => t.priority === "Urgent" || t.priority === "High").length;
    return { open, pending, resolved, closed, urgent, total: tickets.length };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return tickets.filter(t => {
      const matchesQuery = !q || [t.id, t.customer, t.phone, t.email, t.subject, t.category, t.status, t.priority, t.assigned].join(" ").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "All" || t.status === statusFilter;
      const matchesPriority = priorityFilter === "All" || t.priority === priorityFilter;
      const matchesCategory = categoryFilter === "All" || t.category === categoryFilter;
      const matchesStaff = staffFilter === "All" || t.assigned === staffFilter;
      return matchesQuery && matchesStatus && matchesPriority && matchesCategory && matchesStaff;
    });
  }, [tickets, query, statusFilter, priorityFilter, categoryFilter, staffFilter]);

  const priorityTone = { Low: "neutral", Medium: "info", High: "warning", Urgent: "danger" };
  const statusTone = { "Open": "danger", "In Progress": "info", "Waiting for Customer": "warning", "Resolved": "success", "Closed": "neutral" };

  const handleCreate = () => {
    if (!newTicket.customer.trim() || !newTicket.subject.trim()) { toast("Customer Name and Subject required"); return; }
    const t = { id: `TKT-2026-${String(tickets.length+101).padStart(3,"0")}`, customer: newTicket.customer, phone: newTicket.phone || "—", email: newTicket.email || "—", subject: newTicket.subject, category: newTicket.category, description: newTicket.description || "—", priority: newTicket.priority, status: "Open", assigned: "Unassigned", created: new Date().toISOString().slice(0,10), updated: new Date().toISOString().slice(0,10), resolved: "—", customerReply: "—", staffReply: "—", notes: "", attachments: [], history: [`Created: ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}`], satisfaction: "—", activeSchemes: "—", enrollments: "—", payments: "—", orders: "—", prevTickets: "0" };
    setTickets(prev => [t, ...prev]);
    setShowCreate(false);
    toast("Ticket created");
  };

  const updateTicket = (id, patch) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...patch, updated: new Date().toISOString().slice(0,10) } : t));
    if (selected?.id === id) setSelected(s => ({ ...s, ...patch }));
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Support Dashboard</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Customer support requests — track, assign, resolve and measure satisfaction.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => setShowCreate(true)}>Create Ticket</Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-motion="stat">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Open Tickets</div><div className="num mt-1 text-2xl font-extrabold text-danger">{stats.open}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Pending Tickets</div><div className="num mt-1 text-2xl font-extrabold text-info">{stats.pending}</div><div className="text-xs text-faint">In Progress / Waiting</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Resolved Tickets</div><div className="num mt-1 text-2xl font-extrabold text-emerald-600">{stats.resolved}</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Closed Tickets</div><div className="num mt-1 text-2xl font-extrabold">{stats.closed}</div></Card>
        <Card className="p-4 border-danger-line bg-danger-soft/40"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-danger">Urgent / Priority</div><div className="num mt-1 text-2xl font-extrabold text-danger">{stats.urgent}</div><div className="text-xs text-danger/70">High + Urgent</div></Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search Tickets — ID, customer, subject, category..." value={query} onChange={e => setQuery(e.target.value)} className="min-w-[260px] flex-1 max-w-md" />
        <Select value={statusFilter} onValueChange={setStatusFilter} options={["All", ...STATUSES]} className="w-[160px]" />
        <Select value={priorityFilter} onValueChange={setPriorityFilter} options={["All", ...PRIORITIES]} className="w-[130px]" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter} options={["All", ...CATEGORIES]} className="w-[160px]" />
        <Select value={staffFilter} onValueChange={setStaffFilter} options={["All", ...STAFF]} className="w-[150px]" />
        {(query || statusFilter!=="All" || priorityFilter!=="All" || categoryFilter!=="All" || staffFilter!=="All") && <button onClick={()=>{setQuery("");setStatusFilter("All");setPriorityFilter("All");setCategoryFilter("All");setStaffFilter("All");}} className="text-xs font-bold text-accent underline">Clear</button>}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">Customer Support Requests</h3><span className="text-xs text-muted">{filtered.length} tickets</span></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Ticket ID</th><th className="py-3">Customer</th><th className="py-3">Subject</th><th className="py-3">Category</th><th className="py-3">Priority</th><th className="py-3">Status</th><th className="py-3">Assigned Staff</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold">{t.id}</td>
                  <td className="py-3.5">
                    <div className="font-bold leading-tight">{t.customer}</div>
                    <div className="font-mono text-[11px] text-muted">{t.phone} · {t.email}</div>
                  </td>
                  <td className="py-3.5 max-w-[220px]"><div className="font-medium truncate">{t.subject}</div><div className="text-xs text-muted truncate">{t.description}</div></td>
                  <td className="py-3.5"><Badge tone="neutral">{t.category}</Badge></td>
                  <td className="py-3.5"><Badge tone={priorityTone[t.priority]}>{t.priority}</Badge></td>
                  <td className="py-3.5"><Badge tone={statusTone[t.status]} dot>{t.status}</Badge></td>
                  <td className="py-3.5 text-xs font-medium">{t.assigned}</td>
                  <td className="py-3.5 pr-6 text-right" onClick={e=>e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => setSelected(t)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Ticket detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative w-full max-w-[760px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold">{selected.id} — {selected.subject}</h3>
                <p className="text-xs text-muted">{selected.customer} · {selected.phone} · {selected.email} · <Badge tone="neutral" className="ml-1">{selected.category}</Badge></p>
              </div>
              <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas shrink-0">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Priority</div><Badge tone={priorityTone[selected.priority]}>{selected.priority}</Badge><div className="mt-2 flex gap-1"><Select value={selected.priority} onValueChange={v => updateTicket(selected.id, {priority: v})} options={PRIORITIES} className="flex-1" /><Button size="sm" variant="outline" onClick={() => toast(`Priority changed to ${selected.priority}`)}>Change Priority</Button></div></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Status</div><Badge tone={statusTone[selected.status]} dot>{selected.status}</Badge><div className="mt-2 flex gap-1"><Select value={selected.status} onValueChange={v => updateTicket(selected.id, {status: v, resolved: v==="Resolved"||v==="Closed" ? new Date().toISOString().slice(0,10) : "—"})} options={STATUSES} className="flex-1" /><Button size="sm" variant="outline" onClick={() => toast(`Status changed to ${selected.status}`)}>Change Status</Button></div></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Assigned Staff</div><div className="font-bold">{selected.assigned}</div><Select value={selected.assigned} onValueChange={v => updateTicket(selected.id, {assigned: v})} options={STAFF} className="mt-2" /></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Dates</div><div className="text-xs">Created: {selected.created}</div><div className="text-xs">Last Updated: {selected.updated}</div><div className="text-xs">Resolution: {selected.resolved}</div></div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <Button size="sm" variant="outline" onClick={() => { const v = prompt("Assign to staff:", selected.assigned); if(v) updateTicket(selected.id,{assigned:v}); toast("Ticket assigned"); }}>Assign Ticket</Button>
                <Button size="sm" variant="outline" onClick={() => { const v = prompt("Reassign to:", selected.assigned); if(v) updateTicket(selected.id,{assigned:v}); toast("Ticket reassigned"); }}>Reassign Ticket</Button>
                <Button size="sm" variant="outline" onClick={() => updateTicket(selected.id,{status:"Closed", resolved: new Date().toISOString().slice(0,10)})}>Close Ticket</Button>
                <Button size="sm" variant="outline" onClick={() => updateTicket(selected.id,{status:"Open"})}>Reopen Ticket</Button>
              </div>

              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Description</h4>
                <p className="mt-2 text-sm leading-relaxed">{selected.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">{selected.attachments.map((a,i)=><Badge key={i} tone="neutral">{a}</Badge>)} {selected.attachments.length===0 && <span className="text-xs text-muted">No attachments</span>}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line p-3">
                  <div className="text-xs font-bold">Customer Reply</div>
                  <p className="mt-1 text-sm text-muted">{selected.customerReply}</p>
                  <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={2} placeholder="Reply to Customer..." className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
                  <Button size="sm" className="mt-2 bg-accent hover:bg-accent-strong" onClick={() => { if(!reply.trim()) return; updateTicket(selected.id,{customerReply: reply, history: [...selected.history, `Staff reply: ${reply.slice(0,30)} — ${new Date().toLocaleDateString("en-IN")}`]}); setReply(""); toast("Replied to customer"); }}>Reply to Customer</Button>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <div className="text-xs font-bold">Internal Notes</div>
                  <p className="mt-1 text-sm text-muted">{selected.notes || "—"}</p>
                  <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Add Internal Note..." className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => { if(!note.trim()) return; updateTicket(selected.id,{notes: note, history: [...selected.history, `Note: ${note.slice(0,30)} — ${new Date().toLocaleDateString("en-IN")}`]}); setNote(""); toast("Internal note added"); }}>Add Internal Note</Button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Conversation / Message History</h4>
                <div className="mt-2 grid gap-1 text-xs">
                  <div className="rounded-lg bg-accent-soft border border-accent-line px-3 py-2"><span className="font-bold">Staff:</span> {selected.staffReply}</div>
                  <div className="rounded-lg bg-canvas border border-line px-3 py-2"><span className="font-bold">Customer:</span> {selected.customerReply}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Ticket Activity History</h4>
                <div className="mt-2 space-y-1">{selected.history.map((h,i)=><div key={i} className="text-xs text-muted">• {h}</div>)}</div>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Customer Support Profile</h4>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted">Customer details:</span> <span className="font-bold">{selected.customer}, {selected.phone}</span></div>
                  <div><span className="text-muted">Active schemes:</span> {selected.activeSchemes}</div>
                  <div><span className="text-muted">Enrollments:</span> {selected.enrollments}</div>
                  <div><span className="text-muted">Payment history:</span> {selected.payments}</div>
                  <div><span className="text-muted">Orders:</span> {selected.orders}</div>
                  <div><span className="text-muted">Previous tickets:</span> {selected.prevTickets}</div>
                </div>
              </div>

              <div className="rounded-xl border border-line p-4 flex items-center justify-between">
                <div><div className="text-xs font-bold">Customer satisfaction / rating</div><div className="text-sm">{selected.satisfaction}</div></div>
                <Button size="sm" variant="outline" onClick={() => { updateTicket(selected.id,{satisfaction:"★★★★★"}); toast("Rating recorded"); }}>Rate ★★★★★</Button>
              </div>

              <div className="flex gap-2">
                <span className="text-xs font-bold">Support Notifications:</span>
                <Badge tone="neutral">Escalation</Badge><Badge tone="neutral">Staff assignment</Badge><Badge tone="neutral">Resolution notes</Badge>
              </div>
            </div>
            <div className="border-t border-line p-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => setSelected(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShowCreate(false)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Create Ticket</h3><button onClick={() => setShowCreate(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Customer Name *</span><Input value={newTicket.customer} onChange={e=>setNewTicket({...newTicket, customer: e.target.value})} placeholder="e.g. Priya Raj" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Customer Phone</span><Input value={newTicket.phone} onChange={e=>setNewTicket({...newTicket, phone: e.target.value})} placeholder="9876543210" /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Customer Email</span><Input value={newTicket.email} onChange={e=>setNewTicket({...newTicket, email: e.target.value})} placeholder="priya@ex.com" /></label>
              </div>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Subject *</span><Input value={newTicket.subject} onChange={e=>setNewTicket({...newTicket, subject: e.target.value})} placeholder="Brief subject" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Issue Category</span><Select value={newTicket.category} onValueChange={v=>setNewTicket({...newTicket, category: v})} options={CATEGORIES} /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Description</span><textarea value={newTicket.description} onChange={e=>setNewTicket({...newTicket, description: e.target.value})} rows={3} placeholder="Describe the issue..." className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Priority</span><Select value={newTicket.priority} onValueChange={v=>setNewTicket({...newTicket, priority: v})} options={PRIORITIES} /></label>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleCreate}>Create Ticket</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reports */}
      <Card data-motion="reveal" className="mt-6 p-6">
        <h3 className="text-sm font-extrabold">Support Reports</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Total tickets</div><div className="font-bold text-lg">{stats.total}</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Open tickets</div><div className="font-bold text-lg text-danger">{stats.open}</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Resolved tickets</div><div className="font-bold text-lg text-emerald-600">{stats.resolved}</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Avg response time</div><div className="font-bold text-lg">2.4h</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Avg resolution time</div><div className="font-bold text-lg">18h</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Tickets by category</div><div className="text-xs">Payments 2, KYC 1, Gold Rate 1...</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Tickets by staff</div><div className="text-xs">Asha 2, Manoj 2, Priya 1...</div></div>
          <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Customer satisfaction</div><div className="font-bold text-lg">4.6/5 ★</div></div>
        </div>
      </Card>

      {/* FAQ */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold">FAQ / Help Articles</h3>
          <Button size="sm" variant="outline" onClick={() => { if(!newFaq.q.trim()) return; setFaqs(prev=>[{id:Date.now(), q:newFaq.q, a:newFaq.a || "—", published:false}, ...prev]); setNewFaq({q:"",a:""}); toast("FAQ created"); }}>Create FAQ</Button>
        </div>
        <div className="mt-4 grid gap-2">
          <div className="flex gap-2"><Input placeholder="Question" value={newFaq.q} onChange={e=>setNewFaq({...newFaq, q: e.target.value})} className="flex-1" /><Input placeholder="Answer" value={newFaq.a} onChange={e=>setNewFaq({...newFaq, a: e.target.value})} className="flex-1" /></div>
          {faqs.map(f => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <div><div className="font-bold text-sm">{f.q}</div><div className="text-xs text-muted">{f.a}</div></div>
              <div className="flex items-center gap-2">
                <Badge tone={f.published ? "success" : "neutral"}>{f.published ? "Published" : "Draft"}</Badge>
                <Button size="sm" variant="outline" onClick={() => setFaqs(prev=>prev.map(x=>x.id===f.id?{...x, published:!x.published}:x))}>{f.published?"Unpublish":"Publish"}</Button>
                <Button size="sm" variant="outline" onClick={() => setFaqs(prev=>prev.filter(x=>x.id!==f.id))}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Contact Support Settings */}
      <Card className="mt-6 p-6">
        <h3 className="text-sm font-extrabold">Contact Support Settings</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5"><span className="text-xs font-bold">Support phone</span><Input value={supportContact.phone} onChange={e=>setSupportContact({...supportContact, phone: e.target.value})} /></label>
          <label className="grid gap-1.5"><span className="text-xs font-bold">Support email</span><Input value={supportContact.email} onChange={e=>setSupportContact({...supportContact, email: e.target.value})} /></label>
          <label className="grid gap-1.5"><span className="text-xs font-bold">Business hours</span><Input value={supportContact.hours} onChange={e=>setSupportContact({...supportContact, hours: e.target.value})} /></label>
          <label className="grid gap-1.5"><span className="text-xs font-bold">WhatsApp support</span><Input value={supportContact.whatsapp} onChange={e=>setSupportContact({...supportContact, whatsapp: e.target.value})} /></label>
        </div>
        <Button size="sm" className="mt-4 bg-accent hover:bg-accent-strong" onClick={()=>toast("Support contact saved")}>Save Settings</Button>
      </Card>
    </div>
  );
}
