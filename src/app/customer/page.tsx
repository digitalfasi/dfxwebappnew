"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import {
  Gem,
  CreditCard,
  BookOpen,
  Heart,
} from 'lucide-react';
import { Toast } from '@/components/ui/toast';
import { customerService, CustomerProfile } from '@/services/customerService';
import { enrollmentService, CustomerEnrollment } from '@/services/enrollmentService';
import { passbookService, Passbook } from '@/services/passbookService';
import { goldRateService, CustomerGoldRate } from '@/services/goldRateService';
import { paymentService, CustomerPayment } from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [activeEnrollment, setActiveEnrollment] = useState<CustomerEnrollment | null>(null);
  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [goldRate, setGoldRate] = useState<CustomerGoldRate | null>(null);
  const [pendingPayment, setPendingPayment] = useState<CustomerPayment | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [profileData, enrollments, rate, payments] = await Promise.all([
        customerService.getProfile(),
        enrollmentService.getMyEnrollments(),
        goldRateService.getCustomerRate(),
        paymentService.getMyPayments(),
      ]);
      setProfile(profileData);
      setGoldRate(rate);

      // "Current scheme" = the most recently joined ACTIVE enrollment. A
      // customer can hold more than one; there's no "primary scheme" concept
      // in the backend, so most-recent-active is the honest, unambiguous pick.
      const active =
        enrollments
          .filter((e) => e.status === 'ACTIVE')
          .sort((a, b) => new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime())[0] ?? null;
      setActiveEnrollment(active);

      if (active) {
        const pb = await passbookService.getMyPassbook(active.id);
        setPassbook(pb);

        // No installment due-date schedule exists anywhere in the backend
        // (see SESSION_HANDOFF.md §8) — the closest honest proxy, same
        // reasoning Module 13 used for the Admin Dashboard's Pending
        // Installments tile, is the enrollment's oldest still-PENDING
        // payment record. No due date is fabricated.
        const pending =
          payments
            .filter((p) => p.enrollmentId === active.id && p.paymentStatus === 'PENDING')
            .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())[0] ?? null;
        setPendingPayment(pending);
      } else {
        setPassbook(null);
        setPendingPayment(null);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const firstName = profile?.name?.split(' ')[0] || '';
  const totalPaid = passbook?.summary.totalAmountPaid ?? 0;
  const totalWeight = passbook?.summary.totalGoldWeight ?? 0;
  // Scheme's total commitment (monthly amount x duration) — both already-real
  // fields, not a new business rule. Progress = how much of that has been paid.
  const schemeTarget = passbook ? passbook.scheme.monthlyAmount * passbook.scheme.durationMonths : 0;
  const progressPercent = schemeTarget > 0 ? Math.min(100, Math.round((totalPaid / schemeTarget) * 100)) : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="p-4 border-red-200 bg-red-50/60">
        <p className="text-xs font-medium text-red-700">{loadError}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={loadDashboard}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Top Greeting Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-base text-ink flex items-center gap-1.5">
            Hello, {firstName || 'there'} 👋
          </h1>
          <p className="text-xs text-slate-muted">Here&apos;s your gold savings overview</p>
        </div>
      </div>

      {/* Primary Gold Savings Hero Card matching Screen 3 */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-gold-light via-gold to-gold-dark text-ink shadow-lg relative overflow-hidden border border-gold/40">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-ink/80 block">
              Current Gold Savings
            </span>
            <div className="font-display font-extrabold text-3xl text-ink">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-xs font-bold text-ink/90 pt-1">
              Total Weight: <span className="font-mono font-extrabold">{formatWeight(totalWeight)}</span>
            </div>
          </div>

          {/* Radial Progress Ring on Right */}
          <div className="w-16 h-16 rounded-full bg-ink/10 border-4 border-ink/20 flex items-center justify-center font-display font-bold text-sm text-ink shrink-0">
            {progressPercent}%
          </div>
        </div>
      </div>

      {/* Two Metric Boxes below Gold Card */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5 border-slate-line bg-white shadow-sm">
          <div className="text-[10px] text-slate-muted font-bold uppercase">
            Gold Rate (24K)
          </div>
          <div className="font-display font-bold text-sm text-ink my-0.5 font-mono">
            {goldRate ? `${formatCurrency(goldRate.rate24k)} / g` : '—'}
          </div>
          <Badge variant="neutral" className="text-[9px] px-1.5 py-0">
            {goldRate
              ? `Updated ${new Date(goldRate.updatedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
              : 'Not set yet'}
          </Badge>
        </Card>

        <Card className="p-3.5 border-slate-line bg-white shadow-sm">
          <div className="text-[10px] text-slate-muted font-bold uppercase">
            Next Installment
          </div>
          <div className="font-display font-bold text-sm text-ink my-0.5">
            {pendingPayment ? 'Payment Pending' : activeEnrollment ? 'All Caught Up' : 'No Active Scheme'}
          </div>
          <span className="text-[10px] font-mono font-bold text-gold">
            {pendingPayment ? formatCurrency(pendingPayment.amount) : '—'}
          </span>
        </Card>
      </div>

      {/* Festival Offer Banner */}
      <div className="bg-gradient-to-r from-ink via-ink-2 to-[#0D1226] text-white p-3.5 rounded-2xl border border-gold/30 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/20 text-gold-light flex items-center justify-center text-xl shrink-0">
            🎁
          </div>
          <div>
            <div className="font-display font-bold text-xs text-white">
              Festival Offer
            </div>
            <div className="text-[11px] text-gold-light font-medium">
              Flat 5% Bonus on New Schemes
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push('/customer/schemes')}
          className="px-2.5 py-1 bg-gold text-ink text-[11px] font-bold rounded-lg hover:brightness-105"
        >
          View Offer
        </button>
      </div>

      {/* Quick Actions (4 Grid) */}
      <div>
        <div className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-2">
          Quick Actions
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => router.push('/customer/schemes')}
            className="p-3 bg-white border border-slate-line rounded-xl flex flex-col items-center gap-1.5 hover:border-gold transition-colors text-center shadow-card"
          >
            <Gem className="h-5 w-5 text-gold" />
            <span className="text-[10px] font-bold text-ink">Join Scheme</span>
          </button>
          <button
            onClick={() => router.push('/customer/payment')}
            className="p-3 bg-white border border-slate-line rounded-xl flex flex-col items-center gap-1.5 hover:border-gold transition-colors text-center shadow-card"
          >
            <CreditCard className="h-5 w-5 text-gold" />
            <span className="text-[10px] font-bold text-ink">Pay Installment</span>
          </button>
          <button
            onClick={() => router.push('/customer/enrollments')}
            className="p-3 bg-white border border-slate-line rounded-xl flex flex-col items-center gap-1.5 hover:border-gold transition-colors text-center shadow-card"
          >
            <BookOpen className="h-5 w-5 text-gold" />
            <span className="text-[10px] font-bold text-ink">Passbook</span>
          </button>
          <button
            onClick={() => router.push('/customer/catalogue')}
            className="p-3 bg-white border border-slate-line rounded-xl flex flex-col items-center gap-1.5 hover:border-gold transition-colors text-center shadow-card"
          >
            <Heart className="h-5 w-5 text-gold" />
            <span className="text-[10px] font-bold text-ink">Wishlist</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
