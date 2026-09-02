"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV_ITEMS } from '@/constants';
import { useTenant } from '@/hooks/useTenant';
import {
  LayoutDashboard,
  Users,
  Coins,
  Gem,
  UserPlus,
  CreditCard,
  Tag,
  Calendar,
  Megaphone,
  TrendingUp,
  BarChart3,
  Store,
  UserCheck,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Coins,
  Gem,
  UserPlus,
  CreditCard,
  Tag,
  Calendar,
  Megaphone,
  TrendingUp,
  BarChart3,
  Store,
  UserCheck,
  ShieldCheck,
  Settings,
};

export const AdminSidebar: React.FC = () => {
  const pathname = usePathname();
  const { branding } = useTenant();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn(
      "shrink-0 bg-gradient-to-b from-ink to-ink-2 text-[#E8EAF6] min-h-screen flex flex-col border-r border-[#232B4A] transition-all duration-300",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className="p-5 border-b border-[#232B4A] flex items-center justify-center min-h-[60px]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-full border border-gold flex items-center justify-center font-display font-bold text-gold-light text-sm bg-radial from-ink-2 to-ink shrink-0">
            {branding.logoText || 'DF'}
          </div>
          {!collapsed && (
            <div className="animate-in fade-in whitespace-nowrap">
              <div className="font-display font-bold text-sm text-white leading-none">
                {branding.brandName}
              </div>
              <div className="text-[11px] text-[#9AA3C7] mt-1">Jeweller Admin</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="px-5 text-[10px] uppercase tracking-wider text-[#9AA3C7] font-bold mb-2">
            Management
          </div>
        )}
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive =
            item.path === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.path);

          return (
            <Link
              key={item.key}
              href={item.path}
              className={cn(
                "w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold transition-all border-l-4",
                isActive
                  ? "bg-[#1E2A52] text-white border-gold"
                  : "text-[#C7CDE8] border-transparent hover:bg-[#1E2A52]/50 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3" title={collapsed ? item.label : undefined}>
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </div>
              {!item.ready && !collapsed && (
                <span className="text-[9px] font-mono text-[#9AA3C7] bg-[#182142] px-1.5 py-0.5 rounded">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#232B4A]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-[#9AA3C7] hover:text-white hover:bg-[#1E2A52]/50 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
    </aside>
  );
};
