import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatINR(value, opts = {}) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    ...opts,
  }).format(value);
}

/**
 * Rupees, always with paise — the format every money figure in billing,
 * procurement and payments is shown in. Use this rather than a local copy so a
 * bill and a purchase never disagree on rounding. (formatINR above is the
 * whole-rupee variant used by dashboards/reports.)
 */
export function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Gold weight, to milligram precision: "44.000 g". */
export function grams(n) {
  return `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`;
}

/**
 * A date as an Indian retail user reads it: "09 Sep 2026". Every screen must use
 * this (or fmtDateShort) rather than a local copy — the locale is the whole
 * point, and an en-US copy silently flips the day and month around.
 * Returns "—" for a missing date, and the raw value if it will not parse.
 */
export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Same, without the year — for dense chart axes and compact tables: "09 Sep". */
export function fmtDateShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

/**
 * Today's date in IST, as YYYY-MM-DD.
 *
 * The shop's day is an IST day, and the backend resolves every period against
 * IST (_today_ist). A date derived from the VIEWER's clock therefore disagrees
 * with the server for anyone west of IST, for a window every single day: a UTC
 * machine computes yesterday until 05:30 IST, a US machine until about 09:30.
 * On those machines, during those hours, a range ending "today" silently
 * excludes today and the figures come back stale - which is exactly the
 * intermittent dashboard nobody could reproduce, because the owner's machine is
 * on IST and never sees it.
 *
 * Same technique as istNow() in app/api/live-rates/publish: shift the instant by
 * +5:30 and then read the UTC parts, which makes the result independent of
 * wherever the browser thinks it is. Never use toISOString().slice(0,10) for
 * this - that is the UTC date, which is wrong in the other direction.
 */
export function istToday() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
