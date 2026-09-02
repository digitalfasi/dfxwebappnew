"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { schemeService, CustomerScheme } from '@/services/schemeService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Gem, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/apiClient';

export default function SchemesListPage() {
  const router = useRouter();
  const [schemes, setSchemes] = useState<CustomerScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadSchemes = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await schemeService.getCustomerSchemes();
      setSchemes(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load schemes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemes();
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
            Gold Savings Schemes
          </h1>
          <p className="text-xs text-slate-muted">
            Choose a plan to start saving in gold
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadSchemes}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && schemes.length === 0 && (
        <EmptyState
          icon={<Gem className="h-7 w-7 text-gold" />}
          title="No schemes available"
          description="Your store hasn't published any savings schemes yet. Please check back later."
        />
      )}

      {!loading && !loadError && schemes.length > 0 && (
        <div className="space-y-3">
          {schemes.map((scheme) => (
            <Card
              key={scheme.id}
              onClick={() => router.push(`/customer/schemes/${scheme.id}`)}
              className="p-4 border-slate-line cursor-pointer hover:border-gold transition-all"
            >
              <CardContent className="p-0 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gold-dim text-[#1E4E8C] flex items-center justify-center font-bold text-xs">
                      <Gem className="h-4 w-4" />
                    </div>
                    <span className="font-display font-bold text-sm text-ink">
                      {scheme.name}
                    </span>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>

                {scheme.description && (
                  <p className="text-xs text-slate-muted line-clamp-2">
                    {scheme.description}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-line/60 text-[11px] text-slate-muted">
                  <div>
                    <span className="block text-[10px]">Duration</span>
                    <span className="font-bold text-ink">{scheme.durationMonths} Months</span>
                  </div>
                  <div>
                    <span className="block text-[10px]">Monthly Amount</span>
                    <span className="font-bold text-ink">₹{scheme.monthlyAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px]">Bonus</span>
                    <span className="font-bold text-gold">{scheme.bonusDescription || 'None'}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
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
