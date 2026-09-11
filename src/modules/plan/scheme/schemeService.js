/**
 * Scheme integration for the new UI. Ports the existing DFX frontend
 * schemeService contract (endpoints, payload, response mapping) onto the new
 * apiClient. Maturity/bonus figures are backend-derived — this layer maps
 * names only. No business rules recomputed, no fields invented.
 */
import { apiClient } from "@/_shared/apiClient";

// The three (and only three) backend scheme types and their display labels.
export const SCHEME_TYPES = [
  { value: "MONTHLY", label: "Monthly Gold Saving" },
  { value: "FLEXIBLE_DIGI_GOLD", label: "Flexible Digi Gold" },
  { value: "FIXED_GOLD_RATE", label: "Fixed Gold Rate" },
];
const SCHEME_TYPE_LABELS = Object.fromEntries(SCHEME_TYPES.map((t) => [t.value, t.label]));
export function schemeTypeLabel(v) {
  return SCHEME_TYPE_LABELS[v] || SCHEME_TYPE_LABELS.MONTHLY;
}

/** GET /schemes item -> the card shape the Schemes view renders. */
function mapCard(raw) {
  const schemeType = raw.scheme_type || "MONTHLY";
  return {
    id: raw.id,
    // Short category label = the scheme type (backend-authoritative).
    tier: schemeTypeLabel(schemeType),
    schemeType,
    name: raw.name,
    amount: raw.monthly_amount,
    tenure: `${raw.duration_months} installments`,
    perk: raw.bonus_description || raw.description || "Gold savings plan",
    // Enrollments referencing this scheme, any status — the server sends it so
    // the grid knows whether a permanent delete is possible at all. Null on an
    // older backend that does not: unknown, not zero.
    enrolled: raw.enrollment_count ?? null,
    status: raw.is_active ? "Active" : "Inactive",
    // Raw backend fields kept verbatim so the Edit form can prefill without a
    // refetch. Not recomputed or faked — passed straight from /schemes.
    isActive: raw.is_active,
    description: raw.description || "",
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    // Purity a gold scheme buys in. Null for MONTHLY, which saves money.
    goldPurity: raw.gold_purity || "",
    bonusDescription: raw.bonus_description || "",
    // Full tier grid (active + inactive) so the Edit form can prefill the tiers
    // the admin already selected. Backend-authoritative; never faked.
    tiers: (raw.tiers ?? []).map((t) => ({
      id: t.id,
      monthlyAmount: t.monthly_amount,
      durationMonths: t.duration_months,
      isActive: t.is_active,
    })),
  };
}

export const schemeService = {
  /** GET /api/v1/schemes — admin scheme list. */
  async getSchemes() {
    const res = await apiClient.get("/schemes", { auth: true });
    return (res.data?.schemes ?? []).map(mapCard);
  },

  /**
   * POST /api/v1/schemes — create. Field names + tier shape match the existing
   * DFX frontend `toBackendPayload` contract exactly: scheme-level base
   * monthly_amount/duration_months plus a tiers[] array, each tier carrying its
   * own monthly_amount/duration_months (+ bonus_percentage, is_active).
   */
  async createScheme({ name, description, schemeType, monthlyAmount, durationMonths, goldPurity, bonusDescription, tiers }) {
    const body = {
      name,
      ...(description ? { description } : {}),
      ...(schemeType ? { scheme_type: schemeType } : {}),
      monthly_amount: monthlyAmount,
      duration_months: durationMonths,
      ...(goldPurity ? { gold_purity: goldPurity } : {}),
      ...(bonusDescription ? { bonus_description: bonusDescription } : {}),
      ...(tiers && tiers.length
        ? {
            tiers: tiers.map((t) => ({
              monthly_amount: t.monthlyAmount,
              duration_months: t.durationMonths,
              bonus_percentage: t.bonusPercentage ?? 0,
              is_active: t.isActive ?? true,
            })),
          }
        : {}),
    };
    const res = await apiClient.post("/schemes", body, { auth: true });
    return res.data?.scheme;
  },

  /** PUT /api/v1/schemes/{id} — update (backend supported; no UI control yet). */
  async updateScheme(id, data) {
    const body = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.schemeType !== undefined ? { scheme_type: data.schemeType } : {}),
      ...(data.monthlyAmount !== undefined ? { monthly_amount: data.monthlyAmount } : {}),
      ...(data.durationMonths !== undefined ? { duration_months: data.durationMonths } : {}),
      ...(data.goldPurity ? { gold_purity: data.goldPurity } : {}),
      ...(data.bonusDescription !== undefined ? { bonus_description: data.bonusDescription } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
      // Tier set reconciled server-side: matching tiers kept, new added, missing
      // ones deactivated. Omitted when not provided (leaves tiers untouched).
      ...(data.tiers !== undefined
        ? {
            tiers: data.tiers.map((t) => ({
              monthly_amount: t.monthlyAmount,
              duration_months: t.durationMonths,
              is_active: t.isActive ?? true,
            })),
          }
        : {}),
    };
    const res = await apiClient.put(`/schemes/${id}`, body, { auth: true });
    return res.data?.scheme;
  },

  /** DELETE /api/v1/schemes/{id} — deactivate (soft; the row is kept). */
  async deactivateScheme(id) {
    await apiClient.delete(`/schemes/${id}`, { auth: true });
  },

  /**
   * DELETE /api/v1/schemes/{id}/permanent — removes the row and its tiers.
   * The backend refuses with 409 when any enrollment or scheme request points
   * at the scheme, so this only ever clears one created by mistake.
   */
  async deleteSchemePermanently(id) {
    await apiClient.delete(`/schemes/${id}/permanent`, { auth: true });
  },
};
