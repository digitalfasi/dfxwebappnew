"use client";

import React, { useEffect, useState } from 'react';
import { schemeService, AdminScheme, SchemeFormData } from '@/services/schemeService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Ban, RotateCcw, Coins } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { ApiError } from '@/lib/apiClient';

const EMPTY_FORM: SchemeFormData = {
  name: '',
  description: '',
  monthlyAmount: 1000,
  durationMonths: 11,
  bonusDescription: '',
};

type FieldErrors = Partial<Record<keyof SchemeFormData, string>>;

export default function AdminSchemesPage() {
  const [schemes, setSchemes] = useState<AdminScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SchemeFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadSchemes = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await schemeService.getAdminSchemes();
      setSchemes(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load schemes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemes();
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (scheme: AdminScheme) => {
    setEditingId(scheme.id);
    setForm({
      name: scheme.name,
      description: scheme.description,
      monthlyAmount: scheme.monthlyAmount,
      durationMonths: scheme.durationMonths,
      bonusDescription: scheme.bonusDescription,
    });
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const applyApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.errors.length > 0) {
      const next: FieldErrors = {};
      let banner = '';
      const fieldMap: Record<string, keyof SchemeFormData> = {
        name: 'name',
        description: 'description',
        monthly_amount: 'monthlyAmount',
        duration_months: 'durationMonths',
        bonus_description: 'bonusDescription',
      };
      for (const e of err.errors) {
        const mapped = e.field ? fieldMap[e.field] : undefined;
        if (mapped) {
          next[mapped] = e.message || 'Invalid value';
        } else {
          banner = e.message || err.message;
        }
      }
      setFieldErrors(next);
      setFormError(Object.keys(next).length === 0 ? (banner || err.message) : '');
    } else {
      setFormError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const handleSave = async () => {
    setFieldErrors({});
    setFormError('');
    setSaving(true);
    try {
      if (editingId) {
        await schemeService.updateScheme(editingId, form);
        setToast({ message: 'Scheme updated successfully', type: 'success' });
      } else {
        await schemeService.createScheme(form);
        setToast({ message: 'Scheme created successfully', type: 'success' });
      }
      setDialogOpen(false);
      await loadSchemes();
    } catch (err) {
      applyApiError(err, 'Could not save scheme. Please try again.');
      setToast({ message: 'Could not save scheme', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (scheme: AdminScheme) => {
    setTogglingId(scheme.id);
    try {
      if (scheme.isActive) {
        await schemeService.deactivateScheme(scheme.id);
        setToast({ message: `"${scheme.name}" deactivated`, type: 'success' });
      } else {
        await schemeService.updateScheme(scheme.id, { isActive: true });
        setToast({ message: `"${scheme.name}" reactivated`, type: 'success' });
      }
      await loadSchemes();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not update scheme status',
        type: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Gold Saving Schemes Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Create and manage the savings scheme templates customers can join.
          </p>
        </div>

        <Button onClick={openCreateDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
          <Plus className="w-4 h-4 mr-1.5" /> Create Scheme
        </Button>
      </div>

      {/* Loading state */}
      {loading && <Skeleton className="h-64 w-full" />}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadSchemes}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadError && schemes.length === 0 && (
        <EmptyState
          icon={<Coins className="h-7 w-7 text-gold" />}
          title="No schemes yet"
          description="Create your first gold savings scheme template for customers to join."
          actionLabel="Create Scheme"
          onAction={openCreateDialog}
        />
      )}

      {/* SCHEMES TABLE */}
      {!loading && !loadError && schemes.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Scheme Name</th>
                  <th className="p-4 text-center">Duration</th>
                  <th className="p-4 text-right">Monthly Amount</th>
                  <th className="p-4 text-center">Bonus</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {schemes.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-[#0B0E23] flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold-dark font-bold text-xs flex items-center justify-center shrink-0 border border-gold/30">
                        <Coins className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-[#0B0E23]">{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {s.id}</div>
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-[#0B0E23]">{s.durationMonths} Months</td>
                    <td className="p-4 text-right font-mono font-bold text-[#0B0E23]">
                      {formatCurrency(s.monthlyAmount)}
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-gold/15 text-gold-dark px-2.5 py-1 rounded-md font-bold text-[11px] border border-gold/30">
                        {s.bonusDescription || 'None'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant={s.isActive ? 'success' : 'danger'} dot>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditDialog(s)}
                          className="p-1.5 text-slate-400 hover:text-[#0B0E23] hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Scheme"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(s)}
                          disabled={togglingId === s.id}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title={s.isActive ? 'Deactivate Scheme' : 'Reactivate Scheme'}
                        >
                          {s.isActive ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* CREATE / EDIT SCHEME DIALOG */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        title={editingId ? 'Edit Scheme' : 'Create New Gold Savings Scheme'}
      >
        <div className="space-y-3.5 text-xs">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Scheme Title *</label>
            <Input
              error={!!fieldErrors.name}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Festival Special Plan"
            />
            {fieldErrors.name && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Description</label>
            <Input
              error={!!fieldErrors.description}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description shown to customers"
            />
            {fieldErrors.description && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Duration (Months) *</label>
              <Input
                type="number"
                error={!!fieldErrors.durationMonths}
                value={form.durationMonths}
                onChange={(e) => setForm((f) => ({ ...f, durationMonths: Number(e.target.value) }))}
              />
              {fieldErrors.durationMonths && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.durationMonths}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Monthly Amount (₹) *</label>
              <Input
                type="number"
                error={!!fieldErrors.monthlyAmount}
                value={form.monthlyAmount}
                onChange={(e) => setForm((f) => ({ ...f, monthlyAmount: Number(e.target.value) }))}
              />
              {fieldErrors.monthlyAmount && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.monthlyAmount}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Bonus Description</label>
            <Input
              error={!!fieldErrors.bonusDescription}
              value={form.bonusDescription}
              onChange={(e) => setForm((f) => ({ ...f, bonusDescription: e.target.value }))}
              placeholder="e.g. 8% bonus on maturity"
            />
            {fieldErrors.bonusDescription && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.bonusDescription}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={saving} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Create Scheme'}
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
