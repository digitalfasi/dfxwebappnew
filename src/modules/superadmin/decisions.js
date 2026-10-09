import { fmtDate, seenAt } from "@/modules/superadmin/saService";

// Shops that need the platform owner to act. One rule, used by the bell in
// the top bar and the dashboard's "Needs your decision" panel, so their
// counts always agree. Most urgent first.
export const QUIET_DAYS = 7;
export const ENDING_DAYS = 7;

export function decisionsFor(shops = [], live = []) {
  const seen = Object.fromEntries(live.map((t) => [t.id, t]));
  const rows = [];
  shops.forEach((t) => {
    if (t.access === "EXPIRED") {
      rows.push({ t, rank: 0, tone: "bad", what: "trial ended", why: `Locked at next login · ended ${fmtDate(t.trial_ends_at)}` });
    } else if (t.access === "TRIAL" && t.days_left != null && t.days_left <= ENDING_DAYS) {
      rows.push({ t, rank: 1, tone: "warn", what: t.days_left <= 1 ? "trial ends tomorrow" : `trial ends in ${t.days_left} days`, why: `Make permanent or extend · ends ${fmtDate(t.trial_ends_at)}` });
    } else if (t.access === "PAID" || t.access === "TRIAL") {
      const s = seen[t.id];
      if (s && s.admin_idle_days != null && s.admin_idle_days >= QUIET_DAYS) {
        rows.push({ t, rank: 2, tone: "warn", what: "going quiet", why: `Owner last seen ${seenAt(s.last_admin_seen_at)}` });
      }
    }
  });
  return rows.sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name));
}

export const openShop = (id) => { window.location.hash = `#/control/shops?open=${encodeURIComponent(id)}`; };
