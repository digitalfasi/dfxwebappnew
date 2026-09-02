"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { Gem, Pencil, X, Clock } from 'lucide-react';
import { goldRateService, GoldRate } from '@/services/goldRateService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/formatters';

export default function AdminGoldRatePage() {
  const [rate, setRate] = useState<GoldRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editing, setEditing] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadRate = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await goldRateService.getTodayRateAdmin();
      setRate(r);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load today’s gold rate.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRate();
  }, []);

  const startEditing = () => {
    setRateInput(rate ? String(rate.rate24k) : '');
    setFieldError('');
    setFormError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setFieldError('');
    setFormError('');
  };

  const handleSave = async () => {
    setFieldError('');
    setFormError('');

    const parsed = parseFloat(rateInput);
    if (!rateInput.trim() || isNaN(parsed) || parsed <= 0) {
      setFieldError('Enter a valid rate greater than ₹0');
      return;
    }

    setSaving(true);
    try {
      const updated = rate
        ? await goldRateService.updateTodayRate(parsed)
        : await goldRateService.createTodayRate(parsed);
      setRate(updated);
      setEditing(false);
      setToast({ message: `Today's 24K gold rate ${rate ? 'updated' : 'set'} successfully`, type: 'success' });
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        const fieldErr = err.errors.find((e) => e.field === 'rate_24k');
        if (fieldErr) {
          setFieldError(fieldErr.message || 'Invalid rate');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not save the gold rate. Please try again.');
      }
      setToast({ message: 'Could not save gold rate', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Gold Rate Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Set and update today&apos;s 24 Karat gold rate for your store. Customers see this rate immediately.
          </p>
        </div>
      </div>

      {loading && <Skeleton className="h-40 w-full max-w-lg" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60 max-w-lg">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadRate}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && (
        <Card className="p-6 max-w-lg border-slate-200 shadow-xs">
          {!editing ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                    <Gem className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">24 Karat Gold Rate</p>
                    {rate ? (
                      <p className="font-display font-extrabold text-3xl text-[#0B0E23]">
                        {formatCurrency(rate.rate24k)}
                        <span className="text-sm font-semibold text-slate-400"> / gram</span>
                      </p>
                    ) : (
                      <p className="font-display font-bold text-lg text-slate-400">Not set for today</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={startEditing}
                  aria-label={rate ? 'Update rate' : 'Set rate'}
                  className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 bg-white text-gold flex items-center justify-center hover:bg-gold/10 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              {rate ? (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium pt-3 border-t border-slate-100">
                  <Clock className="h-3.5 w-3.5" />
                  Last updated {new Date(rate.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  <Badge variant="success" className="text-[10px] ml-auto">Live</Badge>
                </div>
              ) : (
                <Button size="sm" onClick={startEditing}>
                  Set Today&apos;s Rate
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-sm text-[#0B0E23]">
                  {rate ? "Update Today's Rate" : "Set Today's Rate"}
                </h2>
                <button
                  onClick={cancelEditing}
                  aria-label="Cancel"
                  className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {formError && (
                <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  24K Rate (₹ per gram)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  error={!!fieldError}
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="9820.50"
                  className="font-mono text-lg"
                  autoFocus
                />
                {fieldError && <p className="text-[11px] text-red-600 font-medium">{fieldError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="primary" size="sm" className="flex-1" isLoading={saving} onClick={handleSave}>
                  {saving ? 'Saving...' : 'Save Rate'}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={cancelEditing} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
