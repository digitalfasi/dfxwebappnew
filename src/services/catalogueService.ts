import { apiClient, API_BASE_URL, tokenStore, ApiError } from '@/lib/apiClient';

export type ImageVariantType =
  | 'ORIGINAL'
  | 'ENHANCED'
  | 'BACKGROUND_REMOVED'
  | 'TEMPLATE'
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'PDF'
  | 'THUMBNAIL'
  // Module 21 — two more named pipeline stops, plus a Facebook marketing variant.
  | 'LUXURY_LIGHTING'
  | 'FINAL_CATALOGUE'
  | 'FACEBOOK'
  // Phase A — Image Editor's Save step.
  | 'EDITED';

export type AIEnhancementType =
  | 'REMOVE_BACKGROUND'
  | 'HD_UPSCALE'
  | 'LUXURY_LIGHTING'
  | 'DIAMOND_ENHANCEMENT'
  | 'GOLD_SHINE'
  | 'REFLECTION_REMOVAL'
  | 'AUTO_CROP'
  | 'SHADOW_CORRECTION';

export const PIPELINE_STAGES: ImageVariantType[] = [
  'ORIGINAL',
  'BACKGROUND_REMOVED',
  'ENHANCED',
  'LUXURY_LIGHTING',
  'FINAL_CATALOGUE',
];

export interface PipelineStageStatus {
  variantType: ImageVariantType;
  completed: boolean;
  image: ProductImage | null;
}

export interface PipelineStatus {
  sourceImageId: string;
  stages: PipelineStageStatus[];
  aiProviderConfigured: boolean;
}

/** Product Studio redesign — the 7 real-world shot angles Step 2 tags an
 * upload with. Stored on the backend (ProductImage.shot_type), not just
 * ephemeral frontend state. */
export type ShotType = 'FRONT' | 'BACK' | 'SIDE' | 'TOP' | 'ANGLE_45' | 'LIFESTYLE' | 'MACRO';

export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  FRONT: 'Front',
  BACK: 'Back',
  SIDE: 'Side',
  TOP: 'Top',
  ANGLE_45: '45°',
  LIFESTYLE: 'Lifestyle',
  MACRO: 'Macro',
};

interface BackendProductImage {
  id: string;
  product_id: string;
  variant_type: ImageVariantType;
  source_image_id: string | null;
  shot_type: string | null;
  url: string;
  file_name: string;
  content_type: string;
  file_size_bytes: number;
  display_order: number;
  is_primary: boolean;
  created_at: string;
}

interface BackendProduct {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  purity: string | null;
  price: number | null;
  weight_grams: number | null;
  tags: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  images: BackendProductImage[];
  primary_image_url: string | null;
  image_count: number;
}

export interface ProductImage {
  id: string;
  productId: string;
  variantType: ImageVariantType;
  sourceImageId: string | null;
  shotType: ShotType | null;
  url: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  purity: string;
  price: number | null;
  weightGrams: number | null;
  tags: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  images: ProductImage[];
  primaryImageUrl: string | null;
  imageCount: number;
}

export interface ProductFormData {
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  purity?: string;
  price?: number | null;
  weightGrams?: number | null;
  tags?: string[];
  isActive?: boolean;
}

interface BackendPipelineStageStatus {
  variant_type: ImageVariantType;
  completed: boolean;
  image: BackendProductImage | null;
}

interface BackendPipelineStatus {
  source_image_id: string;
  stages: BackendPipelineStageStatus[];
  ai_provider_configured: boolean;
}

export interface StorageStatus {
  provider: 'local_disk' | 'supabase';
  configured: boolean;
}

export interface AIProviderStatus {
  provider: string;
  configured: boolean;
}

function mapImage(raw: BackendProductImage): ProductImage {
  return {
    id: raw.id,
    productId: raw.product_id,
    variantType: raw.variant_type,
    sourceImageId: raw.source_image_id,
    shotType: (raw.shot_type as ShotType | null) ?? null,
    url: raw.url,
    fileName: raw.file_name,
    contentType: raw.content_type,
    fileSizeBytes: raw.file_size_bytes,
    displayOrder: raw.display_order,
    isPrimary: raw.is_primary,
    createdAt: raw.created_at,
  };
}

