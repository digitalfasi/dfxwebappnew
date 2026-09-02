"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TrendingUp,
  Share2,
  MapPin,
  Home,
  Bell,
  Globe,
  LogOut,
  ShieldCheck,
  ChevronRight,
  Pencil,
  X,
  Gem,
  Receipt,
} from 'lucide-react';
import { getInitials } from '@/lib/formatters';
import { Toast } from '@/components/ui/toast';
import { User } from '@/types';
import { customerService, CustomerProfile, UpdateProfileData } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

const KYC_BADGE_VARIANT: Record<User['kycStatus'], 'success' | 'pending' | 'danger'> = {
  Verified: 'success',
  Pending: 'pending',
  Rejected: 'danger',
};

type EditForm = { name: string; email: string; phone: string };
type FieldErrors = Partial<Record<keyof EditForm, string>>;

export default function CustomerProfilePage() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  const { branding } = useTenant();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({ name: '', email: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    setLoadError('');
    customerService
      .getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        // Cached auth-context user still renders below, so this is a banner, not a blocking state.
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not refresh profile details.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const displayName = profile?.name || user?.name || 'Customer';
  const displayEmail = profile?.email || '';
  const displayPhone = profile?.phone || user?.phone || '';
  const kycStatus = profile?.kycStatus ?? user?.kycStatus ?? 'Pending';
  const memberSince = profile?.memberSince || user?.memberSince || '—';

  const startEditing = () => {
    setForm({ name: displayName, email: displayEmail, phone: displayPhone });
    setFieldErrors({});
    setFormError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setFieldErrors({});
    setFormError('');
  };

  const handleSave = async () => {
    setFieldErrors({});
    setFormError('');

    // Only send fields that actually changed.
    const payload: UpdateProfileData = {};
    if (form.name.trim() !== displayName) payload.name = form.name.trim();
    if (form.email.trim() !== displayEmail) payload.email = form.email.trim();
    if (form.phone.trim() !== displayPhone) payload.phone = form.phone.trim();

    setSaving(true);
    try {
      const updated = await customerService.updateProfile(payload);
      setProfile(updated);
      setEditing(false);
      setToast({ message: 'Profile updated successfully', type: 'success' });

      if (user) {
        updateUser({
          ...user,
          name: updated.name,
          email: updated.email || undefined,
          phone: updated.phone,
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        const nextFieldErrors: FieldErrors = {};
        let bannerMessage = '';
        for (const e of err.errors) {
          if (e.field && (e.field === 'name' || e.field === 'email' || e.field === 'phone')) {
            nextFieldErrors[e.field] = e.message || 'Invalid value';
          } else {
            bannerMessage = e.message || err.message;
          }
        }
        setFieldErrors(nextFieldErrors);
        setFormError(Object.keys(nextFieldErrors).length === 0 ? (bannerMessage || err.message) : '');
      } else {
        const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        setFormError(message);
      }
      setToast({ message: 'Could not save changes', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const menuItems = [
    { label: 'My Enrollments', icon: Gem, path: '/customer/enrollments' },
    { label: 'Payment History', icon: Receipt, path: '/customer/payments' },
    { label: 'KYC Verification', icon: ShieldCheck, path: '/customer/kyc' },
    { label: 'My Addresses', icon: Home, path: '/customer/addresses' },
    { label: 'Live Bullion Rates', icon: TrendingUp, path: '/customer/rates' },
    { label: 'Refer & Earn Rewards', icon: Share2, path: '/customer/refer' },
    { label: 'Branch Locator', icon: MapPin, path: '/customer/branch' },
    { label: 'Notification Preferences', icon: Bell, action: () => setToast({ message: 'SMS & Push notifications enabled', type: 'success' }) },
    { label: 'Language Settings (English)', icon: Globe, action: () => setToast({ message: 'Selected English (US)', type: 'success' }) },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Load error banner (non-blocking — cached profile data still renders below) */}
      {loadError && !loadingProfile && (
        <Card className="p-3 border-red-200 bg-red-50/60 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => setRetryCount((c) => c + 1)}>
            Retry
          </Button>
        </Card>
      )}

      {/* Profile Card */}
      <Card dark className="p-5">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-gold-dim text-gold-light border-2 border-gold flex items-center justify-center font-display font-bold text-xl shrink-0">
                  {getInitials(displayName)}
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg text-white">{displayName}</h2>
                  <p className="text-xs text-[#C7CDE8] font-mono">+91 {displayPhone}</p>
                  {displayEmail && (
                    <p className="text-xs text-[#C7CDE8]">{displayEmail}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={KYC_BADGE_VARIANT[kycStatus]} className="text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> KYC {kycStatus}
                    </Badge>
                    <span className="text-[10px] text-[#9AA3C7]">Member since {memberSince}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={startEditing}
                disabled={loadingProfile}
                aria-label="Edit profile"
                className="shrink-0 w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-gold-light flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-sm text-white">Edit Profile</h2>
              <button
                onClick={cancelEditing}
                aria-label="Cancel editing"
                className="w-8 h-8 rounded-lg text-[#C7CDE8] hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div role="alert" className="text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#C7CDE8] uppercase tracking-wider block">Name</label>
              <Input
                dark
                error={!!fieldErrors.name}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
              {fieldErrors.name && <p className="text-[11px] text-red-300 font-medium">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#C7CDE8] uppercase tracking-wider block">Email</label>
              <Input
                dark
                type="email"
                error={!!fieldErrors.email}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@example.com"
              />
              {fieldErrors.email && <p className="text-[11px] text-red-300 font-medium">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#C7CDE8] uppercase tracking-wider block">Phone</label>
              <Input
                dark
                type="tel"
                error={!!fieldErrors.phone}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="9876543210"
                className="font-mono"
              />
              {fieldErrors.phone && <p className="text-[11px] text-red-300 font-medium">{fieldErrors.phone}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" className="flex-1" isLoading={saving} onClick={handleSave}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Menu List */}
      <Card className="p-2 border-slate-line divide-y divide-slate-line">
        {menuItems.map((m, idx) => {
          const Icon = m.icon;
          return (
            <button
              key={idx}
              onClick={() => (m.path ? router.push(m.path) : m.action && m.action())}
              className="w-full flex items-center justify-between p-3 text-xs font-bold text-ink hover:bg-cream transition-colors rounded-xl"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-gold shrink-0" />
                <span>{m.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-muted" />
            </button>
          );
        })}
      </Card>

      {/* Logout CTA */}
      <Button
        onClick={handleLogout}
        variant="danger"
        size="lg"
        className="w-full"
      >
        <LogOut className="h-4 w-4 mr-2" /> Log Out
      </Button>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
