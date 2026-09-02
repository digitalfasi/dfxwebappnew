"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { REDIRECT_BY_ROLE } from '@/services/authService';

export default function RootRedirectPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user || !role) {
      router.replace('/auth/login');
      return;
    }

    router.replace(REDIRECT_BY_ROLE[role]);
  }, [user, role, loading, router]);

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full border-2 border-gold border-t-transparent flex items-center justify-center font-bold text-lg mx-auto animate-spin">
        </div>
        <p className="text-sm text-slate-500 font-medium tracking-widest uppercase">Routing to Workspace...</p>
      </div>
    </div>
  );
}
