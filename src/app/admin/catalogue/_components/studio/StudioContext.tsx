"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  catalogueService,
  Product,
  ProductImage,
  ImageEditOperation,
  CanvasDocument,
  RenderQuality,
  OutputPresetKey,
  ImageEditPreviewResult,
  CatalogueDesign,
  Template,
} from '@/services/catalogueService';
import { WatermarkPosition, buildCanvasFromTemplate } from './studioCanvasUtils';

export interface WatermarkSettings {
  jewellerLogoImageId: string | null;
  showDfxWatermark: boolean;
  position: WatermarkPosition;
  opacity: number;
}

const DEFAULT_WATERMARK: WatermarkSettings = {
  jewellerLogoImageId: null,
  showDfxWatermark: true,
  position: 'BOTTOM_RIGHT',
  opacity: 0.9,
};

// Module 28 — relabeled for the workspace's left nav (Studio → Auto Fit +
// Image Processing as two distinct entries; Preview + Publish merged into
// one "Preview & Export" entry). Purely presentational: still 6 entries at
// the same indices, so currentStep/furthestUnlockedStep need no changes.
export const STUDIO_STEPS = [
  'Product Details',
  'Upload Images',
  'Auto Fit',
  'Image Processing',
  'Templates',
  'Preview & Export',
] as const;

interface StudioContextValue {
  // -- Product (Step 1) ---------------------------------------------------
  product: Product | null;
  loadingProduct: boolean;
  loadError: string;
  isNewProduct: boolean;
  reloadProduct: () => Promise<void>;
  setProduct: (p: Product) => void;

  // -- Wizard navigation ----------------------------------------------------
  currentStep: number;
  setCurrentStep: (step: number) => void;
  furthestUnlockedStep: number;

  // -- Selected image (Step 2/3) --------------------------------------------
  selectedImageId: string | null;
  setSelectedImageId: (id: string | null) => void;

  // -- Image Editor session (Step 3 — Phase A, ephemeral until Save) -------
  editOperations: ImageEditOperation[];
  applyEditOperation: (op: ImageEditOperation, options?: { stack?: boolean }) => void;
  removeEditOperationType: (type: string) => void;
  undoEdit: () => void;
  redoEdit: () => void;
  resetEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  editPreview: ImageEditPreviewResult | null;
  editPreviewLoading: boolean;
  savingEdit: boolean;
  saveEditedImage: () => Promise<ProductImage | null>;

  // -- Watermark (Step 3) ---------------------------------------------------
  watermark: WatermarkSettings;
  setWatermark: React.Dispatch<React.SetStateAction<WatermarkSettings>>;

  // -- Quality (Step 3) -------------------------------------------------------
  quality: RenderQuality;
  setQuality: (q: RenderQuality) => void;

  // -- Template & canvas (Step 4) --------------------------------------------
  selectedTemplateKey: string | null;
  canvas: CanvasDocument | null;
  selectTemplate: (templateKey: string, templateCanvas: CanvasDocument) => void;
  outputPreset: OutputPresetKey | null;
  setOutputPreset: (p: OutputPresetKey | null) => void;

  // -- Live render preview (Step 4/5) ----------------------------------------
  renderPreview: ImageEditPreviewResult | null;
  renderPreviewLoading: boolean;
  refreshRenderPreview: () => Promise<void>;

  // -- Saved design version (Step 6) -----------------------------------------
  savedDesign: CatalogueDesign | null;
  setSavedDesign: (d: CatalogueDesign | null) => void;

  // -- Effective image (source for the design's Product layer) --------------
  effectiveImage: ProductImage | null;

