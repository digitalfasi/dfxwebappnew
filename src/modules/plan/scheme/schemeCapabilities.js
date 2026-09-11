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

/** Capabilities of a scheme type. Unknown/missing type is treated as an
 *  instalment plan, which is what every pre-existing scheme is. */
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
