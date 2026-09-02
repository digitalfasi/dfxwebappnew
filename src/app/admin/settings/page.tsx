"use client";

import React from 'react';
import { Building2 } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Jeweller Store Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage store business details, tax rates, automated notification rules, and passbook receipt templates.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<Building2 className="w-7 h-7" />}
          title="Store Configuration Coming Soon"
          description="Business/GST details, notification rules, and receipt templates aren't configurable yet — no backend tenant-settings API exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