  // -- Templates (Step 4) — fetched once per session, shared across visits --
  templates: Template[];
  templatesLoading: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const useStudio = (): StudioContextValue => {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within a StudioProvider');
  return ctx;
};

export const StudioProvider: React.FC<{ productId: string; children: React.ReactNode }> = ({
  productId,
  children,
}) => {
  const isNewProduct = productId === 'new';

  const [product, setProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(!isNewProduct);
  const [loadError, setLoadError] = useState('');
  const [currentStep, setCurrentStepState] = useState(0);
  const [furthestUnlockedStep, setFurthestUnlockedStep] = useState(isNewProduct ? 0 : 5);

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const [editOperations, setEditOperations] = useState<ImageEditOperation[]>([]);
  const [editHistory, setEditHistory] = useState<ImageEditOperation[][]>([]);
  const [editFuture, setEditFuture] = useState<ImageEditOperation[][]>([]);
  const [editPreview, setEditPreview] = useState<ImageEditPreviewResult | null>(null);
  const [editPreviewLoading, setEditPreviewLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [watermark, setWatermark] = useState<WatermarkSettings>(DEFAULT_WATERMARK);
  const [quality, setQuality] = useState<RenderQuality>('HIGH');

  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasDocument | null>(null);
  const [outputPreset, setOutputPreset] = useState<OutputPresetKey | null>(null);

  const [renderPreview, setRenderPreviewState] = useState<ImageEditPreviewResult | null>(null);
  const [renderPreviewLoading, setRenderPreviewLoading] = useState(false);

  const [savedDesign, setSavedDesign] = useState<CatalogueDesign | null>(null);

  // Templates are product-agnostic and never change within a session — fetch
  // once here so revisiting Step 4 doesn't re-trigger its network+skeleton
  // every time (it previously fetched on every mount of that step).
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    catalogueService
      .listTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productRef = React.useRef(product);
  productRef.current = product;

  const reloadProduct = useCallback(async () => {
    if (isNewProduct) return;
    setLoadingProduct(true);
    setLoadError('');
    try {
      const data = await catalogueService.getProductById(productId);
      setProduct(data);
      const primary = data.images.find((i) => i.isPrimary && i.variantType === 'ORIGINAL');
      setSelectedImageId((current) => current ?? primary?.id ?? data.images[0]?.id ?? null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load this product.');
    } finally {
      setLoadingProduct(false);
    }
  }, [productId, isNewProduct]);

  React.useEffect(() => {
    // Step 1's submit already sets `product` from the create response right
    // before flipping the URL from /new to the real id — skip the redundant
    // GET (and the loading-skeleton flash it would otherwise trigger) when
    // we already hold the product this productId now points to.
    if (productRef.current?.id === productId) {
      setLoadingProduct(false);
      return;
    }
    reloadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const setCurrentStep = useCallback((step: number) => {
    setCurrentStepState(step);
    setFurthestUnlockedStep((prev) => Math.max(prev, step));
  }, []);

  // -- Image Editor session (Phase A) ---------------------------------------
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runEditPreview = useCallback(
    (ops: ImageEditOperation[]) => {
      if (!product || !selectedImageId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (ops.length === 0) {
        setEditPreview(null);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setEditPreviewLoading(true);
        try {
          const result = await catalogueService.previewEditImage(product.id, selectedImageId, ops);
          setEditPreview(result);
        } catch {
          // A transient/invalid intermediate operation state shouldn't crash
          // the session — the last good preview just stays on screen.
        } finally {
          setEditPreviewLoading(false);
        }
      }, 350);
    },
    [product, selectedImageId]
  );

  /**
   * Adds/updates one operation in the session's list. For continuous
   * controls (Brightness/Contrast/Saturation/Sharpness/Blur/Noise
   * Reduction/White Balance/Auto Fit) this UPSERTS by type — re-dragging a
   * slider replaces that one adjustment's value in place rather than
   * stacking a new operation per tick, which is what a user actually means
   * by "set brightness to X." Pass `stack: true` for genuinely discrete,
   * repeatable actions (e.g. multiple crops) that should each stay as their
   * own step.
   */
  const applyEditOperation = useCallback(
    (op: ImageEditOperation, options?: { stack?: boolean }) => {
      setEditHistory((h) => [...h, editOperations]);
      setEditFuture([]);
      const next = options?.stack
        ? [...editOperations, op]
        : [...editOperations.filter((existing) => existing.type !== op.type), op];
      setEditOperations(next);
      runEditPreview(next);
    },
    [editOperations, runEditPreview]
  );

  const removeEditOperationType = useCallback(
    (type: string) => {
      setEditHistory((h) => [...h, editOperations]);
      setEditFuture([]);
      const next = editOperations.filter((op) => op.type !== type);
      setEditOperations(next);
      runEditPreview(next);
    },
    [editOperations, runEditPreview]
  );

  const undoEdit = useCallback(() => {
    setEditHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setEditFuture((f) => [editOperations, ...f]);
      setEditOperations(prev);
      runEditPreview(prev);
      return h.slice(0, -1);
    });
  }, [editOperations, runEditPreview]);

  const redoEdit = useCallback(() => {
    setEditFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setEditHistory((h) => [...h, editOperations]);
      setEditOperations(next);
      runEditPreview(next);
      return f.slice(1);
    });
  }, [editOperations, runEditPreview]);

  const resetEdit = useCallback(() => {
    setEditHistory([]);
    setEditFuture([]);
    setEditOperations([]);
    setEditPreview(null);
  }, []);

  // Selecting a different image starts a fresh, empty editing session.
  React.useEffect(() => {
    resetEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImageId]);

  const saveEditedImage = useCallback(async (): Promise<ProductImage | null> => {
    if (!product || !selectedImageId || editOperations.length === 0) return null;
    setSavingEdit(true);
    try {
      const saved = await catalogueService.saveEditImage(product.id, selectedImageId, editOperations);
      await reloadProduct();
      setSelectedImageId(saved.id);
      resetEdit();
      return saved;
    } finally {
      setSavingEdit(false);
    }
  }, [product, selectedImageId, editOperations, reloadProduct, resetEdit]);

  // -- Template selection + live render preview (Phase B) -------------------
  const effectiveImage = useMemo<ProductImage | null>(() => {
    if (!product) return null;
    return product.images.find((i) => i.id === selectedImageId) ?? null;
  }, [product, selectedImageId]);

  const selectTemplate = useCallback(
    (templateKey: string, templateCanvas: CanvasDocument) => {
      setSelectedTemplateKey(templateKey);
      const built = buildCanvasFromTemplate(
        templateCanvas,
        effectiveImage?.id ?? selectedImageId,
        watermark
      );
      setCanvas(built);
      setSavedDesign(null); // a different template starts a new, unsaved version
    },
    [effectiveImage, selectedImageId, watermark]
  );

  // Re-derive the canvas whenever the effective image or watermark settings
  // change, so the live preview always reflects the Studio's current state
  // without requiring the user to re-click the template.
  React.useEffect(() => {
    if (!selectedTemplateKey || !canvas) return;
    setCanvas((prev) => (prev ? buildCanvasFromTemplate(prev, effectiveImage?.id ?? selectedImageId, watermark) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveImage?.id, watermark]);

  const refreshRenderPreview = useCallback(async () => {
    if (!product || !canvas) return;
    setRenderPreviewLoading(true);
    try {
      const result = await catalogueService.renderPreview(product.id, canvas, outputPreset ?? undefined, quality);
      setRenderPreviewState(result);
    } catch {
      // keep the last good preview on screen
    } finally {
      setRenderPreviewLoading(false);
    }
  }, [product, canvas, outputPreset, quality]);

  React.useEffect(() => {
    if (!canvas) return;
    const timer = setTimeout(() => refreshRenderPreview(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, outputPreset, quality]);

  // Memoized so a state change in one corner of the wizard (e.g. a debounced
  // preview finishing in the background) doesn't force every context
  // consumer — including whichever step is currently mounted — to re-render.
  const value: StudioContextValue = useMemo(
    () => ({
      product,
      loadingProduct,
      loadError,
      isNewProduct,
      reloadProduct,
      setProduct,
      currentStep,
      setCurrentStep,
      furthestUnlockedStep,
      selectedImageId,
      setSelectedImageId,
      editOperations,
      applyEditOperation,
      removeEditOperationType,
      undoEdit,
      redoEdit,
      resetEdit,
      canUndo: editHistory.length > 0,
      canRedo: editFuture.length > 0,
      editPreview,
      editPreviewLoading,
      savingEdit,
      saveEditedImage,
      watermark,
      setWatermark,
      quality,
      setQuality,
      selectedTemplateKey,
      canvas,
      selectTemplate,
      outputPreset,
      setOutputPreset,
      renderPreview,
      renderPreviewLoading,
      refreshRenderPreview,
      savedDesign,
      setSavedDesign,
      effectiveImage,
      templates,
      templatesLoading,
    }),
    [
      product,
      loadingProduct,
      loadError,
      isNewProduct,
      reloadProduct,
      currentStep,
      setCurrentStep,
      furthestUnlockedStep,
      selectedImageId,
      editOperations,
      applyEditOperation,
      removeEditOperationType,
      undoEdit,
      redoEdit,
      resetEdit,
      editHistory.length,
      editFuture.length,
      editPreview,
      editPreviewLoading,
      savingEdit,
      saveEditedImage,
      watermark,
      quality,
      selectedTemplateKey,
      canvas,
      selectTemplate,
      outputPreset,
      renderPreview,
      renderPreviewLoading,
      refreshRenderPreview,
      savedDesign,
      effectiveImage,
      templates,
      templatesLoading,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
};
