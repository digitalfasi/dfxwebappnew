"use client";

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { ADMIN_NAV_ITEMS, SUPER_ADMIN_NAV_ITEMS } from '@/constants';
import { Search, Bell, Settings, LogOut, Building2, Store, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const TopBar: React.FC = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { branding } = useTenant();

  const isSuperAdmin = user?.role === 'superadmin';

  // Navigation quick-jump. The backend exposes no full-text search endpoint
  // (only structured, per-module filters), so this is a client-side jump to
  // known destinations — it never fabricates entity results. Reuses the
  // existing sidebar nav items so there is a single source of destinations.
  const destinations = useMemo(
    () => (isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : ADMIN_NAV_ITEMS).filter((i) => i.ready !== false),
    [isSuperAdmin]
  );

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return destinations.filter((d) => d.label.toLowerCase().includes(q) || d.key.toLowerCase().includes(q)).slice(0, 6);
  }, [query, destinations]);

  const go = (path: string) => {
    setQuery('');
    setOpen(false);
    router.push(path);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) go(target.path);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <header className="h-[60px] bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left side: Company Context */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gold/15 flex items-center justify-center text-gold-dark border border-gold/30">
          <Building2 className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#0B0E23] leading-none">{branding.brandName}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider flex items-center gap-1">
            <Store className="w-3 h-3 text-gold" />
            <span>{isSuperAdmin ? 'Platform-Wide' : 'Admin Workspace'}</span>
          </div>
        </div>
      </div>

      {/* Center: quick-jump navigation search */}
      <div className="flex-1 max-w-md mx-8 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a module — customers, payments, schemes..."
            aria-label="Search modules"
            className="w-full pl-9 bg-[#F7F8FC] border-slate-200 h-9 text-xs focus:border-gold focus:ring-gold/20 font-medium"
          />

          {open && query.trim() !== '' && (
            <div
              className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
              onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
            >
              {results.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400 font-medium">No matching module.</div>
              ) : (
                results.map((r, idx) => (
                  <button
                    key={r.key}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => go(r.path)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-left transition-colors ${
                      idx === activeIndex ? 'bg-gold/10 text-[#0B0E23]' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{r.label}</span>
                    {idx === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Actions & Profile */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(isSuperAdmin ? '/superadmin/audit' : '/admin/appointments')}
          className="relative p-2 text-slate-400 hover:text-[#0B0E23] transition-colors rounded-xl hover:bg-slate-100"
          title="Notifications & Bookings"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-gold rounded-full border border-white"></span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-0.5"></div>

        {/* User Profile */}
        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-[#0B0E23] leading-none">{user?.name || 'User'}</div>
            <div className="text-[10px] text-slate-500 font-semibold mt-1">
              {isSuperAdmin ? 'Super Admin' : 'Admin'}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#0B0E23] text-gold border border-gold/40 flex items-center justify-center shadow-2xs font-display font-bold text-xs">
            {user?.name?.charAt(0) || 'U'}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-1">
          <Button
            onClick={() => router.push(isSuperAdmin ? '/superadmin/settings' : '/admin/settings')}
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-slate-200 text-slate-600 hover:text-[#0B0E23] hidden lg:flex gap-1.5 text-xs font-bold"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </Button>

          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="h-8 px-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 flex gap-1.5 text-xs font-bold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