function mapProduct(raw: BackendProduct): Product {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    category: raw.category ?? '',
    sku: raw.sku ?? '',
    purity: raw.purity ?? '',
    price: raw.price,
    weightGrams: raw.weight_grams,
    tags: raw.tags ?? [],
    isActive: raw.is_active,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    images: raw.images.map(mapImage),
    primaryImageUrl: raw.primary_image_url,
    imageCount: raw.image_count,
  };
}

function mapPipelineStatus(raw: BackendPipelineStatus): PipelineStatus {
  return {
    sourceImageId: raw.source_image_id,
    aiProviderConfigured: raw.ai_provider_configured,
    stages: raw.stages.map((s) => ({
      variantType: s.variant_type,
      completed: s.completed,
      image: s.image ? mapImage(s.image) : null,
    })),
  };
}

function toBackendPayload(data: Partial<ProductFormData>) {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.category !== undefined && { category: data.category }),
    ...(data.sku !== undefined && { sku: data.sku }),
    ...(data.purity !== undefined && { purity: data.purity }),
    ...(data.price !== undefined && { price: data.price }),
    ...(data.weightGrams !== undefined && { weight_grams: data.weightGrams }),
    ...(data.tags !== undefined && { tags: data.tags }),
    ...(data.isActive !== undefined && { is_active: data.isActive }),
  };
}

/* ======================================================================
 * Phase A — Image Editor (real, local Pillow/OpenCV processing)
 * ====================================================================== */

export type ImageEditOperationType =
  | 'CROP'
  | 'ROTATE'
  | 'FLIP'
  | 'BRIGHTNESS'
  | 'CONTRAST'
  | 'SATURATION'
  | 'SHARPNESS'
  | 'BLUR'
  | 'WHITE_BALANCE'
  | 'NOISE_REDUCTION'
  | 'BACKGROUND_REPLACE'
  // Product Studio redesign — Auto Fit (classical CV, no AI).
  | 'REMOVE_EMPTY_SPACE'
  | 'AUTO_CENTER'
  | 'AUTO_SCALE';

export type BackgroundReplaceMode = 'WHITE' | 'BLACK' | 'LUXURY_BLUE' | 'GRADIENT' | 'TRANSPARENT' | 'CUSTOM';

/**
 * One step in an editing session. Kept as one flexible shape (matching the
 * backend's ImageEditOperation exactly, snake_case included) — only the
 * fields relevant to `type` are read. Sent to the backend as-is, no mapping
 * layer, since this is effectively wire-format data the Studio UI builds
 * directly rather than a domain object with its own frontend identity.
 */
export interface ImageEditOperation {
  type: ImageEditOperationType;
  // CROP
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // ROTATE
  degrees?: number;
  // FLIP
  axis?: 'HORIZONTAL' | 'VERTICAL';
  // BRIGHTNESS / CONTRAST / SATURATION / SHARPNESS
  factor?: number;
  // BLUR
  radius?: number;
  // NOISE_REDUCTION
  strength?: number;
  // BACKGROUND_REPLACE
  mode?: BackgroundReplaceMode;
  color?: string;
  gradient_color_2?: string;
  // REMOVE_EMPTY_SPACE / AUTO_CENTER
  padding_ratio?: number;
  // AUTO_SCALE
  fill_ratio?: number;
}

export interface ImageEditPreviewResult {
  contentBase64: string;
  contentType: string;
  width: number;
  height: number;
}

function mapEditPreview(raw: any): ImageEditPreviewResult {
  return {
    contentBase64: raw.content_base64,
    contentType: raw.content_type,
    width: raw.width,
    height: raw.height,
  };
}

/** Turns a preview's base64 payload into a displayable data URL. */
export function editPreviewToDataUrl(preview: ImageEditPreviewResult): string {
  return `data:${preview.contentType};base64,${preview.contentBase64}`;
}

/* ======================================================================
 * Phase B — Design Studio & Rendering Engine
 * ====================================================================== */

