"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Download, Share2, CheckCircle2, BookOpen } from 'lucide-react';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import { Toast } from '@/components/ui/toast';
import { passbookService, Passbook } from '@/services/passbookService';
import { ApiError } from '@/lib/apiClient';

export default function PassbookPage() {
  const router = useRouter();
  const params = useParams();
  const enrollmentId = params.enrollmentId as string;

  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadPassbook = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await passbookService.getMyPassbook(enrollmentId);
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

  const handleDownload = () => {
    setToastMsg("Passbook statement downloaded");
  };

  const handleShare = () => {
    setToastMsg("Passbook shared successfully");
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer/enrollments')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display font-bold text-base text-ink">
            Digital Passbook
          </h1>
          <p className="text-xs text-slate-muted">{passbook?.scheme.name || 'Loading...'}</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}

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
          {/* Top Summary Banner */}
          <Card className="p-4 border-slate-line bg-white shadow-card">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-muted block text-[10px] uppercase font-bold">
                  Total Paid
                </span>
                <span className="font-display font-bold text-base text-ink font-mono">
                  {formatCurrency(passbook.summary.totalAmountPaid)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-slate-muted block text-[10px] uppercase font-bold">
                  Total Weight
                </span>
                <span className="font-display font-bold text-base text-gold font-mono">
                  {formatWeight(passbook.summary.totalGoldWeight)}
                </span>
              </div>
            </div>
          </Card>

          {/* Transaction History Entries */}
          {passbook.entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7 text-gold" />}
              title="No entries yet"
              description="Your payment history will appear here once you make your first installment."
            />
          ) : (
            <div className="space-y-2.5">
              {passbook.entries.map((item) => (
                <Card key={item.id} className="p-3.5 border-slate-line bg-white">
                  <CardContent className="p-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        <div>
                          <span className="font-bold text-ink block">
                            {new Date(item.entryDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </span>
                          <span className="text-[10px] text-slate-muted">{item.description}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-ink block font-mono">
                          {formatCurrency(item.amount)}
                        </span>
                        <span className="text-[11px] font-mono text-gold font-bold">
                          {item.goldWeight.toFixed(3)} g
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Bottom Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button onClick={handleDownload} variant="outline" size="sm" className="w-full">
              <Download className="h-4 w-4 mr-1 text-gold" /> Download
            </Button>
            <Button onClick={handleShare} variant="outline" size="sm" className="w-full">
              <Share2 className="h-4 w-4 mr-1 text-gold" /> Share
            </Button>
          </div>
        </>
      )}

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
