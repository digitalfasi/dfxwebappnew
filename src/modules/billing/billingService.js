/**
 * Billing/inventory integration for the new UI. Ports the existing DFX frontend
 * billingService inventory contract onto the new apiClient. Weights, costs and
 * stock status are backend authoritative — this layer maps names only and
 * recreates no pricing/inventory business rules.
 */
import { apiClient } from "@/_shared/apiClient";

const STOCK_LABEL = {
  IN_STOCK: "In Stock",
  SOLD: "Sold",
  INACTIVE: "Inactive",
  RETURNED_PENDING_INSPECTION: "Returned",
  DAMAGED: "Damaged",
};
function labelStock(s) {
  return STOCK_LABEL[String(s || "").toUpperCase()] ?? s ?? "";
}

/** GET /billing/inventory item -> the row shape the Inventory table renders. */
function mapItem(raw) {
  return {
    id: raw.id,
    code: raw.product_code,
    name: raw.product_name,
    category: raw.category ?? "",
    sub: raw.subcategory ?? "",
    purity: raw.purity,
    net: raw.net_gold_weight_grams ?? 0,
    gross: raw.gross_weight_grams ?? 0,
    vendor: raw.vendor_name ?? "",
    status: labelStock(raw.stock_status),
    catalogue: raw.add_to_catalogue ? "Yes" : "No",
    huid: raw.huid ?? "",
    // ONLINE (HUID, rate locked) / OFFLINE (Item Code, rate editable).
    billMode: raw.bill_mode ?? (raw.huid ? "ONLINE" : "OFFLINE"),
    tag: raw.tag ?? "",
    cost: raw.purchase_cost ?? 0,
    // The tunch this piece was bought at. null (not 0) when the lot never
    // recorded one - the table shows a dash, because "no tunch charged" and
    // "nobody wrote it down" must not look the same.
    tunch: raw.tunch_percent ?? null,
    imageUrl: raw.image_url ?? null,
  };
}

