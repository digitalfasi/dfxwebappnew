import { apiClient } from '@/lib/apiClient';
import { ExportFile, ExportFormat, BackendExportFile, mapExportFile } from '@/lib/exportDownload';

export type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'this_year';

export interface RangeParams {
  period?: ReportPeriod;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value === undefined) continue;
    const paramKey = key === 'dateFrom' ? 'date_from' : key === 'dateTo' ? 'date_to' : key;
    qs.set(paramKey, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

interface BackendDateRange {
  date_from: string;
  date_to: string;
  label: string;
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
  label: string;
}

function mapRange(raw: BackendDateRange): DateRange {
  return { dateFrom: raw.date_from, dateTo: raw.date_to, label: raw.label };
}

export type TenantStatus = 'Active' | 'Inactive';

/* ------------------------------------------------------------------ */
/* Tenants                                                              */
/* ------------------------------------------------------------------ */

interface BackendTenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  admin_name: string | null;
  admin_email: string | null;
  admin_phone: string | null;
  created_at: string;
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  /** Derived from the tenant's first Admin-role user — Tenant itself has no owner/contact columns. */
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  createdAt: string;
}

function mapTenant(raw: BackendTenantListItem): TenantListItem {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    status: raw.status === 'Active' ? 'Active' : 'Inactive',
    adminName: raw.admin_name,
    adminEmail: raw.admin_email,
    adminPhone: raw.admin_phone,
    createdAt: raw.created_at,
  };
}

interface BackendTenantDetail extends BackendTenantListItem {
  updated_at: string;
  brand_color?: string | null;
  logo_url?: string | null;
}

export interface TenantDetail extends TenantListItem {
  updatedAt: string;
  brandColor: string | null;
  logoUrl: string | null;
}

