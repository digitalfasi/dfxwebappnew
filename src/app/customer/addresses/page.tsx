"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Phone, Pencil, Trash2, Star, Plus } from 'lucide-react';
import { customerService, Address, AddressFormData, AddressType } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

const EMPTY_FORM: AddressFormData = {
  name: '',
  phone: '',
  house: '',
  street: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  type: 'Home',
};

type FieldErrors = Partial<Record<keyof AddressFormData, string>>;

export default function AddressesPage() {
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadAddresses = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await customerService.getAddresses();
      setAddresses(list);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load addresses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (addr: Address) => {
    setEditingId(addr.id);
    setForm({
      name: addr.name,
      phone: addr.phone,
      house: addr.house,
      street: addr.street,
      area: addr.area,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      type: addr.type,
    });
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const applyApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.errors.length > 0) {
      const next: FieldErrors = {};
      let banner = '';
      for (const e of err.errors) {
        const field = e.field as keyof AddressFormData | undefined;
        if (field && field in EMPTY_FORM) {
          next[field] = e.message || 'Invalid value';
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
        await customerService.updateAddress(editingId, form);
        setToast({ message: 'Address updated successfully', type: 'success' });
      } else {
        await customerService.addAddress(form);
        setToast({ message: 'Address added successfully', type: 'success' });
      }
      setDialogOpen(false);
      await loadAddresses();
    } catch (err) {
      applyApiError(err, 'Could not save address. Please try again.');
      setToast({ message: 'Could not save address', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await customerService.deleteAddress(deleteTarget.id);
      setToast({ message: 'Address deleted', type: 'success' });
      setDeleteTarget(null);
      await loadAddresses();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not delete address',
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (addr: Address) => {
    if (addr.isDefault) return;
    setSettingDefaultId(addr.id);
    try {
      await customerService.setDefaultAddress(addr.id);
      setToast({ message: `${addr.name}'s address set as default`, type: 'success' });
      await loadAddresses();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not set default address',
        type: 'error',
      });
    } finally {
      setSettingDefaultId(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/customer/profile')}
            className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display font-bold text-base text-ink">
            My Addresses
          </h1>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add New
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadAddresses}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadError && addresses.length === 0 && (
        <EmptyState
          icon={<MapPin className="h-7 w-7 text-gold" />}
          title="No saved addresses"
          description="Add a shipping address to speed up checkout and appointments."
          actionLabel="Add Address"
          onAction={openAddDialog}
        />
      )}

      {/* Address list */}
      {!loading && !loadError && addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <Card key={addr.id} className="p-4 border-slate-line bg-white shadow-card">
              <CardContent className="p-0 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-extrabold text-sm text-ink">{addr.name}</h3>
                    <Badge variant="gold" className="text-[10px]">{addr.type}</Badge>
                    {addr.isDefault && (
                      <Badge variant="success" className="text-[10px]">
                        <Star className="h-3 w-3" /> Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditDialog(addr)}
                      aria-label="Edit address"
                      className="w-7 h-7 rounded-lg text-slate-muted hover:bg-cream hover:text-gold flex items-center justify-center transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(addr)}
                      aria-label="Delete address"
                      className="w-7 h-7 rounded-lg text-slate-muted hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-muted flex items-center gap-1.5 font-mono">
                  <Phone className="h-3 w-3 shrink-0" /> +91 {addr.phone}
                </p>

                <p className="text-xs text-slate-muted leading-relaxed">
                  {addr.house}, {addr.street}, {addr.area}, {addr.city}, {addr.state} - {addr.pincode}
                </p>

                {!addr.isDefault && (
                  <div className="pt-2 border-t border-slate-line">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      isLoading={settingDefaultId === addr.id}
                      onClick={() => handleSetDefault(addr)}
                    >
                      Set as Default
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        title={editingId ? 'Edit Address' : 'Add New Address'}
      >
        <div className="space-y-3">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Full Name</label>
              <Input
                error={!!fieldErrors.name}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              {fieldErrors.name && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.name}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Phone</label>
              <Input
                type="tel"
                className="font-mono"
                error={!!fieldErrors.phone}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              {fieldErrors.phone && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.phone}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">House / Flat No.</label>
            <Input
              error={!!fieldErrors.house}
              value={form.house}
              onChange={(e) => setForm((f) => ({ ...f, house: e.target.value }))}
            />
            {fieldErrors.house && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.house}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Street</label>
            <Input
              error={!!fieldErrors.street}
              value={form.street}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            />
            {fieldErrors.street && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.street}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Area</label>
            <Input
              error={!!fieldErrors.area}
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            />
            {fieldErrors.area && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.area}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">City</label>
              <Input
                error={!!fieldErrors.city}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
              {fieldErrors.city && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.city}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">State</label>
              <Input
                error={!!fieldErrors.state}
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
              {fieldErrors.state && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.state}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Pincode</label>
              <Input
                className="font-mono"
                error={!!fieldErrors.pincode}
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
              />
              {fieldErrors.pincode && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.pincode}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Type</label>
              <Select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AddressType }))}
              >
                <option value="Home">Home</option>
                <option value="Work">Work</option>
                <option value="Other">Other</option>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={saving} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Add Address'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Address?"
      >
        <p className="text-xs text-slate-600 leading-relaxed">
          Are you sure you want to delete <span className="font-bold">{deleteTarget?.name}</span>&apos;s address
          {deleteTarget?.isDefault ? ' — since this is your default address, another one will automatically become the default.' : ''}?
          This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" isLoading={deleting} onClick={confirmDelete}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
