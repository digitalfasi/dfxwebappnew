// Auto-save of an unfinished purchase (5.9): a LOCAL browser draft, keyed by
// tenant + user + form, so one shop's or one user's half-typed slip never
// appears for another. Never the photo (a File cannot be stored) and never
// anything the server computes. Storage can be unavailable (private window,
// blocked site data), so every access is guarded and failure just means
// "no draft".
import { STORAGE_KEYS } from "@/_shared/apiClient";

function owner() {
  try {
    const u = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || "null");
    return u ? `${u.tenant_id || u.tenantId || "t"}_${u.id || "u"}` : null;
  } catch { return null; }
}

const keyFor = (form) => {
  const o = owner();
  return o ? `dfx_purchase_draft_${form}_${o}` : null;
};

export function loadDraft(form) {
  const k = keyFor(form);
  if (!k) return null;
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
}

export function saveDraft(form, data) {
  const k = keyFor(form);
  if (!k) return false;
  try { localStorage.setItem(k, JSON.stringify({ ...data, savedAt: Date.now() })); return true; } catch { return false; }
}

export function clearDraft(form) {
  const k = keyFor(form);
  if (!k) return;
  try { localStorage.removeItem(k); } catch { /* nothing to clear */ }
}
