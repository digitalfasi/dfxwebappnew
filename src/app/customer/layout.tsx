import React from 'react';
import { CustomerHeader } from '@/components/layout/CustomerHeader';
import { CustomerBottomNav } from '@/components/layout/CustomerBottomNav';
import { CartProvider } from '@/providers/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { RequireAuth } from '@/components/shared/RequireAuth';
import { TenantProvider } from '@/providers/TenantProvider';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allow={['customer']}>
      <TenantProvider>
        <CartProvider>
          <div className="min-h-[calc(100vh-50px)] bg-[#ECEEF7] flex justify-center items-start p-0 sm:p-6">
            {/* Mobile Frame Wrapper on Desktop, Full Screen on Mobile */}
            <div className="w-full max-w-md bg-cream min-h-screen sm:min-h-[720px] sm:rounded-3xl sm:border sm:border-slate-line sm:shadow-2xl flex flex-col relative overflow-hidden">
              <CustomerHeader />
              <main className="flex-1 p-4 pb-6 overflow-y-auto">{children}</main>
              <CustomerBottomNav />
              <CartDrawer />
            </div>
          </div>
        </CartProvider>
      </TenantProvider>
    </RequireAuth>
  );
}