export type LayerType = 'BACKGROUND' | 'PRODUCT' | 'TEXT' | 'LOGO' | 'BADGE' | 'QR' | 'OVERLAY' | 'SHAPE';
export type TextAlign = 'LEFT' | 'CENTER' | 'RIGHT';
export type FontWeight = 'REGULAR' | 'MEDIUM' | 'BOLD';
export type ShapeKind = 'RECTANGLE' | 'CIRCLE' | 'LINE';
export type FontFamily = 'PLAYFAIR_DISPLAY' | 'POPPINS' | 'GREAT_VIBES';

export interface LayerShadow {
  color: string;
  blur: number;
  offset_x: number;
  offset_y: number;
}

/**
 * One layer in a CatalogueDesign's canvas — matches the backend's
 * CanvasLayer field-for-field (snake_case included) since this is the exact
 * shape saved/rendered server-side. The Design Studio builds and mutates
 * this shape directly rather than a separately-mapped frontend model.
 */
export interface CanvasLayer {
  id: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  z_index: number;
  image_id?: string | null;
  color?: string | null;
  gradient_color_2?: string | null;
  text?: string | null;
  font_family?: FontFamily | string | null;
  font_size?: number | null;
  font_weight?: FontWeight | null;
  text_align?: TextAlign | null;
  letter_spacing?: number | null;
  shadow?: LayerShadow | null;
  badge_key?: string | null;
  overlay_key?: string | null;
  qr_payload?: string | null;
  shape_kind?: ShapeKind | null;
  props?: Record<string, unknown>;
}

export interface CanvasDocument {
  canvas_width: number;
  canvas_height: number;
  layers: CanvasLayer[];
}

export type OutputPresetKey =
  | 'INSTAGRAM_POST' | 'INSTAGRAM_STORY' | 'WHATSAPP' | 'FACEBOOK'
  | 'POSTER' | 'BANNER' | 'SQUARE' | 'PORTRAIT' | 'LANDSCAPE';

/** Product Studio redesign — a real render parameter (JPEG quality), not a
 * cosmetic label. */
export type RenderQuality = 'STANDARD' | 'HIGH' | 'ULTRA';

export interface CatalogueDesign {
  id: string;
  productId: string;
  sourceDesignId: string | null;
  name: string | null;
  version: number;
  canvas: CanvasDocument;
  templateKey: string | null;
  createdBy: string;
  createdAt: string;
}

function mapDesign(raw: any): CatalogueDesign {
  return {
    id: raw.id,
    productId: raw.product_id,
    sourceDesignId: raw.source_design_id,
    name: raw.name,
    version: raw.version,
    canvas: raw.canvas,
    templateKey: raw.template_key,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
  };
}

export interface Template {
  key: string;
  label: string;
  canvas: CanvasDocument;
}

export interface OutputPreset {
  key: OutputPresetKey;
  width: number;
  height: number;
}

export interface CataloguePdfResult {
  filename: string;
  contentType: string;
  contentBase64: string;
  productCount: number;
}

