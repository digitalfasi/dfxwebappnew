// Pure display helpers for the inbox - no imports, so tests can load them directly.

/** "just now", "5 min", "3 h", "Yesterday", "12 Sept". */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  const d = new Date(t);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (t >= startOfToday) return `${Math.floor(s / 3600)} h`;
  if (t >= startOfToday - 86400000) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** Today / Yesterday / Earlier — the section headings on the full page. */
export function dayGroup(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  const n = new Date(now);
  const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86400000) return "Yesterday";
  return "Earlier";
}

export const badgeText = (count, capped) => (capped || count > 99 ? "99+" : String(count));
