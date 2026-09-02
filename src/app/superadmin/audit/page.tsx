"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import {
  ShieldCheck,
  Search,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { auditService, AuditLogItem } from '@/services/auditService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

// Real target_entity values written by AuditRepository.create_log across the
// codebase (see grep in SESSION_HANDOFF.md Module 14) — not the fictional
// "Payments/Subscriptions/Market API" module list from the old mock.
const TARGET_ENTITIES = [
  { value: 'payments', label: 'Payments' },
  { value: 'kyc_records', label: 'KYC Records' },
  { value: 'schemes', label: 'Schemes' },
  { value: 'scheme_enrollments', label: 'Enrollments' },
  { value: 'gold_rates', label: 'Gold Rates' },
  { value: 'user_addresses', label: 'Addresses' },
  { value: 'users', label: 'Profile Updates' },
  { value: 'tenants', label: 'Tenants' },
];

const ACTOR_ROLES = ['SuperAdmin', 'Admin', 'Staff', 'Customer'];

const PAGE_SIZE = 25;

export default function SuperAdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [targetEntityFilter, setTargetEntityFilter] = useState('All');
  const [actorRoleFilter, setActorRoleFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadLogs = async (targetPage: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await auditService.getAuditLogs({
        page: targetPage,
        pageSize: PAGE_SIZE,
        targetEntity: targetEntityFilter === 'All' ? undefined : targetEntityFilter,
        actorRole: actorRoleFilter === 'All' ? undefined : actorRoleFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setLogs(result.logs);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      setPage(result.pagination.page);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEntityFilter, actorRoleFilter, dateFrom, dateTo]);

  // Free-text search only applies within the current page's already-loaded
  // rows — the backend filters listed above (module/role/date) are the real
  // server-side query; there's no full-text search endpoint.
  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    return l.actorName.toLowerCase().includes(q) || l.action.toLowerCase().includes(q);
  });

  const handleExportAudit = async () => {
    setToastMsg("Exporting immutable audit log trail to Excel...");
    try {
      // Same structured filters the list view sends — free-text `search` is
      // intentionally excluded (client-side-only, no backend full-text search).
      const file = await auditService.exportAuditLogs({
        targetEntity: targetEntityFilter === 'All' ? undefined : targetEntityFilter,
        actorRole: actorRoleFilter === 'All' ? undefined : actorRoleFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        format: 'excel',
      });
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Platform Security & Audit Trail Viewer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Immutable log trail of administrative actions across every tenant — KYC decisions, payments, scheme changes, tenant status changes, and more.
          </p>
        </div>

        <Button onClick={handleExportAudit} variant="outline" size="sm" className="h-9">
          <Download className="w-4 h-4 mr-1.5" /> Export Audit Log
        </Button>
      </div>

      {/* SEARCH & FILTERS */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this page by actor or action..."
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <Select value={targetEntityFilter} onChange={(e) => setTargetEntityFilter(e.target.value)} className="w-36">
            <option value="All">All Modules</option>
            {TARGET_ENTITIES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
          <Select value={actorRoleFilter} onChange={(e) => setActorRoleFilter(e.target.value)} className="w-36">
            <option value="All">All Roles</option>
            {ACTOR_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => loadLogs(page)}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && logs.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-7 w-7 text-gold" />}
          title="No audit logs found"
          description="Try adjusting your module, role, or date filters."
        />
      )}

      {!loading && !loadError && logs.length > 0 && (
        <>
          <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">Actor</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Module</th>
                    <th className="p-4">Target ID</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono text-slate-500 text-[11px]">
                        {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-[#0B0E23]">{log.actorName}</div>
                        <div className="text-[10px] text-slate-400">{log.actorRole}</div>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-800">{log.action}</td>
                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-bold text-[10px]">
                          {log.targetEntity}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-500">{log.targetId ?? '—'}</td>
                      <td className="p-4 text-center">
                        {/* Every row here reflects a write that actually committed —
                           failed actions never reach the audit table — so this is
                           always accurate, not a fabricated field. */}
                        <Badge variant="success" className="text-[10px]">Success</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* PAGINATION */}
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
            <span>
              Page {page} of {totalPages} ({totalItems.toLocaleString('en-IN')} total log entries)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => loadLogs(page - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => loadLogs(page + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
