/**
 * Which module key each page needs, and whether a given user may open it.
 *
 * D2: the frontend did no permission gating at all. Every entry of
 * NAV_SECTIONS rendered for everyone, so a staff member granted two modules was
 * offered all twenty — and clicking one called an API that correctly refused
 * him and painted a red error. The server was right every time; the screen was
 * offering work it knew would fail.
 *
 * This is a CONVENIENCE AND CLARITY layer, not a security boundary. The server
 * decides, and must keep deciding. Nothing here may be relied on to keep a user
 * out of anything — its only job is to stop offering what the server will
 * refuse, so that a refusal becomes a real signal again.
 *
 * The keys are the backend's own (app/_shared/core/constants.py:
 * ALL_STAFF_MODULES). Each page is mapped to the module its API actually
 * requires — read off the routers, not guessed — so the menu and the server
 * cannot drift into disagreeing.
 */

/** Pages no STAFF account can open, whatever is granted: their APIs require an
 *  Admin, not a module. Marketing and Notifications have module keys in the
 *  backend vocabulary but their routes are require_admin, so a staff member
 *  holding "marketing" would still be refused — the menu follows the route. */
export const ADMIN_ONLY = "ADMIN_ONLY";

export const PAGE_MODULE = {
  // Overview
  dashboard: "analytics",
  "gold-rate": "gold_rate",
  // Customers
  customers: "customers",
  // Plans
  schemes: "schemes",
  "scheme-management": "enrollments",
  // Procurement — all three read and write inventory
  "master-inventory": "billing_inventory",
  inventory: "billing_inventory",
  vendors: "billing_inventory",
  // Billing — three independently grantable areas
  "new-sale": "billing_new_sale",
  "sales-history": "billing_sales_history",
  // Money
  payments: "payments",
  // Studio / outreach
  catalogue: "catalogue",
  marketing: ADMIN_ONLY,
  "promotion-create": ADMIN_ONLY,
  reports: "reports",
  // Estate
  branches: "branches",
  "staff-users": ADMIN_ONLY,
  support: "support",
  notifications: ADMIN_ONLY,
  settings: ADMIN_ONLY,
};

const PRIVILEGED = new Set(["Admin", "SuperAdmin"]);

/** A legacy "billing" grant still expands to the three granular areas, exactly
 *  as require_admin_or_staff_module does server-side. */
const BILLING_UMBRELLA_CHILDREN = ["billing_inventory", "billing_new_sale", "billing_sales_history"];

export function expandPermissions(permissions) {
  const set = new Set(permissions || []);
  if (set.has("billing")) BILLING_UMBRELLA_CHILDREN.forEach((m) => set.add(m));
  return set;
}

/**
 * May this user open this page?
 * Admin and SuperAdmin may open everything — their access is never gated by a
 * module key, which is why this returns true before looking at permissions.
 */
export function canOpen(pageId, role, permissions) {
  if (PRIVILEGED.has(role)) return true;
  const needed = PAGE_MODULE[pageId];
  // An unmapped page is not silently opened. A new page added without a mapping
  // must be a deliberate decision, not an accident of omission.
  if (!needed || needed === ADMIN_ONLY) return false;
  return expandPermissions(permissions).has(needed);
}

/** The page a user should land on. Dashboard when they may open it, otherwise
 *  the first page they can — landing a staff member on a page that immediately
 *  refuses him is how this defect looked from the counter. */
export function landingPage(role, permissions, order) {
  if (canOpen("dashboard", role, permissions)) return "dashboard";
  const ids = order && order.length ? order : Object.keys(PAGE_MODULE);
  return ids.find((id) => canOpen(id, role, permissions)) || null;
}
