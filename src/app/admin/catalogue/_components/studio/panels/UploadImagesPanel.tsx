"use client";

import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, Star, Trash2, X, ArrowRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';
import { catalogueService, ShotType, SHOT_TYPE_LABELS } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { useStudio } from '../StudioContext';

const SHOT_TYPES = Object.keys(SHOT_TYPE_LABELS) as ShotType[];

interface PendingFile {
  file: File;
  previewUrl: string;
  shotType: ShotType | '';
}

interface PanelProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export const UploadImagesPanel: React.FC<PanelProps> = React.memo(({ onToast }) => {
  const { product, setProduct, reloadProduct, setCurrentStep, selectedImageId, setSelectedImageId } = useStudio();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const originals = (product?.images ?? [])
    .filter((i) => i.variantType === 'ORIGINAL')
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        onToast(`"${f.name}" isn't a supported image type — skipped.`, 'error');
        return false;
      }
      return true;
    });
    setPending((prev) => [
      ...prev,
      ...valid.map((file) => ({ file, previewUrl: URL.createObjectURL(file), shotType: '' as ShotType | '' })),
    ]);
  };

  const removePending = (index: number) => {
    setPending((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const setPendingShotType = (index: number, shotType: ShotType | '') => {
    setPending((prev) => prev.map((p, i) => (i === index ? { ...p, shotType } : p)));
  };

  const uploadAll = async () => {
    if (!product || pending.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < pending.length; i++) {
        const { file, shotType } = pending[i];
        await catalogueService.uploadImageWithProgress(
          product.id,
          file,
          (percent) => setUploadProgress(Math.round(((i + percent / 100) / pending.length) * 100)),
          shotType || undefined
        );
      }
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      await reloadProduct();
      onToast('Image(s) uploaded');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    if (!product) return;
    // Optimistic update — the star flips instantly instead of waiting on
    // the round trip, then reconciles with the real server state.
    const previousImages = product.images;
    setProduct({
      ...product,
      images: product.images.map((img) => ({ ...img, isPrimary: img.id === imageId })),
    });
    try {
      await catalogueService.setPrimaryImage(product.id, imageId);
      await reloadProduct();
    } catch (err) {
      setProduct({ ...product, images: previousImages });
      onToast(err instanceof ApiError ? err.message : 'Could not set primary image.', 'error');
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!product) return;
    try {
      await catalogueService.deleteImage(product.id, imageId);
      await reloadProduct();
      onToast('Image deleted');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not delete image.', 'error');
    }
  };

  const handleReorderDrop = async (targetId: string) => {
    if (!product || !draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const ids = originals.map((i) => i.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, draggedId);
    setDraggedId(null);
    try {
      await catalogueService.reorderImages(product.id, ids);
      await reloadProduct();
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save the new order.', 'error');
    }
  };

  const goToStudio = () => {
    const primary = originals.find((i) => i.isPrimary) ?? originals[0];
    if (primary) setSelectedImageId(primary.id);
    setCurrentStep(2);
  };

  if (!product) return null;

  return (
    <div className="space-y-5">
      <div>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200',
            isDragging ? 'border-gold bg-gold/5' : 'border-slate-200 hover:border-gold/50 hover:bg-slate-50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <UploadCloud className="w-7 h-7 text-gold mx-auto mb-2" />
          <p className="text-xs font-bold text-ink">Drag & drop, or click to browse</p>
          <p className="text-[10px] text-slate-500 mt-1">JPEG, PNG, or WebP</p>
        </div>

        {pending.length > 0 && (
          <div className="mt-3 space-y-2">
            {pending.map((p, index) => (
              <div key={p.previewUrl} className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt={p.file.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <Select
                    value={p.shotType}
                    onChange={(e) => setPendingShotType(index, e.target.value as ShotType | '')}
                    className="h-8 text-[11px]"
                  >
                    <option value="">No shot type</option>
                    {SHOT_TYPES.map((st) => (
                      <option key={st} value={st}>{SHOT_TYPE_LABELS[st]}</option>
                    ))}
                  </Select>
                </div>
                <button onClick={() => removePending(index)} className="p-1 text-slate-400 hover:text-red-600 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              {uploading ? (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-gold-dark">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{uploadProgress}%</span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500">{pending.length} ready</span>
              )}
              <Button size="sm" onClick={uploadAll} isLoading={uploading}>
                Upload All
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
          Gallery {originals.length > 0 && `(${originals.length})`}
        </h3>
        {originals.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-slate-200 rounded-2xl">
            <ImageOff className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
            <p className="text-[11px] text-slate-400 font-medium">No images yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {originals.map((image) => (
              <div
                key={image.id}
                draggable
                onDragStart={() => setDraggedId(image.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleReorderDrop(image.id)}
                onClick={() => setSelectedImageId(image.id)}
                className={cn(
                  'group relative rounded-xl border overflow-hidden bg-slate-50 aspect-square cursor-pointer transition-all duration-200',
                  draggedId === image.id
                    ? 'opacity-50 border-gold'
                    : selectedImageId === image.id
                      ? 'border-gold ring-2 ring-gold/30'
                      : 'border-slate-200 hover:shadow-md'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.fileName} loading="lazy" className="w-full h-full object-cover" />

                <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
                  {image.isPrimary && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gold text-white text-[8px] font-bold shadow-sm">
                      <Star className="w-2.5 h-2.5 fill-white" />
                      Primary
                    </span>
                  )}
                </div>

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  {!image.isPrimary && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSetPrimary(image.id); }}
                      className="p-1.5 rounded-full bg-white/90 text-ink hover:bg-white transition-colors"
                      title="Set as primary"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(image.id); }}
                    className="p-1.5 rounded-full bg-white/90 text-red-600 hover:bg-white transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={goToStudio} disabled={originals.length === 0} className="w-full gap-1.5">
        <span>Continue to Auto Fit</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});
UploadImagesPanel.displayName = 'UploadImagesPanel';
