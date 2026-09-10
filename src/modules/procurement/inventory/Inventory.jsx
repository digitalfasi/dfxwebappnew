import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { DigitsInput, Input, MoneyInput, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { billingService } from "@/modules/billing/billingService";
import { money } from "@/_shared/utils";
import { goldRateService } from "@/modules/gold-rate/goldRateService";
import { masterInventoryService } from "@/modules/procurement/master-inventory/masterInventoryService";

// A purchase is ALWAYS priced at the 24K (pure gold) rate — the purity only
// converts the net weight into the pure gold it contains, it never changes the
// rate/g. Returns null when no 24K rate is published for today.
function rate24kPerGram(rateObj) {
  if (!rateObj) return null;
  const r24 = rateObj.rate_24k;
  return r24 != null && Number(r24) > 0 ? Number(r24) : null;
}

// Categories and subcategories come from the Master Inventory the store
// maintains under Procurement. They used to be two hardcoded arrays of six
// invented names, so the pickers here never matched the store's real taxonomy.
// Backend Purity contract (app/schemas/billing.py Purity literal).
const PURITIES = ["24K","22K","20K","18K","14K","9K"];
const STATUS_OPTS = ["All statuses","In Stock","Sold","Inactive"];
const PAYMENT_MODES = ["CASH","CREDIT","PARTIAL"];
// Mode of payment (how the money actually moved) — separate from settlement
// type. Recorded in the Vendor Payment ledger so cash/UPI/card/bank are
// accounted. These are exactly the billing PaymentMethod enum values
// (CASH/CARD/UPI/BANK_TRANSFER/OTHER); anything else is rejected with a 422,
// so do not add a value here without adding it to that Literal first.
const PAY_METHOD_OPTS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Net Banking / Bank" },
  { value: "OTHER", label: "Other (cheque / demand draft)" },
];

// Tunch is per row (two lots on one invoice are negotiated separately) and
// defaults to the trade norm of 4%. `rate` is the 24K rate for that row and is
// seeded from today's published rate by newBulkRow below — editable, because a
// vendor invoice can be struck at a rate agreed earlier in the day.
const DEFAULT_TUNCH_PERCENT = "4";
const emptyBulkRow = () => ({ ident: "", name: "", category: "", subCategory: "", purity: "22K", gross: "", net: "", rate: "", tunch: DEFAULT_TUNCH_PERCENT });

// Real inventory loads from the DFX backend via billingService. No mock items.

const EMPTY_PURCHASE = {
  photoFile: null, photo: null, huid: "", name: "", category: "Rings", subCategory: "Traditional",
  purity: "22K", gross: "", net: "", vendor: "", purchaseDate: "", invoice: "", rate: "",
  tunch: "4", paymentMode: "CASH", paymentMethod: "CASH", paidNow: "", addToCatalogue: true,
};

