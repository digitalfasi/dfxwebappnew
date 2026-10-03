import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { usePageMotion } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import InboxRow from "@/modules/inbox/InboxRow";
import { inboxService, inboxIntent, INBOX_CHANGED } from "@/modules/inbox/inboxService";
import { dayGroup, badgeText } from "@/modules/inbox/inboxFormat";

const PAGE = 25;

/** Everything the bell has, grouped Today / Yesterday / Earlier, 90 days deep. */
export default function Inbox({ onNavigate }) {
  const scope = useRef(null);
  usePageMotion(scope);
  const [filter, setFilter] = useState("all"); // all | unread
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await inboxService.list({ limit: PAGE, unread: filter === "unread" });
      setItems(r.items);
      setNext(r.nextBefore);
      setCount(r.unreadCount);
      setCapped(r.unreadCapped);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // The bell may mark things read while this page is open.
  useEffect(() => {
    const sync = () => inboxService.unreadCount().then((r) => { setCount(r.count); setCapped(r.capped); }).catch(() => {});
    window.addEventListener(INBOX_CHANGED, sync);
    return () => window.removeEventListener(INBOX_CHANGED, sync);
  }, []);

  const loadMore = async () => {
    if (!next || more) return;
    setMore(true);
    try {
      const r = await inboxService.list({ limit: PAGE, before: next, unread: filter === "unread" });
      setItems((list) => [...list, ...r.items.filter((i) => !list.some((x) => x.key === i.key))]);
      setNext(r.nextBefore);
    } catch (err) {
      toast(err?.message || "Could not load more");
    } finally {
      setMore(false);
    }
  };

  const open = (item) => {
    if (!item.read) {
      setItems((list) => list.map((i) => (i.key === item.key ? { ...i, read: true } : i)));
      setCount((c) => Math.max(0, c - 1));
      inboxService.markRead([item.key]).catch(() => {});
    }
    if (item.page) onNavigate(item.page, inboxIntent(item));
  };

  const markAll = async () => {
    try {
      await inboxService.markAllRead();
      setCount(0);
      setCapped(false);
      if (filter === "unread") setItems([]);
      else setItems((list) => list.map((i) => ({ ...i, read: true })));
    } catch (err) {
      toast(err?.message || "Could not mark all as read");
    }
  };

  const groups = [];
  for (const item of items) {
    const g = dayGroup(item.createdAt);
    if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  return (
    <div ref={scope} className="mx-auto max-w-[760px]">
      <div data-motion="page-head" className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">All notifications</h2>
          <p className="mt-1 text-sm text-muted">
            {count > 0 ? `${badgeText(count, capped)} unread` : "You’re all caught up"} · last 90 days
          </p>
        </div>
        {count > 0 && <Button size="sm" variant="outline" onClick={markAll}>Mark all as read</Button>}
      </div>

      <div role="tablist" aria-label="Filter" className="mb-3 inline-flex rounded-xl border border-line bg-surface p-1">
        {[["all", "All"], ["unread", "Unread"]].map(([v, l]) => (
          <button
            key={v}
            role="tab"
            aria-selected={filter === v}
            onClick={() => setFilter(v)}
            className={`min-h-9 rounded-lg px-4 text-xs font-extrabold transition-colors ${filter === v ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        {state === "loading" && <div className="px-6 py-14 text-center text-sm font-semibold text-muted">Loading notifications…</div>}
        {state === "error" && (
          <div className="px-6 py-14 text-center">
            <div className="font-bold text-danger">Couldn’t load notifications</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
          </div>
        )}
        {state === "ready" && items.length === 0 && (
          <div className="px-6 py-14 text-center">
            <div className="text-sm font-bold">{filter === "unread" ? "No unread notifications" : "No notifications yet"}</div>
            <div className="mt-1 text-xs text-muted">Scheme requests, KYC, app payments and support tickets from customers show here.</div>
          </div>
        )}
        {state === "ready" && groups.map((g) => (
          <section key={g.label}>
            <div className="border-b border-line bg-canvas/60 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{g.label}</div>
            <div className="divide-y divide-line-soft">
              {g.items.map((item) => <InboxRow key={item.key} item={item} onOpen={open} />)}
            </div>
          </section>
        ))}
        {state === "ready" && next && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={more}>{more ? "Loading…" : "Load older"}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
