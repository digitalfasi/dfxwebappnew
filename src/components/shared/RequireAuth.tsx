"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { REDIRECT_BY_ROLE } from '@/services/authService';
import { Logo } from '@/components/shared/Logo';
import { UserRole } from '@/types';

interface RequireAuthProps {
  /** Roles permitted to view this workspace. */
  allow: UserRole[];
  children: React.ReactNode;
}

/**
 * Client-side route guard. Unauthenticated visitors are sent to the login
 * page; authenticated users hitting the wrong workspace are sent to theirs.
 */
export const RequireAuth: React.FC<RequireAuthProps> = ({ allow, children }) => {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  const authorized = !!user && !!role && allow.includes(role);

  useEffect(() => {
    if (loading) return;

    if (!user || !role) {
      router.replace('/auth/login');
      return;
    }

    if (!allow.includes(role)) {
      router.replace(REDIRECT_BY_ROLE[role]);
    }
  }, [user, role, loading, allow, router]);

  if (loading || !authorized) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center">
        <div className="text-center space-y-5">
          <Logo className="h-14 mx-auto" />
          <div className="w-10 h-10 rounded-full border-2 border-gold border-t-transparent mx-auto animate-spin" />
          <p className="text-sm text-slate-500 font-medium tracking-widest uppercase">
            {loading ? 'Verifying Session...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
