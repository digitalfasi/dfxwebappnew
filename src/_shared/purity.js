// The one purity vocabulary, and the ONLY place the fineness numbers live.
//
// The stored value is and stays the karat string — "22K". The fineness ("916")
// is a DISPLAY label and nothing else. The backend keys its published-rate map
// on exactly "24K"/"22K"/"18K"/"14K"/"9K" (app/modules/gold_rate/purity_rate.py,
// PUBLISHED_RATE_COLUMN) and karat_of() parses the digits out of that string.
// Storing "916" or "22K - 916" silently breaks rate lookup and every scheme
// gram conversion, so label and value are exported separately on purpose and
// PURITY_LABEL must never be written to state, to a payload, or to a filter
// query param.
//
// Deliberately NOT imported by:
//   - src/modules/plan/.../Schemes.jsx (PURITY_CHOICES) — money-bearing, and
//     asserted character-for-character by tests/billing-new-logic.test.js.
//   - src/modules/customers/Customers.jsx — scheme enrollment purity. rateFor()
//     maps five rate columns; 20K has no published column and returns null, so
//     widening that list would let a FIXED_GOLD_RATE enrollment be locked at an
//     unpublished rate.
//   - anything that builds an API key or column name (rate_24k, rate_22k …).

// Ordered purest-first, the way a jeweller reads them.
export const PURITY_VALUES = ["24K", "22K", "20K", "18K", "14K", "9K"];

// Millesimal fineness — parts of pure gold per thousand. 20K is 833 by the
// trade's rounding of 20/24.
export const PURITY_FINENESS = {
  "24K": 999,
  "22K": 916,
  "20K": 833,
  "18K": 750,
  "14K": 585,
  "9K": 375,
};

// The same purity as the trade says it, in percent (18K = 75%, 22K = 91.6%).
// This is what the screens show; Arrival Purity and Tunch are typed against it.
export const PURITY_PERCENT = {
  "24K": 99.9,
  "22K": 91.6,
  "20K": 83.3,
  "18K": 75,
  "14K": 58.5,
  "9K": 37.5,
};

// "22K" -> "22K – 91.6%". An unknown value (old stock saved under a purity that
// is no longer offered) passes through unchanged rather than being hidden.
export function purityLabel(value) {
  const pct = PURITY_PERCENT[value];
  return pct != null ? `${value} – ${pct}%` : String(value ?? "");
}

// Ready-made options for <Select>, which normalizes {value,label} pairs.
export const PURITY_OPTIONS = PURITY_VALUES.map((value) => ({ value, label: purityLabel(value) }));
