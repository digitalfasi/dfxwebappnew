import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import {
  notificationService, CHANNELS, TARGETS, STATUS_TONE,
  channelLabel, targetLabel, statusLabel,
} from "@/modules/notifications/notificationService";
import { schemeService } from "@/modules/plan/scheme/schemeService";
import InboxRow from "@/modules/inbox/InboxRow";
import { inboxService, INBOX_CHANGED } from "@/modules/inbox/inboxService";
import { badgeText } from "@/modules/inbox/inboxFormat";

// What the STORE receives (requests, payments, KYC, tickets) - the other side
// of this page, which sends to customers. Read-only preview; the full list,
// read state and actions live on the inbox page.
function StoreInboxPanel({ onNavigate }) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try {
      const r = await inboxService.list({ limit: 3 });
      setData({ items: r.items, unread: r.unreadCount, capped: r.unreadCapped });
    } catch {
      setData({ items: [], unread: 0, capped: false, error: true });
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(INBOX_CHANGED, load);
    return () => window.removeEventListener(INBOX_CHANGED, load);
  }, [load]);
  const open = () => onNavigate?.("inbox");

  return (
    <Card data-motion="reveal" className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">Store inbox</span>
              {data?.unread > 0 && <span className="num rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-extrabold text-danger">{badgeText(data.unread, data.capped)} new</span>}
            </div>
            <p className="text-xs text-muted">Notifications your store receives - payments, requests, KYC and tickets.</p>
          </div>
        </div>
        <button type="button" onClick={open} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold text-accent-strong hover:bg-accent-soft/60">
          Open inbox
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
      {data === null && (
        <div className="space-y-2 px-5 py-4" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-canvas" />)}
        </div>
      )}
      {data && data.items.length === 0 && (
        <div className="px-5 py-5 text-center text-xs text-muted">{data.error ? "Couldn’t load the inbox." : "Nothing in the inbox yet."}</div>
      )}
      {data && data.items.length > 0 && (
        <div className="divide-y divide-line-soft">
          {data.items.map((item) => <InboxRow key={item.key} item={item} onOpen={open} compact />)}
        </div>
      )}
    </Card>
  );
}

// Tabs map onto the backend's own status vocabulary rather than a parallel set
// of display words, so a tab can never drift from the thing it filters.
const TABS = [
  { label: "All", status: null },
  { label: "Drafts", status: "DRAFT" },
  { label: "Sent", status: "SENT" },
  { label: "Failed", status: "FAILED" },
  { label: "Cancelled", status: "CANCELLED" },
];

// "Specific customers" is a real backend audience (target_type=CUSTOMERS) but
// it needs a list of customer ids, and this screen has no customer picker. An
// option that cannot be filled in is worse than a missing one, so it is not
// offered until the picker exists. ALL needs nothing; SCHEME needs one id,
// which the scheme dropdown below supplies.
const OFFERED_TARGETS = TARGETS.filter((t) => t.value !== "CUSTOMERS");

const EMPTY_FORM = { title: "", message: "", channel: "IN_APP", targetType: "ALL", schemeId: "" };

