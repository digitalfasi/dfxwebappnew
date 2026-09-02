"use client";

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ImageOff, Loader2, Undo2, Redo2, RotateCcw, Save, Maximize, Columns2, LayoutTemplate, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { editPreviewToDataUrl } from '@/services/catalogueService';
import { useStudio } from '../StudioContext';
import { SmoothImage } from '../SmoothImage';

// Heaviest component in the Studio (zoom/pan/fullscreen/compare-slider) and
// only ever needed once the admin actually clicks "Fullscreen" — the one
// component in this module worth lazy-loading rather than bundling eagerly.
const ImageViewer = dynamic(() => import('../../ImageViewer').then((m) => m.ImageViewer), { ssr: false });

const CanvasFrame: React.FC<{ children: React.ReactNode; loading?: boolean }> = ({ children, loading }) => (
  <div className="relative flex-1 min-h-0 rounded-3xl bg-[repeating-conic-gradient(#F1F3F9_0_25%,white_0_50%)] bg-[length:22px_22px] border border-slate-200 shadow-card flex items-center justify-center overflow-hidden">
    {children}
    {loading && (
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[2px] flex items-center justify-center animate-fade-in">
        <Loader2 className="w-7 h-7 text-gold animate-spin" />
      </div>
    )}
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; hint?: string; action?: React.ReactNode }> = ({
  icon: Icon,
  title,
  hint,
  action,
}) => (
  <div className="flex flex-col items-center gap-3 text-center px-8 animate-fade-in">
    <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
      <Icon className="w-7 h-7 text-gold-dark" />
    </div>
    <div>
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="text-xs text-slate-400 font-medium mt-1 max-w-xs">{hint}</p>}
    </div>
    {action}
  </div>
);

/**
 * The workspace's one constant, non-negotiable region — mounted once by
 * StudioShell and never remounted by a step change. Only its *content*
 * (which image, which overlay, which toolbar) reacts to `currentStep`, via
 * SmoothImage's preload-then-swap so the previous frame is always what's
 * on screen until the next one is actually ready. This is what makes
 * "the preview must never disappear" true rather than aspirational.
 */
