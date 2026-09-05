/**
 * Billing/inventory integration for the new UI. Ports the existing DFX frontend
 * billingService inventory contract onto the new apiClient. Weights, costs and
 * stock status are backend authoritative — this layer maps names only and
 * recreates no pricing/inventory business rules.
 */
import { apiClient } from "../lib/apiClient";

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
    cost: raw.purchase_cost ?? 0,
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
      invoice_ref: data.invoiceRef || null,
      weight_grams: data.weightGrams,
      rate_per_gram: data.ratePerGram,
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
      makingValue: d.making_charge_value ?? "",
      wastageType: d.wastage_type ?? "PERCENTAGE",
      wastageValue: d.wastage_value ?? "",
      goldProfit: d.gold_profit_percent ?? "",
      tax: d.tax_rate_percent ?? "",
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
      gold_profit_percent: f.goldProfit !== "" ? Number(f.goldProfit) : null,
      tax_rate_percent: f.tax !== "" ? Number(f.tax) : null,
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
      product_code: data.productCode,
      product_name: data.productName,
      category: data.category || null,
      subcategory: data.subcategory || null,
      huid: data.huid || null,
      purity: data.purity,
      gross_weight_grams: data.grossWeightGrams,
      net_gold_weight_grams: data.netGoldWeightGrams,
      vendor_id: data.vendorId || null,
      vendor_name: data.vendorName || null,
      purchase_date: data.purchaseDate || null,
      purchase_invoice_ref: data.purchaseInvoiceRef || null,
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
      purchase_invoice_ref: data.invoiceRef || null,
      vendor_charge_percent: data.tunchPercent !== "" && data.tunchPercent != null ? Number(data.tunchPercent) : null,
      payment_mode: data.paymentMode,
      paid_now: data.paymentMode === "PARTIAL" && data.paidNow !== "" && data.paidNow != null ? Number(data.paidNow) : null,
      payment_method: data.paymentMethod || "CASH",
      payment_date: data.paymentDate || null,
      reference_no: data.referenceNo || null,
      remarks: data.remarks || null,
      items: (data.items ?? []).map((r) => ({
        huid: r.huid,
        product_name: r.name,
        category: r.category || null,
        subcategory: r.subCategory || null,
        purity: r.purity,
        gross_weight_grams: Number(r.gross),
        net_gold_weight_grams: Number(r.net),
        purchase_rate_per_gram: Number(r.rate),
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
      purchase_invoice_ref: data.invoiceRef || null,
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

  /** POST /api/v1/billing/inventory/{id}/publish — publish to catalogue.
   *  SELLING_COST lets the server compute the price (no price sent). */
  async publishToCatalogue(id) {
    await apiClient.post(`/billing/inventory/${id}/publish`, { pricing_source: "SELLING_COST" }, { auth: true });
  },

  /**
   * GET /api/v1/billing/sell/quote/{productCode} — backend-authoritative sale
   * quote for one inventory piece. All pricing (gold value, making, wastage,
   * tax, final amount) is computed server-side; nothing is recomputed here.
   */
  async getSaleQuote(productCode, {
    discountAmount = 0, gstApplied = true, appliedRatePerGram,
    makingChargeValue, makingChargeType, wastageValue, wastageType,
  } = {}) {
    const params = new URLSearchParams();
    if (discountAmount) params.set("discount_amount", String(discountAmount));
    params.set("gst_applied", String(gstApplied));
    if (appliedRatePerGram != null && appliedRatePerGram !== "") params.set("applied_rate_per_gram", String(appliedRatePerGram));
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
    if (appliedRatePerGram != null && appliedRatePerGram !== "") body.applied_rate_per_gram = Number(appliedRatePerGram);
    if (makingChargeValue != null && makingChargeValue !== "") { body.making_charge_value = Number(makingChargeValue); if (makingChargeType) body.making_charge_type = makingChargeType; }
    if (wastageValue != null && wastageValue !== "") { body.wastage_value = Number(wastageValue); if (wastageType) body.wastage_type = wastageType; }
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
    makingChargeValue, makingChargeType, wastageValue, wastageType, schemeAmounts, note,
  }) {
    const body = { product_code: productCode, gst_applied: gstApplied };
    if (customerId) body.customer_id = customerId;
    if (customerName) body.customer_name = customerName;
    if (customerPhone) body.customer_phone = customerPhone;
    if (discountAmount) body.discount_amount = discountAmount;
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
  async listSales({ search = "", limit = 100, customerId = "", paymentStatus = "" } = {}) {
    const params = new URLSearchParams({ page: "1", limit: String(limit) });
    if (search) params.set("search", search);
    if (customerId) params.set("customer_id", customerId);
    if (paymentStatus) params.set("payment_status", paymentStatus);
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
    goldProfitPercent: b.gold_profit_percent ?? null,    // internal — not shown as a line
    goldProfitAmount: b.gold_profit_amount ?? null,      // discount ceiling; null for Staff
    stoneChargeAmount: b.stone_charge_amount ?? 0,
    otherChargesAmount: b.other_charges_amount ?? 0,
    subtotalBeforeTax: b.subtotal_before_tax ?? 0,
    gstApplied: b.gst_applied ?? gstApplied,
    taxRatePercent: b.tax_rate_percent ?? 0,
    taxAmount: b.tax_amount ?? 0,
    discountAmount: b.discount_amount ?? 0,
    finalAmount: b.final_amount ?? 0,
  };
}

/** GET /billing/sales item -> the row shape the Sales History table renders.
 *  One sale = one jewellery piece, so items is always 1. */
function mapSaleRow(raw) {
  return {
    id: raw.id,
    inv: raw.invoice_number,
    customer: raw.customer_name || "Walk-in",
    items: 1,
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
    saleTimestamp: raw.sale_timestamp ?? raw.created_at ?? null,
    status: saleStatusLabel(raw.payment_status, raw.sale_status),
  };
}
