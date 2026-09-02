"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Gem, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { goldRateService, CustomerGoldRate } from '@/services/goldRateService';
import { ApiError } from '@/lib/apiClient';

export default function LiveRatesPage() {
  const router = useRouter();

  const [rate, setRate] = useState<CustomerGoldRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadRate = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await goldRateService.getCustomerRate();
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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display font-bold text-lg text-ink">
            Today&apos;s Gold Rate
          </h1>
          <p className="text-xs text-slate-muted">24 Karat Rate, Set by Your Store</p>
        </div>
      </div>

      {loading && <Skeleton className="h-40 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadRate}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && (
        <Card dark className="p-5 space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-display font-bold text-base text-gold-light">
              🥇 24 Karat Gold
            </span>
            {rate && <Badge variant="success">Live</Badge>}
          </div>

          {rate ? (
            <>
              <div className="text-center py-3 border-y border-white/10">
                <div className="font-display font-extrabold text-4xl text-white">
                  {formatCurrency(rate.rate24k)}
                  <span className="text-sm font-semibold text-[#9AA3C7]"> / gram</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#9AA3C7] font-medium">
                <Clock className="h-3.5 w-3.5" />
                Last updated {new Date(rate.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </>
          ) : (
            <p className="text-center py-6 text-sm text-[#9AA3C7]">
              Your store hasn&apos;t set today&apos;s gold rate yet. Please check back shortly.
            </p>
          )}
        </Card>
      )}

      <Button
        onClick={() => router.push('/customer/schemes')}
        size="lg"
        className="w-full shadow-glow"
      >
        <Gem className="h-4 w-4 mr-2" /> Start a Gold Savings Scheme
      </Button>
    </div>
  );
}