export const StudioCenterCanvas: React.FC = React.memo(() => {
  const {
    product,
    currentStep,
    setCurrentStep,
    selectedImageId,
    effectiveImage,
    editPreview,
    editPreviewLoading,
    editOperations,
    canUndo,
    canRedo,
    undoEdit,
    redoEdit,
    resetEdit,
    savingEdit,
    saveEditedImage,
    canvas,
    selectedTemplateKey,
    renderPreview,
    renderPreviewLoading,
  } = useStudio();

  const [viewerOpen, setViewerOpen] = useState(false);

  const originals = useMemo(
    () => (product?.images ?? []).filter((i) => i.variantType === 'ORIGINAL' || i.variantType === 'EDITED'),
    [product]
  );
  const hasAnyImage = originals.length > 0;
  const fallbackImage = effectiveImage ?? product?.images.find((i) => i.isPrimary) ?? product?.images[0] ?? null;

  const editingSrc = editPreview ? editPreviewToDataUrl(editPreview) : fallbackImage?.url ?? null;
  const renderSrc = renderPreview ? editPreviewToDataUrl(renderPreview) : null;

  const showEditingToolbar = currentStep === 2 || currentStep === 3;

  let body: React.ReactNode;

  if (currentStep === 0) {
    body = fallbackImage ? (
      <SmoothImage src={fallbackImage.url} alt={product?.name ?? 'Product'} className="max-w-full max-h-full object-contain p-6" />
    ) : (
      <EmptyState
        icon={ImageOff}
        title="Your product canvas will appear here"
        hint="Fill in the details, then continue to upload photography."
      />
    );
  } else if (currentStep === 1) {
    body = fallbackImage ? (
      <SmoothImage src={fallbackImage.url} alt={fallbackImage.fileName} className="max-w-full max-h-full object-contain p-6" />
    ) : (
      <EmptyState icon={ImageOff} title="No images yet" hint="Drag & drop photos in the panel on the right." />
    );
  } else if (currentStep === 2 || currentStep === 3) {
    body = hasAnyImage ? (
      <SmoothImage src={editingSrc} alt="Live preview" className="max-w-full max-h-full object-contain p-6" />
    ) : (
      <EmptyState
        icon={ImageOff}
        title="Upload at least one image first"
        hint="Auto Fit and Image Processing work on a real uploaded photo."
        action={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCurrentStep(1)}>
            <span>Go to Upload Images</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        }
      />
    );
  } else if (currentStep === 4) {
    body = renderSrc ? (
      <SmoothImage src={renderSrc} alt="Template render" className="max-w-full max-h-full object-contain p-6" />
    ) : (
      <EmptyState
        icon={LayoutTemplate}
        title="Choose a template"
        hint="Pick one from the panel on the right — it renders here instantly."
      />
    );
  } else {
    // Preview & Export — before/after, the export controls live in the right panel.
    body = canvas ? (
      <div className="w-full h-full grid grid-cols-2 gap-3 p-4">
        <div className="min-h-0 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">Before</span>
          <div className="flex-1 min-h-0 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
            <SmoothImage src={fallbackImage?.url ?? null} alt="Before" className="max-w-full max-h-full object-contain p-2" fallback={<ImageOff className="w-6 h-6 text-slate-300" />} />
          </div>
        </div>
        <div className="min-h-0 flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">After</span>
          <div className="flex-1 min-h-0 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
            <SmoothImage src={renderSrc} alt="After" className="max-w-full max-h-full object-contain p-2" fallback={<Loader2 className="w-5 h-5 text-gold animate-spin" />} />
          </div>
        </div>
      </div>
    ) : (
      <EmptyState
        icon={LayoutTemplate}
        title="Select a template first"
        hint="Preview & Export needs a template to render against."
        action={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCurrentStep(4)}>
            <span>Go to Templates</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        }
      />
    );
  }

  const isLoadingOverlay =
    (showEditingToolbar && editPreviewLoading) || ((currentStep === 4 || currentStep === 5) && renderPreviewLoading);

  return (
    <div className="flex-1 min-w-0 flex flex-col p-5 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          {showEditingToolbar && (
            <>
              <Button size="sm" variant="outline" onClick={undoEdit} disabled={!canUndo} className="gap-1 px-2.5" title="Undo">
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={redoEdit} disabled={!canRedo} className="gap-1 px-2.5" title="Redo">
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={resetEdit} disabled={editOperations.length === 0} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </Button>
              {editOperations.length > 0 && (
                <span className="text-[11px] text-slate-400 font-semibold ml-1">
                  {editOperations.length} adjustment{editOperations.length > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
          {currentStep === 4 && selectedTemplateKey && (
            <span className="text-[11px] font-bold text-slate-500">Live render — updates as you adjust the panel</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {showEditingToolbar && editOperations.length > 0 && (
            <Button size="sm" onClick={() => saveEditedImage()} isLoading={savingEdit} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              <span>Save as New Version</span>
            </Button>
          )}
          {currentStep === 5 && renderSrc && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setViewerOpen(true)}>
              <Maximize className="w-3.5 h-3.5" />
              <span>Fullscreen + Compare</span>
            </Button>
          )}
        </div>
      </div>

      <CanvasFrame loading={isLoadingOverlay}>{body}</CanvasFrame>

      {/* SELECTED IMAGE STRIP — quick-switch without leaving the canvas, shown whenever there's more than one image and the step benefits from it. */}
      {(currentStep === 1 || currentStep === 2 || currentStep === 3) && originals.length > 1 && (
        <SelectedImageStrip />
      )}

      {viewerOpen && (
        <ImageViewer
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          imageUrl={renderSrc ?? ''}
          imageLabel="After"
          compareUrl={fallbackImage?.url ?? undefined}
          compareLabel="Before"
        />
      )}
    </div>
  );
});
StudioCenterCanvas.displayName = 'StudioCenterCanvas';

const SelectedImageStrip: React.FC = React.memo(() => {
  const { product, selectedImageId, setSelectedImageId } = useStudio();
  const originals = useMemo(
    () => (product?.images ?? []).filter((i) => i.variantType === 'ORIGINAL' || i.variantType === 'EDITED'),
    [product]
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 pb-1">
      {originals.map((img) => (
        <button
          key={img.id}
          onClick={() => setSelectedImageId(img.id)}
          className={
            'relative w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all duration-150 ' +
            (selectedImageId === img.id ? 'border-gold' : 'border-transparent hover:border-slate-200 opacity-80 hover:opacity-100')
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" loading="lazy" />
          {img.variantType === 'EDITED' && (
            <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[7px] font-bold text-center">
              EDITED
            </span>
          )}
        </button>
      ))}
    </div>
  );
});
SelectedImageStrip.displayName = 'SelectedImageStrip';