export const billingService = {
  /** GET /api/v1/billing/inventory — paginated inventory list. */
  async listInventory({ search = "", limit = 100 } = {}) {
    const params = new URLSearchParams({ page: "1", limit: String(limit) });
    if (search) params.set("search", search);
    const res = await apiClient.get(`/billing/inventory?${params.toString()}`, { auth: true });
    return {
      items: (res.data?.items ?? []).map(mapItem),
      total: res.data?.total ?? 0,
      totalGoldWeightGrams: res.data?.total_gold_weight_grams ?? 0,
    };
  },

  /**
   * GET /api/v1/billing/inventory/raw-gold — the shop's raw gold / bullion.
   *
   * Raw gold lives in its own table keyed by SERIAL NUMBER, not HUID, because
   * a bar is not a hallmarked piece. Bulk receiving has been writing these
   * rows since it shipped and nothing read them back, so a recorded purchase
   * was invisible afterwards - the money owed to the vendor was real and the
   * bars were nowhere.
   */
  /** { BF: 3, RG: 1 } - the next free Item Code number for each 2-letter prefix. */
  async nextItemCodes(prefixes = []) {
    if (!prefixes.length) return {};
    const res = await apiClient.get(`/billing/inventory/next-item-codes?prefixes=${encodeURIComponent(prefixes.join(","))}`, { auth: true });
    return res.data || {};
  },

  async listRawGold({ search = "", stockStatus = "" } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (stockStatus) params.set("stock_status", stockStatus);
    const qs = params.toString();
    const res = await apiClient.get(`/billing/inventory/raw-gold${qs ? `?${qs}` : ""}`, { auth: true });
    return (res.data?.items ?? []).map((r) => ({
      id: r.id,
      serialNumber: r.serial_number,
      productName: r.product_name,
      category: r.category ?? "",
      subcategory: r.subcategory ?? "",
      purity: r.purity,
      grossWeightGrams: r.gross_weight_grams ?? 0,
      netGoldWeightGrams: r.net_gold_weight_grams ?? 0,
      vendorName: r.vendor_name ?? "",
      purchaseDate: r.purchase_date ?? null,
      purchaseInvoiceRef: r.purchase_invoice_ref ?? "",
      purchaseRatePerGram: r.purchase_rate_per_gram ?? null,
      purchaseCost: r.purchase_cost ?? null,
      stockStatus: r.stock_status,
    }));
  },

  /**
   * GET /api/v1/billing/sell/raw-gold/quote/{serial} — price one bullion bar.
   *
   * Metal at the published rate for its purity, plus GST, and nothing else: a
   * bar carries no making, wastage, stone or discount, because there is no
   * labour in it. The shop buys below the market and sells at it, and that
   * difference is the whole profit.
   */
  async getRawGoldQuote(serialNumber, { appliedRatePerGram, gstApplied = true } = {}) {
    const params = new URLSearchParams();
    if (appliedRatePerGram) params.set("applied_rate_per_gram", String(appliedRatePerGram));
    params.set("gst_applied", String(!!gstApplied));
    const res = await apiClient.get(
      `/billing/sell/raw-gold/quote/${encodeURIComponent(serialNumber)}?${params.toString()}`,
      { auth: true }
    );
    const d = res.data ?? {};
    return {
      serialNumber: d.serial_number,
      productName: d.product_name,
      purity: d.purity,
      netGoldWeightGrams: d.net_gold_weight_grams ?? 0,
      grossWeightGrams: d.gross_weight_grams ?? 0,
      goldRate24k: d.gold_rate_24k ?? null,
      publishedRatePerGram: d.published_rate_per_gram ?? null,
      appliedRatePerGram: d.applied_rate_per_gram ?? null,
      goldValueAmount: d.gold_value_amount ?? 0,
      subtotalBeforeTax: d.subtotal_before_tax ?? 0,
      taxRatePercent: d.tax_rate_percent ?? 0,
      taxAmount: d.tax_amount ?? 0,
      finalAmount: d.final_amount ?? 0,
      gstApplied: !!d.gst_applied,
      effectiveDate: d.effective_date ?? null,
      // Admin-only; null for Staff, who still get the direction label.
      purchaseCost: d.purchase_cost ?? null,
      profitOrLoss: d.profit_or_loss ?? null,
      profitLabel: d.profit_or_loss_label ?? null,
    };
  },

  /** POST /api/v1/billing/sell/raw-gold — sell one bar into the same sales
   *  ledger as jewellery. No scheme: a scheme buys jewellery gold at a
   *  contracted rate, not bullion at the market rate. */
  async sellRawGold({ serialNumber, customerId, customerName, customerPhone,
                      appliedRatePerGram, gstApplied = true, paymentMethod,
                      amountPaid = 0, paymentReferenceNo, allowBelowCost = false }) {
    const body = {
      serial_number: serialNumber,
      gst_applied: !!gstApplied,
      payment_method: paymentMethod,
      amount_paid: Number(amountPaid) || 0,
      allow_below_cost: !!allowBelowCost,
    };
    if (customerId) body.customer_id = customerId;
    if (customerName) body.customer_name = customerName;
    if (customerPhone) body.customer_phone = customerPhone;
    if (appliedRatePerGram) body.applied_rate_per_gram = Number(appliedRatePerGram);
    if (paymentReferenceNo) body.payment_reference_no = paymentReferenceNo;
    const res = await apiClient.post("/billing/sell/raw-gold", body, { auth: true });
    return res.data?.sale ?? null;
  },

  /** GET /api/v1/billing/vendors — real vendor list (full vendor master rows). */
  async listVendors(search = "") {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await apiClient.get(`/billing/vendors${params}`, { auth: true });
    return (res.data?.vendors ?? []).map(mapVendor);
  },

  /** POST /api/v1/billing/vendors — create a vendor master. */
  async createVendor(data) {
    const res = await apiClient.post("/billing/vendors", vendorBody(data), { auth: true });
    return mapVendor(res.data?.vendor ?? {});
  },

  /** PUT /api/v1/billing/vendors/{id} — update a vendor master. */
  async updateVendor(id, data) {
    const res = await apiClient.put(`/billing/vendors/${id}`, vendorBody(data), { auth: true });
    return mapVendor(res.data?.vendor ?? {});
  },

  /**
   * GET /api/v1/billing/vendor-purchases — vendor purchase payables. Every money
   * figure (base, vendor charge, purchase amount, paid, outstanding, status) is
   * backend authoritative; nothing is recomputed here.
   */
  async listVendorPurchases({ vendorId = "", paymentStatus = "" } = {}) {
    const params = new URLSearchParams();
    if (vendorId) params.set("vendor_id", vendorId);
    if (paymentStatus) params.set("payment_status", paymentStatus);
    const q = params.toString();
    const res = await apiClient.get(`/billing/vendor-purchases${q ? `?${q}` : ""}`, { auth: true });
    return (res.data?.purchases ?? []).map(mapVendorPurchase);
  },

  /** GET /api/v1/billing/vendor-purchases/{id} — one purchase payable. */
  async getVendorPurchase(id) {
    const res = await apiClient.get(`/billing/vendor-purchases/${id}`, { auth: true });
    return mapVendorPurchase(res.data?.purchase ?? {});
  },

  /**
   * POST /api/v1/billing/vendor-purchases — create a vendor purchase payable.
   * The backend recomputes base = rate × weight, vendor charge = base × pct/100,
   * purchase amount = base + charge; submitted totals are never trusted. An
   * optional initial CASH/PARTIAL settlement posts the first ledger row. Returns
   * the authoritative purchase.
   */
  async createVendorPurchase(data) {
    const body = {
      vendor_id: data.vendorId,
      purchase_date: data.purchaseDate,
      // The time of day beside the date. purchase_date stays the DATE every
      // filter and report runs on; this is additive and may be null.
      purchase_at: data.purchaseAt || null,
      invoice_ref: data.invoiceRef || null,
      reference_type: data.referenceType || null,
      delivered_by: data.deliveredBy || null,
      delivered_by_phone: data.deliveredByPhone || null,
      // GST on the vendor's bill, switched on per purchase (backend default 3%).
      gst_applied: !!data.gstApplied,
      gst_percent: data.gstApplied && data.gstPercent !== "" && data.gstPercent != null ? Number(data.gstPercent) : null,
      weight_grams: data.weightGrams,
      rate_per_gram: data.ratePerGram,
      // Purity of the gold bought. Tunch is charged on the net weight at its
      // 24K value, so the backend needs the purity to pay the vendor for
      // Net × (purity % + Tunch %) grams of pure gold.
      purity: data.purity ?? null,
      // Flat rupee cost of the stones in the piece. The server adds it to the
      // payable after the gold math, so Tunch never touches it.
      stone_charge_amount: data.stoneChargeAmount != null && data.stoneChargeAmount !== "" ? Number(data.stoneChargeAmount) : 0,
      // The other half of the V/A card. Money, never metal: the server adds it
      // after the gold math, so no purity conversion and no Tunch touch it.
      other_charges_amount: data.otherChargesAmount != null && data.otherChargesAmount !== "" ? Number(data.otherChargesAmount) : 0,
      // The non-gold WEIGHT the net was derived from. Recorded, never priced.
      stone_weight_grams: data.stoneWeightGrams != null && data.stoneWeightGrams !== "" ? Number(data.stoneWeightGrams) : null,
      vendor_charge_percent: data.vendorChargePercent ?? null,
      inventory_item_id: data.inventoryItemId || null,
      note: data.note || null,
      payment_mode: data.paymentMode,
      paid_now: data.paidNow ?? null,
      payment_method: data.paymentMethod || "CASH",
      payment_date: data.paymentDate || null,
      reference_no: data.referenceNo || null,
      remarks: data.remarks || null,
    };
    const res = await apiClient.post("/billing/vendor-purchases", body, { auth: true });
    return mapVendorPurchase(res.data?.purchase ?? {});
  },

  /**
   * GET /api/v1/billing/vendor-purchases/{id}/payments — authoritative payable
   * state plus the full append-only payment ledger for one purchase.
   */
  async getVendorPurchasePayments(purchaseId) {
    const res = await apiClient.get(`/billing/vendor-purchases/${purchaseId}/payments`, { auth: true });
    return mapVendorPurchasePayments(res.data ?? {});
  },

  /**
   * POST /api/v1/billing/vendor-purchases/{id}/payments — record money paid to a
   * vendor. The backend row-locks the purchase, re-derives outstanding from the
   * ledger, rejects overpayment and payment on a fully-paid purchase, and derives
   * PAID/PARTIAL. Returns the refreshed purchase + ledger.
   */
  async recordVendorPayment(purchaseId, { amount, paymentDate, paymentMethod, referenceNo, remarks } = {}) {
    const res = await apiClient.post(
      `/billing/vendor-purchases/${purchaseId}/payments`,
      {
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_no: referenceNo || null,
        remarks: remarks || null,
      },
      { auth: true }
    );
    return mapVendorPurchasePayments(res.data ?? {});
  },

  /**
   * GET /api/v1/billing/vendor-summary — backend-authoritative vendor KPIs for a
   * named period or custom range, optionally scoped to one vendor. Figures are
   * real DB aggregations (never a reduction of listed rows). Classification:
   * Offline = CASH; Online = UPI + CARD + BANK_TRANSFER; Other = OTHER.
   */
  async getVendorSummary({ period = "this_month", dateFrom = "", dateTo = "", vendorId = "" } = {}) {
    const params = new URLSearchParams();
    if (dateFrom && dateTo) {
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
    } else {
      params.set("period", period);
    }
    if (vendorId) params.set("vendor_id", vendorId);
    const res = await apiClient.get(`/billing/vendor-summary?${params.toString()}`, { auth: true });
    const d = res.data ?? {};
    return {
      period: d.period ?? "",
      dateFrom: d.date_from ?? null,
      dateTo: d.date_to ?? null,
      vendorId: d.vendor_id ?? null,
      totalPurchases: d.total_purchases ?? 0,
      totalPaid: d.total_paid ?? 0,
      outstanding: d.outstanding ?? 0,
      offline: d.offline ?? 0,
      online: d.online ?? 0,
      other: d.other ?? 0,
      paidByMethod: d.paid_by_method ?? {},
    };
  },

  /** GET /api/v1/billing/defaults/store — the store-wide pricing defaults
   *  (making/wastage/gold-profit/tax/pricing) used to pre-fill new items. */
  async getStoreDefaults() {
    const res = await apiClient.get("/billing/defaults/store", { auth: true });
    const d = res.data ?? {};
    return {
      makingType: d.making_charge_type ?? "PERCENTAGE",
      // 6% is the shop's stated default (3% gold profit + 3% negotiable
      // extra). The field shipped blank and a blank number input saves as 0,
      // which the billing rule then read as "no margin at all" - so 0 and
      // unset both show the default here, and the owner can still type
      // anything else over it.
      makingValue: d.making_charge_value ? d.making_charge_value : 6,
      wastageType: d.wastage_type ?? "PERCENTAGE",
      wastageValue: d.wastage_value ?? "",
      goldProfit: d.gold_profit_percent ?? "",
      // The shop's own cost of being open, as a percentage of the metal. It
      // was welded into the break-even rule at 4% where nobody could see or
      // change it; a shop whose real running cost is 6% was being told an 11%
      // bill broke even when it did not. Blank means "use the 4% the rule has
      // always assumed".
      runningCost: d.running_cost_percent ?? "",
      // The gold profit inside the making-charge bands (Store Defaults).
      goldProfitBand: d.band_gold_profit_percent ?? null,
      // GST is compulsory and fixed at 3%.
      tax: 3,
      pricingMode: d.default_pricing_mode ?? "AUTO",
    };
  },

  /** PUT /api/v1/billing/defaults/store — update the store pricing defaults.
   *  Pre-fill source only; never touches saved inventory or sales. */
  async updateStoreDefaults(f = {}) {
    const body = {
      making_charge_type: f.makingType,
      making_charge_value: f.makingValue !== "" ? Number(f.makingValue) : null,
      wastage_type: f.wastageType,
      wastage_value: f.wastageValue !== "" ? Number(f.wastageValue) : null,
      // Preserved, not edited. The screen no longer offers a Gold Profit
      // default - margin lives in the making charge - so whatever the store had
      // is sent back untouched rather than being wiped to null on the next save.
      gold_profit_percent: f.goldProfit !== "" && f.goldProfit != null ? Number(f.goldProfit) : null,
      running_cost_percent: f.runningCost !== "" && f.runningCost != null ? Number(f.runningCost) : null,
      band_gold_profit_percent: f.goldProfitBand !== "" && f.goldProfitBand != null ? Number(f.goldProfitBand) : null,
      tax_rate_percent: 3,
      default_pricing_mode: f.pricingMode,
    };
    const res = await apiClient.put("/billing/defaults/store", body, { auth: true });
    return res.data;
  },

  /** PUT /api/v1/billing/inventory/{id} — retire (INACTIVE) / restore (IN_STOCK). */
  async setInventoryStatus(id, stockStatus) {
    const res = await apiClient.put(`/billing/inventory/${id}`, { stock_status: stockStatus }, { auth: true });
    return res.data?.item;
  },

  /**
   * PUT /api/v1/billing/inventory/{id} — patch item fields. Used by Purchase to
   * snapshot the backend-authoritative purchase cost (Base + Tunch) returned by
   * the linked vendor purchase onto the item, so COGS stays correct at sale time.
   * Only defined keys are sent.
   */
  async updateInventoryItem(id, data = {}) {
    const body = {};
    if (data.purchaseCost !== undefined) body.purchase_cost = data.purchaseCost;
    const res = await apiClient.put(`/billing/inventory/${id}`, body, { auth: true });
    return res.data?.item;
  },

  /** POST /api/v1/billing/inventory/{id}/image — attach/replace an existing
   *  item's image (multipart). Needed so an item with no photo can be given one
   *  before publishing to the catalogue (publish reuses the item's own image). */
  async setInventoryItemImage(id, file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post(`/billing/inventory/${id}/image`, fd, { auth: true });
    return res.data?.item ?? null;
  },

  /** POST /api/v1/billing/inventory/image — stage an image, returns storage path. */
  async uploadStagingImage(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post("/billing/inventory/image", fd, { auth: true });
    return res.data?.image_storage_path;
  },

  /** POST /api/v1/billing/inventory — create item (image path mandatory server-side). */
  async createInventoryItem(data) {
    const body = {
      // Blank = the server allocates the Item Code; ignored when a HUID is sent.
      product_code: data.productCode || null,
      product_name: data.productName,
      category: data.category || null,
      subcategory: data.subcategory || null,
      huid: data.huid || null,
      purity: data.purity,
      gross_weight_grams: data.grossWeightGrams,
      net_gold_weight_grams: data.netGoldWeightGrams,
      stone_weight_grams: data.stoneWeightGrams != null && data.stoneWeightGrams !== "" ? Number(data.stoneWeightGrams) : null,
      vendor_id: data.vendorId || null,
      vendor_name: data.vendorName || null,
      purchase_date: data.purchaseDate || null,
      purchase_at: data.purchaseAt || null,
      purchase_invoice_ref: data.purchaseInvoiceRef || null,
      purchase_reference_type: data.purchaseReferenceType || null,
      purchase_rate_per_gram: data.purchaseRatePerGram ?? null,
      purchase_cost: data.purchaseCost ?? null,
      making_charge_type: data.makingChargeType,
      making_charge_value: data.makingChargeValue ?? null,
      wastage_type: data.wastageType,
      wastage_value: data.wastageValue ?? null,
      gold_profit_percent: data.goldProfitPercent ?? null,
      stone_charge_amount: data.stoneChargeAmount ?? 0,
      other_charges_amount: data.otherChargesAmount ?? 0,
      tax_rate_percent: data.taxRatePercent,
      pricing_mode: data.pricingMode ?? null,
      ...(data.imageStoragePath ? { image_storage_path: data.imageStoragePath } : {}),
    };
    const res = await apiClient.post("/billing/inventory", body, { auth: true });
    return res.data?.item;
  },

  /**
   * POST /api/v1/billing/inventory/bulk-purchase — one vendor/date/invoice
   * header + many finished-jewellery rows (HUID identifier), settled by ONE
   * aggregate vendor payable. Backend computes Base Total = Σ(net × rate),
   * Tunch, final, paid, outstanding, status. Selling-price fields inherit store
   * defaults. Returns the created items + the aggregate purchase.
   */
  async bulkPurchase(data = {}) {
    const body = {
      vendor_id: data.vendorId,
      purchase_date: data.purchaseDate,
      purchase_at: data.purchaseAt || null,
      purchase_invoice_ref: data.invoiceRef || null,
      purchase_reference_type: data.referenceType || null,
      delivered_by: data.deliveredBy || null,
      delivered_by_phone: data.deliveredByPhone || null,
      // GST on the vendor's bill, switched on per purchase (backend default 3%).
      gst_applied: !!data.gstApplied,
      gst_percent: data.gstApplied && data.gstPercent !== "" && data.gstPercent != null ? Number(data.gstPercent) : null,
      vendor_charge_percent: data.tunchPercent !== "" && data.tunchPercent != null ? Number(data.tunchPercent) : null,
      payment_mode: data.paymentMode,
      paid_now: data.paymentMode === "PARTIAL" && data.paidNow !== "" && data.paidNow != null ? Number(data.paidNow) : null,
      payment_method: data.paymentMethod || "CASH",
      payment_date: data.paymentDate || null,
      reference_no: data.referenceNo || null,
      remarks: data.remarks || null,
      items: (data.items ?? []).map((r) => ({
        // Item Code XOR HUID. Both blank = the server allocates an Item Code.
        huid: r.huid || null,
        product_code: r.huid ? null : (r.itemCode || null),
        product_name: r.name,
        category: r.category || null,
        subcategory: r.subCategory || null,
        purity: r.purity,
        gross_weight_grams: Number(r.gross),
        // Net is still sent because every gold calculation runs on it - but it
        // is now DERIVED from the two figures the slip actually states.
        net_gold_weight_grams: Number(r.net),
        stone_weight_grams: r.stoneWt !== "" && r.stoneWt != null ? Number(r.stoneWt) : null,
        purchase_rate_per_gram: Number(r.rate),
        // Flat rupee cost of this row's stones - not gold, so it carries no
        // purity conversion and no Tunch.
        stone_charge_amount: r.stone !== "" && r.stone != null ? Number(r.stone) : 0,
        // The V/A card's second line. Money, never metal.
        other_charges_amount: r.other !== "" && r.other != null ? Number(r.other) : 0,
        // Tunch per row. Null (omitted) lets the server fall back to the
        // header, then to the vendor default.
        vendor_charge_percent: r.tunch !== "" && r.tunch != null ? Number(r.tunch) : null,
      })),
    };
    const res = await apiClient.post("/billing/inventory/bulk-purchase", body, { auth: true });
    return {
      items: res.data?.items ?? [],
      purchase: mapVendorPurchase(res.data?.purchase ?? {}),
    };
  },

  /**
   * POST /api/v1/billing/inventory/raw-gold-bulk-purchase — raw gold / bullion
   * bulk (Serial Number identifier). Same aggregate payable + Tunch + payment
   * rules as jewellery bulk. No making/wastage/tax/image.
   */
  async bulkPurchaseRawGold(data = {}) {
    const body = {
      vendor_id: data.vendorId,
      purchase_date: data.purchaseDate,
      purchase_at: data.purchaseAt || null,
      purchase_invoice_ref: data.invoiceRef || null,
      purchase_reference_type: data.referenceType || null,
      delivered_by: data.deliveredBy || null,
      delivered_by_phone: data.deliveredByPhone || null,
      // GST on the vendor's bill, switched on per purchase (backend default 3%).
      gst_applied: !!data.gstApplied,
      gst_percent: data.gstApplied && data.gstPercent !== "" && data.gstPercent != null ? Number(data.gstPercent) : null,
      vendor_charge_percent: data.tunchPercent !== "" && data.tunchPercent != null ? Number(data.tunchPercent) : null,
      payment_mode: data.paymentMode,
      paid_now: data.paymentMode === "PARTIAL" && data.paidNow !== "" && data.paidNow != null ? Number(data.paidNow) : null,
      payment_method: data.paymentMethod || "CASH",
      payment_date: data.paymentDate || null,
      reference_no: data.referenceNo || null,
      remarks: data.remarks || null,
      items: (data.items ?? []).map((r) => ({
        serial_number: r.serial,
        product_name: r.name,
        category: r.category || null,
        subcategory: r.subCategory || null,
        purity: r.purity,
        gross_weight_grams: Number(r.gross),
        net_gold_weight_grams: Number(r.net),
        purchase_rate_per_gram: Number(r.rate),
      })),
    };
    const res = await apiClient.post("/billing/inventory/raw-gold-bulk-purchase", body, { auth: true });
    return {
      items: res.data?.items ?? [],
      purchase: mapVendorPurchase(res.data?.purchase ?? {}),
    };
  },

  /** POST /api/v1/billing/inventory/{id}/publish — publish (or idempotently
   *  re-publish = "Update Listing") one item to the catalogue.
   *  - SELLING_COST: server computes the price; no price sent, gst_applied flags
   *    whether GST is included in that computed selling price.
   *  - CATALOGUE_COST: admin's manual catalogue_price (> 0) is sent instead.
   *  sub_category is optional either way. Backend rejects a client price for
   *  SELLING_COST and requires one for CATALOGUE_COST — mirrored here. */
  async publishToCatalogue(id, { pricingSource = "SELLING_COST", cataloguePrice, subCategory, gstApplied = true } = {}) {
    const body = { pricing_source: pricingSource };
    if (pricingSource === "CATALOGUE_COST") body.catalogue_price = Number(cataloguePrice);
    else body.gst_applied = gstApplied;
    if (subCategory && String(subCategory).trim()) body.sub_category = String(subCategory).trim();
    await apiClient.post(`/billing/inventory/${id}/publish`, body, { auth: true });
  },

  /**
   * GET /api/v1/billing/sell/quote/{productCode} — backend-authoritative sale
   * quote for one inventory piece. All pricing (gold value, making, wastage,
   * tax, final amount) is computed server-side; nothing is recomputed here.
   */
  async getSaleQuote(productCode, {
    discountAmount = 0, gstApplied = true, appliedRatePerGram,
    makingChargeValue, makingChargeType, wastageValue, wastageType,
    customerPrice, goldProfitPercent, schemeValue, allowBelowCost,
  } = {}) {
    const params = new URLSearchParams();
    if (discountAmount) params.set("discount_amount", String(discountAmount));
    params.set("gst_applied", String(gstApplied));
    // Scheme (gold-savings) preview: the rupee value of the gold slice the
    // customer's scheme will cover. Backend carves making/wastage/profit and GST
    // off that slice and caps it to the piece's gold value — preview only.
    if (schemeValue != null && schemeValue !== "" && Number(schemeValue) > 0) params.set("scheme_value", String(schemeValue));
    // Offline manual price: the admin's negotiated final price. Backend makes it
    // authoritative and returns the implied gold_profit_percent in the breakdown.
    if (customerPrice != null && customerPrice !== "") params.set("customer_price", String(customerPrice));
    // Offline margin override: drives the engine price from this profit %.
    if (goldProfitPercent != null && goldProfitPercent !== "") params.set("gold_profit_percent", String(goldProfitPercent));
    if (appliedRatePerGram != null && appliedRatePerGram !== "") params.set("applied_rate_per_gram", String(appliedRatePerGram));
    // Preview the bill as an approved below-cost sale. Without it the quote
    // refuses a customer price under the item's cost - exactly as the sale
    // will - so the preview and the eventual bill never disagree.
    if (allowBelowCost) params.set("allow_below_cost", "true");
    // A value override must travel with its own type so a FIXED amount is never
    // reinterpreted as a PERCENTAGE by the backend engine.
    if (makingChargeValue != null && makingChargeValue !== "") { params.set("making_charge_value", String(makingChargeValue)); if (makingChargeType) params.set("making_charge_type", makingChargeType); }
    if (wastageValue != null && wastageValue !== "") { params.set("wastage_value", String(wastageValue)); if (wastageType) params.set("wastage_type", wastageType); }
    const res = await apiClient.get(
      `/billing/sell/quote/${encodeURIComponent(productCode)}?${params.toString()}`,
      { auth: true }
    );
    return mapSaleQuote(res.data ?? {}, productCode, gstApplied);
  },

  /**
   * POST /api/v1/billing/sell — finalize a real sale for one piece. The backend
   * recomputes every figure authoritatively, marks the item SOLD, issues an
   * invoice and seeds the payment ledger. A buyer (existing customer_id or a
   * walk-in customer_name[+phone]) is required by the backend.
   */
  async createSale({
    productCode, customerId, customerName, customerPhone,
    discountAmount = 0, gstApplied = true, appliedRatePerGram,
    makingChargeValue, makingChargeType, wastageValue, wastageType,
    customerPrice, goldProfitPercent, schemeValue,
    allowBelowCost, belowCostReason,
    paymentMethod = "CASH", paymentStatus = "PAID",
    initialPaymentAmount, paymentReferenceNo,
  }) {
    const body = {
      product_code: productCode,
      gst_applied: gstApplied,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
    };
    if (customerId) body.customer_id = customerId;
    if (customerName) body.customer_name = customerName;
    if (customerPhone) body.customer_phone = customerPhone;
    if (discountAmount) body.discount_amount = discountAmount;
    if (customerPrice != null && customerPrice !== "") body.customer_price = Number(customerPrice);
    if (goldProfitPercent != null && goldProfitPercent !== "") body.gold_profit_percent = Number(goldProfitPercent);
    if (appliedRatePerGram != null && appliedRatePerGram !== "") body.applied_rate_per_gram = Number(appliedRatePerGram);
    // Selling under cost is allowed but never silent: the backend requires the
    // reason and writes its own SALE_BELOW_COST_APPROVED audit row.
    if (allowBelowCost) { body.allow_below_cost = true; body.below_cost_reason = belowCostReason; }
    if (makingChargeValue != null && makingChargeValue !== "") { body.making_charge_value = Number(makingChargeValue); if (makingChargeType) body.making_charge_type = makingChargeType; }
    if (wastageValue != null && wastageValue !== "") { body.wastage_value = Number(wastageValue); if (wastageType) body.wastage_type = wastageType; }
    // The scheme credit about to be redeemed against this bill. Validation
    // only - the sale is stored uncarved and the carve still happens inside the
    // OTP-gated redemption - but it means a discount that could not survive the
    // carve is refused now rather than with the customer at the OTP step.
    if (schemeValue) body.scheme_value = Number(schemeValue);
    if (paymentStatus === "PARTIAL") body.initial_payment_amount = initialPaymentAmount;
    if (paymentReferenceNo) body.payment_reference_no = paymentReferenceNo;
    const res = await apiClient.post("/billing/sell", body, { auth: true });
    const s = res.data?.sale ?? {};
    return { id: s.id, invoiceNumber: s.invoice_number, finalAmount: s.final_amount };
  },

  /**
   * POST /api/v1/billing/quotation — a "sample bill" using the SAME authoritative
   * pricing engine. Nothing is sold, no scheme balance is spent (scheme_amounts
   * is a read-only preview). Returns the created quotation number + breakdown.
   */
  async generateQuotation({
    productCode, customerId, customerName, customerPhone,
    discountAmount = 0, gstApplied = true, appliedRatePerGram,
    makingChargeValue, makingChargeType, wastageValue, wastageType,
    customerPrice, goldProfitPercent, schemeAmounts, note,
  }) {
    const body = { product_code: productCode, gst_applied: gstApplied };
    if (customerId) body.customer_id = customerId;
    if (customerName) body.customer_name = customerName;
    if (customerPhone) body.customer_phone = customerPhone;
    if (discountAmount) body.discount_amount = discountAmount;
    if (customerPrice != null && customerPrice !== "") body.customer_price = Number(customerPrice);
    if (goldProfitPercent != null && goldProfitPercent !== "") body.gold_profit_percent = Number(goldProfitPercent);
    if (appliedRatePerGram != null && appliedRatePerGram !== "") body.applied_rate_per_gram = Number(appliedRatePerGram);
    if (makingChargeValue != null && makingChargeValue !== "") { body.making_charge_value = Number(makingChargeValue); if (makingChargeType) body.making_charge_type = makingChargeType; }
    if (wastageValue != null && wastageValue !== "") { body.wastage_value = Number(wastageValue); if (wastageType) body.wastage_type = wastageType; }
    if (schemeAmounts && Object.keys(schemeAmounts).length) body.scheme_amounts = schemeAmounts;
    if (note) body.note = note;
    const res = await apiClient.post("/billing/quotation", body, { auth: true });
    const q = res.data?.quotation ?? {};
    return { id: q.id, quotationNumber: q.quotation_number, finalAmount: q.final_amount, outstandingAmount: q.outstanding_amount };
  },

  /** GET /api/v1/billing/dashboard-summary?period=today — today's 24K gold rate. */
  async getTodayGoldRate24k() {
    const res = await apiClient.get("/billing/dashboard-summary?period=today", { auth: true });
    return res.data?.today_gold_rate_24k ?? null;
  },

  /**
   * GET /api/v1/billing/dashboard-summary — backend-authoritative money-in
   * collection for a period. Reads data.selected_period.cash_collected and
   * .collected_by_method directly (no frontend row reduction). The backend
   * already excludes SCHEME_REDEMPTION and REFUND from both figures and groups
   * the split by payment_method (source=GATEWAY never overrides the method), so
   * the parts sum to cash_collected. Mapping: Offline = CASH; Online = UPI +
   * CARD + BANK_TRANSFER; Other = remainder (OTHER / any other method); Total =
   * cash_collected. Returns null when the summary is unavailable.
   *
   * Accepts one backend-supported named period (today/this_week/this_month/
   * last_month/…) OR a custom { dateFrom, dateTo } range (both required); the
   * backend resolves the calendar window. dateFrom/dateTo win over period.
   */
  async getBusinessCollectionSummary({ period = "today", dateFrom = "", dateTo = "" } = {}) {
    const params = new URLSearchParams();
    if (dateFrom && dateTo) {
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
    } else {
      params.set("period", period);
    }
    const res = await apiClient.get(
      `/billing/dashboard-summary?${params.toString()}`,
      { auth: true }
    );
    const sp = res.data?.selected_period ?? null;
    if (!sp) return null;
    const m = sp.collected_by_method ?? {};
    const val = (k) => Number(m[k]) || 0;
    const offline = val("CASH");
    const online = val("UPI") + val("CARD") + val("BANK_TRANSFER");
    const total = Number(sp.cash_collected) || 0;
    // Other is the residual so the parts always sum to cash_collected even if
    // the backend introduces a new method key — never recomputed from rows.
    const other = Math.max(0, Number((total - offline - online).toFixed(2)));
    return { offline, online, other, total, label: res.data?.selected_period_label ?? "" };
  },

  /**
   * GET /api/v1/billing/sales — sales-history list. Amounts, weights and
   * statuses are backend authoritative. Returns already-mapped rows plus the
   * real total count for the footer.
   */
  async listSales({ search = "", limit = 100, page = 1, customerId = "", paymentStatus = "", saleStatus = "", dateFrom = "", dateTo = "", period = "", category = "", subcategory = "", purity = "", timeoutMs } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (customerId) params.set("customer_id", customerId);
    if (paymentStatus) params.set("payment_status", paymentStatus);
    if (saleStatus) params.set("sale_status", saleStatus);
    // Explicit range wins over a named period server-side; send whichever is set.
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (period) params.set("period", period);
    // Category, sub-category and purity are SERVER-side filters and always were
    // (billing/router.py accepts all three). Filtering them in the browser meant
    // searching only the rows this page happened to load, so a filtered view
    // silently returned a subset and read as the whole answer. Sending them also
    // makes total, total_gold_weight_grams and total_outstanding describe the
    // filtered set, because the backend computes all three from the same
    // conditions as the page query.
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (purity) params.set("purity", purity);
    const res = await apiClient.get(`/billing/sales?${params.toString()}`, { auth: true });
    return {
      sales: (res.data?.sales ?? []).map(mapSaleRow),
      total: res.data?.total ?? 0,
      totalGoldWeightGrams: res.data?.total_gold_weight_grams ?? 0,
      totalOutstanding: res.data?.total_outstanding ?? 0,
    };
  },

  /**
   * GET /api/v1/billing/sales/{sale_id}/payments — backend-authoritative payment
   * ledger for one business sale. Outstanding, paid amount and payment status are
   * ledger-derived server-side; nothing is recomputed here.
   */
  async getSalePayments(saleId) {
    const res = await apiClient.get(`/billing/sales/${saleId}/payments`, { auth: true });
    const raw = res.data?.paymentHistory ?? res.data?.payment_history ?? res.data ?? {};
    return mapPaymentHistory(raw);
  },

  /**
   * POST /api/v1/billing/sales/{sale_id}/payments — record a collection against an
   * existing sale. The backend row-locks the sale, re-derives outstanding, rejects
   * overpayment and returned/cancelled sales, and derives PAID/PARTIAL. Returns the
   * refreshed authoritative payment history.
   */
  async recordSalePayment(saleId, { amount, paymentDate, paymentMethod, referenceNo, remarks } = {}) {
    const res = await apiClient.post(
      `/billing/sales/${saleId}/payments`,
      {
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_no: referenceNo || null,
        remarks: remarks || null,
      },
      { auth: true }
    );
    const raw = res.data?.paymentHistory ?? res.data?.payment_history ?? res.data ?? {};
    return mapPaymentHistory(raw);
  },

  /** GET /api/v1/billing/sales/{id}/invoice.pdf — download one invoice PDF. */
  async downloadInvoicePdf(saleId, invoiceNumber) {
    await apiClient.download(`/billing/sales/${saleId}/invoice.pdf`, `${invoiceNumber}.pdf`);
  },

  /**
   * POST /api/v1/billing/sales/{id}/void — reverse a scheme-redemption sale whose
   * OTP was never completed: the item returns to stock and the invoice is
   * cancelled. Called when the admin closes the OTP step without verifying.
   */
  /* ── Bill drafts — an unfinished bill held server-side ──────────────────
   * The counter saves what it has typed and comes back to it. A draft is not
   * a sale: it reserves no stock, takes no invoice number and appears in no
   * revenue figure until it is finalized. Admin sees every draft in the
   * tenant; Staff sees only their own (enforced by the backend).
   */

  /** POST /api/v1/billing/drafts */
  async saveDraft(payload) {
    const res = await apiClient.post("/billing/drafts", payload, { auth: true });
    return res.data?.draft ?? null;
  },

  /** GET /api/v1/billing/drafts — open drafts, newest first. */
  async listDrafts(status = "OPEN") {
    const res = await apiClient.get(`/billing/drafts?status=${encodeURIComponent(status)}`, { auth: true });
    return res.data?.drafts ?? [];
  },

  /** GET /api/v1/billing/drafts/{id} — the full draft, to resume it. */
  async getDraft(draftId) {
    const res = await apiClient.get(`/billing/drafts/${draftId}`, { auth: true });
    return res.data?.draft ?? null;
  },

  /** DELETE /api/v1/billing/drafts/{id} — discard, or clear after billing. */
  async deleteDraft(draftId) {
    await apiClient.delete(`/billing/drafts/${draftId}`, { auth: true });
  },

  async voidSale(saleId) {
    const res = await apiClient.post(`/billing/sales/${saleId}/void`, {}, { auth: true });
    return res.data?.void ?? null;
  },

  /** GET /api/v1/billing/sales/{id}/invoice.pdf — open the invoice PDF in a new
   *  tab (view / print). */
  async openInvoicePdf(saleId) {
    await apiClient.openInNewTab(`/billing/sales/${saleId}/invoice.pdf`);
  },

  /** GET /api/v1/billing/sales/{id}/invoice.xlsx — download one invoice as Excel. */
  async downloadInvoiceExcel(saleId, invoiceNumber) {
    await apiClient.download(`/billing/sales/${saleId}/invoice.xlsx`, `${invoiceNumber}.xlsx`);
  },

  /**
   * POST /api/v1/billing/sales/{id}/return — reverse a sale. return_type RETURN
   * or CANCELLATION; the backend restores the item, refunds only the cash it can
   * (never the scheme portion or the unpaid balance) and re-derives status.
   */
  async processReturn(saleId, { returnType = "RETURN", reason, refundAmount, refundMethod, refundReferenceNo, refundDate } = {}) {
    const body = { return_type: returnType, reason };
    if (refundAmount != null && refundAmount !== "") body.refund_amount = Number(refundAmount);
    if (refundMethod) body.refund_method = refundMethod;
    if (refundReferenceNo) body.refund_reference_no = refundReferenceNo;
    if (refundDate) body.refund_date = refundDate;
    const res = await apiClient.post(`/billing/sales/${saleId}/return`, body, { auth: true });
    return res.data?.saleReturn ?? res.data ?? null;
  },

  /** GET /api/v1/billing/quotation/{id}/pdf — download the quotation PDF. */
  async downloadQuotationPdf(quotationId, quotationNumber) {
    await apiClient.download(`/billing/quotation/${quotationId}/pdf`, `${quotationNumber}.pdf`);
  },

  /** GET /api/v1/billing/quotation/{id}/pdf — open the quotation PDF in a new
   *  tab so the admin can view or print it (auth is header-based, so it must be
   *  fetched, not linked). */
  async openQuotationPdf(quotationId) {
    await apiClient.openInNewTab(`/billing/quotation/${quotationId}/pdf`);
  },

  /** GET /api/v1/billing/sales/export.xlsx — export the sales history (Excel). */
  async exportSalesXlsx({ search = "" } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const q = params.toString();
    await apiClient.download(`/billing/sales/export.xlsx${q ? `?${q}` : ""}`, "sales-history.xlsx");
  },
};

