"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function PaymentPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold transition-colors duration-150"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display font-bold text-base text-ink">Pay Installment</h1>
      </div>

      <ComingSoonPlaceholder
        icon={<CreditCard className="w-7 h-7" />}
        title="Online Payments Coming Soon"
        description="Your store hasn't connected a payment gateway yet. Please contact your branch to make a payment, or check your Payment History for anything already recorded."
      />

      <button
        onClick={() => router.push('/customer/payments')}
        className="w-full text-center text-xs font-bold text-gold-dark hover:underline transition-colors duration-150"
      >
        View Payment History
      </button>
    </div>
  );
}
