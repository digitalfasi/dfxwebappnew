/**
 * Indian-format field rules, shared by every screen that collects them.
 *
 * These mirror app/_shared/core/indian_formats.py one-for-one. The backend is
 * the authority — these exist so the counter sees the problem in the field
 * rather than as a rejected request, and so two screens cannot disagree about
 * what a valid phone number looks like. `onlyTenDigits` had been copy-pasted
 * into each module separately, which is how that drift starts.
 */

/** Strip everything but digits and cap at 10. For onChange, so a paste of
 *  "+91 98765 43210" lands as "9876543210" rather than being rejected. */
export function onlyTenDigits(value) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

/** India's mobile numbering plan: 10 digits starting 6-9. A number starting
 *  0-5 is a landline or a typo, not a mobile a customer can be reached on. */
export function isValidIndianPhone(value) {
  return /^[6-9]\d{9}$/.test(String(value ?? "").replace(/\D/g, ""));
}

export const PHONE_ERROR =
  "Enter a 10-digit mobile number starting 6, 7, 8 or 9";

/**
 * GSTIN, 15 characters:
 *   2  state code
 *   10 PAN: 5 letters, 4 digits, 1 letter
 *   1  entity number for that PAN in that state
 *   1  literal 'Z'
 *   1  check character
 * The checksum algorithm is not enforced here or on the backend — the
 * structural rule catches every realistic typo, and a structurally valid GSTIN
 * with a wrong check digit is a question for the tenant's accountant.
 */
const GSTIN_RE = /^[0-3][0-9A-Z][A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper-case and strip spaces. GSTIN is stored unique, so the same number
 *  typed in lower case would otherwise register as a second tenant. */
export function normalizeGstin(value) {
  return String(value ?? "").replace(/\s/g, "").toUpperCase().slice(0, 15);
}

export function isValidGstin(value) {
  return GSTIN_RE.test(normalizeGstin(value));
}

export const GSTIN_ERROR =
  "Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5";