/** Payment/ sale status -> the label the Sales History table renders. */
function saleStatusLabel(paymentStatus, saleStatus) {
  const ss = String(saleStatus || "").toUpperCase();
  if (ss === "RETURNED") return "Returned";
  if (ss === "CANCELLED") return "Canceled";
  const ps = String(paymentStatus || "").toUpperCase();
  if (ps === "PAID") return "Paid";
  if (ps === "PARTIAL" || ps === "PARTIALLY_REFUNDED") return "Partial";
  if (ps === "PENDING") return "Pending";
  if (ps === "REFUNDED") return "Returned";
  return paymentStatus ?? "";
}

const METHOD_LABEL = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

/** GET/POST /billing/sales/{id}/payments -> the payment-ledger shape the invoice
 *  detail panel renders. All money figures are backend authoritative. */
function mapPaymentHistory(raw = {}) {
  return {
    saleId: raw.sale_id,
    invoiceNumber: raw.invoice_number,
    finalAmount: raw.final_amount ?? 0,
    amountPaid: raw.amount_paid ?? 0,
    amountOutstanding: raw.amount_outstanding ?? 0,
    paymentStatus: raw.payment_status ?? "",
    payments: (raw.payments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount ?? 0,
      paymentDate: p.payment_date ?? null,
      paymentMethod: p.payment_method ?? "",
      methodLabel: METHOD_LABEL[String(p.payment_method || "").toUpperCase()] ?? (p.payment_method || "—"),
      source: p.source ?? "",
      referenceNo: p.reference_no ?? null,
      remarks: p.remarks ?? null,
      recordedByName: p.recorded_by_name ?? null,
      createdAt: p.created_at ?? null,
    })),
  };
}

