"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Sparkles,
  Zap,
  Download,
  Coins,
  Building2,
  Target,
  AlertTriangle,
  Minus,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import {
  reportService,
  ReportPeriod,
  PaymentSummary,
  EnrollmentSummary,
  SchemeSummaryReport,
} from '@/services/reportService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

type Scope = 'business' | 'scheme';

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
];

function ScopeTabs({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  const tabs: { value: Scope; label: string; icon: React.ElementType }[] = [
    { value: 'business', label: 'Business', icon: Building2 },
    { value: 'scheme', label: 'Scheme', icon: Coins },
  ];
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = scope === t.value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              active ? 'bg-white text-[#0B0E23] shadow-xs border border-slate-200' : 'text-slate-500 hover:text-[#0B0E23]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodSelect({ period, onChange }: { period: ReportPeriod; onChange: (p: ReportPeriod) => void }) {
  return (
    <select
      value={period}
      onChange={(e) => onChange(e.target.value as ReportPeriod)}
      className="h-9 rounded-lg border border-slate-200 bg-[#F7F8FC] px-3 text-xs font-bold text-[#0B0E23] focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
    >
      {PERIOD_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface KpiTile {
  label: string;
  val: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}

function KpiCard({ st }: { st: KpiTile }) {
  const IconComp = st.icon;
  return (
    <Card variant="statistic" className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-xl ${st.color}`}>
          <IconComp className="w-4 h-4" />
        </div>
      </div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{st.label}</div>
      <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-0.5">{st.val}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-1">{st.desc}</div>
    </Card>
  );
}

type InsightTone = 'good' | 'bad' | 'neutral';

/** Interpretive card. All interpretation is derived strictly from
 * server-provided figures (growth %, counts). No client-side recomputation
 * of financial/analytics values. */
function InsightCard({ tone, title, body }: { tone: InsightTone; title: string; body: string }) {
  const map = {
    good: { icon: TrendingUp, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    bad: { icon: AlertTriangle, cls: 'text-red-700 bg-red-50 border-red-200' },
    neutral: { icon: Minus, cls: 'text-slate-600 bg-slate-50 border-slate-200' },
  }[tone];
  const Icon = map.icon;
  return (
    <div className={`flex gap-3 p-4 rounded-2xl border ${map.cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <div className="text-xs font-bold">{title}</div>
        <div className="text-[11px] font-medium opacity-90 mt-0.5">{body}</div>
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [scope, setScope] = useState<Scope>('business');
  const [period, setPeriod] = useState<ReportPeriod>('this_month');

  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadAnalytics = async (p: ReportPeriod) => {
    setLoading(true);
    setLoadError('');
    try {
      const [payments, enrollments, schemes] = await Promise.all([
        reportService.getPaymentSummary({ period: p }),
        reportService.getEnrollmentSummary({ period: p }),
        reportService.getSchemeSummary({ period: p }),
      ]);
      setPaymentSummary(payments);
      setEnrollmentSummary(enrollments);
      setSchemeSummary(schemes);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(period);
  }, [period]);

  const handleExport = async () => {
    setToastMsg('Exporting analytics summary to Excel...');
    try {
      const file = await reportService.exportAnalyticsSummary('excel');
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  const rangeLabel = paymentSummary?.range.label ?? enrollmentSummary?.range.label ?? '';

  /* ---- Business analytics: interpret server growth figures ---- */
  const revGrowth = paymentSummary?.totalRevenueGrowthPercent ?? null;
  const dueGrowth = paymentSummary?.outstandingDuesGrowthPercent ?? null;
  // Peak month is a presentation pick over the server-provided series (not a
  // recomputed figure).
  const peakMonth = paymentSummary && paymentSummary.monthlyTrend.length
    ? paymentSummary.monthlyTrend.reduce((a, b) => (b.totalAmount > a.totalAmount ? b : a))
    : null;

  const businessKpis: KpiTile[] = paymentSummary
    ? [
        { label: 'Revenue Growth', val: revGrowth != null ? `${revGrowth > 0 ? '+' : ''}${revGrowth.toFixed(1)}%` : '—', desc: 'vs previous period', icon: revGrowth != null && revGrowth < 0 ? TrendingDown : TrendingUp, color: 'text-amber-600 bg-amber-50' },
        { label: 'Avg Installment', val: formatCurrency(paymentSummary.avgInstallmentAmount), desc: 'Per successful payment', icon: Coins, color: 'text-teal-600 bg-teal-50' },
        { label: 'Collection Success', val: `${paymentSummary.successPaymentCount}`, desc: `${paymentSummary.pendingPaymentCount} pending`, icon: Zap, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Outstanding Trend', val: dueGrowth != null ? `${dueGrowth > 0 ? '+' : ''}${dueGrowth.toFixed(1)}%` : '—', desc: 'Dues vs previous period', icon: dueGrowth != null && dueGrowth > 0 ? TrendingUp : TrendingDown, color: 'text-blue-600 bg-blue-50' },
      ]
    : [];

  const revenueTrend = paymentSummary?.monthlyTrend.map((t) => ({ label: t.label, amount: t.totalAmount })) ?? [];

  /* ---- Scheme analytics ---- */
  const retention = enrollmentSummary?.retentionRatePercent ?? null;
  const topSchemes = schemeSummary
    ? [...schemeSummary.schemes].sort((a, b) => b.activeEnrollments - a.activeEnrollments).slice(0, 5)
    : [];

  const schemeKpis: KpiTile[] = enrollmentSummary
    ? [
        { label: 'Scheme Retention', val: retention != null ? `${retention}%` : '—', desc: 'Active + Completed vs Cancelled', icon: Sparkles, color: 'text-teal-600 bg-teal-50' },
        { label: 'New Enrolments', val: String(enrollmentSummary.newEnrollmentsInRange), desc: 'In selected period', icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
        { label: 'Conversion Funnel', val: enrollmentSummary.conversionFunnelPercent != null ? `${enrollmentSummary.conversionFunnelPercent}%` : '—', desc: enrollmentSummary.conversionFunnelPercent != null ? 'Leads to enrolment' : 'No lead tracking yet', icon: Target, color: 'text-blue-600 bg-blue-50' },
        { label: 'Redemption Velocity', val: enrollmentSummary.redemptionVelocityDays != null ? `${enrollmentSummary.redemptionVelocityDays} Days` : '—', desc: enrollmentSummary.redemptionVelocityDays != null ? 'Avg time to purchase' : 'No redemption tracking yet', icon: Users, color: 'text-emerald-600 bg-emerald-50' },
      ]
    : [];

  const enrolTrend = enrollmentSummary?.dailyTrend.map((t) => ({ label: t.label, enrolments: t.newEnrollments })) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Analytics</h1>
            <Badge variant="gold" className="text-[10px]">Trends & interpretation</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Directional read of the underlying report data — strongest areas, risks and priorities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScopeTabs scope={scope} onChange={setScope} />
          <PeriodSelect period={period} onChange={setPeriod} />
          <Button onClick={handleExport} variant="outline" size="sm" className="h-9">
            <Download className="w-4 h-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => loadAnalytics(period)}>Retry</Button>
        </Card>
      )}

      {/* ============================= BUSINESS ANALYTICS ============================= */}
      {!loading && !loadError && scope === 'business' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {businessKpis.map((st, i) => <KpiCard key={i} st={st} />)}
          </div>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Revenue Trend</CardTitle>
                <p className="text-xs text-slate-500 font-medium">Collections trajectory across the period</p>
              </div>
              <Badge variant="gold">{rangeLabel}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-64 w-full">
                {revenueTrend.length === 0 ? (
                  <EmptyState title="No trend data" description="No collections were recorded for the selected period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${v / 100000}L`} />
                      <Tooltip formatter={(val: number) => [formatCurrency(val), 'Collections']} contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="amount" stroke="#2C6FBD" strokeWidth={3} dot={false} name="Collections" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base font-bold text-[#0B0E23]">Interpretation</CardTitle>
              <p className="text-xs text-slate-500 font-medium">Derived from the period&apos;s recorded figures</p>
            </CardHeader>
            <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InsightCard
                tone={revGrowth == null ? 'neutral' : revGrowth >= 0 ? 'good' : 'bad'}
                title={revGrowth == null ? 'Revenue trend: no comparison' : revGrowth >= 0 ? 'Revenue is growing' : 'Revenue is declining'}
                body={revGrowth == null ? 'No prior-period baseline to compare against.' : `Collections moved ${revGrowth > 0 ? '+' : ''}${revGrowth.toFixed(1)}% versus the previous period.`}
              />
              <InsightCard
                tone={dueGrowth == null ? 'neutral' : dueGrowth <= 0 ? 'good' : 'bad'}
                title={dueGrowth == null ? 'Outstanding dues: no comparison' : dueGrowth <= 0 ? 'Dues under control' : 'Dues rising — prioritise collections'}
                body={dueGrowth == null ? 'No prior-period baseline to compare against.' : `Outstanding dues moved ${dueGrowth > 0 ? '+' : ''}${dueGrowth.toFixed(1)}% versus the previous period.`}
              />
              {peakMonth && (
                <InsightCard
                  tone="neutral"
                  title={`Strongest period: ${peakMonth.label}`}
                  body={`Highest recorded collections at ${formatCurrency(peakMonth.totalAmount)}.`}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================= SCHEME ANALYTICS ============================= */}
      {!loading && !loadError && scope === 'scheme' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {schemeKpis.map((st, i) => <KpiCard key={i} st={st} />)}
          </div>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Enrolment Trend</CardTitle>
                <p className="text-xs text-slate-500 font-medium">New scheme enrolments across the period</p>
              </div>
              <Badge variant="gold">{rangeLabel}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-64 w-full">
                {enrolTrend.length === 0 ? (
                  <EmptyState title="No enrolment data" description="No enrolments were recorded for the selected period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enrolTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="enrolments" stroke="#2C6FBD" strokeWidth={3} name="New Enrolments" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top enrolling schemes */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base font-bold text-[#0B0E23]">Top Enrolling Schemes</CardTitle>
              <p className="text-xs text-slate-500 font-medium">Ranked by active enrolments in the period</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-56 w-full">
                {topSchemes.length === 0 ? (
                  <EmptyState title="No scheme activity" description="No schemes had active enrolments in the selected period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSchemes} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis type="category" dataKey="schemeName" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#334155' }} />
                      <Tooltip formatter={(val: number) => [val, 'Active Enrolments']} contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Bar dataKey="activeEnrollments" fill="#C6A15B" radius={[0, 6, 6, 0]} name="Active Enrolments" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base font-bold text-[#0B0E23]">Interpretation</CardTitle>
              <p className="text-xs text-slate-500 font-medium">Derived from the period&apos;s recorded figures</p>
            </CardHeader>
            <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InsightCard
                tone={retention == null ? 'neutral' : retention >= 70 ? 'good' : 'bad'}
                title={retention == null ? 'Retention: no data' : retention >= 70 ? 'Healthy scheme retention' : 'Retention needs attention'}
                body={retention == null ? 'Not enough enrolment history to compute retention.' : `${retention}% of enrolments are active or completed rather than cancelled.`}
              />
              {topSchemes[0] && (
                <InsightCard
                  tone="neutral"
                  title={`Strongest scheme: ${topSchemes[0].schemeName}`}
                  body={`Leads with ${topSchemes[0].activeEnrollments} active enrolments and ${formatCurrency(topSchemes[0].totalCollected)} collected.`}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
