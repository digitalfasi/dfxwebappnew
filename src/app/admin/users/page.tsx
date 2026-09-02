"use client";

import React from 'react';
import { UserCheck } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Staff User & Access Role Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage store employees, assign branch access permissions, and log audit trail activities.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <ComingSoonPlaceholder
          icon={<UserCheck className="w-7 h-7" />}
          title="Staff Management Coming Soon"
          description="Inviting staff, assigning branch access, and role permissions aren't available yet — no backend staff-management API exists. This feature will be available in a future release."
        />
      </div>
    </div>
  );
}
