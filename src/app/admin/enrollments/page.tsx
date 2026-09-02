"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Gem, BookOpen } from 'lucide-react';
import { enrollmentService, AdminEnrollment, EnrollmentStatus } from '@/services/enrollmentService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<EnrollmentStatus, 'success' | 'gold' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'gold',
  CANCELLED: 'danger',
};

export default function AdminEnrollmentsPage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadEnrollments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await enrollmentService.getAdminEnrollments();
      setEnrollments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load enrollments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnrollments();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Scheme Enrollments
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Read-only view of every customer enrollment across your active and past schemes.
          </p>
        </div>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

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
          description="Once customers join your schemes, their enrollments will appear here."
        />
      )}

      {!loading && !loadError && enrollments.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Enrollment No.</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4 text-center">Joined</th>
                  <th className="p-4 text-center">Maturity</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Passbook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {enrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#0B0E23]">{e.enrollmentNumber}</td>
                    <td className="p-4 font-bold text-[#0B0E23]">{e.customerName}</td>
                    <td className="p-4">{e.schemeName}</td>
                    <td className="p-4 text-center">{new Date(e.joinedDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 text-center">{new Date(e.maturityDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 text-center">
                      <Badge variant={STATUS_VARIANT[e.status]} dot>{e.status}</Badge>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => router.push(`/admin/enrollments/${e.id}/passbook`)}
                        className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                        title="View Passbook"
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
