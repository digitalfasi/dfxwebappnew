import { apiClient } from '@/lib/apiClient';
import { ExportFile, ExportFormat, BackendExportFile, mapExportFile } from '@/lib/exportDownload';

export type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'this_year';

export interface ReportRangeParams {
  period?: ReportPeriod;
  /** YYYY-MM-DD. Both dateFrom and dateTo are required together — overrides `period` when set. */
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

/** Shape of the `range` object every report response includes. */
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

/* ------------------------------------------------------------------ */
/* Payment Summary — Reports page KPIs/chart, Analytics avg-installment KPI */
/* ------------------------------------------------------------------ */

interface BackendPaymentTrendPoint {
  period_label: string;
  total_amount: number;
  payment_count: number;
}

interface BackendPaymentSummary {
  range: BackendDateRange;
  total_revenue: number;
  total_revenue_growth_percent: number | null;
  outstanding_dues: number;
  outstanding_dues_growth_percent: number | null;
  avg_installment_amount: number;
  success_payment_count: number;
  pending_payment_count: number;
  monthly_trend: BackendPaymentTrendPoint[];
}

export interface PaymentTrendPoint {
  label: string;
  totalAmount: number;
  paymentCount: number;
}

export interface PaymentSummary {
  range: DateRange;
  totalRevenue: number;
  totalRevenueGrowthPercent: number | null;
  outstandingDues: number;
  outstandingDuesGrowthPercent: number | null;
  avgInstallmentAmount: number;
  successPaymentCount: number;
  pendingPaymentCount: number;
  monthlyTrend: PaymentTrendPoint[];
}

function mapPaymentSummary(raw: BackendPaymentSummary): PaymentSummary {
  return {
    range: mapRange(raw.range),
    totalRevenue: raw.total_revenue,
    totalRevenueGrowthPercent: raw.total_revenue_growth_percent,
    outstandingDues: raw.outstanding_dues,
    outstandingDuesGrowthPercent: raw.outstanding_dues_growth_percent,
    avgInstallmentAmount: raw.avg_installment_amount,
    successPaymentCount: raw.success_payment_count,
    pendingPaymentCount: raw.pending_payment_count,
    monthlyTrend: raw.monthly_trend.map((t) => ({
      label: t.period_label,
      totalAmount: t.total_amount,
      paymentCount: t.payment_count,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Top Customers — Reports page table                                  */
/* ------------------------------------------------------------------ */

interface BackendTopCustomer {
  enrollment_id: string;
  customer_id: string;
  customer_name: string;
  scheme_name: string;
  enrollment_status: string;
  total_invested: number;
  gold_weight_grams: number;
}

interface BackendTopCustomersResponse {
  range: BackendDateRange;
  customers: BackendTopCustomer[];
}

export interface TopCustomer {
  enrollmentId: string;
  customerId: string;
  customerName: string;
  schemeName: string;
  enrollmentStatus: string;
  totalInvested: number;
  goldWeightGrams: number;
}

export interface TopCustomersReport {
  range: DateRange;
  customers: TopCustomer[];
}

function mapTopCustomers(raw: BackendTopCustomersResponse): TopCustomersReport {
  return {
    range: mapRange(raw.range),
    customers: raw.customers.map((c) => ({
      enrollmentId: c.enrollment_id,
      customerId: c.customer_id,
      customerName: c.customer_name,
      schemeName: c.scheme_name,
      enrollmentStatus: c.enrollment_status,
      totalInvested: c.total_invested,
      goldWeightGrams: c.gold_weight_grams,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Enrollment Summary — Reports Active Passbooks KPI, Analytics retention */
/* KPI + weekly trend chart                                            */
/* ------------------------------------------------------------------ */

interface BackendEnrollmentTrendPoint {
  period_label: string;
  new_enrollments: number;
}

interface BackendEnrollmentSummary {
  range: BackendDateRange;
  active_count: number;
  completed_count: number;
  cancelled_count: number;
  new_enrollments_in_range: number;
  retention_rate_percent: number | null;
  conversion_funnel_percent: number | null;
  redemption_velocity_days: number | null;
  daily_trend: BackendEnrollmentTrendPoint[];
}

export interface EnrollmentTrendPoint {
  label: string;
  newEnrollments: number;
}

export interface EnrollmentSummary {
  range: DateRange;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  newEnrollmentsInRange: number;
  retentionRatePercent: number | null;
  /** Always null: no leads/CRM capture exists in the backend yet. */
  conversionFunnelPercent: number | null;
  /** Always null: no redemption/maturity-payout event is modeled yet. */
  redemptionVelocityDays: number | null;
  dailyTrend: EnrollmentTrendPoint[];
}

function mapEnrollmentSummary(raw: BackendEnrollmentSummary): EnrollmentSummary {
  return {
    range: mapRange(raw.range),
    activeCount: raw.active_count,
    completedCount: raw.completed_count,
    cancelledCount: raw.cancelled_count,
    newEnrollmentsInRange: raw.new_enrollments_in_range,
    retentionRatePercent: raw.retention_rate_percent,
    conversionFunnelPercent: raw.conversion_funnel_percent,
    redemptionVelocityDays: raw.redemption_velocity_days,
    dailyTrend: raw.daily_trend.map((t) => ({ label: t.period_label, newEnrollments: t.new_enrollments })),
  };
}

/* ------------------------------------------------------------------ */
/* Gold Rate Trend / Scheme Summary / Dashboard Summary — built as a    */
/* reusable foundation in Module 12, first consumed by the Admin        */
/* Dashboard in Module 13 (see SESSION_HANDOFF.md)                      */
/* ------------------------------------------------------------------ */

interface BackendGoldRateTrendPoint {
  date: string;
  rate_24k: number;
}

interface BackendGoldRateTrendResponse {
  range: BackendDateRange;
  trend: BackendGoldRateTrendPoint[];
  latest_change_percent: number | null;
}

export interface GoldRateTrendPoint {
  date: string;
  rate24k: number;
}

export interface GoldRateTrendReport {
  range: DateRange;
  trend: GoldRateTrendPoint[];
  /** Day-over-day % change between the two most recent points, or null if <2 points. */
  latestChangePercent: number | null;
}

function mapGoldRateTrend(raw: BackendGoldRateTrendResponse): GoldRateTrendReport {
  return {
    range: mapRange(raw.range),
    trend: raw.trend.map((t) => ({ date: t.date, rate24k: t.rate_24k })),
    latestChangePercent: raw.latest_change_percent,
  };
}

interface BackendSchemeSummaryItem {
  scheme_id: string;
  scheme_name: string;
  is_active: boolean;
  active_enrollments: number;
  total_collected: number;
}

interface BackendSchemeSummaryResponse {
  range: BackendDateRange;
  schemes: BackendSchemeSummaryItem[];
}

export interface SchemeSummaryItem {
  schemeId: string;
  schemeName: string;
  isActive: boolean;
  activeEnrollments: number;
  totalCollected: number;
}

export interface SchemeSummaryReport {
  range: DateRange;
  schemes: SchemeSummaryItem[];
}

function mapSchemeSummary(raw: BackendSchemeSummaryResponse): SchemeSummaryReport {
  return {
    range: mapRange(raw.range),
    schemes: raw.schemes.map((s) => ({
      schemeId: s.scheme_id,
      schemeName: s.scheme_name,
      isActive: s.is_active,
      activeEnrollments: s.active_enrollments,
      totalCollected: s.total_collected,
    })),
  };
}

interface BackendDashboardSummary {
  range: BackendDateRange;
  total_revenue: number;
  total_revenue_growth_percent: number | null;
  active_enrollments: number;
  total_gold_accumulated_grams: number;
  outstanding_dues: number;
  total_customers: number;
  total_customers_growth_percent: number | null;
}

export interface DashboardSummary {
  range: DateRange;
  totalRevenue: number;
  totalRevenueGrowthPercent: number | null;
  activeEnrollments: number;
  totalGoldAccumulatedGrams: number;
  outstandingDues: number;
  totalCustomers: number;
  totalCustomersGrowthPercent: number | null;
}

function mapDashboardSummary(raw: BackendDashboardSummary): DashboardSummary {
  return {
    range: mapRange(raw.range),
    totalRevenue: raw.total_revenue,
    totalRevenueGrowthPercent: raw.total_revenue_growth_percent,
    activeEnrollments: raw.active_enrollments,
    totalGoldAccumulatedGrams: raw.total_gold_accumulated_grams,
    outstandingDues: raw.outstanding_dues,
    totalCustomers: raw.total_customers,
    totalCustomersGrowthPercent: raw.total_customers_growth_percent,
  };
}

export const reportService = {
  /** GET /api/v1/reports/payment-summary (Admin) */
  async getPaymentSummary(params: ReportRangeParams = {}): Promise<PaymentSummary> {
    const res = await apiClient.get<{ summary: BackendPaymentSummary }>(
      `/reports/payment-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapPaymentSummary(res.data.summary);
  },

  /** GET /api/v1/reports/top-customers (Admin) */
  async getTopCustomers(params: ReportRangeParams & { limit?: number } = {}): Promise<TopCustomersReport> {
    const res = await apiClient.get<{ report: BackendTopCustomersResponse }>(
      `/reports/top-customers${buildQuery(params)}`,
      { auth: true }
    );
    return mapTopCustomers(res.data.report);
  },

  /** GET /api/v1/reports/enrollment-summary (Admin) */
  async getEnrollmentSummary(params: ReportRangeParams = {}): Promise<EnrollmentSummary> {
    const res = await apiClient.get<{ summary: BackendEnrollmentSummary }>(
      `/reports/enrollment-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapEnrollmentSummary(res.data.summary);
  },

  /** GET /api/v1/reports/gold-rate-trend (Admin) — reusable, not wired to a page yet. */
  async getGoldRateTrend(params: ReportRangeParams = {}): Promise<GoldRateTrendReport> {
    const res = await apiClient.get<{ report: BackendGoldRateTrendResponse }>(
      `/reports/gold-rate-trend${buildQuery(params)}`,
      { auth: true }
    );
    return mapGoldRateTrend(res.data.report);
  },

  /** GET /api/v1/reports/scheme-summary (Admin) — reusable, not wired to a page yet. */
  async getSchemeSummary(params: ReportRangeParams = {}): Promise<SchemeSummaryReport> {
    const res = await apiClient.get<{ report: BackendSchemeSummaryResponse }>(
      `/reports/scheme-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapSchemeSummary(res.data.report);
  },

  /** GET /api/v1/reports/dashboard-summary (Admin) — reserved for a future Admin Dashboard module. */
  async getDashboardSummary(params: ReportRangeParams = {}): Promise<DashboardSummary> {
    const res = await apiClient.get<{ summary: BackendDashboardSummary }>(
      `/reports/dashboard-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapDashboardSummary(res.data.summary);
  },

  /* ---------------------------------------------------------------- */
  /* Export (Module 15) — each fetches the file; the caller passes the */
  /* result to triggerExportDownload() from '@/lib/exportDownload'.    */
  /* ---------------------------------------------------------------- */

  /** GET /api/v1/reports/export/reports-summary (Admin) — Top Customers table. */
  async exportReportsSummary(
    params: ReportRangeParams & { limit?: number; format?: ExportFormat } = {}
  ): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/reports-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/reports/export/analytics-summary (Admin) — 4 Analytics-page KPIs. */
  async exportAnalyticsSummary(format: ExportFormat = 'excel'): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/analytics-summary${buildQuery({ format })}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/reports/export/dashboard-summary (Admin) — today-scoped Dashboard KPIs. */
  async exportDashboardSummary(format: ExportFormat = 'excel'): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/dashboard-summary${buildQuery({ format })}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },
};
