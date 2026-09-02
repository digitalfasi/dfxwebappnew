"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, CheckCircle2, BookOpen } from 'lucide-react';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import { passbookService, Passbook } from '@/services/passbookService';
import { ApiError } from '@/lib/apiClient';

export default function AdminPassbookPage() {
  const router = useRouter();
  const params = useParams();
  const enrollmentId = params.id as string;

  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPassbook = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await passbookService.getAdminPassbook(enrollmentId);
      setPassbook(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load passbook.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPassbook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => router.push('/admin/enrollments')}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-gold hover:text-gold transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display font-extrabold text-xl text-[#0B0E23]">
            {passbook ? `${passbook.scheme.name} — Passbook` : 'Passbook'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Read-only view. Payment entries will appear here once the Payments module is live.
          </p>
        </div>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPassbook}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && passbook && (
        <>
          {/* Enrollment / Summary Card */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card variant="statistic" className="p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Enrollment No.</div>
              <div className="text-sm font-extrabold text-[#0B0E23] font-display mt-0.5 font-mono">{passbook.enrollment.enrollmentNumber}</div>
            </Card>
            <Card variant="statistic" className="p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</div>
              <div className="mt-1"><Badge variant="success" dot>{passbook.enrollment.status}</Badge></div>
            </Card>
            <Card variant="statistic" className="p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Paid</div>
              <div className="text-sm font-extrabold text-[#0B0E23] font-display mt-0.5 font-mono">{formatCurrency(passbook.summary.totalAmountPaid)}</div>
            </Card>
            <Card variant="statistic" className="p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Gold Weight</div>
              <div className="text-sm font-extrabold text-gold-dark font-display mt-0.5 font-mono">{formatWeight(passbook.summary.totalGoldWeight)}</div>
            </Card>
          </div>

          {/* Entries */}
          {passbook.entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7 text-gold" />}
              title="No entries yet"
              description="This customer has not made any installment payments yet."
            />
          ) : (
            <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-4">#</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Description</th>
                      <th className="p-4 text-right">Amount</th>
                      <th className="p-4 text-right">Gold Rate</th>
                      <th className="p-4 text-right">Gold Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {passbook.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-mono">{entry.entryNumber}</td>
                        <td className="p-4">{new Date(entry.entryDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                        <td className="p-4 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          {entry.description}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(entry.amount)}</td>
                        <td className="p-4 text-right font-mono">{formatCurrency(entry.goldRate)}/g</td>
                        <td className="p-4 text-right font-mono font-bold text-gold-dark">{entry.goldWeight.toFixed(3)} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
