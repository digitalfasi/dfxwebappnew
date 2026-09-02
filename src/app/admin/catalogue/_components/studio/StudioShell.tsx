"use client";

import React, { useCallback, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { Toast } from '@/components/ui/toast';
import { useStudio } from './StudioContext';
import { StudioTopHeader } from './workspace/StudioTopHeader';
import { StudioLeftNav } from './workspace/StudioLeftNav';
import { StudioCenterCanvas } from './workspace/StudioCenterCanvas';
import { StudioRightPanel } from './workspace/StudioRightPanel';

/**
 * Module 28 — one persistent workspace instead of a wizard of stacked
 * pages. The header, left nav, and canvas are mounted exactly once by this
 * component and never remount on a step change — only StudioRightPanel's
 * children swap (see that file). This is the actual mechanism behind "the
 * preview must never disappear," not just a visual claim: there is no
 * `key`-driven remount and no conditional return anywhere in this tree that
 * would unmount the canvas once a product is loaded.
 *
 * Loading/error states are scoped to the *canvas + panel* area only — the
 * header and left nav render unconditionally, so even the very first paint
 * of an existing product shows the workspace chrome immediately with the
 * center area alone reflecting the fetch in flight.
 */
export const StudioShell: React.FC = () => {
  const { product, loadingProduct, loadError, isNewProduct, reloadProduct } = useStudio();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const workspaceIsLoading = !isNewProduct && loadingProduct;
  const workspaceHasError = !isNewProduct && !loadingProduct && (loadError || !product);

  return (
    <div className="h-[calc(100vh-108px)] flex flex-col rounded-3xl overflow-hidden border border-slate-200 shadow-premium bg-cream-dark">
      <StudioTopHeader onToast={showToast} />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <StudioLeftNav />

        {workspaceIsLoading ? (
          <div className="flex-1 flex flex-col p-5 gap-3">
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="flex-1 rounded-3xl" />
          </div>
        ) : workspaceHasError ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <ErrorState message={loadError || 'Product not found.'} onRetry={reloadProduct} />
          </div>
        ) : (
          <>
            <StudioCenterCanvas />
            <StudioRightPanel onToast={showToast} />
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
