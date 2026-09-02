"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { TenantBranding } from '@/types';
import { DEFAULT_BRANDING } from '@/constants';
import { tenantService } from '@/services/tenantService';
import { useAuth } from '@/hooks/useAuth';

interface TenantContextType {
  branding: TenantBranding;
  loading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/**
 * Fetches tenant branding exactly once per session and shares it across
 * every consumer (AdminSidebar, TopBar, CustomerHeader, dashboards, etc.)
 * instead of each one independently calling tenantService.getBranding() —
 * previously up to 3 redundant calls per page load.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      const data = await tenantService.getBranding(user?.tenantId);
      if (cancelled) return;
      setBranding(data);
      setLoading(false);

      // Update CSS Variables dynamically for runtime white labeling
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--gold', data.brandColor);
      }
    }
    loadBranding();

    return () => {
      cancelled = true;
    };
  }, [user?.tenantId]);

  return (
    <TenantContext.Provider value={{ branding, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
