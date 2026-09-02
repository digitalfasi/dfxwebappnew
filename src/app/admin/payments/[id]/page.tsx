"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { paymentService, AdminPayment, PaymentStatus } from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

export default function AdminPaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;

  const [payment, setPayment] = useState<AdminPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPayment = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await paymentService.getAdminPaymentById(paymentId);
      setPayment(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load payment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      <div className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => router.push('/admin/payments')}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-gold hover:text-gold transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display font-extrabold text-xl text-[#0B0E23]">
            Payment Details
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Read-only record. Editing arrives with a future update.</p>
        </div>
      </div>

      {loading && <Skeleton className="h-72 w-full max-w-lg" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60 max-w-lg">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayment}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && payment && (
        <Card className="p-6 max-w-lg border-slate-200 shadow-xs space-y-1 text-xs divide-y divide-slate-100">
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Reference No.</span>
            <span className="font-bold text-[#0B0E23] font-mono">{payment.paymentReference}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Status</span>
            <Badge variant={STATUS_VARIANT[payment.paymentStatus]} dot>{payment.paymentStatus}</Badge>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Customer</span>
            <span className="font-bold text-[#0B0E23]">{payment.customerName}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Scheme</span>
            <span className="font-bold text-[#0B0E23]">{payment.schemeName}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Enrollment No.</span>
            <span className="font-mono text-[#0B0E23]">{payment.enrollmentNumber}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Amount</span>
            <span className="font-bold text-[#0B0E23] font-mono">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Method</span>
            <span className="font-bold text-[#0B0E23]">{payment.paymentMethod.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Date</span>
            <span className="text-[#0B0E23]">{new Date(payment.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-500 font-medium">Linked Passbook Entry</span>
            <span className="text-slate-400">{payment.passbookEntryId || 'Not linked yet'}</span>
          </div>
          {payment.remarks && (
            <div className="flex justify-between py-2.5">
              <span className="text-slate-500 font-medium">Remarks</span>
              <span className="text-[#0B0E23] text-right max-w-[60%]">{payment.remarks}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
