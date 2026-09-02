"use client";

import React from 'react';
import { Users } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function AdminCustomersPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Customer CRM & Passbook Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage customer profiles, scheme passbooks, accumulated gold weights, and payment histories.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<Users className="w-7 h-7" />}
          title="Customer Management Coming Soon"
          description="A dedicated customer directory (search, profiles, passbook ledger in one place) isn't available yet — no backend customer-listing API exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