/** GET/POST/PUT /billing/vendors item -> the vendor-master shape the Vendor
 *  module renders. vendor_charge_percent is the backend default (4%) unless the
 *  vendor overrides it. */
function mapVendor(v = {}) {
  return {
    id: v.id,
    name: v.name ?? "",
    contactPerson: v.contact_person ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
    address: v.address ?? "",
    gstNumber: v.gst_number ?? "",
    // Supplier Master: the store's short code name and its owner.
    code: v.code ?? "",
    ownerName: v.owner_name ?? "",
    ownerPhone: v.owner_phone ?? "",
    // The supplier's delivery staff (name + phone), oldest first.
    staff: (v.staff || []).map((s) => ({ id: s.id, name: s.name ?? "", phone: s.phone ?? "" })),
    vendorChargePercent: v.vendor_charge_percent ?? 4,
    isActive: v.is_active ?? true,
    createdAt: v.created_at ?? null,
  };
}

/** Vendor create/update UI shape -> the backend request body. Only defined keys
 *  are sent so an update PATCHes just what changed. */
function vendorBody(data = {}) {
  const b = {};
  if (data.name !== undefined) b.name = data.name;
  if (data.contactPerson !== undefined) b.contact_person = data.contactPerson || null;
  if (data.phone !== undefined) b.phone = data.phone || null;
  if (data.email !== undefined) b.email = data.email || null;
  if (data.address !== undefined) b.address = data.address || null;
  if (data.gstNumber !== undefined) b.gst_number = data.gstNumber || null;
  if (data.code !== undefined) b.code = data.code || "";
  if (data.ownerName !== undefined) b.owner_name = data.ownerName || null;
  if (data.ownerPhone !== undefined) b.owner_phone = data.ownerPhone || null;
  if (data.staff !== undefined) b.staff = data.staff.map((s) => ({ id: s.id || undefined, name: s.name.trim(), phone: s.phone || null }));
  if (data.vendorChargePercent !== undefined && data.vendorChargePercent !== "" && data.vendorChargePercent !== null)
    b.vendor_charge_percent = Number(data.vendorChargePercent);
  if (data.isActive !== undefined) b.is_active = data.isActive;
  return b;
}

