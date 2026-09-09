/**
 * Installment-schedule presentation for scheme enrollments.
 *
 * The backend's `next_due_date` is the OLDEST UNPAID installment date — so once
 * a customer misses payments it sits in the past. Labeling that "Next due" reads
 * as broken to an admin. These helpers turn it into what a person actually needs:
 *
 *   • how many installments are missed (and since when)
 *   • the NEXT date an installment actually falls due (in the future)
 *
 * Money stays backend-authoritative: the caller shows the backend's
 * `overdue_amount` as the rupee figure. `missedAmount` here is only a hint for
 * screens that have no backend overdue field (e.g. the manual-payment modal).
 */

/** Add n calendar months, clamping to the last valid day of the target month. */
function addMonths(base, n) {
  const day = base.getDate();
  const r = new Date(base.getFullYear(), base.getMonth(), 1);
  r.setMonth(r.getMonth() + n);
  const daysInMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, daysInMonth));
  return r;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const EMPTY = { missedCount: 0, missedAmount: 0, missedDates: [], oldestUnpaid: null, nextUpcoming: null, daysOverdue: 0 };

/**
 * @param nextDueIso   backend next_due_date (oldest unpaid installment)
 * @param monthlyAmount installment size, for the missedAmount hint
 * @param remainingMonths cap so we never count past contractual maturity
 * @returns {{missedCount:number, missedAmount:number, oldestUnpaid:Date|null, nextUpcoming:Date|null, daysOverdue:number}}
 */
export function dueSchedule(nextDueIso, monthlyAmount = 0, remainingMonths = null, today = new Date()) {
  if (!nextDueIso) return EMPTY;
  const parsed = new Date(nextDueIso);
  if (Number.isNaN(parsed.getTime())) return EMPTY;

  const first = startOfDay(parsed);
  const t = startOfDay(today);

  // Nothing missed — the oldest unpaid installment is still in the future.
  if (first > t) return { ...EMPTY, nextUpcoming: first };

  // Count every installment date from `first` through today (inclusive),
  // capped by the months still left on the contract.
  const cap = remainingMonths == null ? Number.POSITIVE_INFINITY : Math.max(0, remainingMonths);
  let missedCount = 0;
  let cursor = first;
  const missedDates = [];
  while (cursor <= t && missedCount < cap && missedCount < 600) {
    missedDates.push(cursor);
    missedCount += 1;
    cursor = addMonths(first, missedCount);
  }

  return {
    missedCount,
    missedAmount: missedCount * (Number(monthlyAmount) || 0),
    missedDates,
    oldestUnpaid: first,
    // First installment date that has NOT yet come due — the real "next due".
    nextUpcoming: missedCount >= cap ? null : cursor,
    daysOverdue: Math.round((t - first) / 86400000),
  };
}

/** "19 May · 19 Jun · 19 Jul · 19 Aug 2026" — the actual dates that were missed,
 *  so an admin can see WHY the day count is what it is. */
export function fmtMissedDates(dates = []) {
  if (!dates.length) return "—";
  const year = dates[dates.length - 1].getFullYear();
  const parts = dates.map((d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
  return `${parts.join(" · ")} ${year}`;
}

/** "19 May 2026" */
export function fmtDueDate(d) {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