/** Turns a base64-encoded file response into an actual browser download. */
export function triggerBase64Download(filename: string, contentType: string, contentBase64: string): void {
  const byteChars = atob(contentBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const catalogueService = {
  /** GET /api/v1/catalogue/products (Admin) */
  async getProducts(): Promise<Product[]> {
    const res = await apiClient.get<{ products: BackendProduct[] }>('/catalogue/products', { auth: true });
    return res.data.products.map(mapProduct);
  },

  /** GET /api/v1/catalogue/products/{id} (Admin) */
  async getProductById(id: string): Promise<Product> {
    const res = await apiClient.get<{ product: BackendProduct }>(`/catalogue/products/${id}`, { auth: true });
    return mapProduct(res.data.product);
  },

  /** POST /api/v1/catalogue/products (Admin) */
  async createProduct(data: ProductFormData): Promise<Product> {
    const res = await apiClient.post<{ product: BackendProduct }>(
      '/catalogue/products',
      toBackendPayload(data),
      { auth: true }
    );
    return mapProduct(res.data.product);
  },

  /** PUT /api/v1/catalogue/products/{id} (Admin) */
  async updateProduct(id: string, data: Partial<ProductFormData>): Promise<Product> {
    const res = await apiClient.put<{ product: BackendProduct }>(
      `/catalogue/products/${id}`,
      toBackendPayload(data),
      { auth: true }
    );
    return mapProduct(res.data.product);
  },

  /** DELETE /api/v1/catalogue/products/{id} (Admin) — soft delete. */
  async deactivateProduct(id: string): Promise<void> {
    await apiClient.delete(`/catalogue/products/${id}`, { auth: true });
  },

  /** POST /api/v1/catalogue/products/{id}/images (Admin) — multipart upload, always creates a new ORIGINAL. */
  async uploadImage(productId: string, file: File, shotType?: ShotType): Promise<ProductImage> {
    const formData = new FormData();
    formData.append('file', file);
    if (shotType) formData.append('shot_type', shotType);
    const res = await apiClient.post<{ image: BackendProductImage }>(
      `/catalogue/products/${productId}/images`,
      formData,
      { auth: true }
    );
    return mapImage(res.data.image);
  },

  /**
   * Module 21 — Phase 8: same upload, real byte-level progress via
   * XMLHttpRequest (fetch has no upload-progress event, which is what
   * uploadImage() above uses). One simplification, disclosed rather than
   * hidden: this does not perform apiClient's silent-refresh-on-401 retry —
   * if the access token happens to expire mid-upload, the caller sees a
   * clear "session expired" error rather than a transparent retry. Uploads
   * are an infrequent, user-initiated action, not background polling, so
   * asking the user to retry once is an acceptable trade-off against the
   * real complexity of replaying a multipart body after a token refresh.
   */
  uploadImageWithProgress(
    productId: string,
    file: File,
    onProgress: (percent: number) => void,
    shotType?: ShotType
  ): Promise<ProductImage> {
    return new Promise((resolve, reject) => {
      const token = tokenStore.getAccessToken();
      if (!token) {
        reject(new ApiError('Your session has expired. Please sign in again.', 401));
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      if (shotType) formData.append('shot_type', shotType);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/catalogue/products/${productId}/images`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        let payload: any = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          // fall through to the generic error below
        }
        if (xhr.status >= 200 && xhr.status < 300 && payload?.data?.image) {
          resolve(mapImage(payload.data.image));
        } else {
          const message = payload?.message || `Upload failed with status ${xhr.status}`;
          reject(new ApiError(message, xhr.status, payload?.errors ?? []));
        }
      };

      xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));

      xhr.send(formData);
    });
  },

  /** PUT /api/v1/catalogue/products/{id}/images/{imageId}/primary (Admin) */
  async setPrimaryImage(productId: string, imageId: string): Promise<void> {
    await apiClient.put(`/catalogue/products/${productId}/images/${imageId}/primary`, undefined, { auth: true });
  },

  /** PUT /api/v1/catalogue/products/{id}/images/reorder (Admin) — imageIds in the new front-to-back order. */
  async reorderImages(productId: string, imageIds: string[]): Promise<void> {
    await apiClient.put(
      `/catalogue/products/${productId}/images/reorder`,
      { image_ids: imageIds },
      { auth: true }
    );
  },

  /** DELETE /api/v1/catalogue/products/{id}/images/{imageId} (Admin) */
  async deleteImage(productId: string, imageId: string): Promise<void> {
    await apiClient.delete(`/catalogue/products/${productId}/images/${imageId}`, { auth: true });
  },

  /** GET /api/v1/catalogue/media (Admin) — every image variant across every product. */
  async getMediaLibrary(): Promise<ProductImage[]> {
    const res = await apiClient.get<{ images: BackendProductImage[] }>('/catalogue/media', { auth: true });
    return res.data.images.map(mapImage);
  },

  /** GET /api/v1/catalogue/storage-status (Admin) */
  async getStorageStatus(): Promise<StorageStatus> {
    const res = await apiClient.get<StorageStatus>('/catalogue/storage-status', { auth: true });
    return res.data;
  },

  /** GET /api/v1/catalogue/ai-provider-status (Admin) — Module 21. */
  async getAIProviderStatus(): Promise<AIProviderStatus> {
    const res = await apiClient.get<AIProviderStatus>('/catalogue/ai-provider-status', { auth: true });
    return res.data;
  },

  /**
   * POST /api/v1/catalogue/products/{id}/images/{imageId}/enhance (Admin)
   * No AI provider is configured yet (Module 20 is foundation-only) — this
   * always rejects with a clear "not yet configured" message. Callers
   * should surface that honestly, never treat a caught error here as a
   * silent success.
   */
  async enhanceImage(productId: string, imageId: string, enhancementType: AIEnhancementType): Promise<void> {
    await apiClient.post(
      `/catalogue/products/${productId}/images/${imageId}/enhance`,
      { enhancement_type: enhancementType },
      { auth: true }
    );
  },

  /**
   * GET /api/v1/catalogue/products/{id}/images/{imageId}/pipeline (Admin)
   * Module 21, Phase 1 — which of the 5 pipeline stages exist for a given
   * original image.
   */
  async getPipelineStatus(productId: string, imageId: string): Promise<PipelineStatus> {
    const res = await apiClient.get<BackendPipelineStatus>(
      `/catalogue/products/${productId}/images/${imageId}/pipeline`,
      { auth: true }
    );
    return mapPipelineStatus(res.data);
  },

  /* ==================================================================
   * Phase A — Image Editor
   * ================================================================== */

  /** POST /api/v1/catalogue/products/{id}/images/{imageId}/edit/preview (Admin) — ephemeral, nothing persisted. */
  async previewEditImage(
    productId: string,
    imageId: string,
    operations: ImageEditOperation[]
  ): Promise<ImageEditPreviewResult> {
    const res = await apiClient.post<any>(
      `/catalogue/products/${productId}/images/${imageId}/edit/preview`,
      { operations },
      { auth: true }
    );
    return mapEditPreview(res.data);
  },

  /** POST /api/v1/catalogue/products/{id}/images/{imageId}/edit/save (Admin) — persists a new EDITED variant. */
  async saveEditImage(
    productId: string,
    imageId: string,
    operations: ImageEditOperation[]
  ): Promise<ProductImage> {
    const res = await apiClient.post<{ image: BackendProductImage }>(
      `/catalogue/products/${productId}/images/${imageId}/edit/save`,
      { operations },
      { auth: true }
    );
    return mapImage(res.data.image);
  },

  /* ==================================================================
   * Phase B — Design Studio & Rendering Engine
   * ================================================================== */

  /** GET /api/v1/catalogue/templates (Admin) — the 10 preset templates. */
  async listTemplates(): Promise<Template[]> {
    const res = await apiClient.get<{ templates: Template[] }>('/catalogue/templates', { auth: true });
    return res.data.templates;
  },

  /** GET /api/v1/catalogue/output-presets (Admin) — the 9 marketing-size presets. */
  async listOutputPresets(): Promise<OutputPreset[]> {
    const res = await apiClient.get<{ presets: OutputPreset[] }>('/catalogue/output-presets', { auth: true });
    return res.data.presets;
  },

  /** POST /api/v1/catalogue/products/{id}/designs (Admin) — creates a new immutable design version. */
  async saveDesign(
    productId: string,
    canvas: CanvasDocument,
    name?: string,
    templateKey?: string
  ): Promise<CatalogueDesign> {
    const res = await apiClient.post<{ design: any }>(
      `/catalogue/products/${productId}/designs`,
      { canvas, name: name ?? null, template_key: templateKey ?? null },
      { auth: true }
    );
    return mapDesign(res.data.design);
  },

  /** GET /api/v1/catalogue/products/{id}/designs (Admin) — every version, newest first (= version history). */
  async getDesigns(productId: string): Promise<CatalogueDesign[]> {
    const res = await apiClient.get<{ designs: any[] }>(`/catalogue/products/${productId}/designs`, { auth: true });
    return res.data.designs.map(mapDesign);
  },

  /** GET /api/v1/catalogue/products/{id}/designs/{designId} (Admin) */
  async getDesign(productId: string, designId: string): Promise<CatalogueDesign> {
    const res = await apiClient.get<{ design: any }>(
      `/catalogue/products/${productId}/designs/${designId}`,
      { auth: true }
    );
    return mapDesign(res.data.design);
  },

  /** POST /api/v1/catalogue/products/{id}/designs/{designId}/restore (Admin) — brings an old version back as newest. */
  async restoreDesign(productId: string, designId: string, name?: string): Promise<CatalogueDesign> {
    const res = await apiClient.post<{ design: any }>(
      `/catalogue/products/${productId}/designs/${designId}/restore`,
      { name: name ?? null },
      { auth: true }
    );
    return mapDesign(res.data.design);
  },

  /** POST /api/v1/catalogue/products/{id}/designs/{designId}/duplicate (Admin) — branches a copy to edit independently. */
  async duplicateDesign(productId: string, designId: string, name?: string): Promise<CatalogueDesign> {
    const res = await apiClient.post<{ design: any }>(
      `/catalogue/products/${productId}/designs/${designId}/duplicate`,
      { name: name ?? null },
      { auth: true }
    );
    return mapDesign(res.data.design);
  },

  /**
   * POST /api/v1/catalogue/products/{id}/designs/render/preview (Admin)
   * Ephemeral — renders an ad-hoc, unsaved canvas (the live editing
   * session). Nothing is persisted.
   */
  async renderPreview(
    productId: string,
    canvas: CanvasDocument,
    outputPreset?: OutputPresetKey,
    quality?: RenderQuality
  ): Promise<ImageEditPreviewResult> {
    const res = await apiClient.post<any>(
      `/catalogue/products/${productId}/designs/render/preview`,
      { canvas, output_preset: outputPreset ?? null, quality: quality ?? null },
      { auth: true }
    );
    return mapEditPreview(res.data);
  },

  /**
   * POST /api/v1/catalogue/products/{id}/designs/{designId}/export (Admin)
   * Renders a SAVED design version and persists the flattened result as a
   * new ProductImage — the only rendering call that writes anything.
   */
  async exportDesign(
    productId: string,
    designId: string,
    outputPreset?: OutputPresetKey,
    quality?: RenderQuality
  ): Promise<ProductImage> {
    const res = await apiClient.post<{ image: BackendProductImage }>(
      `/catalogue/products/${productId}/designs/${designId}/export`,
      { output_preset: outputPreset ?? null, quality: quality ?? null },
      { auth: true }
    );
    return mapImage(res.data.image);
  },

  /**
   * POST /api/v1/catalogue/designs/batch-render (Admin)
   * Renders ONE template across MANY products, synchronously. Each
   * product's own primary image is resolved into the template's Product
   * layer automatically.
   */
  async batchRender(
    templateKey: string,
    productIds: string[],
    outputPreset?: OutputPresetKey,
    quality?: RenderQuality
  ): Promise<ProductImage[]> {
    const res = await apiClient.post<{ images: BackendProductImage[] }>(
      '/catalogue/designs/batch-render',
      { template_key: templateKey, product_ids: productIds, output_preset: outputPreset ?? null, quality: quality ?? null },
      { auth: true }
    );
    return res.data.images.map(mapImage);
  },

  /**
   * POST /api/v1/catalogue/designs/catalogue-pdf (Admin)
   * Multi-product catalogue PDF — ephemeral, base64 in the response
   * (nothing persisted), same precedent as Module 15's CSV/Excel/Markdown
   * exports.
   */
  async generateCataloguePdf(
    templateKey: string,
    productIds: string[],
    quality?: RenderQuality
  ): Promise<CataloguePdfResult> {
    const res = await apiClient.post<any>(
      '/catalogue/designs/catalogue-pdf',
      { template_key: templateKey, product_ids: productIds, quality: quality ?? null },
      { auth: true }
    );
    return {
      filename: res.data.filename,
      contentType: res.data.content_type,
      contentBase64: res.data.content_base64,
      productCount: res.data.product_count,
    };
  },
};
