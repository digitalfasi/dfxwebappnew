/**
 * Catalogue integration for the new UI. Ports the existing DFX frontend
 * catalogueService product contract onto the new apiClient. Product identity,
 * price, purity, weight, active status and images are backend authoritative —
 * this layer maps names only and recreates no pricing/catalogue business rules.
 */
import { apiClient } from "../lib/apiClient";

/** GET /catalogue/products item -> the row shape the Catalogue grid renders. */
function mapProduct(raw) {
  return {
    id: raw.id,
    name: raw.name ?? "",
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

export const catalogueService = {
  /** GET /api/v1/catalogue/products — admin product list. */
  async getProducts() {
    const res = await apiClient.get("/catalogue/products", { auth: true });
    return (res.data?.products ?? []).map(mapProduct);
  },

  /** POST /api/v1/catalogue/products — create product. */
  async createProduct(data) {
    const res = await apiClient.post("/catalogue/products", toCreatePayload(data), { auth: true });
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
