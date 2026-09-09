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
