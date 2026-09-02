"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Store,
  MapPin,
  Phone,
  UserCheck,
  Plus,
} from 'lucide-react';
import { customerService, Branch } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadBranches = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await customerService.getBranches();
      setBranches(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  // No branch-management backend exists yet (create/edit/staff-roster/per-branch
  // sales) — only the read-only branch list is real (reused from the
  // customer-facing branch locator endpoint). These actions are honestly
  // unavailable rather than faked. See SESSION_HANDOFF.md Module 17.
  const notYetAvailable = () => setToastMsg('Branch management actions are not available yet.');

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Multi-Branch Store Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage jewellery store locations, branch managers, daily sales KPIs, and staff assignments.
          </p>
        </div>

        <Button onClick={notYetAvailable} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9 transition-all duration-200">
          <Plus className="w-4 h-4 mr-1.5" /> Register New Branch
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && <ErrorState message={loadError} onRetry={loadBranches} />}

      {!loading && !loadError && branches.length === 0 && (
        <EmptyState
          icon={<Store className="h-7 w-7 text-gold" />}
          title="No branches yet"
          description="No store branches have been added for your tenant yet."
        />
      )}

      {!loading && !loadError && branches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {branches.map((b) => (
            <Card
              key={b.id}
              className="p-6 bg-white border-slate-200 shadow-xs hover:border-gold/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gold/15 text-gold-dark flex items-center justify-center font-bold border border-gold/30 shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-[#0B0E23]">{b.name}</h3>
                    </div>
                  </div>
                  <Badge variant={b.isActive ? 'success' : 'inactive'} className="text-[10px]">
                    {b.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 my-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-tight">{b.address}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono font-bold text-[#0B0E23]">{b.phone}</span>
                  </div>
                </div>

                {/* No branch-level staff/customer/sales attribution exists in the
                    backend (see SESSION_HANDOFF.md §8/§17) — rendered honestly
                    as "not available" rather than fabricated. */}
                <div className="grid grid-cols-3 gap-2 text-xs text-center border-t border-b border-slate-100 py-3 mb-4">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Enroled Members</span>
                    <span className="font-display font-extrabold text-sm text-slate-300">—</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Showroom Items</span>
                    <span className="font-display font-extrabold text-sm text-slate-300">—</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-bold uppercase">Today Sales</span>
                    <span className="font-display font-extrabold text-sm text-slate-300">—</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={notYetAvailable}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs font-bold border-slate-200 transition-all duration-200"
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Manage Branch
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
