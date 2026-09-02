"use client";

import React from 'react';
import { Settings } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Global SaaS Infrastructure & Security Settings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Configure multi-tenant gateway servers, SMTP relays, database cluster encryption, and platform security rules.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<Settings className="w-7 h-7" />}
          title="Platform Settings Coming Soon"
          description="SMTP relays, WhatsApp API keys, and platform-wide security toggles aren't configurable yet — no PlatformSettings backend exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