/** GET/POST /billing/vendor-purchases item -> the payable row shape the Vendor
 *  module renders. All money figures are backend authoritative. */
function mapVendorPurchase(p = {}) {
  return {
    id: p.id,
    vendorId: p.vendor_id,
    vendorName: p.vendor_name ?? "",
    inventoryItemId: p.inventory_item_id ?? null,
    purchaseDate: p.purchase_date ?? null,
    invoiceRef: p.invoice_ref ?? "",
    deliveredBy: p.delivered_by ?? "",
    deliveredByPhone: p.delivered_by_phone ?? "",
    // The store staff member who recorded the purchase.
    enteredByName: p.entered_by_name ?? "",
    enteredByPhone: p.entered_by_phone ?? "",
    // netWeightGrams is the metal received (45 g of 22K stays 45 g);
    // weightGrams is the 24K equivalent the payment was calculated on. Null
    // netWeightGrams means a purchase recorded before the column existed.
    netWeightGrams: p.net_weight_grams ?? null,
    purity: p.purity ?? "",
    stoneChargeAmount: p.stone_charge_amount ?? 0,
    otherChargesAmount: p.other_charges_amount ?? 0,
    gstApplied: !!p.gst_applied,
    gstPercent: p.gst_percent ?? 0,
    gstAmount: p.gst_amount ?? 0,
    weightGrams: p.weight_grams ?? 0,
    ratePerGram: p.rate_per_gram ?? 0,
    baseGoldAmount: p.base_gold_amount ?? 0,
    vendorChargePercent: p.vendor_charge_percent ?? 0,
    vendorChargeAmount: p.vendor_charge_amount ?? 0,
    purchaseAmount: p.purchase_amount ?? 0,
    amountPaid: p.amount_paid ?? 0,
    amountOutstanding: p.amount_outstanding ?? 0,
    paymentStatus: p.payment_status ?? "",
    note: p.note ?? "",
    createdAt: p.created_at ?? null,
  };
}