export default function Inventory({ onNavigate }) {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorList, setVendorList] = useState([]);
  const [query, setQuery] = useState("");
  // Active categories/subcategories from Master Inventory.
  const [master, setMaster] = useState([]);
  const [status, setStatus] = useState("All statuses");
  const [vendor, setVendor] = useState("All Vendors");
  const [category, setCategory] = useState("All Categories");
  const [subCategory, setSubCategory] = useState("All Sub-categories");
  const [purity, setPurity] = useState("All Purity");

  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [defaults, setDefaults] = useState(null);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  // Store-default GST, needed because single-item create requires tax_rate_percent.
  const [storeTax, setStoreTax] = useState(0);

  const [addForm, setAddForm] = useState(EMPTY_PURCHASE);
  // Today's gold rate object. Only rate_24k is used: a purchase is always
  // priced at the 24K rate, so it pre-fills the Purchase Rate/g.
  const [todayRate, setTodayRate] = useState(null);

  // Inline "add new vendor" inside the Add Purchase vendor section (replaces the
  // separate Manage Vendors button — a vendor is created without leaving the form).
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "" });
  const [vendorSaving, setVendorSaving] = useState(false);

  // Add-to-Catalogue / Update-Listing modal. mode "add" or "update"; both hit the
  // same idempotent publish endpoint (re-publish updates the linked product).
  const [catModal, setCatModal] = useState(null); // { item, mode } | null
  const [catForm, setCatForm] = useState({ pricing: "SELLING_COST", price: "", gst: true, sub: "" });
  const [catImageFile, setCatImageFile] = useState(null);
  const [catImagePreview, setCatImagePreview] = useState(null);
  // Set when the browser cannot load the stored asset (missing file, or a
  // storage URL this host cannot reach). The placeholder is then shown instead
  // of the browser's broken-image icon, and the field asks for an upload.
  const [catImageBroken, setCatImageBroken] = useState(false);
  const [catBusy, setCatBusy] = useState(false);

  // Bulk receiving — Phase 4. Two types: Jewellery (HUID) / Raw Gold (Serial).
  const [bulkType, setBulkType] = useState("JEWELLERY");
  const [bulkHeader, setBulkHeader] = useState({ vendor: "", date: "", invoice: "", paymentMode: "CASH", paymentMethod: "CASH", paidNow: "" });
  const [bulkRows, setBulkRows] = useState([emptyBulkRow()]);
  const [bulkSaving, setBulkSaving] = useState(false);

  usePageMotion(scope, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [inv, vendors, sd, master] = await Promise.all([
        billingService.listInventory(),
        billingService.listVendors().catch(() => []),
        billingService.getStoreDefaults().catch(() => null),
        // The taxonomy is a master the admin maintains; a failure here must not
        // blank the stock table, so the pickers fall back to the names already
        // present on the items.
        masterInventoryService.getMaster().catch(() => null),
      ]);
      setItems(inv.items);
      setVendorList(vendors);
      if (master) setMaster(master.categories);
      if (sd && sd.tax !== "" && sd.tax != null) setStoreTax(Number(sd.tax) || 0);
      // Neither the single Purchase nor the bulk header preselects a vendor —
      // both start in an empty placeholder state (real vendor master only).
    } catch (err) {
      setLoadError(err?.message || "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Master Inventory's "View items" hands over the category/subcategory it was
  // looking at. Read once and cleared, so a later visit to Inventory is not
  // silently still filtered.
  useEffect(() => {
    let handoff = null;
    try {
      const raw = sessionStorage.getItem("dfx:inventoryFilter");
      if (raw) { handoff = JSON.parse(raw); sessionStorage.removeItem("dfx:inventoryFilter"); }
    } catch { /* unreadable storage simply means no handoff */ }
    if (!handoff) return;
    if (handoff.category) setCategory(handoff.category);
    setSubCategory(handoff.subCategory || "All Sub-categories");
  }, []);

  // Fetch today's rate once, so the Add Purchase form can price the gold live.
  useEffect(() => {
    goldRateService.getTodayRate().then(setTodayRate).catch(() => setTodayRate(null));
  }, []);

  // Auto-fill Purchase Rate/g = today's 24K rate, when the form opens. Changing
  // the Purity must NOT touch the rate (purity only converts the net weight),
  // and a rate already typed in is never overwritten.
  useEffect(() => {
    if (!showAdd || !todayRate) return;
    const r = rate24kPerGram(todayRate);
    if (r == null) return;
    const rounded = String(Math.round(r * 100) / 100);
    setAddForm((f) => (f.rate !== "" ? f : { ...f, rate: rounded }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd, todayRate]);

  const totalGold = useMemo(() => items.filter(i=>i.status==="In Stock").reduce((s,i)=>s+i.net,0), [items]);
  const vendorNames = useMemo(() => vendorList.map((v) => v.name), [vendorList]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(i => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || (i.huid || "").toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
      const matchesStatus = status==="All statuses" || i.status===status;
      const matchesVendor = vendor==="All Vendors" || i.vendor===vendor;
      const matchesCat = category==="All Categories" || i.category===category;
      const matchesSub = subCategory==="All Sub-categories" || i.sub===subCategory;
      const matchesPurity = purity==="All Purity" || i.purity===purity;
      return matchesQ && matchesStatus && matchesVendor && matchesCat && matchesSub && matchesPurity;
    });
  }, [items, query, status, vendor, category, subCategory, purity]);

  // Gold-weight composition of the currently in-stock, filtered inventory. Real
  // loaded data only — display aggregation, no financials. Default is purity-wise;
  // when a Category/Sub-category filter is active it breaks down by Category+Purity.
  const compByCategory = category !== "All Categories" || subCategory !== "All Sub-categories";
  const composition = useMemo(() => {
    const map = new Map();
    filtered.filter(i => i.status === "In Stock").forEach(i => {
      const key = compByCategory ? `${i.category || "Uncategorised"}|${i.purity}` : (i.purity || "—");
      map.set(key, (map.get(key) || 0) + (i.net || 0));
    });
    return [...map.entries()]
      .map(([k, g]) => compByCategory
        ? (() => { const [cat, pur] = k.split("|"); return { cat, pur, g }; })()
        : { cat: null, pur: k, g })
      .sort((a, b) => b.g - a.g);
  }, [filtered, compByCategory]);

  // Filter options = the master's ACTIVE names merged with the values actually
  // present on stock, de-duplicated. A label already on an item never vanishes
  // from the filter just because the master no longer offers it — otherwise
  // that stock becomes unreachable.
  const masterCats = useMemo(() => master.filter((c) => c.isActive), [master]);
  const catOptions = useMemo(() => {
    const set = new Set(masterCats.map((c) => c.name));
    items.forEach(i => { if (i.category) set.add(i.category); });
    return [...set].sort();
  }, [masterCats, items]);
  const subOptions = useMemo(() => {
    const set = new Set();
    masterCats.forEach((c) => c.subcategories.forEach((sc) => { if (sc.isActive) set.add(sc.name); }));
    items.forEach(i => { if (i.sub) set.add(i.sub); });
    return [...set].sort();
  }, [masterCats, items]);

  // For the entry forms, only the master's own names — a purchase should be
  // filed under a governed category, not under whatever was typed before.
  const catChoices = useMemo(() => masterCats.map((c) => c.name), [masterCats]);
  const subChoicesFor = useCallback((categoryName) => {
    const cat = masterCats.find((c) => c.name === categoryName);
    const subs = (cat?.subcategories ?? []).filter((sc) => sc.isActive).map((sc) => sc.name);
    // No category picked yet (or one with no subcategories): offer every active
    // subcategory rather than an empty list the user cannot get past.
    if (subs.length) return subs;
    return [...new Set(masterCats.flatMap((c) => c.subcategories.filter((sc) => sc.isActive).map((sc) => sc.name)))].sort();
  }, [masterCats]);

  // Add Purchase amount preview, in the vendor's own terms: everything is
  // priced at the 24K rate and the purity only converts the weight.
  //   490 g of 18K  →  490 × 18/24 = 367.500 g of pure gold
  //   Tunch 4%      →  4% of that   =  14.700 g of pure gold
  //   payable       →  382.200 g of pure gold × the 24K rate/g
  // (Purchase Cost = (24K Equivalent × 24K Rate) + Touch%, per the gold billing
  // model — Tunch is a percent of the 24K-equivalent value, not of the net.)
  // Rate/g is ALWAYS the 24K rate (editable), never a per-purity rate. Mirrors
  // the backend payable formula (backend stays authoritative); the final figure
  // is also the item's purchase_cost so create satisfies that required field.
  const addAmounts = useMemo(() => {
    const net = Number(addForm.net) || 0;
    const rate24 = Number(addForm.rate) || 0;
    const karat = parseInt(addForm.purity, 10) || 0;
    const tunchPct = addForm.tunch !== "" ? Number(addForm.tunch) || 0 : 4;
    const fineGrams = karat > 0 ? net * karat / 24 : 0;
    const tunchGrams = fineGrams * tunchPct / 100;
    const base = fineGrams * rate24;
    const tunchAmt = tunchGrams * rate24;
    return {
      base, rate24, fineGrams, tunchGrams,
      payableGrams: fineGrams + tunchGrams,
      tunchAmt, final: base + tunchAmt,
    };
  }, [addForm.net, addForm.rate, addForm.purity, addForm.tunch]);

  const openDefaults = async () => {
    setShowDefaults(true);
    if (defaults) return;
    setDefaultsLoading(true);
    try { setDefaults(await billingService.getStoreDefaults()); }
    catch (err) { toast(err?.message || "Could not load store defaults"); }
    finally { setDefaultsLoading(false); }
  };
  const saveDefaults = async () => {
    if (!defaults) return;
    setDefaultsSaving(true);
    try { await billingService.updateStoreDefaults({ ...defaults, pricingMode: "AUTO" }); toast("Store defaults saved"); setShowDefaults(false); }
    catch (err) { toast(err?.message || "Save failed"); }
    finally { setDefaultsSaving(false); }
  };

  const handleAdd = async () => {
    const f = addForm;
    if (!(f.photoFile instanceof File)) { toast("Product photo is required"); return; }
    if (!f.huid.trim()) { toast("HUID is required"); return; }
    if (!f.name.trim()) { toast("Product Name is required"); return; }
    const matchedVendor = vendorList.find(v => v.name === f.vendor);
    if (!matchedVendor) { toast("Select a vendor"); return; }
    if (!f.purchaseDate) { toast("Purchase Date is required"); return; }
    if (!(Number(f.gross) > 0) || !(Number(f.net) > 0)) { toast("Gross and Net weight required"); return; }
    if (Number(f.net) > Number(f.gross)) { toast("Net weight cannot exceed gross"); return; }
    if (!(Number(f.rate) > 0)) { toast("Purchase Rate/g is required"); return; }
    if (f.paymentMode === "PARTIAL" && !(Number(f.paidNow) > 0)) { toast("Enter the amount paid now"); return; }

    setSaving(true);
    try {
      const imageStoragePath = await billingService.uploadStagingImage(f.photoFile);
      // HUID is the primary identifier. Product Code is no longer collected in the
      // Purchase UI; the backend column still exists, so the HUID is used as the
      // item's product_code. Selling-price rules (making/wastage/profit/tax/
      // pricing) are omitted → backend inherits the store's configured defaults.
      const created = await billingService.createInventoryItem({
        productCode: f.huid.trim().toUpperCase(),
        productName: f.name.trim(),
        category: f.category,
        subcategory: f.subCategory,
        huid: f.huid.trim(),
        purity: f.purity,
        grossWeightGrams: Number(f.gross),
        netGoldWeightGrams: Number(f.net),
        vendorId: matchedVendor.id,
        vendorName: matchedVendor.name,
        purchaseDate: f.purchaseDate,
        purchaseInvoiceRef: f.invoice || undefined,
        purchaseRatePerGram: Number(f.rate),
        // Final Purchase Amount (Base + Tunch) — required purchase_cost. The
        // vendor payable below re-derives the same figure authoritatively.
        purchaseCost: Number(addAmounts.final.toFixed(2)),
        // Required by the inventory contract; store-default GST (not a Purchase
        // selling field). Sale-time GST is still resolved by the backend.
        taxRatePercent: storeTax,
        imageStoragePath,
      });

      if (created?.id) {
        // Vendor purchase payable. Backend computes Base = Net × Rate/g,
        // Tunch = Net × Tunch% valued at the 24K rate behind that purity, and
        // Final = Base + Tunch (= Net × (purity % + Tunch %) grams of pure gold),
        // then posts the initial CASH/PARTIAL settlement into the separate
        // Vendor Payment ledger. Purity is required for the Tunch leg.
        await billingService.createVendorPurchase({
          vendorId: matchedVendor.id,
          purchaseDate: f.purchaseDate,
          invoiceRef: f.invoice || undefined,
          weightGrams: Number(f.net),
          ratePerGram: Number(f.rate),
          purity: f.purity,
          vendorChargePercent: f.tunch !== "" ? Number(f.tunch) : undefined,
          inventoryItemId: created.id,
          paymentMode: f.paymentMode,
          paidNow: f.paymentMode === "PARTIAL" ? Number(f.paidNow) : undefined,
          // Mode of payment for the initial settlement; CREDIT moves no money.
          paymentMethod: f.paymentMode === "CREDIT" ? "CASH" : f.paymentMethod,
          paymentDate: f.purchaseDate,
        });
        if (f.addToCatalogue) {
          await billingService.publishToCatalogue(created.id).catch(() => {});
        }
      }

      setShowAdd(false);
      setAddForm(EMPTY_PURCHASE);
      await load();
      toast(f.addToCatalogue ? "Purchase recorded and published to catalogue" : "Purchase recorded");
    } catch (err) {
      toast(err?.message || "Purchase failed");
    } finally {
      setSaving(false);
    }
  };

  const bulkIdentLabel = bulkType === "RAW_GOLD" ? "Serial Number" : "HUID";
  // Each row's Cost/g is the 24K rate, so the row's base is its PURE gold
  // content (net × karat/24) at that rate — the purity never changes the rate.
  const bulkRowBase = (r) => (Number(r.net) || 0) * ((parseInt(r.purity, 10) || 0) / 24) * (Number(r.rate) || 0);
  // A new row opens with today's 24K rate already in it, so the common case
  // needs no typing at all; the field stays editable for a back-dated invoice.
  const newBulkRow = useCallback(() => {
    const live = rate24kPerGram(todayRate);
    return { ...emptyBulkRow(), rate: live != null ? String(live) : "" };
  }, [todayRate]);

  const bulkSubtotal = bulkRows.reduce((s, r) => s + bulkRowBase(r), 0);
  // Pure-gold (24K) equivalent of the whole receipt = Σ(net × karat/24). Lets the
  // admin see the actual fine-gold content bought, independent of each row's purity.
  const bulk24kEquiv = bulkRows.reduce((s, r) => s + (Number(r.net) || 0) * ((parseInt(r.purity, 10) || 0) / 24), 0);
  // Tunch, same rule as a single purchase — a percent of the row's
  // 24K-equivalent gold value — but resolved PER ROW now that each row carries
  // its own percentage. The backend re-derives the payable the same way.
  const rowTunchPct = (r) => (r.tunch !== "" && r.tunch != null ? Number(r.tunch) || 0 : 0);
  const bulkTunchGrams = bulkRows.reduce(
    (s, r) => s + (Number(r.net) || 0) * ((parseInt(r.purity, 10) || 0) / 24) * rowTunchPct(r) / 100, 0);
  const bulkTunchAmount = bulkRows.reduce((s, r) => s + bulkRowBase(r) * rowTunchPct(r) / 100, 0);

  const handleBulkAdd = async () => {
    const h = bulkHeader;
    const matchedVendor = vendorList.find(v => v.name === h.vendor);
    if (!matchedVendor) { toast("Select a vendor"); return; }
    if (!h.date) { toast("Purchase Date is required"); return; }
    const rows = bulkRows.filter(r => r.ident.trim() || r.name.trim() || r.gross || r.net || r.rate);
    if (!rows.length) { toast("Add at least one row"); return; }
    for (const r of rows) {
      if (!r.ident.trim()) { toast(`${bulkIdentLabel} is required on every row`); return; }
      if (r.name.trim().length < 2) { toast("Product Name required (min 2 chars)"); return; }
      if (!(Number(r.gross) > 0) || !(Number(r.net) > 0)) { toast("Gross and Net weight required on every row"); return; }
      if (Number(r.net) > Number(r.gross)) { toast("Net weight cannot exceed gross"); return; }
      if (!(Number(r.rate) > 0)) { toast("24K Cost/g is required on every row"); return; }
    }
    if (h.paymentMode === "PARTIAL" && !(Number(h.paidNow) > 0)) { toast("Enter the amount paid now"); return; }

    setBulkSaving(true);
    try {
      const payload = {
        vendorId: matchedVendor.id,
        purchaseDate: h.date,
        invoiceRef: h.invoice || undefined,
        // No header Tunch any more — every row sends its own and the server
        // sums them, so a mixed-Tunch receipt is priced correctly.
        paymentMode: h.paymentMode,
        paidNow: h.paidNow,
        paymentMethod: h.paymentMode === "CREDIT" ? "CASH" : h.paymentMethod,
        paymentDate: h.date,
        items: rows.map(r => ({
          huid: r.ident.trim(),
          serial: r.ident.trim(),
          name: r.name.trim(),
          category: r.category || undefined,
          subCategory: r.subCategory || undefined,
          purity: r.purity,
          gross: r.gross,
          net: r.net,
          rate: r.rate,
          tunch: r.tunch,
        })),
      };
      const res = bulkType === "RAW_GOLD"
        ? await billingService.bulkPurchaseRawGold(payload)
        : await billingService.bulkPurchase(payload);
      const final = res?.purchase?.purchaseAmount;
      setShowBulk(false);
      setBulkRows([newBulkRow()]);
      setBulkHeader({ vendor: "", date: "", invoice: "", paymentMode: "CASH", paymentMethod: "CASH", paidNow: "" });
      await load();
      toast(final != null ? `Bulk purchase recorded — ₹${final} payable` : "Bulk purchase recorded");
    } catch (err) {
      toast(err?.message || "Bulk purchase failed");
    } finally {
      setBulkSaving(false);
    }
  };

  const retire = async (code) => {
    const it = items.find(i => i.code === code);
    if (!it?.id) return;
    try { await billingService.setInventoryStatus(it.id, "INACTIVE"); await load(); toast("Item retired"); }
    catch (err) { toast(err?.message || "Retire failed"); }
  };
  // Open the catalogue modal (add or update). Prefill sub-category on update.
  const openCatModal = (item, mode) => {
    setCatForm({ pricing: "SELLING_COST", price: "", gst: true, sub: item.sub || "" });
    setCatImageFile(null);
    setCatImagePreview(null);
    setCatImageBroken(false);
    setCatModal({ item, mode });
  };
  const submitCatalogue = async () => {
    if (!catModal?.item?.id) return;
    const it = catModal.item;
    if (catForm.pricing === "CATALOGUE_COST" && !(Number(catForm.price) > 0)) { toast("Enter a catalogue price greater than 0"); return; }
    // A catalogue image is mandatory server-side (publish reuses the item's own
    // image). If the item has none and none is chosen here, block before calling.
    const usableExisting = it.imageUrl && !catImageBroken;
    if (!usableExisting && !catImageFile) { toast("A catalogue image is required — upload one"); return; }
    setCatBusy(true);
    try {
      // Attach/replace the item image first so publish finds one. The
      // response carries the stored image_url; adopting it here means the modal
      // is showing the PERSISTED asset (not the local blob) before it closes,
      // which is exactly what the reopen has to render.
      if (catImageFile) {
        const saved = await billingService.setInventoryItemImage(it.id, catImageFile);
        if (saved?.image_url) {
          setCatModal((m) => (m ? { ...m, item: { ...m.item, imageUrl: saved.image_url } } : m));
          setCatImageBroken(false);
        }
      }
      await billingService.publishToCatalogue(it.id, {
        pricingSource: catForm.pricing,
        cataloguePrice: catForm.pricing === "CATALOGUE_COST" ? Number(catForm.price) : undefined,
        gstApplied: catForm.gst,
        subCategory: catForm.sub,
      });
      const wasUpdate = catModal.mode === "update";
      setCatModal(null);
      await load();
      toast(wasUpdate ? "Catalogue listing updated" : "Added to catalogue");
    } catch (err) {
      toast(err?.message || "Publish failed");
    } finally {
      setCatBusy(false);
    }
  };

  // Create a vendor inline from the Add Purchase form and select it immediately.
  const addVendorInline = async () => {
    const name = newVendor.name.trim();
    if (name.length < 2) { toast("Vendor name required (min 2 chars)"); return; }
    // Mirrors the server rule so a number the form accepts cannot be rejected
    // by the API a second later.
    if (newVendor.phone && !/^[6-9]\d{9}$/.test(newVendor.phone)) {
      toast("Enter a 10-digit Indian mobile number starting 6-9");
      return;
    }
    setVendorSaving(true);
    try {
      const v = await billingService.createVendor({ name, phone: newVendor.phone.trim() || undefined });
      setVendorList(prev => [...prev, v]);
      setAddForm(f => ({ ...f, vendor: v.name }));
      setNewVendor({ name: "", phone: "" });
      setShowAddVendor(false);
      toast(`Vendor added — ${v.name}`);
    } catch (err) {
      toast(err?.message || "Could not add vendor");
    } finally {
      setVendorSaving(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1400px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Inventory</h2>
          <p className="mt-1 text-sm text-muted">Receive finished jewellery / artefacts into stock — <span className="font-mono text-xs">HUID</span> tracked per piece.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openDefaults}>Store Pricing Defaults</Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>Bulk Purchase</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => setShowAdd(true)}>Add Purchase</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <Card data-motion="stat" className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Gold in Inventory</div>
          <div className="num mt-1 text-2xl font-extrabold">{totalGold.toFixed(2)} g</div>
          <div className="text-xs text-muted">In Stock only</div>
        </Card>
        <Card data-motion="stat" className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Inventory Composition</div>
            <div className="text-[11px] text-muted">{compByCategory ? "Category · Purity · In Stock" : "Purity-wise · In Stock"}</div>
          </div>
          {composition.length === 0 ? (
            <div className="mt-2 text-sm text-muted">No in-stock gold to break down.</div>
          ) : compByCategory ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {composition.map(({ cat, pur, g }) => (
                <span key={`${cat}-${pur}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/50 px-2.5 py-1 text-xs">
                  <span className="font-bold uppercase tracking-wide">{cat}</span>
                  <Badge tone="neutral">{pur}</Badge>
                  <span className="num font-mono font-semibold">{g.toFixed(2)} g</span>
                </span>
              ))}
            </div>
          ) : (() => {
            const totalG = composition.reduce((s, c) => s + c.g, 0) || 1;
            const maxG = composition.reduce((m, c) => Math.max(m, c.g), 0) || 1;
            return (
              <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                {composition.map(({ pur, g }) => {
                  const share = (g / totalG) * 100;
                  const barW = (g / maxG) * 100;
                  return (
                    <div key={pur} className="group">
                      <div className="flex items-baseline justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-bold">
                          <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" />
                          {pur}
                        </span>
                        <span className="num font-mono text-xs font-semibold tabular-nums">{g.toFixed(2)} g <span className="text-muted">· {share.toFixed(0)}%</span></span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line-soft/70">
                        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-700 ease-out" style={{ width: `${Math.max(barW, 4)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>
      </div>

      <div className="mb-4 grid gap-2" data-motion="toolbar">
        <div className="flex flex-wrap gap-2">
          <SearchInput placeholder="Search HUID, product or code" value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 min-w-[200px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold">Filters</span>
          <Select value={status} onValueChange={setStatus} options={STATUS_OPTS} className="w-[140px]" />
          <Select value={vendor} onValueChange={setVendor} options={["All Vendors", ...vendorNames]} className="w-[160px]" />
          <Select value={category} onValueChange={setCategory} options={["All Categories", ...catOptions]} className="w-[140px]" />
          <Select value={subCategory} onValueChange={setSubCategory} options={["All Sub-categories", ...subOptions]} className="w-[170px]" />
          <Select value={purity} onValueChange={setPurity} options={["All Purity", ...PURITIES]} className="w-[130px]" />
          {/* Clear used to call setProductName, which does not exist on this
              component, so the click threw a ReferenceError and nothing reset.
              Every filter this screen owns is listed here, and the control is
              right-aligned with the destructive treatment used elsewhere. */}
          {(query || status !== "All statuses" || vendor !== "All Vendors" || category !== "All Categories" || subCategory !== "All Sub-categories" || purity !== "All Purity") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("All statuses");
                setVendor("All Vendors");
                setCategory("All Categories");
                setSubCategory("All Sub-categories");
                setPurity("All Purity");
              }}
              className="ml-auto rounded-full border border-danger-line bg-danger-soft px-3.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3"><h3 className="text-sm font-extrabold">Product list</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {/* Fixed column widths: the Name cell truncates instead of pushing
              into Category, and the full value stays available on hover. */}
          <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[130px]" /><col className="w-[220px]" /><col className="w-[130px]" />
              <col className="w-[140px]" /><col className="w-[90px]" /><col className="w-[110px]" />
              <col className="w-[150px]" /><col className="w-[110px]" /><col className="w-[110px]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left align-middle text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">HUID</th><th className="px-3 py-3">Name</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Sub-category</th><th className="px-3 py-3">Purity</th><th className="px-3 py-3 text-right">Net Weight</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Catalogue</th><th className="py-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id || p.code} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold whitespace-nowrap">{p.huid || p.code || "Not provided"}</td>
                  <td className="px-3 py-3.5"><span className="block truncate font-semibold leading-snug" title={p.name}>{p.name}</span></td>
                  <td className="px-3 py-3.5"><span className="block truncate" title={p.category || ""}>{p.category || "—"}</span></td>
                  <td className="px-3 py-3.5"><span className="block truncate text-muted" title={p.sub || ""}>{p.sub || "—"}</span></td>
                  <td className="px-3 py-3.5"><Badge tone="neutral">{p.purity}</Badge></td>
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">{p.net} g</td>
                  <td className="px-3 py-3.5"><span className="block truncate text-xs" title={p.vendor}>{p.vendor || "—"}</span></td>
                  <td className="px-3 py-3.5"><Badge tone={p.status==="In Stock"?"success":p.status==="Sold"?"warning":"neutral"} dot>{p.status}</Badge></td>
                  <td className="px-3 py-3.5"><Badge tone={p.catalogue==="Yes"?"success":"neutral"}>{p.catalogue}</Badge></td>
                  <td className="py-3.5 pr-6 whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {p.catalogue === "Yes"
                        ? <Button size="sm" variant="outline" onClick={() => openCatModal(p, "update")}>Update Listing</Button>
                        : <Button size="sm" variant="outline" onClick={() => openCatModal(p, "add")}>Catalogue</Button>}
                      <Button size="sm" variant="outline" className="text-danger" onClick={() => retire(p.code)}>Retire</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={10} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load inventory</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold">No purchases found</div><p className="mt-1 text-sm text-muted">Add a purchase or adjust filters.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Purchase Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowAdd(false)} aria-label="Close" />
          <div className="relative w-full max-w-[720px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Add Purchase</h3><button onClick={()=>setShowAdd(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <div className="text-xs font-bold">Photo *</div>
                <label className="mt-1.5 flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 text-xs text-muted hover:border-accent"><input type="file" accept="image/*" className="hidden" onChange={e=>{ const file=e.target.files?.[0]; if(file) setAddForm({...addForm, photoFile: file, photo: URL.createObjectURL(file)});}} />{addForm.photo ? <img src={addForm.photo} alt="photo" className="h-full w-full rounded-xl object-cover" /> : <span>Upload Photo</span>}</label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5"><span className="text-xs font-bold">HUID *</span><Input placeholder="Hallmark Unique ID" value={addForm.huid} onChange={e=>setAddForm({...addForm, huid:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><Input placeholder="e.g. Gold Bangle" value={addForm.name} onChange={e=>setAddForm({...addForm, name:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Category</span><Select value={addForm.category} onValueChange={v=>setAddForm({...addForm, category:v, subCategory:""})} options={catChoices} placeholder={catChoices.length ? "Select category" : "Add categories in Master Inventory"} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Sub-category</span><Select value={addForm.subCategory} onValueChange={v=>setAddForm({...addForm, subCategory:v})} options={subChoicesFor(addForm.category)} placeholder={addForm.category ? "Select sub-category" : "Pick a category first"} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purity</span><Select value={addForm.purity} onValueChange={v=>setAddForm({...addForm, purity:v})} options={PURITIES} /></label>
                <div />
                <label className="grid gap-1.5"><span className="text-xs font-bold">Gross Weight (g) *</span><Input type="number" value={addForm.gross} onChange={e=>setAddForm({...addForm, gross:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Net Gold Weight (g) *</span><Input type="number" value={addForm.net} onChange={e=>setAddForm({...addForm, net:e.target.value})} />
                  {addAmounts.fineGrams > 0
                    ? <span className="text-[11px] font-semibold text-accent-strong">≈ {addAmounts.fineGrams.toFixed(3)} g pure gold (24K equivalent = Net × {addForm.purity}/24) · + Tunch {addAmounts.tunchGrams.toFixed(3)} g = <strong>{addAmounts.payableGrams.toFixed(3)} g payable</strong></span>
                    : <span className="text-[11px] text-muted">Pure-gold (24K) equivalent shown once net weight is entered.</span>}
                </label>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Vendor / Purchase</h4>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Vendor *</span>
                    {!showAddVendor && (
                      <button type="button" onClick={()=>setShowAddVendor(true)} className="text-[11px] font-bold text-accent underline">+ Add new vendor</button>
                    )}
                  </div>
                  <Select value={addForm.vendor} onValueChange={v=>setAddForm({...addForm, vendor:v})} options={vendorNames} placeholder={vendorNames.length ? "Select vendor…" : "No vendors — add one below"} />
                  {showAddVendor && (
                    <div className="mt-1 grid gap-3 rounded-xl border border-line bg-surface p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5"><span className="text-xs font-bold">New vendor name<span className="text-danger">*</span></span><Input value={newVendor.name} onChange={e=>setNewVendor({...newVendor, name:e.target.value})} placeholder="e.g. Sri Balaji Gold" /></label>
                        {/* Same +91 prefix and 10-digit rule as a customer's phone,
                            so the two modules validate and store identically. */}
                        <label className="grid gap-1.5">
                          <span className="text-xs font-bold">Phone <span className="font-normal text-muted">— 10 digits</span></span>
                          <div className="flex h-10 items-stretch overflow-hidden rounded-xl border border-line bg-surface transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]">
                            <span className="grid w-11 shrink-0 place-items-center border-r border-line-soft bg-canvas/60 text-sm font-bold text-muted" aria-hidden="true">+91</span>
                            <DigitsInput
                              value={newVendor.phone}
                              onValueChange={v=>setNewVendor({...newVendor, phone:v})}
                              maxDigits={10}
                              placeholder="98765 43210"
                              aria-label="Vendor mobile number"
                              className="min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus:shadow-none"
                            />
                          </div>
                          {newVendor.phone && !/^[6-9]\d{9}$/.test(newVendor.phone) && (
                            <span className="text-[11px] font-semibold text-danger">Enter a 10-digit number starting 6-9.</span>
                          )}
                        </label>
                      </div>
                      {/* Shared buttons, primary action last: Add is the primary,
                          Cancel is the secondary, both the standard size. */}
                      <div className="flex justify-end gap-2.5">
                        <Button variant="outline" size="sm" disabled={vendorSaving} onClick={()=>{setShowAddVendor(false);setNewVendor({ name: "", phone: "" });}}>Cancel</Button>
                        <Button size="sm" disabled={vendorSaving} onClick={addVendorInline}>{vendorSaving ? "Adding…" : "Add vendor"}</Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Date *</span><Input type="date" value={addForm.purchaseDate} onChange={e=>setAddForm({...addForm, purchaseDate:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Invoice / Reference</span><Input value={addForm.invoice} onChange={e=>setAddForm({...addForm, invoice:e.target.value})} placeholder="INV-..." /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Rate (₹/g) — 24K *</span><Input type="number" value={addForm.rate} onChange={e=>setAddForm({...addForm, rate:e.target.value})} /><span className="text-[11px] text-muted">{rate24kPerGram(todayRate) != null ? "Always the 24K (pure gold) rate — auto-filled from today's 24K rate, editable. Purity only converts the net weight." : "No live 24K rate set today — enter the 24K rate manually."}</span></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Tunch (%)</span><Input type="number" value={addForm.tunch} onChange={e=>setAddForm({...addForm, tunch:e.target.value})} /><span className="text-[11px] text-muted">Percent of the 24K-equivalent gold value ({addForm.purity} = {((parseInt(addForm.purity,10)||0)*100/24).toFixed(2)}% of net, then + Tunch {addForm.tunch || 0}% on that). Never added to the rate/g.</span></label>
                </div>
              </div>

              <div className="rounded-xl border border-accent-soft bg-accent-soft/40 p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-accent-strong">Purchase Amount</h4>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted">Gold at {addForm.purity} — {addAmounts.fineGrams.toFixed(3)} g pure @ 24K</span><span className="num font-mono tabular-nums">₹{addAmounts.base.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted">Tunch {addForm.tunch || 4}% of the 24K value — {addAmounts.tunchGrams.toFixed(3)} g pure</span><span className="num font-mono tabular-nums">₹{addAmounts.tunchAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                  <div className="flex items-center justify-between border-t border-line-soft pt-1.5"><span className="text-muted">Payable gold — {addAmounts.payableGrams.toFixed(3)} g pure × ₹{addAmounts.rate24.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/g (24K)</span><span className="num font-mono tabular-nums text-muted">{(Number(addForm.net) || 0) > 0 ? `${(((parseInt(addForm.purity,10)||0)*100/24) + (addForm.tunch !== "" ? Number(addForm.tunch) || 0 : 4)).toFixed(2)}% of net` : "—"}</span></div>
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5"><span className="font-bold">Final Purchase Amount</span><span className="num font-mono font-extrabold tabular-nums">₹{addAmounts.final.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Purchase Cost = (24K equivalent × 24K rate) + Tunch % — Tunch is never added to the per-gram rate. Backend re-derives this authoritatively.</p>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Payment</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Payment Type</span><Select value={addForm.paymentMode} onValueChange={v=>setAddForm({...addForm, paymentMode:v})} options={PAYMENT_MODES} /></label>
                  {addForm.paymentMode !== "CREDIT" && (
                    <label className="grid gap-1.5"><span className="text-xs font-bold">Mode of Payment</span><Select value={addForm.paymentMethod} onValueChange={v=>setAddForm({...addForm, paymentMethod:v})} options={PAY_METHOD_OPTS} /></label>
                  )}
                  {addForm.paymentMode === "PARTIAL" && (
                    <label className="grid gap-1.5"><span className="text-xs font-bold">Paid Now *</span><MoneyInput value={addForm.paidNow} onValueChange={v=>setAddForm({...addForm, paidNow:v})} /></label>
                  )}
                </div>
                <p className="text-[11px] text-muted">CASH settles in full · CREDIT leaves the full amount outstanding · PARTIAL records Paid Now and leaves the remainder outstanding. Mode of Payment (Cash/UPI/Card/Bank/Cheque) is recorded in the Vendor Payment ledger.</p>
              </div>

              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addForm.addToCatalogue} onChange={e=>setAddForm({...addForm, addToCatalogue:e.target.checked})} /> Add to Catalogue after creating</label>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} className="bg-accent hover:bg-accent-strong" onClick={handleAdd}>{saving ? "Saving…" : "Add Purchase"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Purchase Receiving — Phase 4. Jewellery (HUID) / Raw Gold (Serial). */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowBulk(false)} aria-label="Close" />
          <div className="relative w-full max-w-[1240px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">Bulk Purchase Receiving</h3>
              <button onClick={()=>setShowBulk(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Type toggle */}
              <div className="inline-flex rounded-xl border border-line p-1">
                {[["JEWELLERY","Jewellery / Artefacts"],["RAW_GOLD","Raw Gold / Bullion"]].map(([val,label])=>(
                  <button key={val} onClick={()=>setBulkType(val)} className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${bulkType===val ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>{label}</button>
                ))}
              </div>

              {/* Shared header */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Vendor *</span><Select value={bulkHeader.vendor} onValueChange={v=>setBulkHeader({...bulkHeader, vendor:v})} options={vendorNames} placeholder={vendorNames.length ? "Select vendor…" : "No vendors — add one"} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Date *</span><Input type="date" value={bulkHeader.date} onChange={e=>setBulkHeader({...bulkHeader, date:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Invoice Number</span><Input value={bulkHeader.invoice} onChange={e=>setBulkHeader({...bulkHeader, invoice:e.target.value})} placeholder="INV-..." /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Payment Type</span><Select value={bulkHeader.paymentMode} onValueChange={v=>setBulkHeader({...bulkHeader, paymentMode:v})} options={PAYMENT_MODES} /></label>
                {bulkHeader.paymentMode !== "CREDIT" && (
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Mode of Payment</span><Select value={bulkHeader.paymentMethod} onValueChange={v=>setBulkHeader({...bulkHeader, paymentMethod:v})} options={PAY_METHOD_OPTS} /></label>
                )}
                {bulkHeader.paymentMode === "PARTIAL" && (
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Paid Now *</span><MoneyInput value={bulkHeader.paidNow} onValueChange={v=>setBulkHeader({...bulkHeader, paidNow:v})} /></label>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[1140px] border-collapse text-sm">
                  <thead><tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    <th className="px-3 py-2 w-[150px]">{bulkIdentLabel} *</th>
                    <th className="py-2 w-[160px]">Product Name *</th>
                    <th className="py-2 w-[130px]">Category</th>
                    <th className="py-2 w-[140px]">Sub-category</th>
                    <th className="py-2 w-[100px]">Purity</th>
                    <th className="py-2 w-[100px]">Gross (g) *</th>
                    <th className="py-2 w-[100px]">Net (g) *</th>
                    <th className="py-2 w-[120px]">24K Cost/g (₹) *</th>
                    <th className="py-2 w-[90px]">Tunch %</th>
                    <th className="py-2 w-[130px] text-right">Total Cost</th>
                    <th className="py-2 w-[44px]"></th>
                  </tr></thead>
                  <tbody>
                    {bulkRows.map((r,i)=>{
                      const setCell = (k,v)=>{const c=bulkRows.map((row,ix)=>ix===i?{...row,[k]:v}:row);setBulkRows(c);};
                      const lineTotal = bulkRowBase(r);
                      return (
                        <tr key={i} className="border-t border-line-soft align-top">
                          <td className="px-2 py-2"><Input value={r.ident} onChange={e=>setCell("ident",e.target.value)} placeholder={bulkIdentLabel} className="h-9 text-sm" /></td>
                          <td className="px-2 py-2"><Input value={r.name} onChange={e=>setCell("name",e.target.value)} placeholder="Name" className="h-9 text-sm" /></td>
                          <td className="px-2 py-2">{bulkType==="JEWELLERY"
                            ? <Select value={r.category||""} onValueChange={v=>setCell("category",v)} options={catChoices} placeholder="Category" />
                            : <Input value={r.category} onChange={e=>setCell("category",e.target.value)} placeholder="e.g. Bar" className="h-9 text-sm" />}</td>
                          <td className="px-2 py-2">{bulkType==="JEWELLERY"
                            ? <Select value={r.subCategory||""} onValueChange={v=>setCell("subCategory",v)} options={subChoicesFor(r.category)} placeholder="Sub-category" />
                            : <Input value={r.subCategory} onChange={e=>setCell("subCategory",e.target.value)} placeholder="Optional" className="h-9 text-sm" />}</td>
                          <td className="px-2 py-2"><Select value={r.purity} onValueChange={v=>setCell("purity",v)} options={PURITIES} /></td>
                          <td className="px-2 py-2"><Input type="number" value={r.gross} onChange={e=>setCell("gross",e.target.value)} className="h-9" /></td>
                          <td className="px-2 py-2"><Input type="number" value={r.net} onChange={e=>setCell("net",e.target.value)} className="h-9" /></td>
                          <td className="px-2 py-2"><Input type="number" value={r.rate} onChange={e=>setCell("rate",e.target.value)} className="h-9" /></td>
                          {/* One digit only: Tunch is quoted in whole single digits. */}
                          <td className="px-2 py-2"><DigitsInput value={r.tunch} onValueChange={v=>setCell("tunch",v)} maxDigits={1} className="h-9" /></td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">{lineTotal ? money(lineTotal + lineTotal * rowTunchPct(r) / 100) : "—"}</td>
                          <td className="px-2 py-2"><Button size="sm" variant="outline" onClick={()=>setBulkRows(bulkRows.length>1 ? bulkRows.filter((_,ix)=>ix!==i) : [emptyBulkRow()])}>×</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={()=>setBulkRows([...bulkRows, newBulkRow()])}>Add Row</Button>
                <div className="text-sm text-right">
                  <div>
                    <span className="text-muted">Base subtotal (pure gold @ 24K) </span>
                    <span className="font-mono font-bold tabular-nums">₹{bulkSubtotal.toLocaleString("en-IN")}</span>
                    <span className="ml-2 text-muted">+ Tunch (per row) </span>
                    <span className="font-mono font-bold tabular-nums">₹{bulkTunchAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="font-bold">Final payable </span>
                    <span className="font-mono font-extrabold tabular-nums">₹{(bulkSubtotal + bulkTunchAmount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    <span className="ml-2 text-[11px] text-muted">backend re-derives this authoritatively</span>
                  </div>
                  {bulk24kEquiv > 0 && <div className="mt-0.5 text-[11px] font-semibold text-accent-strong">≈ {bulk24kEquiv.toFixed(3)} g pure gold (24K equivalent across all rows) · + Tunch {bulkTunchGrams.toFixed(3)} g = {(bulk24kEquiv + bulkTunchGrams).toFixed(3)} g payable</div>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowBulk(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkSaving} className="bg-accent hover:bg-accent-strong" onClick={handleBulkAdd}>{bulkSaving ? "Saving…" : "Record Bulk Purchase"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Store Pricing Defaults — pre-fill source for new items (backend-backed). */}
      {showDefaults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowDefaults(false)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Store Pricing Defaults</h3><button onClick={()=>setShowDefaults(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="px-6 py-5">
              <p className="mb-4 text-xs text-muted">Pre-fill source only — used to resolve making/wastage/profit/tax for new items. Never changes any saved inventory or sale.</p>
              {defaultsLoading || !defaults ? (
                <div className="py-10 text-center text-sm font-bold text-muted">Loading…</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Type</span><Select value={defaults.makingType} onValueChange={v=>setDefaults({...defaults, makingType:v})} options={["PERCENTAGE","FIXED","PER_GRAM"]} /></label>
                  {/* A PERCENTAGE rule is two digits; a FIXED / PER_GRAM rule is
                      rupees and needs real room (a Rs 500 flat making charge is an
                      ordinary figure). The cap follows the unit, exactly as the
                      server validates it. */}
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Value {defaults.makingType === "PERCENTAGE" ? <span className="font-normal text-muted">— 0-99 %</span> : <span className="font-normal text-muted">— ₹</span>}</span><DigitsInput value={defaults.makingValue} onValueChange={v=>setDefaults({...defaults, makingValue:v})} maxDigits={defaults.makingType === "PERCENTAGE" ? 2 : 7} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Type</span><Select value={defaults.wastageType} onValueChange={v=>setDefaults({...defaults, wastageType:v})} options={["PERCENTAGE","FIXED","PER_GRAM"]} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Value {defaults.wastageType === "PERCENTAGE" ? <span className="font-normal text-muted">— 0-99 %</span> : <span className="font-normal text-muted">— ₹</span>}</span><DigitsInput value={defaults.wastageValue} onValueChange={v=>setDefaults({...defaults, wastageValue:v})} maxDigits={defaults.wastageType === "PERCENTAGE" ? 2 : 7} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Gold Profit % <span className="font-normal text-muted">— 0-99</span></span><DigitsInput value={defaults.goldProfit} onValueChange={v=>setDefaults({...defaults, goldProfit:v})} maxDigits={2} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Tax / GST % <span className="font-normal text-muted">— 0-9</span></span><DigitsInput value={defaults.tax} onValueChange={v=>setDefaults({...defaults, tax:v})} maxDigits={1} /><span className="text-[11px] text-muted">GST on jewellery is 3%.</span></label>
                  {/* One mode exists, so this was a dropdown that could only ever
                      pick what it already showed. Read-only until a second mode is
                      a real product decision. */}
                  <div className="grid gap-1.5 sm:col-span-2">
                    <span className="text-xs font-bold">Pricing Mode</span>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3.5">
                      <span className="text-sm font-bold text-ink">Auto</span>
                      <span className="text-[11px] text-muted">— the server prices every item from the live rate and these defaults.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowDefaults(false)}>Cancel</Button>
              <Button size="sm" disabled={defaultsSaving || defaultsLoading || !defaults} className="bg-accent hover:bg-accent-strong" onClick={saveDefaults}>{defaultsSaving ? "Saving…" : "Save Store Defaults"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Catalogue / Update Listing — same idempotent publish endpoint.
          SELLING_COST = server price (+GST toggle); CATALOGUE_COST = manual price. */}
      {catModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>!catBusy && setCatModal(null)} aria-label="Close" />
          <div className="relative w-full max-w-[520px] rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">{catModal.mode === "update" ? "Update Catalogue Listing" : "Add to Catalogue"}</h3>
              <button onClick={()=>setCatModal(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-canvas/40 text-muted">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                </div>
                <div>
                  <div className="font-bold leading-tight">{catModal.item.name}</div>
                  <div className="text-xs text-muted"><span className="font-mono">{catModal.item.huid || catModal.item.code}</span> · {catModal.item.purity}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Catalogue image {(!catModal.item.imageUrl && !catImageFile) && <span className="text-danger">*</span>}</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-canvas/40 text-muted">
                    {(catImagePreview || (catModal.item.imageUrl && !catImageBroken))
                      ? <img
                          src={catImagePreview || catModal.item.imageUrl}
                          alt={`${catModal.item.name} catalogue photo`}
                          className="h-full w-full object-cover"
                          onError={() => setCatImageBroken(true)}
                        />
                      : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>}
                  </div>
                  <label className="cursor-pointer text-xs font-bold text-accent underline">
                    {((catModal.item.imageUrl && !catImageBroken) || catImageFile) ? "Replace image" : "Upload image"}
                    <input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f){ setCatImageFile(f); setCatImagePreview(URL.createObjectURL(f)); } }} />
                  </label>
                </div>
                {catImageBroken && !catImageFile && (
                  <p className="mt-1 text-[11px] font-semibold text-danger">
                    The stored photo could not be loaded. Upload one to replace it.
                  </p>
                )}
                {(!catModal.item.imageUrl && !catImageFile) && <p className="mt-1 text-[11px] text-muted">This item has no photo yet. A catalogue image is required to publish.</p>}
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Catalogue pricing</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[["SELLING_COST","Selling Price","Server-computed from billing rules"],["CATALOGUE_COST","Catalogue Price","Manual price you set"]].map(([val,title,desc])=>(
                    <button key={val} type="button" onClick={()=>setCatForm(f=>({...f, pricing:val}))} className={`rounded-xl border p-3 text-left transition ${catForm.pricing===val ? "border-accent bg-accent-soft/40" : "border-line hover:border-accent-line"}`}>
                      <div className="text-sm font-bold">{title}</div>
                      <div className="text-[11px] text-muted">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {catForm.pricing === "SELLING_COST" ? (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catForm.gst} onChange={e=>setCatForm(f=>({...f, gst:e.target.checked}))} /> Apply GST in the computed selling price</label>
              ) : (
                <label className="grid gap-1.5"><span className="text-xs font-bold">Catalogue Price (₹) *</span><Input type="number" value={catForm.price} onChange={e=>setCatForm(f=>({...f, price:e.target.value}))} placeholder="e.g. 85000" /></label>
              )}

              <label className="grid gap-1.5"><span className="text-xs font-bold">Sub-category (optional)</span><Input value={catForm.sub} onChange={e=>setCatForm(f=>({...f, sub:e.target.value}))} placeholder="e.g. Chain" /></label>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setCatModal(null)}>Cancel</Button>
              <Button size="sm" disabled={catBusy} className="bg-accent hover:bg-accent-strong" onClick={submitCatalogue}>{catBusy ? "Saving…" : catModal.mode === "update" ? "Update Listing" : "Publish to Catalogue"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