export default function Notifications({ onNavigate }) {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [activeTab, setActiveTab] = useState("All");
  const [list, setList] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setList(await notificationService.list());
    } catch (e) {
      setLoadError(e?.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only needed to address a scheme audience; a failure here must not stop the
  // rest of the screen working, so it is silent and leaves the list empty.
  useEffect(() => {
    schemeService.getSchemes().then(setSchemes).catch(() => setSchemes([]));
  }, []);

  const filtered = useMemo(() => {
    const want = TABS.find((t) => t.label === activeTab)?.status;
    return want ? list.filter((n) => n.status === want) : list;
  }, [list, activeTab]);

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.message.trim()) e.message = "Message is required";
    if (form.targetType === "SCHEME" && !form.schemeId) e.schemeId = "Choose which plan's customers to notify";
    return e;
  };

  const payload = () => ({
    title: form.title.trim(),
    body: form.message.trim(),
    channel: form.channel,
    targetType: form.targetType,
    targetIds: form.targetType === "SCHEME" ? [form.schemeId] : [],
  });

  // The backend answers 200 with status FAILED when a channel has no provider
  // configured or nothing matched the audience. Reporting "sent" off the HTTP
  // code alone is exactly the lie this screen used to tell, so the campaign's
  // own status is what decides the message.
  const reportSend = (campaign) => {
    if (campaign.status === "SENT") {
      const n = campaign.recipientCount;
      toast(n == null ? "Notification sent" : `Notification sent to ${n} customer${n === 1 ? "" : "s"}`);
    } else {
      toast(campaign.error || `Notification ${statusLabel(campaign.status).toLowerCase()}`);
    }
  };

  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setErrors({}); };

  const handleSaveDraft = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Fix highlighted fields"); return; }
    setSubmitting(true);
    try {
      await notificationService.createDraft(payload());
      closeForm();
      toast("Draft saved");
      await load();
    } catch (err) {
      toast(err?.message || "Could not save the draft");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNow = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Fix highlighted fields"); return; }
    setSubmitting(true);
    try {
      // Create then send: there is no one-shot endpoint, and a draft that
      // exists is better than a send that vanished if the second call fails.
      const draft = await notificationService.createDraft(payload());
      const sent = await notificationService.send(draft.id);
      closeForm();
      reportSend(sent);
      await load();
    } catch (err) {
      toast(err?.message || "Could not send the notification");
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (id) => {
    setBusyId(id);
    try {
      reportSend(await notificationService.send(id));
      await load();
    } catch (err) {
      toast(err?.message || "Could not send the notification");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id) => {
    setBusyId(id);
    try {
      await notificationService.cancel(id);
      toast("Notification cancelled");
      await load();
    } catch (err) {
      toast(err?.message || "Could not cancel the notification");
    } finally {
      setBusyId(null);
    }
  };

  const schemeOptions = schemes.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Send Notifications</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Create and manage customer notifications across all channels.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={() => setShowForm(true)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New Notification
        </Button>
      </div>

      <StoreInboxPanel onNavigate={onNavigate} />

      <div className="mb-3 text-sm font-extrabold">Sent to customers</div>
      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(t => (
          <button key={t.label} onClick={() => setActiveTab(t.label)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${activeTab === t.label ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{t.label}</button>
        ))}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Title</th><th className="py-3">Channel</th><th className="py-3">Audience</th><th className="py-3 pr-8 text-right">Recipients</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-bold">
                    {n.title}
                    {/* The reason a send failed belongs beside the thing that
                        failed, not in a toast the admin already dismissed. */}
                    {n.status === "FAILED" && n.error && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-danger">{n.error}</span>
                    )}
                  </td>
                  <td className="py-3.5"><Badge tone="neutral">{channelLabel(n.channel)}</Badge></td>
                  <td className="py-3.5 text-muted text-xs font-medium max-w-[180px]">{targetLabel(n.targetType)}</td>
                  {/* Counted by the backend at send time. A dash before that:
                      "not sent yet" is not the same fact as "nobody". */}
                  <td className="num py-3.5 pr-8 text-right font-semibold">{n.recipientCount ?? "—"}</td>
                  <td className="py-3.5"><Badge tone={STATUS_TONE[n.status] ?? "neutral"} dot>{statusLabel(n.status)}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      {(n.status === "DRAFT" || n.status === "FAILED") ? (
                        <>
                          <Button size="sm" className="bg-accent hover:bg-accent-strong" disabled={busyId === n.id} onClick={() => handleSend(n.id)}>
                            {busyId === n.id ? "Sending…" : n.status === "FAILED" ? "Retry" : "Send"}
                          </Button>
                          {n.status === "DRAFT" && (
                            <Button size="sm" variant="outline" disabled={busyId === n.id} onClick={() => handleCancel(n.id)}>Cancel</Button>
                          )}
                        </>
                      ) : <span className="text-xs text-muted">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">Loading…</td></tr>}
              {!loading && loadError && <tr><td colSpan={6} className="px-6 py-10 text-center font-semibold text-danger">{loadError}</td></tr>}
              {!loading && !loadError && filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No notifications in {activeTab}</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeForm} aria-label="Close" />
          <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">New Notification</h3>
              <button onClick={closeForm} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
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
                <Select value={form.targetType} onValueChange={v => setForm({ ...form, targetType: v, schemeId: "" })} options={OFFERED_TARGETS} />
              </label>

              {form.targetType === "SCHEME" && (
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Scheme *</span>
                  <Select value={form.schemeId} onValueChange={v => setForm({ ...form, schemeId: v })} options={schemeOptions} />
                  {errors.schemeId && <span className="text-xs font-semibold text-danger">{errors.schemeId}</span>}
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={closeForm} disabled={submitting}>Cancel</Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting}>Save Draft</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSendNow} disabled={submitting}>
                {submitting ? "Working…" : "Send Now"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