/** GET/POST /billing/vendor-purchases/{id}/payments -> the purchase + its full
 *  append-only ledger. Money figures are backend authoritative. */
function mapVendorPurchasePayments(raw = {}) {
  return {
    purchase: mapVendorPurchase(raw.purchase ?? {}),
    payments: (raw.payments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount ?? 0,
      paymentDate: p.payment_date ?? null,
      paymentMethod: p.payment_method ?? "",
      methodLabel: METHOD_LABEL[String(p.payment_method || "").toUpperCase()] ?? (p.payment_method || "—"),
      referenceNo: p.reference_no ?? null,
      remarks: p.remarks ?? null,
      recordedBy: p.recorded_by ?? null,
      createdAt: p.created_at ?? null,
    })),
  };
}

/** GET /billing/sell/quote -> the shape New Sale renders. Vendor cost/name is
 *  deliberately NOT mapped — never customer-facing at sale. Every money figure
 *  is backend-authoritative; the UI only renders it. */
function mapSaleQuote(data = {}, productCode = "", gstApplied = true) {
  const item = data.inventory_item ?? {};
  const b = data.breakdown ?? {};
  return {
    productCode: item.product_code ?? productCode,
    huid: item.huid ?? "",
    name: item.product_name ?? "",
    category: item.category ?? "",
    subcategory: item.subcategory ?? "",
    purity: item.purity ?? "",
    netGoldWeightGrams: item.net_gold_weight_grams ?? 0,
    grossWeightGrams: item.gross_weight_grams ?? 0,
    stockStatus: item.stock_status ?? "",
    goldRate24k: b.gold_rate_24k ?? null,
    goldRateApplied: b.gold_rate_applied ?? null,        // applicable purity ₹/g
    goldValueAmount: b.gold_value_amount ?? 0,
    makingChargeType: b.making_charge_type ?? "",
    makingChargeValue: b.making_charge_value ?? 0,
    makingChargeAmount: b.making_charge_amount ?? 0,
    wastageType: b.wastage_type ?? "",
    wastageValue: b.wastage_value ?? 0,
    wastageAmount: b.wastage_amount ?? 0,
    goldRatePurityFactor: b.gold_rate_purity_factor ?? null,
    goldProfitPercent: b.gold_profit_percent ?? null,    // margin % (implied when a customer price is set); null for Staff
    goldProfitAmount: b.gold_profit_amount ?? null,      // discount ceiling; null for Staff
    stoneChargeAmount: b.stone_charge_amount ?? 0,
    otherChargesAmount: b.other_charges_amount ?? 0,
    subtotalBeforeTax: b.subtotal_before_tax ?? 0,
    gstApplied: b.gst_applied ?? gstApplied,
    taxRatePercent: b.tax_rate_percent ?? 0,
    taxAmount: b.tax_amount ?? 0,
    discountAmount: b.discount_amount ?? 0,
    // Scheme gold-savings carve-out (0 on a normal bill). The gold slice paid by
    // the customer's scheme — free of making/wastage/profit and GST. The invoice
    // finalAmount INCLUDES this slice; the customer's cash balance is
    // finalAmount − schemeApplied.
    schemeApplied: b.scheme_applied_amount ?? 0,
    // The same arithmetic laid out the way the customer reads it: the scheme
    // netted off the gold value at the top, and what that credit buys of THIS
    // piece in grams.
    chargeableGoldValue: b.chargeable_gold_value_amount ?? 0,
    schemeGramsEquivalent: b.scheme_grams_equivalent ?? 0,
    finalAmount: b.final_amount ?? 0,
    // Profit views (Admin-only; null for Staff). Today's-gold-value P/L is the
    // card New Sale shows; historical (vs purchase cost) stays available but the
    // New Sale UI does not display it.
    currentGoldValuePnl: data.current_gold_value_profit_or_loss ?? null,
    currentGoldValueMarginPct: data.current_gold_value_margin_percent ?? null,
    historicalPnl: data.historical_profit_or_loss ?? null,
    profitLabel: data.profit_or_loss_label ?? null,
    // What this item's making charge is made of, and the two floors under it.
    // list = base + running cost + THIS LOT's tunch, so a piece bought at 6%
    // tunch bills at 16% where one bought at 4% bills at 14%. Admin-only
    // server-side (tunch and running cost are what the shop pays), so null for
    // a Staff caller - who still gets profitLabel, the decision without the
    // costs behind it.
    makingBands: data.making_bands
      ? {
          tunchPercent: data.making_bands.tunch_percent,
          runningCostPercent: data.making_bands.running_cost_percent,
          goldProfitPercent: data.making_bands.gold_profit_percent,
          extraPercent: data.making_bands.extra_percent,
          breakEvenFloorPercent: data.making_bands.break_even_floor_percent,
          profitFloorPercent: data.making_bands.profit_floor_percent,
          listPercent: data.making_bands.list_percent,
        }
      : null,
    // Safe-price guidance (Admin sees minimum_safe_price). Null when the item has
    // no purchase cost to judge against.
    safePrice: data.safe_price
      ? {
          status: data.safe_price.status ?? null,
          isLoss: !!data.safe_price.is_loss,
          requestedPrice: data.safe_price.requested_price ?? null,
          minimumSafePrice: data.safe_price.minimum_safe_price ?? null,
          achievablePrice: data.safe_price.achievable_price ?? null,
          residualDiscount: data.safe_price.residual_discount ?? null,
          message: data.safe_price.message ?? "",
          // Per-charge trims the backend allocated to reach the requested price.
          // GOLD_PROFIT is cut first; its to_value is the new gold profit %.
          reductions: (data.safe_price.reductions ?? []).map((r) => ({
            component: r.component,
            chargeType: r.charge_type ?? null,
            reduceAmount: r.reduce_amount ?? 0,
            fromValue: r.from_value ?? null,
            toValue: r.to_value ?? null,
          })),
        }
      : null,
  };
}

