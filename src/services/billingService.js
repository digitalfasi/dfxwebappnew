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

  /** GET /api/v1/billing/vendors — real vendor list. */
  async listVendors() {
    const res = await apiClient.get("/billing/vendors", { auth: true });
    return (res.data?.vendors ?? []).map((v) => ({ id: v.id, name: v.name }));
  },

  /** PUT /api/v1/billing/inventory/{id} — retire (INACTIVE) / restore (IN_STOCK). */
  async setInventoryStatus(id, stockStatus) {
    const res = await apiClient.put(`/billing/inventory/${id}`, { stock_status: stockStatus }, { auth: true });
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
  async getSaleQuote(productCode) {
    const res = await apiClient.get(
      `/billing/sell/quote/${encodeURIComponent(productCode)}`,
      { auth: true }
    );
    const item = res.data?.inventory_item ?? {};
    const b = res.data?.breakdown ?? {};
    return {
      productCode: item.product_code ?? productCode,
      name: item.product_name ?? "",
      category: item.category ?? "",
      purity: item.purity ?? "",
      netGoldWeightGrams: item.net_gold_weight_grams ?? 0,
      grossWeightGrams: item.gross_weight_grams ?? 0,
      vendorName: item.vendor_name ?? "",
      // Purity-adjusted rate the backend actually applied (₹/g).
      goldRateApplied: b.gold_rate_applied ?? null,
      finalAmount: b.final_amount ?? 0,
    };
  },

  /**
   * POST /api/v1/billing/sell — finalize a real sale for one piece. The backend
   * recomputes every figure, marks the item SOLD and issues an invoice.
   * Payment defaults to CASH/PAID (walk-in) — the current UI collects no
   * customer or payment method.
   */
  async createSale({ productCode }) {
    const res = await apiClient.post(
      "/billing/sell",
      { product_code: productCode, payment_method: "CASH", payment_status: "PAID", gst_applied: true },
      { auth: true }
    );
    const s = res.data?.sale ?? {};
    return { id: s.id, invoiceNumber: s.invoice_number, finalAmount: s.final_amount };
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

/** GET /billing/sales item -> the row shape the Sales History table renders.
 *  One sale = one jewellery piece, so items is always 1. */
function mapSaleRow(raw) {
  return {
    id: raw.id,
    inv: raw.invoice_number,
    customer: raw.customer_name || "Walk-in",
    items: 1,
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
