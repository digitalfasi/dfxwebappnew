"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { Search, Filter, ShieldCheck, Check, X } from 'lucide-react';
import { customerService, AdminKYCRecord, KYCStatus } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<KYCStatus, 'success' | 'pending' | 'danger'> = {
  Verified: 'success',
  Pending: 'pending',
  Rejected: 'danger',
};

export default function AdminKYCPage() {
  const [records, setRecords] = useState<AdminKYCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | KYCStatus>('Pending');

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<AdminKYCRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await customerService.getAdminKYCRecords();
      setRecords(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load KYC submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.docNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (record: AdminKYCRecord) => {
    setApprovingId(record.id);
    try {
      await customerService.approveKYC(record.id);
      setToast({ message: `KYC approved for ${record.customerName}`, type: 'success' });
      await loadRecords();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not approve KYC submission',
        type: 'error',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectDialog = (record: AdminKYCRecord) => {
    setRejectTarget(record);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejectError('');

    if (rejectReason.trim().length < 3) {
      setRejectError('Please provide a reason of at least 3 characters');
      return;
    }

    setRejecting(true);
    try {
      await customerService.rejectKYC(rejectTarget.id, rejectReason.trim());
      setToast({ message: `KYC rejected for ${rejectTarget.customerName}`, type: 'success' });
      setRejectTarget(null);
      await loadRecords();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        setRejectError(err.errors[0].message || err.message);
      } else {
        setRejectError(err instanceof ApiError ? err.message : 'Could not reject KYC submission');
      }
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            KYC Review
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Review identity documents submitted by customers and approve or reject them.
          </p>
        </div>
      </div>

      {/* FILTERS TOOLBAR */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name or document number..."
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | KYCStatus)}
            className="w-40"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </Select>
        </div>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadRecords}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && records.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-7 w-7 text-gold" />}
          title="No KYC submissions yet"
          description="Once customers submit an identity document, it will show up here for review."
        />
      )}

      {!loading && !loadError && records.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-7 w-7 text-gold" />}
          title="No matching submissions"
          description="Try adjusting your search or status filter."
        />
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Customer</th>
                  <th className="p-4">Doc Type</th>
                  <th className="p-4">Doc Number</th>
                  <th className="p-4">Submitted</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-[#0B0E23]">{r.customerName}</div>
                      <div className="text-[11px] text-slate-400">{r.customerEmail || r.customerPhone}</div>
                    </td>
                    <td className="p-4 font-semibold">{r.docType}</td>
                    <td className="p-4 font-mono">{r.docNumber}</td>
                    <td className="p-4 text-slate-600">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]" dot>
                        {r.status}
                      </Badge>
                      {r.status === 'Rejected' && r.rejectionReason && (
                        <div className="text-[10px] text-red-500 mt-1 max-w-[160px] mx-auto">{r.rejectionReason}</div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {r.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            isLoading={approvingId === r.id}
                            onClick={() => handleApprove(r)}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => openRejectDialog(r)}
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* REJECT DIALOG */}
      <Dialog
        isOpen={!!rejectTarget}
        onClose={() => !rejecting && setRejectTarget(null)}
        title="Reject KYC Submission"
      >
        <div className="space-y-3.5 text-xs">
          {rejectError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {rejectError}
            </div>
          )}
          <p className="text-slate-500">
            Rejecting <span className="font-bold text-[#0B0E23]">{rejectTarget?.customerName}</span>&apos;s{' '}
            {rejectTarget?.docType} submission. This reason will be shown to the customer.
          </p>
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Reason *</label>
            <Textarea
              error={!!rejectError}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Document image is unclear, please resubmit"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setRejectTarget(null)} disabled={rejecting}>
            Cancel
          </Button>
          <Button size="sm" isLoading={rejecting} onClick={handleReject}>
            Reject Submission
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
