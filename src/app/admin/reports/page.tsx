"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FileSpreadsheet,
  Download,
  TrendingUp,
  Coins,
  Users,
  CreditCard,
  Building2,
  Gem,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  GoldRateTrendReport,
  EnrollmentSummary,
  SchemeSummaryReport,
  TopCustomersReport,
} from '@/services/reportService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

/* ------------------------------------------------------------------ */
/* Shared controls — Business vs Scheme scope + reporting period.      */
/* Both Reports and Analytics keep these two dimensions fully separate */
/* per the DFX report structure.                                       */
/* ------------------------------------------------------------------ */

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

/** Growth-percent pill. `invert` flips good/bad color (a drop in outstanding
 * dues is good). Neutral dash when the backend has no comparison. */
function GrowthBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return (
      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">—</span>
    );
  }
  const isGood = invert ? value <= 0 : value >= 0;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
      isGood ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'
    }`}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

interface Kpi {
  label: string;
  val: string;
  growth: number | null;
  invert: boolean;
  icon: React.ElementType;
  color: string;
}

function KpiCard({ st }: { st: Kpi }) {
  const IconComp = st.icon;
  return (
    <Card variant="statistic" className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-xl ${st.color}`}>
          <IconComp className="w-4 h-4" />
        </div>
        <GrowthBadge value={st.growth} invert={st.invert} />
      </div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{st.label}</div>
      <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-0.5">{st.val}</div>
    </Card>
  );
}

const ENROLLMENT_STATUS_BADGE: Record<string, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

