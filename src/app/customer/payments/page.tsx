"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Receipt, ChevronRight } from 'lucide-react';
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

export default function CustomerPaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPayments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await paymentService.getMyPayments();
      setPayments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your payment history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer/profile')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display font-bold text-base text-ink">
          Payment History
        </h1>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayments}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && payments.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-7 w-7 text-gold" />}
          title="No payments yet"
          description="Your payment history will appear here once your store records a payment for you."
        />
      )}

      {!loading && !loadError && payments.length > 0 && (
        <div className="space-y-3">
          {payments.map((p) => (
            <Card
              key={p.id}
              onClick={() => router.push(`/customer/payments/${p.id}`)}
              className="p-4 border-slate-line cursor-pointer hover:border-gold transition-all"
            >
              <CardContent className="p-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-ink">{p.schemeName}</span>
                  <Badge variant={STATUS_VARIANT[p.paymentStatus]} dot>{p.paymentStatus}</Badge>
                </div>
                <p className="text-[11px] text-slate-muted font-mono">{p.paymentReference}</p>
                <div className="flex justify-between items-center pt-2 border-t border-slate-line/60 text-xs">
                  <span className="text-slate-muted">{new Date(p.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                  <span className="font-bold text-ink font-mono">{formatCurrency(p.amount)}</span>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" className="text-xs h-8">
                    View Details <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
