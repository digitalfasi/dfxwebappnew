/**
 * Passbook (ledger) integration for the new UI. Ports the existing DFX frontend
 * passbookService contract onto the new apiClient. Entries, gold weight/rate and
 * summary are backend authoritative — this layer maps names only.
 */
import { apiClient } from "../lib/apiClient";

export const passbookService = {
  /** GET /api/v1/passbooks/{enrollmentId} — admin passbook for an enrollment. */
  async getAdminPassbook(enrollmentId) {
    const res = await apiClient.get(`/passbooks/${enrollmentId}`, { auth: true });
    const p = res.data?.passbook;
    if (!p) return null;
    return {
      entries: (p.entries ?? []).map((e) => ({
        id: e.id,
        entryNumber: e.entry_number,
        entryDate: e.entry_date,
        description: e.description,
        amount: e.amount,
        goldRate: e.gold_rate,
        goldWeight: e.gold_weight,
      })),
      summary: p.summary ?? null,
    };
  },
};
