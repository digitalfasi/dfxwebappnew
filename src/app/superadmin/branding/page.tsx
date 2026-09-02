"use client";

import React from 'react';
import { Palette } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function SuperAdminBrandingPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="font-display font-bold text-2xl text-ink">
          Branding & White Label
        </h1>
        <p className="text-xs text-slate-muted">Customize tenant branding</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-line shadow-card">
        <ComingSoonPlaceholder
          icon={<Palette className="w-7 h-7" />}
          title="Branding Coming Soon"
          description="Per-tenant colors, logo, and white-label customization aren't configurable yet — Tenant has no branding fields in the backend. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
