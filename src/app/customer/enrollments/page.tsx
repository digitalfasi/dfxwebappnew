"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Gem, ChevronRight } from 'lucide-react';
import { enrollmentService, CustomerEnrollment, EnrollmentStatus } from '@/services/enrollmentService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<EnrollmentStatus, 'success' | 'gold' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'gold',
  CANCELLED: 'danger',
};

export default function MyEnrollmentsPage() {
  const router = useRouter();

  const [enrollments, setEnrollments] = useState<CustomerEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadEnrollments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await enrollmentService.getMyEnrollments();
      setEnrollments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your enrollments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnrollments();
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
          My Enrollments
        </h1>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadEnrollments}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && enrollments.length === 0 && (
        <EmptyState
          icon={<Gem className="h-7 w-7 text-gold" />}
          title="No enrollments yet"
          description="Join a gold savings scheme to see it here."
          actionLabel="Browse Schemes"
          onAction={() => router.push('/customer/schemes')}
        />
      )}

      {!loading && !loadError && enrollments.length > 0 && (
        <div className="space-y-3">
          {enrollments.map((e) => (
            <Card
              key={e.id}
              onClick={() => router.push(`/customer/schemes/${e.schemeId}`)}
              className="p-4 border-slate-line cursor-pointer hover:border-gold transition-all"
            >
              <CardContent className="p-0 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-ink">{e.schemeName}</span>
                  <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
                </div>
                <p className="text-[11px] text-slate-muted font-mono">{e.enrollmentNumber}</p>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-line/60 text-[11px] text-slate-muted">
                  <div>
                    <span className="block text-[10px]">Joined</span>
                    <span className="font-bold text-ink">{new Date(e.joinedDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                  </div>
                  <div>
                    <span className="block text-[10px]">Maturity</span>
                    <span className="font-bold text-ink">{new Date(e.maturityDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="secondary" className="text-xs h-8">
                    View Scheme <ChevronRight className="h-3.5 w-3.5 ml-1" />
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