function mapTenantDetail(raw: BackendTenantDetail): TenantDetail {
  return {
    ...mapTenant(raw),
    updatedAt: raw.updated_at,
    brandColor: raw.brand_color ?? null,
    logoUrl: raw.logo_url ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Tenant Statistics — per-tenant drill-down (View Tenant Statistics)   */
/* ------------------------------------------------------------------ */

interface BackendTenantStatistics {
  tenant_id: string;
  tenant_name: string;
  range: BackendDateRange;
  total_customers: number;
  active_enrollments: number;
  completed_enrollments: number;
  cancelled_enrollments: number;
  total_revenue: number;
  outstanding_dues: number;
  total_gold_accumulated_grams: number;
  active_schemes: number;
}

export interface TenantStatistics {
  tenantId: string;
  tenantName: string;
  range: DateRange;
  totalCustomers: number;
  activeEnrollments: number;
  completedEnrollments: number;
  cancelledEnrollments: number;
  totalRevenue: number;
  outstandingDues: number;
  totalGoldAccumulatedGrams: number;
  activeSchemes: number;
}

function mapTenantStatistics(raw: BackendTenantStatistics): TenantStatistics {
  return {
    tenantId: raw.tenant_id,
    tenantName: raw.tenant_name,
    range: mapRange(raw.range),
    totalCustomers: raw.total_customers,
    activeEnrollments: raw.active_enrollments,
    completedEnrollments: raw.completed_enrollments,
    cancelledEnrollments: raw.cancelled_enrollments,
    totalRevenue: raw.total_revenue,
    outstandingDues: raw.outstanding_dues,
    totalGoldAccumulatedGrams: raw.total_gold_accumulated_grams,
    activeSchemes: raw.active_schemes,
  };
}

/* ------------------------------------------------------------------ */
/* Platform Dashboard                                                   */
/* ------------------------------------------------------------------ */

interface BackendGrowthPoint {
  period_label: string;
  new_tenants: number;
}

export interface GrowthPoint {
  label: string;
  newTenants: number;
}

interface BackendStatusBreakdownItem {
  status: string;
  count: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
}

interface BackendRecentTenant {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface RecentTenant {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface BackendPlatformDashboard {
  range: BackendDateRange;
  total_tenants: number;
  active_tenants: number;
  total_customers: number;
  total_schemes: number;
  total_enrollments: number;
  total_payments: number;
  total_payment_amount: number;
  growth_trend: BackendGrowthPoint[];
  status_breakdown: BackendStatusBreakdownItem[];
  recent_tenants: BackendRecentTenant[];
}

export interface PlatformDashboard {
  range: DateRange;
  totalTenants: number;
  activeTenants: number;
  totalCustomers: number;
  totalSchemes: number;
  totalEnrollments: number;
  totalPayments: number;
  totalPaymentAmount: number;
  growthTrend: GrowthPoint[];
  statusBreakdown: StatusBreakdownItem[];
  recentTenants: RecentTenant[];
}

function mapPlatformDashboard(raw: BackendPlatformDashboard): PlatformDashboard {
  return {
    range: mapRange(raw.range),
    totalTenants: raw.total_tenants,
    activeTenants: raw.active_tenants,
    totalCustomers: raw.total_customers,
    totalSchemes: raw.total_schemes,
    totalEnrollments: raw.total_enrollments,
    totalPayments: raw.total_payments,
    totalPaymentAmount: raw.total_payment_amount,
    growthTrend: raw.growth_trend.map((g) => ({ label: g.period_label, newTenants: g.new_tenants })),
    statusBreakdown: raw.status_breakdown.map((s) => ({ status: s.status, count: s.count })),
    recentTenants: raw.recent_tenants.map((t) => ({ id: t.id, name: t.name, status: t.status, createdAt: t.created_at })),
  };
}

/* ------------------------------------------------------------------ */
/* Tenant Provisioning (Module 29)                                      */
/* ------------------------------------------------------------------ */

export type SubscriptionPlan = 'Starter' | 'Professional' | 'Business' | 'Enterprise';

export interface TenantProvisionRequest {
  businessName: string;
  subdomain: string;
  businessAddress: string;
  businessPhone: string;
  contactEmail?: string;
  gstNumber?: string;
  adminName: string;
  adminEmail: string;
  adminPhone?: string;
  plan: SubscriptionPlan;
  trialDays: number;
  brandColor?: string;
}

interface BackendBranchSummary {
  id: string;
  name: string;
  address: string;
  phone: string;
}

interface BackendSubscriptionSummary {
  id: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
}

interface BackendProvisionedAdminSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface BackendTenantProvisionResponse {
  tenant: BackendTenantDetail;
  branch: BackendBranchSummary;
  subscription: BackendSubscriptionSummary;
  admin: BackendProvisionedAdminSummary;
  temporary_password: string;
  activation_link: string;
  activation_link_expires_at: string;
  onboarding_email_sent: boolean;
}

export interface TenantProvisionResult {
  tenant: TenantDetail;
  branch: { id: string; name: string; address: string; phone: string };
  subscription: { id: string; plan: string; status: string; trialEndsAt: string | null };
  admin: { id: string; name: string; email: string | null; phone: string | null };
  /** Returned exactly once by the backend — never persisted client-side beyond this in-memory result, never logged. */
  temporaryPassword: string;
  activationLink: string;
  activationLinkExpiresAt: string;
  onboardingEmailSent: boolean;
}

function mapProvisionResult(raw: BackendTenantProvisionResponse): TenantProvisionResult {
  return {
    tenant: mapTenantDetail(raw.tenant),
    branch: { id: raw.branch.id, name: raw.branch.name, address: raw.branch.address, phone: raw.branch.phone },
    subscription: {
      id: raw.subscription.id,
      plan: raw.subscription.plan,
      status: raw.subscription.status,
      trialEndsAt: raw.subscription.trial_ends_at,
    },
    admin: { id: raw.admin.id, name: raw.admin.name, email: raw.admin.email, phone: raw.admin.phone },
    temporaryPassword: raw.temporary_password,
    activationLink: raw.activation_link,
    activationLinkExpiresAt: raw.activation_link_expires_at,
    onboardingEmailSent: raw.onboarding_email_sent,
  };
}

export const superAdminService = {
  /** GET /api/v1/superadmin/dashboard (SuperAdmin) */
  async getPlatformDashboard(params: RangeParams = {}): Promise<PlatformDashboard> {
    const res = await apiClient.get<{ dashboard: BackendPlatformDashboard }>(
      `/superadmin/dashboard${buildQuery(params)}`,
      { auth: true }
    );
    return mapPlatformDashboard(res.data.dashboard);
  },

  /** GET /api/v1/superadmin/tenants (SuperAdmin) */
  async getTenants(statusFilter?: TenantStatus): Promise<TenantListItem[]> {
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    const res = await apiClient.get<{ tenants: BackendTenantListItem[] }>(`/superadmin/tenants${qs}`, { auth: true });
    return res.data.tenants.map(mapTenant);
  },

  /** GET /api/v1/superadmin/tenants/{id} (SuperAdmin) */
  async getTenantDetail(id: string): Promise<TenantDetail> {
    const res = await apiClient.get<{ tenant: BackendTenantDetail }>(`/superadmin/tenants/${id}`, { auth: true });
    return mapTenantDetail(res.data.tenant);
  },

  /** PUT /api/v1/superadmin/tenants/{id}/status (SuperAdmin) */
  async setTenantStatus(id: string, tenantStatus: TenantStatus): Promise<TenantDetail> {
    const res = await apiClient.put<{ tenant: BackendTenantDetail }>(
      `/superadmin/tenants/${id}/status`,
      { status: tenantStatus },
      { auth: true }
    );
    return mapTenantDetail(res.data.tenant);
  },

  async enableTenant(id: string): Promise<TenantDetail> {
    return superAdminService.setTenantStatus(id, 'Active');
  },

  async disableTenant(id: string): Promise<TenantDetail> {
    return superAdminService.setTenantStatus(id, 'Inactive');
  },

  /** GET /api/v1/superadmin/tenants/{id}/statistics (SuperAdmin) */
  async getTenantStatistics(id: string, params: RangeParams = {}): Promise<TenantStatistics> {
    const res = await apiClient.get<{ statistics: BackendTenantStatistics }>(
      `/superadmin/tenants/${id}/statistics${buildQuery(params)}`,
      { auth: true }
    );
    return mapTenantStatistics(res.data.statistics);
  },

  /**
   * POST /api/v1/superadmin/tenants/provision (SuperAdmin) — Module 29.
   * Real provisioning: creates Tenant + default Branch + Subscription +
   * Admin user, generates a temporary password + activation link, sends an
   * onboarding email, audit-logs every step. Replaces the old fake dialog.
   */
  async provisionTenant(req: TenantProvisionRequest): Promise<TenantProvisionResult> {
    const res = await apiClient.post<{ provisioned: BackendTenantProvisionResponse }>(
      '/superadmin/tenants/provision',
      {
        business_name: req.businessName,
        subdomain: req.subdomain,
        business_address: req.businessAddress,
        business_phone: req.businessPhone,
        contact_email: req.contactEmail || undefined,
        gst_number: req.gstNumber || undefined,
        admin_name: req.adminName,
        admin_email: req.adminEmail,
        admin_phone: req.adminPhone || undefined,
        plan: req.plan,
        trial_days: req.trialDays,
        brand_color: req.brandColor || undefined,
      },
      { auth: true }
    );
    return mapProvisionResult(res.data.provisioned);
  },

  /* ---------------------------------------------------------------- */
  /* Export (Module 15) — pass the result to triggerExportDownload()  */
  /* from '@/lib/exportDownload'.                                     */
  /* ---------------------------------------------------------------- */

  /** GET /api/v1/superadmin/export/dashboard (SuperAdmin) */
  async exportPlatformDashboard(format: ExportFormat = 'excel'): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/superadmin/export/dashboard${buildQuery({ format })}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/superadmin/export/tenants (SuperAdmin) */
  async exportTenants(params: { status?: TenantStatus; format?: ExportFormat } = {}): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/superadmin/export/tenants${buildQuery(params)}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },
};