/** GET /billing/sales item -> the row shape the Sales History table renders.
 *  One sale = one jewellery piece, so items is always 1. */
function mapSaleRow(raw) {
  return {
    id: raw.id,
    inv: raw.invoice_number,
    customer: raw.customer_name || "Walk-in",
    customerCode: raw.customer_code ?? "",
    customerPhone: raw.customer_phone ?? "",
    items: 1,
    productCode: raw.product_code ?? "",
    productName: raw.product_name ?? "",
    vendor: raw.vendor_name ?? "",
    huid: raw.huid ?? "",
    category: raw.category ?? "",
    subcategory: raw.subcategory ?? "",
    purity: raw.purity ?? "",
    netGoldWeightGrams: raw.net_gold_weight_grams ?? 0,
    grossWeightGrams: raw.gross_weight_grams ?? 0,
    amount: raw.final_amount ?? 0,
    // Ledger-derived collection figures (backend authoritative).
    paid: raw.amount_paid ?? 0,
    outstanding: raw.amount_outstanding ?? 0,
    method: METHOD_LABEL[String(raw.payment_method || "").toUpperCase()] ?? (raw.payment_method || "—"),
    paymentStatus: raw.payment_status ?? "",
    saleStatus: raw.sale_status ?? "COMPLETED",
    saleTimestamp: raw.sale_timestamp ?? raw.created_at ?? null,
    status: saleStatusLabel(raw.payment_status, raw.sale_status),
    // Price breakdown for the View popup (backend snapshot; Gold Profit stays
    // internal and is not surfaced as a line).
    goldRateApplied: raw.gold_rate_applied ?? 0,
    goldRateSource: raw.gold_rate_source ?? "",
    goldRateEffectiveDate: raw.gold_rate_effective_date ?? null,
    goldValueAmount: raw.gold_value_amount ?? 0,
    // What the customer was charged for the metal, and the rate behind it.
    // Sent for every role. goldValueAmount is the metal at the PUBLISHED rate
    // and is short of the Subtotal by exactly the margin, so the breakdown has
    // to print these instead or it does not add up to its own total.
    // selling rate is null when no single rate reproduces the amount - the row
    // then prints bare rather than claiming arithmetic that does not hold.
    goldValueCharged: raw.gold_value_charged ?? null,
    sellingRateApplied: raw.selling_rate_applied ?? null,
    makingChargeType: raw.making_charge_type ?? "",
    makingChargeValue: raw.making_charge_value ?? 0,
    makingChargeAmount: raw.making_charge_amount ?? 0,
    wastageType: raw.wastage_type ?? "",
    wastageValue: raw.wastage_value ?? 0,
    wastageAmount: raw.wastage_amount ?? 0,
    stoneChargeAmount: raw.stone_charge_amount ?? 0,
    otherChargesAmount: raw.other_charges_amount ?? 0,
    subtotalBeforeTax: raw.subtotal_before_tax ?? 0,
    gstApplied: raw.gst_applied ?? false,
    taxRatePercent: raw.tax_rate_percent ?? 0,
    taxAmount: raw.tax_amount ?? 0,
    discountAmount: raw.discount_amount ?? 0,
    // What a scheme covered on this bill, frozen at redemption. 0 on an
    // ordinary sale, so an existing invoice reads exactly as it always did.
    schemeApplied: raw.scheme_applied_amount ?? 0,
    schemeGrams: raw.scheme_grams ?? null,
    schemeType: raw.scheme_type ?? null,
    schemePurity: raw.scheme_purity ?? null,
    finalAmount: raw.final_amount ?? 0,
    // Admin-only internal figures (backend returns null for Staff).
    purchaseCost: raw.purchase_cost_snapshot ?? null,
    grossMargin: raw.estimated_gross_margin ?? null,
    profitLabel: raw.profit_or_loss_label ?? null,
    pricingMode: raw.pricing_mode ?? null,
  };
}
