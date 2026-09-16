/** What each scheme type actually has — asked once, answered everywhere.
 *
 * A Flexible Digi Gold enrollment is a WALLET: deposits of ₹500–₹1,00,000 made
 * whenever the customer likes. It therefore has no instalment amount, no
 * maturity amount, nothing outstanding and no due dates — but the enrollment
 * record is shaped like an instalment plan, so every screen happily printed
 * all four. Screens ask this module instead of testing the scheme's NAME,
 * which would break the moment a tenant renames a scheme.
 *
 * Nothing here changes stored data. It decides what is DRAWN.
 */

export const SCHEME_TYPE = {
  MONTHLY: "MONTHLY",
  FIXED_GOLD_RATE: "FIXED_GOLD_RATE",
  FLEXIBLE_DIGI_GOLD: "FLEXIBLE_DIGI_GOLD",
};

// Deposit bounds for a Digi Gold wallet, mirroring app/modules/plan/scheme.
export const DIGI_MIN = 500;
export const DIGI_MAX = 100000;

/** The em dash every table already uses for "this does not apply here". Kept
 *  in one place so a wallet's blanks line up with the blanks beside them. */
export const NOT_APPLICABLE = "—";

export const isWalletScheme = (schemeType) =>
  schemeType === SCHEME_TYPE.FLEXIBLE_DIGI_GOLD;

/** Does the CUSTOMER decide what he pays, rather than the shop?
 *
 * Two of the three types say yes, for different reasons:
 *
 *   FLEXIBLE_DIGI_GOLD  a wallet. He deposits what he likes, whenever he likes,
 *                       and each payment converts at that day's rate.
 *   FIXED_GOLD_RATE     he chooses a PURITY, that purity's rate on the day he
 *                       joins is frozen for his whole term, and he then pays
 *                       what he likes against the frozen rate. The shop fixes
 *                       the RATE; it does not fix the money.
 *
 * Only MONTHLY is sold on an instalment the shop sets.
 *
 * Fixed Gold Rate used to demand an instalment the shop nominated for every
 * customer alike, which is why the create form asked for a Monthly Amount and
 * why the payment modal locked the amount to monthly x months. Both were the
 * instalment plan's shape forced onto a plan that is bought on the rate. */
export const isFreeAmountScheme = (schemeType) =>
  schemeType === SCHEME_TYPE.FLEXIBLE_DIGI_GOLD ||
  schemeType === SCHEME_TYPE.FIXED_GOLD_RATE;

/** Capabilities of a scheme type. Unknown/missing type is treated as an
 *  instalment plan, which is what every pre-existing scheme is. */
/**
 * How a plan is SOLD, in the words that belong to its own type. One answer,
 * used by the scheme card, both enrollment dialogs and the payment modal, so
 * those four can never again quote a plan on terms it does not have.
 *
 *   MONTHLY            an instalment: "Rs 1,000 / mo".
 *   FLEXIBLE_DIGI_GOLD a wallet: a RANGE per deposit, no monthly figure at all.
 *   FIXED_GOLD_RATE    sold on the purity, whose rate that day is locked.
 *
 * `amount` is only ever read for MONTHLY. On the other two the scheme's stored
 * amount is a guide, not a commitment, and printing it as "/mo" is what made a
 * wallet look like a Rs 1,000 instalment plan on every screen it appeared on.
 */
export function planHeadline(scheme) {
  const type = scheme?.schemeType || scheme?.scheme_type;
  if (isWalletScheme(type)) {
    return { value: `${fmt(DIGI_MIN)} – ${fmt(DIGI_MAX)}`, suffix: "per deposit", small: true };
  }
  if (type === SCHEME_TYPE.FIXED_GOLD_RATE) {
    const purity = scheme?.goldPurity || scheme?.gold_purity;
    return { value: purity || "Gold", suffix: "rate locked on the day of enrollment", small: true };
  }
  const amt = Number(scheme?.amount ?? scheme?.monthly_amount ?? 0);
  return { value: fmt(amt), suffix: "/ mo", small: false };
}

/** Whole rupees, Indian grouping — the card has no room for paise. */
function fmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** A plan the shop sets no instalment on has no instalment COUNT to quote.
 *  Its duration is still real - it is when the plan matures. This read the
 *  wallet alone, so a Fixed Gold Rate plan was still advertised as "12
 *  installments" after it stopped having any. */
export function tenureLabel(scheme, durationMonths) {
  const months = Number(durationMonths ?? scheme?.durationMonths ?? scheme?.duration_months ?? 0);
  if (!months) return "";
  const type = scheme?.schemeType || scheme?.scheme_type;
  return isFreeAmountScheme(type) ? `${months} months` : `${months} installments`;
}

export function schemeCapabilities(schemeType) {
  const wallet = isWalletScheme(schemeType);
  return {
    isWallet: wallet,
    hasInstalments: !wallet,
    hasMaturityAmount: !wallet,
    hasOutstanding: !wallet,
    hasDueDates: !wallet,
  };
}
