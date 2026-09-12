import { apiClient } from "@/_shared/apiClient";

/**
 * Master Inventory — the tenant's category / subcategory taxonomy.
 *
 * Every count and weight in these payloads is computed by the backend from
 * inventory_items on each call. Nothing here is derived, summed or cached in
 * the frontend: the whole point of the master is that it cannot disagree with
 * Inventory.
 */

function mapStock(raw = {}) {
  return {
    inStockCount: raw.in_stock_count ?? 0,
    inStockNetWeight: raw.in_stock_net_weight_grams ?? 0,
    // All statuses, sold included — this is what makes a delete impossible.
    totalItemCount: raw.total_item_count ?? 0,
    // What the in-stock weight is made of, computed by the backend over the
    // same IN_STOCK rows as the count, so the purities sum back to the total.
    purityBreakdown: (raw.purity_breakdown ?? []).map((p) => ({
      purity: p.purity,
      count: p.count ?? 0,
      netWeight: p.net_weight_grams ?? 0,
    })),
  };
}

function mapSubcategory(raw) {
  return {
    id: raw.id,
    categoryId: raw.category_id,
    name: raw.name,
    code: raw.code || "",
    isActive: raw.is_active,
    stock: mapStock(raw.stock),
  };
}

function mapCategory(raw) {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code || "",
    isActive: raw.is_active,
    stock: mapStock(raw.stock),
    subcategories: (raw.subcategories ?? []).map(mapSubcategory),
    // Items on this category whose subcategory is blank or not in the master.
    unassignedInStockCount: raw.unassigned_in_stock_count ?? 0,
  };
}

export const masterInventoryService = {
  /** GET /api/v1/procurement/master-inventory */
  async getMaster() {
    const res = await apiClient.get("/procurement/master-inventory", { auth: true });
    return {
      categories: (res.data?.categories ?? []).map(mapCategory),
      // Names already typed onto stock that the master does not hold yet.
      importable: res.data?.importable_category_names ?? [],
    };
  },

  async createCategory({ name, code }) {
    const res = await apiClient.post(
      "/procurement/master-inventory/categories",
      { name, ...(code ? { code } : {}) },
      { auth: true }
    );
    return res.data?.category;
  },

  async updateCategory(id, { name, code, isActive }) {
    const res = await apiClient.put(
      `/procurement/master-inventory/categories/${id}`,
      { name, code: code || null, ...(isActive === undefined ? {} : { is_active: isActive }) },
      { auth: true }
    );
    return res.data?.category;
  },

  async deleteCategory(id) {
    await apiClient.delete(`/procurement/master-inventory/categories/${id}`, { auth: true });
  },

  async createSubcategory({ categoryId, name, code }) {
    const res = await apiClient.post(
      "/procurement/master-inventory/subcategories",
      { category_id: categoryId, name, ...(code ? { code } : {}) },
      { auth: true }
    );
    return res.data?.subcategory;
  },

  async updateSubcategory(id, { categoryId, name, code, isActive }) {
    const res = await apiClient.put(
      `/procurement/master-inventory/subcategories/${id}`,
      {
        name,
        code: code || null,
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(isActive === undefined ? {} : { is_active: isActive }),
      },
      { auth: true }
    );
    return res.data?.subcategory;
  },

  async deleteSubcategory(id) {
    await apiClient.delete(`/procurement/master-inventory/subcategories/${id}`, { auth: true });
  },

  /** POST /api/v1/procurement/master-inventory/import-existing */
  async importExisting() {
    const res = await apiClient.post(
      "/procurement/master-inventory/import-existing",
      {},
      { auth: true }
    );
    return {
      categoriesCreated: res.data?.categories_created ?? 0,
      subcategoriesCreated: res.data?.subcategories_created ?? 0,
    };
  },
};
