"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Stamp, UploadCloud, Loader2 } from 'lucide-react';
import { Collapsible } from '@/components/ui/collapsible';
import { Select, Switch } from '@/components/ui/form-controls';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { catalogueService, ProductImage } from '@/services/catalogueService';
import { useStudio } from '../StudioContext';
import type { WatermarkPosition } from '../studioCanvasUtils';

const POSITIONS: { key: WatermarkPosition; label: string }[] = [
  { key: 'BOTTOM_RIGHT', label: 'Bottom Right' },
  { key: 'BOTTOM_LEFT', label: 'Bottom Left' },
  { key: 'TOP_RIGHT', label: 'Top Right' },
  { key: 'TOP_LEFT', label: 'Top Left' },
  { key: 'CENTER', label: 'Center' },
];

/** Watermark — Jeweller Logo (any existing tenant image, via the Media
 * Library — no new "logo" concept invented) + the DFX Solution watermark
 * (an OVERLAY layer already built into every template) + Position/Opacity,
 * both real CanvasLayer fields. */
export const WatermarkSection: React.FC = () => {
  const { watermark, setWatermark, product, reloadProduct } = useStudio();
  const [mediaLibrary, setMediaLibrary] = useState<ProductImage[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const images = await catalogueService.getMediaLibrary();
        setMediaLibrary(images.filter((i) => i.variantType === 'ORIGINAL'));
      } finally {
        setLoadingLibrary(false);
      }
    })();
  }, []);

  const handleUploadLogo = async (file: File | undefined) => {
    if (!file || !product) return;
    setUploading(true);
    try {
      const uploaded = await catalogueService.uploadImage(product.id, file);
      setMediaLibrary((prev) => [uploaded, ...prev]);
      setWatermark((w) => ({ ...w, jewellerLogoImageId: uploaded.id }));
      await reloadProduct();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Collapsible title="Watermark" icon={Stamp}>
      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
          Jeweller Logo
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              value={watermark.jewellerLogoImageId ?? ''}
              onChange={(e) => setWatermark((w) => ({ ...w, jewellerLogoImageId: e.target.value || null }))}
              disabled={loadingLibrary}
            >
              <option value="">No logo</option>
              {mediaLibrary.map((img) => (
                <option key={img.id} value={img.id}>{img.fileName}</option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            isLoading={uploading}
          >
            <UploadCloud className="w-3.5 h-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleUploadLogo(e.target.files?.[0])}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Pick from any existing image, or upload a new one.</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0B0E23]">&quot;Powered by DFX Solution&quot; watermark</span>
        <Switch
          checked={watermark.showDfxWatermark}
          onChange={(checked) => setWatermark((w) => ({ ...w, showDfxWatermark: checked }))}
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Position</label>
        <Select
          value={watermark.position}
          onChange={(e) => setWatermark((w) => ({ ...w, position: e.target.value as WatermarkPosition }))}
        >
          {POSITIONS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
      </div>

      <Slider
        label="Logo Opacity"
        min={0.1}
        max={1}
        step={0.05}
        value={watermark.opacity}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setWatermark((w) => ({ ...w, opacity: v }))}
      />
    </Collapsible>
  );
};
