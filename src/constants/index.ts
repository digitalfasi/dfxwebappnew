import { TenantBranding, GoldRate, SilverRate } from '@/types';

/**
 * Fallback branding shown until a tenant's own white-label branding is
 * available (there is no branding data on the Tenant model in the backend
 * yet — see SESSION_HANDOFF.md §14/§19 — so this is always what renders
 * today). Deliberately neutral platform branding, not a fabricated business
 * identity, since it's shown to every real admin regardless of their actual
 * tenant.
 */
export const DEFAULT_BRANDING: TenantBranding = {
  brandName: 'DFX Solution',
  brandColor: '#60A3E6',
  fontFamily: 'Golos Text / Inter',
  logoText: 'DF',
  tagline: 'Powered by DFX Solution',
};

export const INITIAL_GOLD_RATE: GoldRate = {
  price24k: 9820,
  price22k: 9003,
  price18k: 7365,
  change24h: 1.25,
  up: true,
  history: [38, 44, 40, 55, 49, 62, 58],
};

export const INITIAL_SILVER_RATE: SilverRate = {
  price999: 118,
  price925: 109,
  change24h: -0.4,
  up: false,
  history: [50, 46, 52, 44, 48, 42, 40],
};

export const CUSTOMER_NAV_ITEMS = [
  { key: 'home', icon: 'Home', label: 'Home', path: '/customer' },
  { key: 'schemes', icon: 'Diamond', label: 'Schemes', path: '/customer/schemes', badge: true },
  { key: 'passbook', icon: 'BookOpen', label: 'Passbook', path: '/customer/enrollments' },
  { key: 'catalogue', icon: 'ShoppingBag', label: 'Catalogue', path: '/customer/catalogue' },
  { key: 'profile', icon: 'User', label: 'Profile', path: '/customer/profile' },
];

export const ADMIN_NAV_ITEMS = [
  { key: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', path: '/admin', ready: true },
  { key: 'gold-rate', icon: 'Gem', label: 'Gold Rate', path: '/admin/gold-rate', ready: true },
  { key: 'customers', icon: 'Users', label: 'Customers', path: '/admin/customers', ready: true },
  { key: 'kyc', icon: 'ShieldCheck', label: 'KYC Review', path: '/admin/kyc', ready: true },
  { key: 'schemes', icon: 'Coins', label: 'Schemes', path: '/admin/schemes', ready: true },
  { key: 'enrollments', icon: 'UserPlus', label: 'Enrollments', path: '/admin/enrollments', ready: true },
  { key: 'payments', icon: 'CreditCard', label: 'Payments', path: '/admin/payments', ready: true },
  { key: 'catalogue', icon: 'Tag', label: 'Catalogue Studio', path: '/admin/catalogue', ready: true },
  { key: 'appointments', icon: 'Calendar', label: 'Appointments', path: '/admin/appointments', ready: true },
  { key: 'marketing', icon: 'Megaphone', label: 'Marketing', path: '/admin/marketing', ready: true },
  { key: 'reports', icon: 'TrendingUp', label: 'Reports', path: '/admin/reports', ready: true },
  { key: 'analytics', icon: 'BarChart3', label: 'Analytics', path: '/admin/analytics', ready: true },
  { key: 'branches', icon: 'Store', label: 'Branches', path: '/admin/branches', ready: true },
  { key: 'users', icon: 'UserCheck', label: 'Staff Users', path: '/admin/users', ready: true },
  { key: 'settings', icon: 'Settings', label: 'Settings', path: '/admin/settings', ready: true },
];

export const SUPER_ADMIN_NAV_ITEMS = [
  { key: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', path: '/superadmin', ready: true },
  { key: 'tenants', icon: 'Building2', label: 'Tenants', path: '/superadmin/tenants', ready: true },
  { key: 'subscriptions', icon: 'CreditCard', label: 'Subscriptions', path: '/superadmin/subscriptions', ready: true },
  { key: 'branding', icon: 'Palette', label: 'Branding', path: '/superadmin/branding', ready: true },
  { key: 'audit', icon: 'ShieldCheck', label: 'Audit Logs', path: '/superadmin/audit', ready: true },
  { key: 'integrations', icon: 'Plug', label: 'Integrations', path: '/superadmin/integrations', ready: true },
  { key: 'settings', icon: 'Settings', label: 'Platform Settings', path: '/superadmin/settings', ready: true },
];
