"use client";

import React from 'react';
import { CreditCard } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function SuperAdminSubscriptionsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            SaaS Subscription Tiers & Billing Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Configure platform SaaS pricing tiers, feature gate limits, and tenant subscription renewals.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<CreditCard className="w-7 h-7" />}
          title="Billing & Subscriptions Coming Soon"
          description="Plan tiers, billing, and renewal management aren't available yet — no billing API exists over the Subscription table yet. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
