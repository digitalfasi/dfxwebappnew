"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import {
  Building2,
  Users,
  TrendingUp,
  ShieldCheck,
  LifeBuoy,
  Server,
  Activity,
  Plus,
  Download,
  ChevronRight,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useRouter } from 'next/navigation';
import { superAdminService, PlatformDashboard, TenantStatus } from '@/services/superAdminService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

const STATUS_COLORS: Record<string, string> = {
  Active: '#10B981',
  Inactive: '#94A3B8',
};

const TENANT_STATUS_BADGE: Record<TenantStatus, 'success' | 'neutral'> = {
  Active: 'success',
  Inactive: 'neutral',
};

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      // "This Year" gives a real month-by-month growth trend (Module 12's
      // adaptive day/month bucketing kicks in for ranges over ~31 days).
      const data = await superAdminService.getPlatformDashboard({ period: 'this_year' });
      setDashboard(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load platform dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // NOTE: this button is pre-existing copy labeled "Export Audit Report" from
  // before Module 14 relabeled the other KPI cards on this page — this page
  // has never displayed audit data. The platform-wide audit trail has its own
  // dedicated export on the Audit Logs page (auditService.exportAuditLogs).
  // Left unrenamed per this module's no-redesign instruction; this exports
  // the dashboard's own summary data, matching what the page actually shows.
  const handleExportSystemAudit = async () => {
    setToastMsg("Exporting platform dashboard summary to Excel...");
    try {
      const file = await superAdminService.exportPlatformDashboard('excel');
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  // KPI cards are relabeled from the original mock where the underlying
  // metric is out of scope for this module (billing/MRR/subscriptions) or
  // has no real backend equivalent at all (infra health monitoring, a
  // support-ticket system, a tenant-approval queue) — repurposed for the
  // real platform-wide metrics this module's objective explicitly lists,
  // reusing the exact same 6-card grid slots. See SESSION_HANDOFF.md Module 14.
  const kpis = dashboard
    ? [
        { title: 'Total Tenants', val: dashboard.totalTenants.toLocaleString('en-IN'), icon: Building2, color: 'text-amber-600 bg-amber-50 border-amber-200' },
        { title: 'Active Tenants', val: dashboard.activeTenants.toLocaleString('en-IN'), icon: ShieldCheck, color: 'text-teal-600 bg-teal-50 border-teal-200' },
        { title: 'Total Customers', val: dashboard.totalCustomers.toLocaleString('en-IN'), icon: Users, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
        { title: 'Total Enrollments', val: dashboard.totalEnrollments.toLocaleString('en-IN'), icon: Activity, color: 'text-blue-600 bg-blue-50 border-blue-200' },
        { title: 'Total Schemes', val: dashboard.totalSchemes.toLocaleString('en-IN'), icon: Layers, color: 'text-amber-600 bg-amber-50 border-amber-200' },
        { title: 'Total Payments', val: dashboard.totalPayments.toLocaleString('en-IN'), icon: LifeBuoy, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
      ]
    : [];

  const growthChartData = (dashboard?.growthTrend ?? []).map((g) => ({ label: g.label, newTenants: g.newTenants }));

  const statusDistribution = (dashboard?.statusBreakdown ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ name: s.status, value: s.count, color: STATUS_COLORS[s.status] ?? '#2C6FBD' }));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
              DFX Solution SaaS Control Plane
            </h1>
            <Badge variant="gold">Super Admin Console</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Multi-tenant SaaS operations, tenant provisioning, platform growth, and audit trail logs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button onClick={() => router.push('/superadmin/tenants')} size="sm" className="bg-[#0B0E23] hover:bg-[#151C3A] text-white font-bold h-9">
            <Plus className="w-4 h-4 mr-1.5 text-gold" /> Manage Tenants
          </Button>
          <Button onClick={handleExportSystemAudit} variant="outline" size="sm" className="h-9">
            <Download className="w-4 h-4 mr-1.5" /> Export Audit Report
          </Button>
        </div>
      </div>

      {/* SYSTEM INFRASTRUCTURE HEALTH STATUS BAR — no real infra-monitoring
         system exists anywhere in the backend; left as pre-existing static
         content, not wired. See SESSION_HANDOFF.md Module 14. */}
      <div className="bg-[#0B0E23] text-white p-3.5 rounded-2xl border border-gold/30 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Platform Infrastructure Health: 99.98% Uptime</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono mt-0.5">
              All 4 Region Data Clusters Operational (Mumbai, Singapore, Frankfurt, US-East)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs flex-wrap">
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">Database API:</span>
            <span className="font-bold text-emerald-400">12ms Latency</span>
          </div>

          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-gold" />
            <span className="text-slate-300">Security Gateways:</span>
            <span className="font-bold text-white">Zero Threats</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadDashboard}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && (
        <>
          {/* EXECUTIVE PLATFORM KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {kpis.map((kpi, idx) => {
              const IconComp = kpi.icon;
              return (
                <Card key={idx} variant="statistic" className="p-3.5 hover:border-gold/50 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-2 rounded-xl ${kpi.color} border shadow-2xs`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{kpi.title}</div>
                  <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-0.5">{kpi.val}</div>
                </Card>
              );
            })}
          </div>

          {/* PLATFORM GROWTH & TENANT STATUS BREAKDOWN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Platform Growth Area Chart (2 Cols) */}
            <Card className="lg:col-span-2 p-5 border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-[#0B0E23]">
                    Platform Growth — New Tenants Onboarded
                  </CardTitle>
                  <p className="text-xs text-slate-500 font-medium">New tenant signups over time</p>
                </div>
                <Badge variant="gold">{dashboard?.range.label ?? 'YTD Growth'}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={growthChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0B0E23" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#0B0E23" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                      <Tooltip
                        formatter={(val: number) => [`${val} Tenants`, 'New Tenants']}
                        contentStyle={{ backgroundColor: '#0B0E23', border: '1px solid rgba(44,111,189,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="newTenants" stroke="#0B0E23" strokeWidth={3} fillOpacity={1} fill="url(#growthGrad)" name="New Tenants" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tenant Status Breakdown (1 Col) */}
            <Card className="p-5 border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-base font-bold text-[#0B0E23]">
                  Tenant Status Breakdown
                </CardTitle>
                <p className="text-xs text-slate-500 font-medium">Active vs Inactive tenants</p>
              </CardHeader>
              <CardContent className="p-0">
                {statusDistribution.length === 0 ? (
                  <div className="h-44 w-full flex items-center justify-center text-xs text-slate-400 font-medium">
                    No tenants yet
                  </div>
                ) : (
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {statusDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => [`${val} Tenants`, 'Count']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="space-y-2 pt-3 border-t border-slate-100">
                  {statusDistribution.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-700">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-[#0B0E23]">{item.value} Tenants</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RECENT TENANT ACTIVITY TABLE */}
          <Card className="p-5 border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">
                  Recent Tenant Activity
                </CardTitle>
                <p className="text-xs text-slate-500 font-medium">Most recently onboarded jewellery businesses</p>
              </div>
              <Button onClick={() => router.push('/superadmin/tenants')} variant="outline" size="sm" className="text-xs font-bold border-slate-200">
                Manage All Tenants <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>

            {(dashboard?.recentTenants.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-6 text-center">No tenants yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Business Name</th>
                      <th className="p-3">Onboarded</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(dashboard?.recentTenants ?? []).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-[#0B0E23] flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-[#0B0E23] text-gold font-bold text-xs flex items-center justify-center shrink-0">
                            {t.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-[#0B0E23]">{t.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">ID: {t.id}</div>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">{new Date(t.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                        <td className="p-3 text-center">
                          <Badge variant={TENANT_STATUS_BADGE[t.status === 'Active' ? 'Active' : 'Inactive']} dot>
                            {t.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => router.push(`/superadmin/tenants/${t.id}`)}
                            className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                            title="View Tenant"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
