"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Bell, ShoppingBag } from 'lucide-react';
import { Toast } from '@/components/ui/toast';
import { getInitials } from '@/lib/formatters';

export const CustomerHeader: React.FC = () => {
  const router = useRouter();
  const { branding } = useTenant();
  const { user } = useAuth();
  const { summary, openCart } = useCart();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleNotificationClick = () => {
    setToastMessage("No new notifications");
  };

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-cream border-b border-slate-line">
        <div
          onClick={() => router.push('/customer')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-radial from-ink-2 to-ink border border-gold flex items-center justify-center font-display font-bold text-[10px] text-gold-light shrink-0">
            {branding.logoText || 'DF'}
          </div>
          <span className="font-display font-bold text-xs text-ink">
            {branding.brandName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Shopping Cart Trigger */}
          <button
            onClick={openCart}
            aria-label="Shopping Cart"
            className="relative w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold transition-colors"
          >
            <ShoppingBag className="h-4 w-4" />
            {summary.totalItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-ink font-mono font-bold text-[10px] flex items-center justify-center border border-white shadow-sm animate-in zoom-in-50">
                {summary.totalItemsCount}
              </span>
            )}
          </button>

          {/* Notifications */}
          <button
            onClick={handleNotificationClick}
            className="relative w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-danger border border-white" />
          </button>

          {/* Profile */}
          <button
            onClick={() => router.push('/customer/profile')}
            className="w-8 h-8 rounded-full bg-gold-dim text-[#1E4E8C] flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-gold transition-all"
          >
            {getInitials(user?.name || 'User')}
          </button>
        </div>
      </div>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </>
  );
};
