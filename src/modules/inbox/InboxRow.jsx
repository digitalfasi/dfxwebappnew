import { timeAgo } from "@/modules/inbox/inboxFormat";

// One look per kind, shared by the bell and the full page.
const KIND = {
  SCHEME_REQUEST: { tone: "bg-accent-soft text-accent-strong", d: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></> },
  KYC_SUBMITTED: { tone: "bg-info-soft text-info", d: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.2 1.7-2 3-2s2.4.8 3 2M14 10h4M14 13h3" /></> },
  APP_PAYMENT: { tone: "bg-emerald-50 text-emerald-700", d: <><path d="M6 4h12M6 9h12M13 20 6 13h3a5 5 0 0 0 0-10" /></> },
  SUPPORT_TICKET: { tone: "bg-warn-soft text-warn", d: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></> },
  SUPPORT_REPLY: { tone: "bg-warn-soft text-warn", d: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></> },
};

export default function InboxRow({ item, onOpen, compact = false }) {
  const k = KIND[item.kind] ?? KIND.SUPPORT_TICKET;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`group flex w-full items-start gap-3 text-left transition-colors hover:bg-canvas/70 focus-visible:bg-canvas/70 focus-visible:outline-none ${compact ? "px-4 py-3" : "px-5 py-3.5"} ${item.read ? "" : "bg-accent-soft/25"}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${k.tone}`}>
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{k.d}</svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={`truncate text-[13px] ${item.read ? "font-semibold text-ink-soft" : "font-extrabold text-ink"}`}>{item.title}</span>
          <span className="shrink-0 text-[11px] text-muted">{timeAgo(item.createdAt)}</span>
        </span>
        <span className={`mt-0.5 block text-xs leading-snug ${item.read ? "text-muted" : "text-ink-soft"} ${compact ? "line-clamp-2" : ""}`}>{item.body}</span>
      </span>
      <span aria-label={item.read ? undefined : "Unread"} className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-accent"}`} />
    </button>
  );
}
