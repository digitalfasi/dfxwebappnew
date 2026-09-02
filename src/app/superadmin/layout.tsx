import React from 'react';
import { SuperAdminSidebar } from '@/components/layout/SuperAdminSidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RequireAuth } from '@/components/shared/RequireAuth';
import { TenantProvider } from '@/providers/TenantProvider';

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allow={['superadmin']}>
      <TenantProvider>
        <div className="flex h-screen overflow-hidden bg-[#F7F8FC]">
          <SuperAdminSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 p-6 overflow-y-auto">{children}</main>
          </div>
        </div>
      </TenantProvider>
    </RequireAuth>
  );
}
