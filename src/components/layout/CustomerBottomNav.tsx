"use client";

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, Gem, BookOpen, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useCart } from '@/hooks/useCart';

export const CustomerBottomNav: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { summary } = useCart();

  const tabs = [
    { key: 'home', icon: Home, label: 'Home', path: '/customer' },
    { key: 'schemes', icon: Gem, label: 'Schemes', path: '/customer/schemes', badge: true },
    { key: 'passbook', icon: BookOpen, label: 'Passbook', path: '/customer/enrollments' },
    { key: 'catalogue', icon: ShoppingBag, label: 'Catalogue', path: '/customer/catalogue', count: summary.totalItemsCount },
    { key: 'profile', icon: User, label: 'Profile', path: '/customer/profile' },
  ];

  return (
    <nav className="sticky bottom-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-slate-line/80 flex items-center justify-around px-2 shadow-lg">
      {tabs.map((t) => {
        const isActive =
          t.path === '/customer'
            ? pathname === '/customer'
            : pathname.startsWith(t.path);
        const Icon = t.icon;

        return (
          <button
            key={t.key}
            onClick={() => router.push(t.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 w-full h-full py-1 text-[10px] font-bold transition-all duration-200 focus:outline-none",
              isActive ? "text-gold" : "text-slate-muted hover:text-slate"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeBottomTab"
                className="absolute top-0 w-8 h-1 bg-gold rounded-b-full shadow-glow"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className={cn("h-5 w-5 transition-transform duration-200", isActive && "scale-110 text-gold")} />
            <span>{t.label}</span>
            {t.badge && !t.count && (
              <span className="absolute top-2.5 right-6 w-2 h-2 rounded-full bg-danger border border-white" />
            )}
            {t.count ? t.count > 0 ? (
              <span className="absolute top-1.5 right-5 min-w-[15px] h-[15px] px-1 rounded-full bg-gold text-ink font-mono font-bold text-[9px] flex items-center justify-center border border-white">
                {t.count}
              </span>
            ) : null : null}
          </button>
        );
      })}
    </nav>
  );
};
