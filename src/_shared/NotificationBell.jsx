import { useCallback, useEffect, useRef, useState } from "react";
import InboxRow from "@/modules/inbox/InboxRow";
import { inboxService, inboxIntent, INBOX_CHANGED } from "@/modules/inbox/inboxService";
import { badgeText } from "@/modules/inbox/inboxFormat";

/**
 * Header bell. The badge shows the REAL unread count from /inbox/unread-count —
 * it used to be a red dot hard-coded into the markup, lit for every user at all
 * times whether or not anything had happened. Nothing unread, no badge.
 *
 * Click opens a popover with the latest few; "See all" opens the full page.
 * The count refreshes every minute, when the tab regains focus, and whenever
 * read state changes anywhere in the app.
 */
const PREVIEW = 6;
const POLL_MS = 60_000;
// Kinds that also pop up beside the screen, not just in the bell: a supplier
// payment / metal return whose reminder day has come. Each pops once a session.
const POP_KINDS = new Set(["SUPPLIER_DUE"]);
const POP_MS = 12_000;
const POPPED_KEY = "dfx.inbox.popped";
const readPopped = () => { try { return new Set(JSON.parse(sessionStorage.getItem(POPPED_KEY) || "[]")); } catch { return new Set(); } };
const savePopped = (set) => { try { sessionStorage.setItem(POPPED_KEY, JSON.stringify([...set].slice(-200))); } catch { /* private mode */ } };

export default function NotificationBell({ onNavigate }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);
  const [items, setItems] = useState([]);
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [busy, setBusy] = useState(false);
  const [popups, setPopups] = useState([]);

  // Unread reminders that have not popped yet this session slide in beside
  // the screen, and dismiss themselves after a few seconds.
  const popDue = useCallback(async () => {
    try {
      const r = await inboxService.list({ limit: 10, unread: true });
      const popped = readPopped();
      const fresh = r.items.filter((i) => POP_KINDS.has(i.kind) && !i.read && !popped.has(i.key)).slice(0, 3);
      if (!fresh.length) return;
      fresh.forEach((i) => popped.add(i.key));
      savePopped(popped);
      setPopups((list) => [...list, ...fresh.filter((i) => !list.some((x) => x.key === i.key))]);
      fresh.forEach((i) => setTimeout(() => setPopups((list) => list.filter((x) => x.key !== i.key)), POP_MS));
    } catch {
      // A pop-up is a courtesy; the bell still has the item.
    }
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      const r = await inboxService.unreadCount();
      setCount(r.count);
      setCapped(r.capped);
      if (r.count > 0) popDue();
    } catch {
      // A failed count must not invent a badge; keep the last known value.
    }
  }, [popDue]);

  const loadList = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const r = await inboxService.list({ limit: PREVIEW });
      setItems(r.items);
      setCount(r.unreadCount);
      setCapped(r.unreadCapped);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    const onFocus = () => document.visibilityState !== "hidden" && refreshCount();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener(INBOX_CHANGED, refreshCount);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(INBOX_CHANGED, refreshCount);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    loadList();
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, loadList]);

  const openItem = async (item) => {
    setOpen(false);
    setPopups((list) => list.filter((x) => x.key !== item.key));
    if (!item.read) {
      setItems((list) => list.map((i) => (i.key === item.key ? { ...i, read: true } : i)));
      setCount((c) => Math.max(0, c - 1));
      inboxService.markRead([item.key]).catch(refreshCount);
    }
    if (item.page && onNavigate) onNavigate(item.page, inboxIntent(item));
  };

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await inboxService.markAllRead();
      setItems((list) => list.map((i) => ({ ...i, read: true })));
      setCount(0);
      setCapped(false);
    } finally {
      setBusy(false);
    }
  };

  const seeAll = () => {
    setOpen(false);
    onNavigate?.("inbox");
  };

  const label = count > 0 ? `Notifications, ${badgeText(count, capped)} unread` : "Notifications";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`relative grid h-11 w-11 place-items-center rounded-full border bg-surface text-ink-soft transition-colors duration-150 hover:border-accent-line hover:text-accent-strong lg:h-9 lg:w-9 ${open ? "border-accent-line text-accent-strong" : "border-line"}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="num absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-extrabold leading-none text-white">
            {badgeText(count, capped)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-32px))] max-lg:fixed max-lg:left-4 max-lg:right-4 max-lg:w-auto max-lg:max-w-[380px] max-lg:mx-auto overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_50px_-12px_rgba(0,0,0,0.25)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">Notifications</span>
              {count > 0 && <span className="num rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-extrabold text-danger">{badgeText(count, capped)} new</span>}
            </div>
            {count > 0 && (
              <button type="button" onClick={markAll} disabled={busy} className="rounded-md px-1.5 py-1 text-xs font-bold text-accent-strong hover:bg-accent-soft disabled:opacity-50">
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {state === "loading" && (
              <div className="divide-y divide-line-soft" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3 px-4 py-3">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-canvas" />
                    <div className="flex-1 space-y-2 py-1"><div className="h-3 w-2/3 animate-pulse rounded bg-canvas" /><div className="h-3 w-full animate-pulse rounded bg-canvas" /></div>
                  </div>
                ))}
              </div>
            )}
            {state === "error" && (
              <div className="px-4 py-8 text-center">
                <div className="text-sm font-bold text-danger">Couldn’t load notifications</div>
                <button type="button" onClick={loadList} className="mt-2 text-xs font-bold text-accent-strong hover:underline">Try again</button>
              </div>
            )}
            {state === "ready" && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-canvas text-muted">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <div className="mt-2 text-sm font-bold">You’re all caught up</div>
                <div className="text-xs text-muted">New requests, KYC, payments and tickets will show here.</div>
              </div>
            )}
            {state === "ready" && items.length > 0 && (
              <div className="divide-y divide-line-soft">
                {items.map((item) => <InboxRow key={item.key} item={item} onOpen={openItem} compact />)}
              </div>
            )}
          </div>

          {state === "ready" && items.length > 0 && (
            <button type="button" onClick={seeAll} className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-xs font-extrabold text-accent-strong hover:bg-accent-soft/50">
              See all notifications
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          )}
        </div>
      )}

      {popups.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[80] grid w-[min(360px,calc(100vw-32px))] gap-2.5" aria-live="polite">
          {popups.map((item) => (
            <div key={item.key} className="animate-[fadein_.25s_ease-out] overflow-hidden rounded-2xl border border-danger-line bg-surface shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)]">
              <div className="flex items-start">
                <div className="min-w-0 flex-1">
                  <InboxRow item={item} onOpen={openItem} compact />
                </div>
                <button type="button" aria-label="Dismiss" onClick={() => setPopups((list) => list.filter((x) => x.key !== item.key))}
                  className="m-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink">✕</button>
              </div>
              <div className="h-0.5 origin-left animate-[shrink_12s_linear_forwards] bg-danger/60" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
