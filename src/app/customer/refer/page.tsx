"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Gift } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function ReferAndEarnPage() {
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
        <div>
          <h1 className="font-display font-bold text-lg text-ink">Refer & Earn</h1>
          <p className="text-xs text-slate-muted">Invite friends to save in gold</p>
        </div>
      </div>

      <ComingSoonPlaceholder
        icon={<Gift className="w-7 h-7" />}
        title="Refer & Earn Coming Soon"
        description="Referral codes and rewards aren't available yet. This feature will be available in a future release."
      />
    </div>
  );
}
