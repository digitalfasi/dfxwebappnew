/**
 * Reports & Analytics integration for the new UI. Ports the existing DFX
 * /reports/* contract (Module 12/15) onto the new apiClient. Every figure —
 * revenue, dues, collections, enrollment counts, retention, growth % — is
 * backend authoritative. This layer only builds query strings, unwraps the
 * standard envelope and maps snake_case → camelCase. No financial/analytic
 * value is computed here.
 */
import { apiClient } from "../lib/apiClient";

const PERIOD_MAP = {
  Today: "today",
  "This Week": "this_week",
  "This Month": "this_month",
  "This Year": "this_year",
};

/** UI period label (+ optional custom range) → backend query params. */
function periodParams({ period, dateFrom, dateTo }) {
  const params = new URLSearchParams();
  if (period === "Custom") {
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
  } else if (PERIOD_MAP[period]) {
    params.set("period", PERIOD_MAP[period]);
  }
  return params;
}

function qs(params) {
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Decode a base64 export payload and hand it to the browser as a download. */
function downloadBase64(file) {
  if (typeof window === "undefined" || !file?.content_base64) return;
  const bytes = atob(file.content_base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: file.content_type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename || "export";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const reportService = {
  /** GET /reports/payment-summary — revenue, dues, avg installment, trend. */
  async getPaymentSummary(opts) {
    const res = await apiClient.get(`/reports/payment-summary${qs(periodParams(opts))}`, { auth: true });
    const s = res.data?.summary ?? {};
    return {
      range: s.range ?? null,
      totalRevenue: s.total_revenue ?? 0,
      totalRevenueGrowthPercent: s.total_revenue_growth_percent ?? null,
      outstandingDues: s.outstanding_dues ?? 0,
      outstandingDuesGrowthPercent: s.outstanding_dues_growth_percent ?? null,
      avgInstallmentAmount: s.avg_installment_amount ?? 0,
      successPaymentCount: s.success_payment_count ?? 0,
      pendingPaymentCount: s.pending_payment_count ?? 0,
      monthlyTrend: (s.monthly_trend ?? []).map((p) => ({
        label: p.period_label, amount: p.total_amount ?? 0, count: p.payment_count ?? 0,
      })),
    };
  },

  /** GET /reports/top-customers — ranked by SUCCESS payment total in range. */
  async getTopCustomers(opts, limit = 10) {
    const params = periodParams(opts);
    params.set("limit", String(limit));
    const res = await apiClient.get(`/reports/top-customers${qs(params)}`, { auth: true });
    const r = res.data?.report ?? {};
    return (r.customers ?? []).map((c) => ({
      customerName: c.customer_name ?? "",
      schemeName: c.scheme_name ?? "",
      status: c.enrollment_status ?? "",
      totalInvested: c.total_invested ?? 0,
      goldWeightGrams: c.gold_weight_grams ?? 0,
    }));
  },

  /** GET /reports/enrollment-summary — status counts, retention, daily trend. */
  async getEnrollmentSummary(opts) {
    const res = await apiClient.get(`/reports/enrollment-summary${qs(periodParams(opts))}`, { auth: true });
    const s = res.data?.summary ?? {};
    return {
      activeCount: s.active_count ?? 0,
      completedCount: s.completed_count ?? 0,
      cancelledCount: s.cancelled_count ?? 0,
      newEnrollmentsInRange: s.new_enrollments_in_range ?? 0,
      retentionRatePercent: s.retention_rate_percent ?? null,
      conversionFunnelPercent: s.conversion_funnel_percent ?? null,
      redemptionVelocityDays: s.redemption_velocity_days ?? null,
      dailyTrend: (s.daily_trend ?? []).map((p) => ({
        label: p.period_label, count: p.new_enrollments ?? 0,
      })),
    };
  },

  /** GET /reports/scheme-summary — per-scheme active enrollments + collected. */
  async getSchemeSummary(opts) {
    const res = await apiClient.get(`/reports/scheme-summary${qs(periodParams(opts))}`, { auth: true });
    const r = res.data?.report ?? {};
    return (r.schemes ?? []).map((s) => ({
      schemeName: s.scheme_name ?? "",
      isActive: !!s.is_active,
      activeEnrollments: s.active_enrollments ?? 0,
      totalCollected: s.total_collected ?? 0,
    }));
  },

  /** GET /reports/gold-rate-trend — daily 24K rate + latest day-over-day %. */
  async getGoldRateTrend(opts) {
    const res = await apiClient.get(`/reports/gold-rate-trend${qs(periodParams(opts))}`, { auth: true });
    const r = res.data?.report ?? {};
    return {
      trend: (r.trend ?? []).map((p) => ({ date: p.date, rate: p.rate_24k ?? 0 })),
      latestChangePercent: r.latest_change_percent ?? null,
    };
  },

  /** GET /reports/export/reports-summary — Top Customers export (csv/excel/markdown). */
  async exportReportsSummary(opts, format = "excel", limit = 10) {
    const params = periodParams(opts);
    params.set("format", format);
    params.set("limit", String(limit));
    const res = await apiClient.get(`/reports/export/reports-summary${qs(params)}`, { auth: true });
    downloadBase64(res.data?.export);
  },

  /** GET /reports/export/analytics-summary — KPI export (csv/excel/markdown). */
  async exportAnalyticsSummary(format = "excel") {
    const params = new URLSearchParams({ format });
    const res = await apiClient.get(`/reports/export/analytics-summary${qs(params)}`, { auth: true });
    downloadBase64(res.data?.export);
  },
};
