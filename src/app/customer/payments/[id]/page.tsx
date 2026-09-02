"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { paymentService, CustomerPayment, PaymentStatus } from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

export default function CustomerPaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;

  const [payment, setPayment] = useState<CustomerPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPayment = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await paymentService.getMyPaymentById(paymentId);
      setPayment(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load this payment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer/payments')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display font-bold text-base text-ink">
          Payment Details
        </h1>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayment}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && payment && (
        <Card className="p-5 border-slate-line bg-white shadow-card space-y-1 text-xs divide-y divide-slate-line">
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Reference No.</span>
            <span className="font-bold text-ink font-mono">{payment.paymentReference}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Status</span>
            <Badge variant={STATUS_VARIANT[payment.paymentStatus]} dot>{payment.paymentStatus}</Badge>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Scheme</span>
            <span className="font-bold text-ink">{payment.schemeName}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Enrollment No.</span>
            <span className="font-mono text-ink">{payment.enrollmentNumber}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Amount</span>
            <span className="font-bold text-ink font-mono">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Method</span>
            <span className="font-bold text-ink">{payment.paymentMethod.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-slate-muted font-medium">Date</span>
            <span className="text-ink">{new Date(payment.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
          </div>
          {payment.remarks && (
            <div className="flex justify-between py-2.5">
              <span className="text-slate-muted font-medium">Remarks</span>
              <span className="text-ink text-right max-w-[60%]">{payment.remarks}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
