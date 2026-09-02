"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import {
  Building2,
  Search,
  Plus,
  Download,
  Eye,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { superAdminService, TenantListItem, TenantStatus } from '@/services/superAdminService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';
import { ProvisionTenantWizard } from './_components/ProvisionTenantWizard';

const TENANT_STATUS_BADGE: Record<TenantStatus, 'success' | 'neutral'> = {
  Active: 'success',
  Inactive: 'neutral',
};

export default function SuperAdminTenantsPage() {
  const router = useRouter();

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | TenantStatus>('All');

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<TenantListItem | null>(null);
  const [disabling, setDisabling] = useState(false);

  // Module 29 — "Provision New Business" is now real (see ProvisionTenantWizard).
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadTenants = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await superAdminService.getTenants();
      setTenants(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const filtered = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.adminName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEnable = async (tenant: TenantListItem) => {
    setTogglingId(tenant.id);
    try {
      await superAdminService.enableTenant(tenant.id);
      setToastMsg(`${tenant.name} enabled`);
      await loadTenants();
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Could not enable tenant');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      await superAdminService.disableTenant(disableTarget.id);
      setToastMsg(`${disableTarget.name} disabled`);
      setDisableTarget(null);
      await loadTenants();
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Could not disable tenant');
    } finally {
      setDisabling(false);
    }
  };

  const handleExportTenants = async () => {
    setToastMsg("Exporting tenant database to Excel...");
    try {
      const file = await superAdminService.exportTenants({
        status: statusFilter === 'All' ? undefined : statusFilter,
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

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Jewellery Business Tenants Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage all onboarded jewellery store businesses using the DFX Solution platform.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleExportTenants} variant="outline" size="sm" className="h-9">
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </Button>
          <Button onClick={() => setIsModalOpen(true)} size="sm" className="bg-[#0B0E23] hover:bg-[#151C3A] text-white font-bold h-9">
            <Plus className="w-4 h-4 mr-1.5 text-gold" /> Provision New Business
          </Button>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business name or admin contact..."
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | TenantStatus)} className="w-40">
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </Select>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadTenants}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && tenants.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-7 w-7 text-gold" />}
          title="No tenants yet"
          description="Jewellery businesses onboarded to the platform will appear here."
        />
      )}

      {!loading && !loadError && tenants.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Business Name</th>
                  <th className="p-4">Admin Contact</th>
                  <th className="p-4">City</th>
                  <th className="p-4">SaaS Plan</th>
                  <th className="p-4">Onboarded</th>
                  <th className="p-4">Renewal Date</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-[#0B0E23] flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#0B0E23] text-gold font-bold text-xs flex items-center justify-center shrink-0 border border-gold/30">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-[#0B0E23]">{t.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {t.id}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      {t.adminName ? (
                        <>
                          <div className="font-bold text-[#0B0E23]">{t.adminName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{t.adminPhone || t.adminEmail || '—'}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">No Admin user yet</span>
                      )}
                    </td>
                    {/* No tenant-level address/city field exists in the schema. */}
                    <td className="p-4 text-slate-400">—</td>
                    {/* Subscription/billing is out of scope for this module. */}
                    <td className="p-4 text-slate-400">—</td>
                    <td className="p-4 text-slate-500">{new Date(t.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 text-slate-400">—</td>
                    <td className="p-4 text-center">
                      <Badge variant={TENANT_STATUS_BADGE[t.status]} dot>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => router.push(`/superadmin/tenants/${t.id}`)}
                          className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                          title="View Tenant Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {t.status === 'Active' ? (
                          <button
                            onClick={() => setDisableTarget(t)}
                            disabled={togglingId === t.id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Disable Tenant"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEnable(t)}
                            disabled={togglingId === t.id}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Enable Tenant"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* DISABLE CONFIRMATION DIALOG */}
      <Dialog
        isOpen={!!disableTarget}
        onClose={() => !disabling && setDisableTarget(null)}
        title="Disable Tenant"
      >
        <p className="text-xs text-slate-600">
          Disable <span className="font-bold text-[#0B0E23]">{disableTarget?.name}</span>? This sets the tenant&apos;s
          status to Inactive and hides it from public store selection during customer signup. It does <strong>not</strong> immediately
          sign out or block existing logged-in users of this tenant.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDisableTarget(null)} disabled={disabling}>
            Cancel
          </Button>
          <Button size="sm" isLoading={disabling} onClick={handleConfirmDisable} className="bg-red-600 hover:bg-red-700 text-white">
            Disable Tenant
          </Button>
        </DialogFooter>
      </Dialog>

      {/* PROVISION TENANT WIZARD — Module 29, real production provisioning */}
      <ProvisionTenantWizard
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProvisioned={() => {
          setToastMsg('Tenant provisioned successfully');
          loadTenants();
        }}
      />

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