export default function AdminReportsPage() {
  const [scope, setScope] = useState<Scope>('business');
  const [period, setPeriod] = useState<ReportPeriod>('this_year');

  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [goldTrend, setGoldTrend] = useState<GoldRateTrendReport | null>(null);
  const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomersReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadReports = async (p: ReportPeriod) => {
    setLoading(true);
    setLoadError('');
    try {
      const [payments, gold, enrollments, schemes, customers] = await Promise.all([
        reportService.getPaymentSummary({ period: p }),
        reportService.getGoldRateTrend({ period: p }),
        reportService.getEnrollmentSummary({ period: p }),
        reportService.getSchemeSummary({ period: p }),
        reportService.getTopCustomers({ period: p, limit: 10 }),
      ]);
      setPaymentSummary(payments);
      setGoldTrend(gold);
      setEnrollmentSummary(enrollments);
      setSchemeSummary(schemes);
      setTopCustomers(customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(period);
  }, [period]);

  const handleExportScheme = async () => {
    setToastMsg('Exporting scheme customers to Excel...');
    try {
      const file = await reportService.exportReportsSummary({ period, format: 'excel' });
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  const rangeLabel = paymentSummary?.range.label ?? enrollmentSummary?.range.label ?? '';

  /* Business Report KPIs — factual payment/financial measures (server figures). */
  const businessKpis: Kpi[] = paymentSummary
    ? [
        { label: 'Total Revenue', val: formatCurrency(paymentSummary.totalRevenue), growth: paymentSummary.totalRevenueGrowthPercent, invert: false, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
        { label: 'Outstanding Dues', val: formatCurrency(paymentSummary.outstandingDues), growth: paymentSummary.outstandingDuesGrowthPercent, invert: true, icon: CreditCard, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Avg Installment', val: formatCurrency(paymentSummary.avgInstallmentAmount), growth: null, invert: false, icon: Coins, color: 'text-teal-600 bg-teal-50' },
        { label: 'Successful Payments', val: String(paymentSummary.successPaymentCount), growth: null, invert: false, icon: Users, color: 'text-blue-600 bg-blue-50' },
      ]
    : [];

  /* Scheme Report KPIs — factual enrollment counts (server figures). */
  const schemeKpis: Kpi[] = enrollmentSummary
    ? [
        { label: 'Active Passbooks', val: String(enrollmentSummary.activeCount), growth: null, invert: false, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Completed', val: String(enrollmentSummary.completedCount), growth: null, invert: false, icon: Coins, color: 'text-teal-600 bg-teal-50' },
        { label: 'Cancelled', val: String(enrollmentSummary.cancelledCount), growth: null, invert: false, icon: CreditCard, color: 'text-red-600 bg-red-50' },
        { label: 'New Enrolments', val: String(enrollmentSummary.newEnrollmentsInRange), growth: null, invert: false, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
      ]
    : [];

  const revenueChartData = paymentSummary?.monthlyTrend.map((t) => ({ label: t.label, amount: t.totalAmount })) ?? [];
  const goldChartData = goldTrend?.trend.map((t) => ({ date: t.date, rate: t.rate24k })) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Reports</h1>
            <Badge variant="neutral" className="text-[10px]">Factual records</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Point-in-time measures for the selected period. Business and Scheme kept separate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScopeTabs scope={scope} onChange={setScope} />
          <PeriodSelect period={period} onChange={setPeriod} />
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => loadReports(period)}>Retry</Button>
        </Card>
      )}

      {/* ============================= BUSINESS REPORT ============================= */}
      {!loading && !loadError && scope === 'business' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {businessKpis.map((st, i) => <KpiCard key={i} st={st} />)}
          </div>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Revenue Collections</CardTitle>
                <p className="text-xs text-slate-500 font-medium">Scheme payment collections per period</p>
              </div>
              <Badge variant="gold">{rangeLabel}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-64 w-full">
                {revenueChartData.length === 0 ? (
                  <EmptyState title="No collections in this period" description="No successful payments were recorded for the selected period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${v / 100000}L`} />
                      <Tooltip formatter={(val: number) => [formatCurrency(val), 'Collections']} contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Bar dataKey="amount" fill="#0B0E23" radius={[6, 6, 0, 0]} name="Collections" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Gold Rate (24K) Movement</CardTitle>
                <p className="text-xs text-slate-500 font-medium">Recorded bullion rate over the period</p>
              </div>
              <Badge variant="gold">
                <Gem className="w-3 h-3" />
                {goldTrend?.latestChangePercent != null ? `${goldTrend.latestChangePercent > 0 ? '+' : ''}${goldTrend.latestChangePercent.toFixed(2)}%` : '—'}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-56 w-full">
                {goldChartData.length === 0 ? (
                  <EmptyState title="No rate history" description="No gold rate points were recorded for the selected period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={goldChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip formatter={(val: number) => [formatCurrency(val), '24K / g']} contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="rate" stroke="#C6A15B" strokeWidth={3} dot={false} name="24K Rate" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================= SCHEME REPORT ============================= */}
      {!loading && !loadError && scope === 'scheme' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {schemeKpis.map((st, i) => <KpiCard key={i} st={st} />)}
          </div>

          {/* Per-scheme collections table */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-base font-bold text-[#0B0E23]">Scheme Collections</CardTitle>
              <p className="text-xs text-slate-500 font-medium">Active enrolments and collections per scheme</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Scheme</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Active Enrolments</th>
                      <th className="p-3 text-right">Total Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(schemeSummary?.schemes ?? []).map((s) => (
                      <tr key={s.schemeId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-[#0B0E23]">{s.schemeName}</td>
                        <td className="p-3 text-center">
                          <Badge variant={s.isActive ? 'success' : 'inactive'} className="text-[10px]">
                            {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{s.activeEnrollments}</td>
                        <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(s.totalCollected)}</td>
                      </tr>
                    ))}
                    {(schemeSummary?.schemes.length ?? 0) === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-slate-400">No schemes recorded for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Top scheme customers table */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Top Scheme Customers</CardTitle>
                <p className="text-xs text-slate-500 font-medium">Highest total invested and accumulated gold</p>
              </div>
              <Button onClick={handleExportScheme} variant="outline" size="sm" className="text-xs font-bold">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Rank</th>
                      <th className="p-3">Customer Name</th>
                      <th className="p-3">Primary Scheme</th>
                      <th className="p-3 text-right">Total Invested</th>
                      <th className="p-3 text-right">Accumulated Gold</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(topCustomers?.customers ?? []).map((row, idx) => (
                      <tr key={row.enrollmentId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-gold-dark">#{idx + 1}</td>
                        <td className="p-3 font-bold text-[#0B0E23]">{row.customerName}</td>
                        <td className="p-3">{row.schemeName}</td>
                        <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(row.totalInvested)}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-700">{row.goldWeightGrams.toFixed(3)} g</td>
                        <td className="p-3 text-center">
                          <Badge variant={ENROLLMENT_STATUS_BADGE[row.enrollmentStatus] ?? 'neutral'} className="text-[10px]">
                            {row.enrollmentStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(topCustomers?.customers.length ?? 0) === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-slate-400">No successful payments recorded in this period yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
