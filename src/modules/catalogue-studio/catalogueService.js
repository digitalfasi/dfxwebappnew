/**
 * Catalogue integration for the new UI. Ports the existing DFX frontend
 * catalogueService product contract onto the new apiClient. Product identity,
 * price, purity, weight, active status and images are backend authoritative —
 * this layer maps names only and recreates no pricing/catalogue business rules.
 */
import { apiClient } from "@/_shared/apiClient";

/** GET /catalogue/products item -> the row shape the Catalogue grid renders. */
function mapProduct(raw) {
  return {
    id: raw.id,
    name: raw.name ?? "",
    description: raw.description ?? "",
    category: raw.category ?? "",
    // Backend product has no sub-category field; UI shows neutral (empty).
    subCategory: "",
    sku: raw.sku ?? "",
    purity: raw.purity ?? "",
    weight: raw.weight_grams ?? "",
    price: raw.price,
    // Catalogue product carries no stock linkage in this contract; neutral text.
    stock: "No stock linked",
    status: raw.is_active ? "Active" : "Inactive",
    img: raw.primary_image_url ?? null,
    imageCount: raw.image_count ?? 0,
    tags: raw.tags ?? [],
  };
}

function toCreatePayload(data) {
  return {
    name: data.name,
    ...(data.description ? { description: data.description } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(data.sku ? { sku: data.sku } : {}),
    ...(data.purity ? { purity: data.purity } : {}),
    ...(data.price != null ? { price: data.price } : {}),
    ...(data.weightGrams != null ? { weight_grams: data.weightGrams } : {}),
    ...(data.tags?.length ? { tags: data.tags } : {}),
    ...(data.makingChargeDiscountPercent != null
      ? { making_charge_discount_percent: data.makingChargeDiscountPercent }
      : {}),
    ...(data.makingChargeDiscountLabel
      ? { making_charge_discount_label: data.makingChargeDiscountLabel }
      : {}),
  };
}

/** Only the fields ProductUpdateRequest actually accepts — nothing invented. */
function toUpdatePayload(data) {
  const p = {};
  if (data.name != null) p.name = data.name;
  if (data.description != null) p.description = data.description;
  if (data.category != null) p.category = data.category;
  if (data.sku != null) p.sku = data.sku;
  if (data.purity != null) p.purity = data.purity;
  if (data.price != null) p.price = data.price;
  if (data.weightGrams != null) p.weight_grams = data.weightGrams;
  if (data.tags != null) p.tags = data.tags;
  if (data.isActive != null) p.is_active = data.isActive;
  return p;
}

export const catalogueService = {
  /** GET /api/v1/catalogue/products — admin product list. */
  async getProducts() {
    const res = await apiClient.get("/catalogue/products", { auth: true });
    return (res.data?.products ?? []).map(mapProduct);
  },

  /** GET /api/v1/catalogue/products/{id} — single product (edit prefill). */
  async getProduct(id) {
    const res = await apiClient.get(`/catalogue/products/${id}`, { auth: true });
    return mapProduct(res.data.product);
  },

  /** POST /api/v1/catalogue/products — create product. */
  async createProduct(data) {
    const res = await apiClient.post("/catalogue/products", toCreatePayload(data), { auth: true });
    return mapProduct(res.data.product);
  },

  /** PUT /api/v1/catalogue/products/{id} — edit existing catalogue product. */
  async updateProduct(id, data) {
    const res = await apiClient.put(`/catalogue/products/${id}`, toUpdatePayload(data), { auth: true });
    return mapProduct(res.data.product);
  },

  /** POST /api/v1/catalogue/products/{id}/images — multipart upload, new ORIGINAL. */
  async uploadImage(productId, file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post(`/catalogue/products/${productId}/images`, fd, { auth: true });
    return res.data?.image;
  },

  /** DELETE /api/v1/catalogue/products/{id} — soft delete (deactivate). */
  async deactivateProduct(id) {
    await apiClient.delete(`/catalogue/products/${id}`, { auth: true });
  },
};
