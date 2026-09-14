import { SCHEME_TYPE } from "../plan/scheme/schemeCapabilities";

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
  // The ladder belongs to MONTHLY GOLD SAVING and to nothing else. The three
  // scheme types are sold on three different things, and only one of them is
  // sold on an amount:
  //
  //   MONTHLY          - the tier ladder IS the product. No purity.
  //   FLEXIBLE_DIGI_GOLD - a wallet. The customer pays what he likes, Rs 500 to
  //                      Rs 1,00,000, as often as he likes; the money converts
  //                      to grams of the chosen PURITY at that day's rate, at
  //                      the moment it is paid. The scheme's "amount" is the
  //                      per-deposit guide, which
  //                      app/modules/plan/scheme/schema.py says in those words
  //                      and enforces as a RANGE, not as an instalment.
  //   FIXED_GOLD_RATE  - the customer picks a PURITY, and that purity's LIVE
  //                      rate on the day he enrolls is frozen for the whole
  //                      term. Up or down, he pays at the rate he walked in
  //                      on. The purity is what is being chosen; the amount is
  //                      the scheme's own.
  //
  // Offering "Monthly amount*" on the other two asked the customer to commit to
  // something the plan does not have, and froze a tier onto it. An unknown or
  // missing type is treated as MONTHLY, which is what every legacy scheme is.
  if (scheme.schemeType === SCHEME_TYPE.FLEXIBLE_DIGI_GOLD) return [];
  if (scheme.schemeType === SCHEME_TYPE.FIXED_GOLD_RATE) return [];
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
