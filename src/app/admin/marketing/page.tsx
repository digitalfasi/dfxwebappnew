"use client";

import React from 'react';
import { Megaphone } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function MarketingPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Marketing & Campaigns
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage WhatsApp, SMS, and Email campaigns to engage your customers.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<Megaphone className="w-7 h-7" />}
          title="Marketing Campaigns Coming Soon"
          description="WhatsApp/SMS/Email campaign tools aren't available yet — no backend Marketing API exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
