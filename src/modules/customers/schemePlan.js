import { isWalletScheme } from "../plan/scheme/schemeCapabilities";

/**
 * Every monthly amount a scheme is actually sold at.
 *
 * Kept in its own module, with no component imports, so BOTH enrollment
 * screens - the Enroll modal and Add Customer - compose their list from one
 * place. A second copy is how the two came to disagree in the first place.
 */

// The scheme's OWN monthly amount, chosen when no tier row matches it. A tier
// id cannot express it because the base amount is not a tier - it lives on the
// scheme - which is exactly why it used to be missing from the list.
export const BASE_PLAN = "__base__";

/** Every monthly amount the shop actually sells this plan at: its own, plus
 *  each active tier, de-duplicated when a tier repeats the base. One builder,
 *  used by the Enroll modal and by Add Customer, so the two cannot drift. */
export function planOptionsFor(scheme) {
  if (!scheme) return [];
  // A Flexible Digi Gold enrollment is a WALLET, not an instalment plan. The
  // scheme's "amount" is the per-deposit GUIDE - Rs 500 to Rs 1,00,000, any
  // number of times - which app/modules/plan/scheme/schema.py states in those
  // words and enforces as a RANGE, not as an instalment. Asking "which monthly
  // amount?" when enrolling therefore invented a commitment the plan does not
  // have, and froze a tier onto a wallet. What actually decides a wallet
  // enrollment is the PURITY: each deposit buys grams of that purity at the
  // rate published on the day the money is paid. So a wallet sells no ladder.
  if (isWalletScheme(scheme.schemeType)) return [];
  const tiers = (scheme.tiers || []).filter((t) => t.isActive);
  const base = {
    value: BASE_PLAN,
    amount: Number(scheme.amount) || 0,
    months: Number(scheme.durationMonths) || Number(scheme.tenureMonths) || null,
  };
  const rows = [base, ...tiers.map((t) => ({
    value: t.id,
    amount: Number(t.monthlyAmount) || 0,
    months: Number(t.durationMonths) || null,
  }))];
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.amount}|${r.months}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
