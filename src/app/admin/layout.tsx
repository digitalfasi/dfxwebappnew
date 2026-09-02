import React from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RequireAuth } from '@/components/shared/RequireAuth';
import { TenantProvider } from '@/providers/TenantProvider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allow={['admin']}>
      <TenantProvider>
        <div className="flex h-screen overflow-hidden bg-[#F7F8FC]">
          <AdminSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 p-6 overflow-y-auto">{children}</main>
          </div>
        </div>
      </TenantProvider>
    </RequireAuth>
  );
}
