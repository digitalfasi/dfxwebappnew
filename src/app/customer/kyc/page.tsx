"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { customerService, KYCRecord, KYCDocType, KYCSubmitData } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

const DOC_TYPES: { value: KYCDocType; label: string; placeholder: string }[] = [
  { value: 'PAN', label: 'PAN Card', placeholder: 'ABCDE1234F' },
  { value: 'Aadhaar', label: 'Aadhaar Card', placeholder: '123456789012' },
  { value: 'Passport', label: 'Passport', placeholder: 'Passport number' },
];

const STATUS_META: Record<string, { variant: 'success' | 'pending' | 'danger'; icon: React.ReactNode; text: string }> = {
  Verified: { variant: 'success', icon: <ShieldCheck className="h-4 w-4" />, text: 'Verified' },
  Pending: { variant: 'pending', icon: <ShieldQuestion className="h-4 w-4" />, text: 'Pending Review' },
  Rejected: { variant: 'danger', icon: <ShieldAlert className="h-4 w-4" />, text: 'Rejected' },
};

type FieldErrors = Partial<Record<'docType' | 'docNumber', string>>;

export default function KYCPage() {
  const router = useRouter();

  const [record, setRecord] = useState<KYCRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState<KYCSubmitData>({ docType: 'PAN', docNumber: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadKYC = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const kyc = await customerService.getKYC();
      setRecord(kyc);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load KYC status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKYC();
  }, []);

  const handleSubmit = async () => {
    setFieldErrors({});
    setFormError('');

    if (!form.docNumber.trim()) {
      setFieldErrors({ docNumber: 'Document number is required' });
      return;
    }

    setSubmitting(true);
    try {
      const updated = await customerService.submitKYC({
        docType: form.docType,
        docNumber: form.docNumber.trim(),
      });
      setRecord(updated);
      setForm({ docType: 'PAN', docNumber: '' });
      setToast({ message: 'KYC document submitted successfully', type: 'success' });
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        const next: FieldErrors = {};
        let banner = '';
        for (const e of err.errors) {
          if (e.field === 'doc_type') next.docType = e.message || 'Invalid document type';
          else if (e.field === 'doc_number') next.docNumber = e.message || 'Invalid document number';
          else banner = e.message || err.message;
        }
        setFieldErrors(next);
        setFormError(Object.keys(next).length === 0 ? (banner || err.message) : '');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not submit KYC. Please try again.');
      }
      setToast({ message: 'Could not submit KYC document', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !record || record.status !== 'Verified';
  const meta = record ? STATUS_META[record.status] : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer/profile')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display font-bold text-base text-ink">
          KYC Verification
        </h1>
      </div>

      {/* Loading state */}
      {loading && <Skeleton className="h-32 w-full" />}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadKYC}>
            Retry
          </Button>
        </Card>
      )}

      {/* Current status */}
      {!loading && !loadError && (
        <Card dark className="p-5">
          {record && meta ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-sm text-white">Current Status</h2>
                <Badge variant={meta.variant} className="text-[10px]">
                  {meta.icon} {meta.text}
                </Badge>
              </div>
              <div className="text-xs text-[#C7CDE8] space-y-0.5">
                <p>Document Type: <span className="text-white font-semibold">{record.docType}</span></p>
                <p>Document Number: <span className="text-white font-mono">{record.docNumber}</span></p>
              </div>
              {record.status === 'Rejected' && record.rejectionReason && (
                <div className="text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mt-2">
                  Reason: {record.rejectionReason}
                </div>
              )}
              {record.status === 'Verified' && (
                <p className="text-[11px] text-[#9AA3C7] pt-1">
                  Your identity has been verified. No further action is needed.
                </p>
              )}
              {record.status === 'Pending' && (
                <p className="text-[11px] text-[#9AA3C7] pt-1">
                  Your document is under review by the store. This usually takes 1-2 business days.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4 text-gold-light" />
                <h2 className="font-display font-bold text-sm text-white">No KYC Submitted</h2>
              </div>
              <p className="text-[11px] text-[#9AA3C7]">
                Submit a government ID to verify your identity and unlock gold savings schemes.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Submit / resubmit form */}
      {!loading && !loadError && canSubmit && (
        <Card className="p-4 border-slate-line bg-white shadow-card">
          <h3 className="font-display font-bold text-sm text-ink mb-3">
            {record ? 'Resubmit Document' : 'Submit Document'}
          </h3>

          <div className="space-y-3">
            {formError && (
              <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Document Type</label>
              <Select
                error={!!fieldErrors.docType}
                value={form.docType}
                onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value as KYCDocType }))}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
              {fieldErrors.docType && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.docType}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Document Number</label>
              <Input
                className="font-mono uppercase"
                error={!!fieldErrors.docNumber}
                value={form.docNumber}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                placeholder={DOC_TYPES.find((d) => d.value === form.docType)?.placeholder}
              />
              {fieldErrors.docNumber && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.docNumber}</p>}
            </div>

            <Button size="sm" className="w-full" isLoading={submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting...' : record ? 'Resubmit for Verification' : 'Submit for Verification'}
            </Button>
          </div>
        </Card>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
