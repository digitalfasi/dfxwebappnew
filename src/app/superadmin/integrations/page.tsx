"use client";

import React from 'react';
import { Plug } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function SuperAdminIntegrationsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Support Tickets & Third-Party Integrations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Monitor tenant helpdesk tickets, webhook connectivity, and platform API integrations.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<Plug className="w-7 h-7" />}
          title="Integrations Coming Soon"
          description="Third-party integration monitoring and a support-ticket system aren't available yet — no backend for either exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
