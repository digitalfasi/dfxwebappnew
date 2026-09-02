import { useState, useRef, useMemo } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

const TABS = ["All", "Drafts", "Sent", "Failed", "Cancelled"];
const CHANNELS = ["In-App", "Email", "WhatsApp", "SMS", "Push"];
const AUDIENCES = ["All customers", "Specific customers", "Customers enrolled in a scheme"];

const INITIAL = [
  { id: 1, title: "Diwali Gold Offer", channel: "WhatsApp", audience: "All customers", recipients: "1,240", status: "Sent" },
  { id: 2, title: "Diwali Gold Offer", channel: "Push", audience: "Specific customers", recipients: "Priya, Ramesh +2", status: "Draft" },
  { id: 3, title: "Payment Reminder", channel: "SMS", audience: "Customers enrolled in a scheme", recipients: "Gold Flexi Saver (42)", status: "Failed" },
  { id: 4, title: "New Branch Launch", channel: "Email", audience: "All customers", recipients: "3,100", status: "Cancelled" },
  { id: 5, title: "Diwali Gold Offer", channel: "In-App", audience: "All customers", recipients: "—", status: "Draft" },
];

const STATUS_TONE = { Draft: "neutral", Sent: "success", Failed: "danger", Cancelled: "warning" };

export default function Notifications() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [activeTab, setActiveTab] = useState("All");
  const [list, setList] = useState(INITIAL);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", channel: "In-App", audience: "All customers" });
  const [errors, setErrors] = useState({});

  const filtered = useMemo(() => {
    if (activeTab === "All") return list;
    const map = { Drafts: "Draft", Sent: "Sent", Failed: "Failed", Cancelled: "Cancelled" };
    return list.filter(n => n.status === map[activeTab]);
  }, [list, activeTab]);

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.message.trim()) e.message = "Message is required";
    return e;
  };

  const handleSaveDraft = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Fix highlighted fields"); return; }
    setList(prev => [{ id: Date.now(), title: form.title.trim(), channel: form.channel, audience: form.audience, recipients: form.audience === "All customers" ? "—" : form.audience === "Specific customers" ? "Priya, ... (draft)" : "Scheme audience (draft)", status: "Draft" }, ...prev]);
    setShowForm(false);
    setForm({ title: "", message: "", channel: "In-App", audience: "All customers" });
    toast("Draft saved");
  };

  const handleSendNow = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Fix highlighted fields"); return; }
    setList(prev => [{ id: Date.now(), title: form.title.trim(), channel: form.channel, audience: form.audience, recipients: form.audience === "All customers" ? `${(1200 + Math.floor(Math.random()*800)).toLocaleString()}` : form.audience === "Specific customers" ? "Selected customers" : "Enrolled customers", status: "Sent" }, ...prev]);
    setShowForm(false);
    setForm({ title: "", message: "", channel: "In-App", audience: "All customers" });
    toast("Notification sent");
  };

  const handleSend = (id) => {
    setList(prev => prev.map(n => n.id === id ? { ...n, status: "Sent" } : n));
    toast("Notification sent");
  };

  const handleCancel = (id) => {
    setList(prev => prev.map(n => n.id === id ? { ...n, status: "Cancelled" } : n));
    toast("Notification cancelled");
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Notifications</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Create and manage customer notifications across all channels.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={() => setShowForm(true)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New Notification
        </Button>
      </div>

      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${activeTab === t ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{t}</button>
        ))}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Title</th><th className="py-3">Channel</th><th className="py-3">Audience</th><th className="py-3">Recipients</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-bold">{n.title}</td>
                  <td className="py-3.5"><Badge tone="neutral">{n.channel}</Badge></td>
                  <td className="py-3.5 text-muted text-xs font-medium max-w-[180px]">{n.audience}</td>
                  <td className="py-3.5 font-mono text-xs">{n.recipients}</td>
                  <td className="py-3.5"><Badge tone={STATUS_TONE[n.status] ?? "neutral"} dot>{n.status}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      {n.status === "Draft" && <><Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => handleSend(n.id)}>Send</Button><Button size="sm" variant="outline" onClick={() => handleCancel(n.id)}>Cancel</Button></>}
                      {n.status !== "Draft" && <span className="text-xs text-muted">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No notifications in {activeTab}</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">New Notification</h3>
              <button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Title *</span>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Diwali Gold Offer" className={errors.title ? "border-danger" : ""} />
                {errors.title && <span className="text-xs font-semibold text-danger">{errors.title}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Message *</span>
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} placeholder="Customer-facing notification content." className={`rounded-xl border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] ${errors.message ? "border-danger" : "border-line"}`} />
                {errors.message && <span className="text-xs font-semibold text-danger">{errors.message}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Channel</span>
                <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: v })} options={CHANNELS} />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Audience</span>
                <Select value={form.audience} onValueChange={v => setForm({ ...form, audience: v })} options={AUDIENCES} />
              </label>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>Save Draft</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSendNow}>Send Now</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
