"use client";

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, Save, Download, FileText, Layers, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/form-controls';
import { Collapsible } from '@/components/ui/collapsible';
import {
  catalogueService, Product, ProductImage, OutputPresetKey, triggerBase64Download,
} from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { useStudio } from '../StudioContext';

interface PanelProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const EXPORT_PRESETS: { key: OutputPresetKey; label: string }[] = [
  { key: 'INSTAGRAM_POST', label: 'Instagram Post' },
  { key: 'INSTAGRAM_STORY', label: 'Instagram Story' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'SQUARE', label: 'Square' },
  { key: 'PORTRAIT', label: 'Portrait' },
  { key: 'LANDSCAPE', label: 'Landscape' },
  { key: 'POSTER', label: 'Poster' },
  { key: 'BANNER', label: 'Banner' },
];

export const PreviewExportPanel: React.FC<PanelProps> = React.memo(({ onToast }) => {
  const { product, canvas, selectedTemplateKey, quality, savedDesign, setSavedDesign, reloadProduct } = useStudio();

  // -- Save Product ---------------------------------------------------------
  const [savingProduct, setSavingProduct] = useState(false);
  const handleSaveProduct = async () => {
    if (!product) return;
    setSavingProduct(true);
    try {
      await catalogueService.updateProduct(product.id, { isActive: true });
      await reloadProduct();
      onToast('Product saved and marked active in the catalogue');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save product.', 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  // -- Save Version -----------------------------------------------------------
  const [versionName, setVersionName] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const handleSaveVersion = async () => {
    if (!product || !canvas) return;
    setSavingVersion(true);
    try {
      const design = await catalogueService.saveDesign(product.id, canvas, versionName || undefined, selectedTemplateKey || undefined);
      setSavedDesign(design);
      onToast(`Saved as version ${design.version}`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save this version.', 'error');
    } finally {
      setSavingVersion(false);
    }
  };

  const ensureSavedDesign = async () => {
    if (savedDesign) return savedDesign;
    if (!product || !canvas) throw new Error('No design to export yet — select a template first.');
    const design = await catalogueService.saveDesign(product.id, canvas, versionName || undefined, selectedTemplateKey || undefined);
    setSavedDesign(design);
    return design;
  };

  // -- Export Images ----------------------------------------------------------
  const [selectedPresets, setSelectedPresets] = useState<Set<OutputPresetKey>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportedImages, setExportedImages] = useState<ProductImage[]>([]);
  const togglePreset = (key: OutputPresetKey) =>
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleExportImages = async () => {
    if (!product || selectedPresets.size === 0) return;
    setExporting(true);
    try {
      const design = await ensureSavedDesign();
      const results: ProductImage[] = [];
      for (const preset of selectedPresets) {
        results.push(await catalogueService.exportDesign(product.id, design.id, preset, quality));
      }
      setExportedImages(results);
      await reloadProduct();
      onToast(`Exported ${results.length} image(s)`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : (err as Error)?.message ?? 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // -- Generate PDF -------------------------------------------------------------
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const handleGeneratePdf = async () => {
    if (!product || !selectedTemplateKey) {
      onToast('Select a template in the Templates step first.', 'error');
      return;
    }
    setGeneratingPdf(true);
    try {
      const result = await catalogueService.generateCataloguePdf(selectedTemplateKey, [product.id], quality);
      triggerBase64Download(result.filename, result.contentType, result.contentBase64);
      onToast('Catalogue PDF downloaded');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not generate PDF.', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // -- Batch Render -------------------------------------------------------------
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchResults, setBatchResults] = useState<ProductImage[]>([]);

  useEffect(() => {
    catalogueService.getProducts().then((all) => setAllProducts(all.filter((p) => p.id !== product?.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const toggleBatchProduct = (id: string) =>
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleBatchRender = async () => {
    if (!product || !selectedTemplateKey || selectedBatchIds.size === 0) return;
    setBatchRendering(true);
    try {
      const results = await catalogueService.batchRender(
        selectedTemplateKey,
        [product.id, ...Array.from(selectedBatchIds)],
        undefined,
        quality
      );
      setBatchResults(results);
      onToast(`Batch-rendered ${results.length} product(s)`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Batch render failed.', 'error');
    } finally {
      setBatchRendering(false);
    }
  };

  if (!product) return null;

  return (
    <div className="space-y-3">
      <Collapsible title="Save Product" icon={CheckCircle2} defaultOpen>
        <p className="text-[11px] text-slate-500 -mt-1">Confirms this product is saved and active in the catalogue.</p>
        <Button size="sm" onClick={handleSaveProduct} isLoading={savingProduct} className="gap-1.5">
          <Save className="w-3.5 h-3.5" />
          <span>Save Product</span>
        </Button>
      </Collapsible>

      <Collapsible title="Save Version" icon={Layers} defaultOpen>
        <p className="text-[11px] text-slate-500 -mt-1">Saves the current design as a new immutable version.</p>
        <Input
          value={versionName}
          onChange={(e) => setVersionName(e.target.value)}
          placeholder="Version name (optional)"
          disabled={!canvas}
        />
        <Button size="sm" onClick={handleSaveVersion} isLoading={savingVersion} disabled={!canvas} className="gap-1.5">
          <Save className="w-3.5 h-3.5" />
          <span>Save Version</span>
        </Button>
        {savedDesign && (
          <p className="text-[11px] text-emerald-600 font-semibold">Current version: v{savedDesign.version}</p>
        )}
      </Collapsible>

      <Collapsible title="Export Images" icon={Download}>
        <p className="text-[11px] text-slate-500 -mt-1">Renders and saves real marketing-ready images at the sizes you pick.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {EXPORT_PRESETS.map((p) => (
            <Checkbox
              key={p.key}
              label={p.label}
              checked={selectedPresets.has(p.key)}
              onChange={() => togglePreset(p.key)}
            />
          ))}
        </div>
        <Button size="sm" onClick={handleExportImages} isLoading={exporting} disabled={!canvas || selectedPresets.size === 0} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          <span>Export Selected</span>
        </Button>
        {exportedImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {exportedImages.map((img) => (
              <a
                key={img.id}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {img.variantType}
              </a>
            ))}
          </div>
        )}
      </Collapsible>

      <Collapsible title="Generate PDF" icon={FileText}>
        <p className="text-[11px] text-slate-500 -mt-1">Assembles this product into a downloadable catalogue PDF.</p>
        <Button size="sm" onClick={handleGeneratePdf} isLoading={generatingPdf} disabled={!selectedTemplateKey} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span>Generate PDF</span>
        </Button>
      </Collapsible>

      <Collapsible title="Batch Render" icon={Layers}>
        <p className="text-[11px] text-slate-500 -mt-1">Applies this template to other products too, synchronously.</p>
        <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
          {allProducts.map((p) => (
            <Checkbox
              key={p.id}
              label={p.name}
              checked={selectedBatchIds.has(p.id)}
              onChange={() => toggleBatchProduct(p.id)}
            />
          ))}
          {allProducts.length === 0 && <p className="text-[11px] text-slate-400">No other products yet.</p>}
        </div>
        <Button
          size="sm"
          onClick={handleBatchRender}
          isLoading={batchRendering}
          disabled={!selectedTemplateKey || selectedBatchIds.size === 0}
          className="gap-1.5"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Batch Render ({selectedBatchIds.size})</span>
        </Button>
        {batchResults.length > 0 && (
          <p className="text-[11px] text-emerald-600 font-semibold">
            Rendered {batchResults.length} product(s) successfully.
          </p>
        )}
      </Collapsible>
    </div>
  );
});
PreviewExportPanel.displayName = 'PreviewExportPanel';
