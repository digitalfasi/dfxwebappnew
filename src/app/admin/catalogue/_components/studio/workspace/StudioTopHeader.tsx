"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Eye, Download, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { catalogueService } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { useStudio } from '../StudioContext';

interface StudioTopHeaderProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

/**
 * Always mounted, never swapped — the one constant across every step
 * (per the "keep the workspace mounted" requirement). Product name is
 * inline-editable (Canva/Adobe-Express-style click-to-rename) once the
 * product exists; Save persists it as active via the same updateProduct
 * call Step 6 used to own; Preview/Export both jump straight to the
 * Preview & Export panel — no new destinations, just faster entry points.
 */
export const StudioTopHeader: React.FC<StudioTopHeaderProps> = React.memo(({ onToast }) => {
  const router = useRouter();
  const { product, isNewProduct, setProduct, setCurrentStep, reloadProduct } = useStudio();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  const startEditingName = () => {
    if (!product) return;
    setNameDraft(product.name);
    setEditingName(true);
  };

  const commitName = async () => {
    if (!product) return;
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === product.name) return;
    setSavingName(true);
    try {
      const saved = await catalogueService.updateProduct(product.id, { name: trimmed });
      setProduct(saved);
      onToast('Product name updated');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not rename product.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleSave = async () => {
    if (!product) return;
    setSavingProduct(true);
    try {
      await catalogueService.updateProduct(product.id, { isActive: true });
      await reloadProduct();
      onToast('Product saved');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save product.', 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 px-5 py-3 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <button
        onClick={() => router.push('/admin/catalogue')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink transition-colors shrink-0"
        title="Back to Catalogue Studio"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      <div className="h-6 w-px bg-slate-200 shrink-0" />

      <div className="flex items-center gap-2 min-w-0 flex-1">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="font-display font-extrabold text-lg text-ink bg-gold/5 border border-gold/30 rounded-lg px-2 py-0.5 outline-none focus:ring-4 focus:ring-gold/10 min-w-0 flex-1"
          />
        ) : (
          <button
            onClick={startEditingName}
            disabled={isNewProduct || !product}
            className="group flex items-center gap-2 min-w-0 disabled:cursor-default"
            title={isNewProduct ? undefined : 'Click to rename'}
          >
            <h1 className="font-display font-extrabold text-lg text-ink truncate">
              {isNewProduct ? 'New Product' : product?.name || 'Product Studio'}
            </h1>
            {!isNewProduct && product && (
              <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-gold shrink-0 transition-colors" />
            )}
            {savingName && <Loader2 className="w-3.5 h-3.5 text-gold animate-spin shrink-0" />}
          </button>
        )}
        <span className="hidden sm:inline-flex shrink-0 items-center px-2.5 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-[10px] font-bold text-gold-dark uppercase tracking-wide">
          Product Studio
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!product}
          onClick={() => setCurrentStep(5)}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Preview</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!product}
          onClick={() => setCurrentStep(5)}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!product}
          isLoading={savingProduct}
          onClick={handleSave}
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save</span>
        </Button>
      </div>
    </header>
  );
});
StudioTopHeader.displayName = 'StudioTopHeader';
