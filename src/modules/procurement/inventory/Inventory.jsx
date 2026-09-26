import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { DigitsInput, Input, MoneyInput, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { billingService } from "@/modules/billing/billingService";
import { money, istToday } from "@/_shared/utils";
import { PURITY_FINENESS, PURITY_OPTIONS, purityLabel } from "@/_shared/purity";
import { goldRateService } from "@/modules/gold-rate/goldRateService";
import { masterInventoryService } from "@/modules/procurement/master-inventory/masterInventoryService";
import { useAuth } from "@/_shared/AuthContext";
import { loadDraft, saveDraft, clearDraft } from "@/_shared/purchaseDraft";
import { VendorForm } from "@/modules/procurement/purchase-history/Vendors";

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
// Backend Purity contract (app/schemas/billing.py Purity literal) — the karat
// string is what is STORED and sent. PURITY_OPTIONS carries the same values
// with the fineness ("22K – 916") as a DISPLAY label only; see _shared/purity.js.
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
// The admin types the product's WHOLE price (no separate stone-price box). The
// part above the gold value + other charges is its value addition (stones,
// work), carried to the backend as the stone charge. null (never edited) or
// blank = the auto figure; the box shows that figure as a real, editable value.
// `below` is true when the typed price is under the auto figure, which the
// purchase refuses.
// GST on a supplier purchase is compulsory, 3% on the whole purchase value
// (gold + Tunch + V/A). The payable includes it; the item's cost does not
// (input GST is a credit, not a cost of the piece).
const gstOn = (on, pct, subtotal) => (on ? Math.round(subtotal * (Number(pct) || 0)) / 100 : 0);

function amountOver(amount, auto) {
  if (amount === "" || amount == null) return { extra: 0, below: false };
  const typed = Number(amount) || 0;
  return { extra: Math.max(0, typed - auto), below: typed < auto - 0.005 };
}
// A row states what the SLIP states: gross and stone weight. Net is derived
// (rowWeights) and never typed, so the two weights can never disagree with a
// third field. `stone` is the stone CHARGE in rupees and `other` the rest of
// the V/A card - both money, never metal.
// Tunch has no default: it comes only from the Tunch Number the supplier quotes.
const emptyBulkRow = () => ({ ident: "", itemCode: "", name: "", category: "", subCategory: "", purity: "22K", gross: "", stoneWt: "", net: "", rate: "", tunchNo: "", other: "", amount: null });

// Bulk receiving: GST is compulsory, 3% on the final bill (owner 2026-09-26).
const BULK_GST_PERCENT = 3;
// One header per type - Jewellery and Raw Gold never share what was typed.
// lotWeight / lotQty: the lot the supplier hands over (e.g. 1000 g, 50 pcs);
// every row entered counts down against them.
const emptyBulkHeader = (date = "") => ({ vendor: "", deliveredBy: "", date, invoice: "", paymentMode: "CASH", paymentMethod: "CASH", paidNow: "", lotWeight: "", lotQty: "" });

// Item Code = category initial + sub-category initial + a 4-digit number per
// prefix (BF0001, BF0002 ...). Mirrors the backend's item_code_prefix exactly.
const initialOf = (v) => (String(v || "").toUpperCase().match(/[A-Z]/)?.[0] || "");
const bulkCodePrefix = (type, r) => {
  if (type === "RAW_GOLD") return (initialOf(r.category) || "R") + (initialOf(r.subCategory) || "G");
  return r.category && r.subCategory ? initialOf(r.category) + initialOf(r.subCategory) : null;
};

// Tunch from the supplier's Tunch Number. The number is the purity's fineness
// raised by the Tunch %: 22K is 916, and 916 + 4% = 916 × 1.04 = 952.6. So
//   Tunch % = (Tunch Number ÷ fineness − 1) × 100      (952.6 on 22K = 4%)
// the same "percent of the pure-gold value" the backend charges. Numbers above
// 100 are parts per thousand (952.6); up to 100 a percentage (95.26).
function tunchFromNumber(no, purity) {
  if (no === "" || no == null) return { pct: 0, error: "" };
  const n = Number(no);
  if (!Number.isFinite(n) || n <= 0) return { pct: 0, error: "Invalid number" };
  const fineness = PURITY_FINENESS[purity] || 0;
  if (!fineness) return { pct: 0, error: "Unknown purity" };
  const touch = n > 100 ? n / 10 : n;
  const pct = Math.round((touch * 10 / fineness - 1) * 10000) / 100;
  if (pct < 0) return { pct: 0, error: `Below purity (${PURITY_FINENESS[purity]})` };
  if (pct > 9) return { pct, error: "Tunch over 9%" };
  return { pct, error: "" };
}

// A header field: fixed-height label row so every control in the grid lines up.
function HeaderField({ label, action, children }) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="text-xs font-bold">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// A lot card: the admin types the lot (weight or pieces); each row entered
// counts down, so zero remaining means every piece of the lot is on the slip.
function LotCard({ label, unit, value, onChange, used, decimals, hint }) {
  const lot = Number(value) || 0;
  const remaining = lot - used;
  const fmt = (x) => (decimals ? x.toFixed(3) : String(Math.round(x)));
  const state = !lot ? "empty" : Math.abs(remaining) < (decimals ? 0.0005 : 0.5) ? "done" : remaining < 0 ? "over" : "left";
  const tone = {
    empty: { box: "border-accent-line bg-accent-soft/25", chip: "bg-canvas text-muted", bar: "bg-accent" },
    left: { box: "border-accent-line bg-accent-soft/25", chip: "bg-amber-100 text-amber-800", bar: "bg-accent" },
    done: { box: "border-emerald-300 bg-emerald-50/60", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
    over: { box: "border-danger-line bg-danger-soft/40", chip: "bg-danger-soft text-danger", bar: "bg-danger" },
  }[state];
  const chip = { empty: "Enter the lot", left: `${fmt(remaining)} ${unit} left`, done: "✓ All entered", over: `Over by ${fmt(-remaining)} ${unit}` }[state];
  const clean = (v) => (decimals ? v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1") : v.replace(/\D/g, "")).slice(0, 10);
  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${tone.box}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-accent-strong">{label} *</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>{chip}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input value={value} onChange={(e) => onChange(clean(e.target.value))} inputMode={decimals ? "decimal" : "numeric"} placeholder={decimals ? "e.g. 1000" : "e.g. 50"} className="num h-10 flex-1 text-lg font-extrabold" aria-label={`${label} of the lot`} />
        <span className="text-sm font-bold text-muted">{unit}</span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between text-xs">
        <span className="text-muted">Entered {fmt(used)} {unit}</span>
        <span className="num font-extrabold">Remaining {lot ? fmt(remaining) : "—"} {lot ? unit : ""}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/80">
        <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${lot ? Math.min(100, (used / lot) * 100) : 0}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted">{hint}</div>
    </div>
  );
}

// Real inventory loads from the DFX backend via billingService. No mock items.

const EMPTY_PURCHASE = {
  // Item Code XOR HUID: itemCode blank = auto-generated; a HUID replaces it.
  photoFile: null, photo: null, itemCode: "", huid: "", name: "", category: "Rings", subCategory: "Traditional",
  // gross + stoneWt are entered; net is DERIVED from them. netOverride holds a
  // hand-corrected net for the real case where the piece weighs differently
  // from gross - stone; the computed figure is kept beside it and both are
  // shown, so an override is never silent.
  purity: "22K", gross: "", stoneWt: "", netOverride: "", netOverridden: false,
  vendor: "", deliveredBy: "", purchaseDate: "", invoice: "", referenceType: "INVOICE", rate: "",
  tunchNo: "", other: "", amount: null, paymentMode: "CASH", paymentMethod: "CASH", paidNow: "", addToCatalogue: true,
};

// The four document types a purchase can arrive on. A Delivery Challan is not a
// tax invoice and a slip is neither, but a purchase carries exactly ONE
// document - hence a type beside the one number, never four number fields.
const REFERENCE_TYPES = [
  { value: "INVOICE", label: "Invoice" },
  { value: "REFERENCE", label: "Reference" },
  { value: "SLIP", label: "Slip" },
  { value: "DC", label: "Delivery Challan" },
];
const REFERENCE_LABEL = (v) => (REFERENCE_TYPES.find((t) => t.value === v)?.label ?? "Invoice");

// A local datetime string for <input type="datetime-local">, which has no
// timezone and therefore must be built from LOCAL parts - toISOString() would
// shift a 6pm slip to the previous day for any negative-offset shop.
const nowLocalInput = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// "2026-09-22T18:15" -> "2026-09-22", the DATE the backend keeps indexed.
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");

export default function Inventory({ onNavigate }) {
  const scope = useRef(null);
  // Store pricing defaults are Admin-only server-side; mirror that here so the
  // button is not offered to someone the API will refuse.
  const { backendRole, user } = useAuth();
  // Who keyed the entry. Display only: the backend stamps created_by from the
  // access token (service.py, created_by=current_user.id), so this is shown to
  // confirm WHO the entry will be recorded against — it is never sent, and
  // typing a different name here must never become possible.
  const staffName = user?.name || user?.email || "";
  const seesStoreDefaults = backendRole === "Admin" || backendRole === "SuperAdmin";
  usePressFeedback(scope);

  const [items, setItems] = useState([]);
  // Raw gold / bullion. Its own table, keyed by serial number rather than
  // HUID, because a bar is not a hallmarked piece. Bulk receiving has been
  // writing these rows since it shipped and the screen never read them back,
  // so a recorded purchase left the vendor owed and the bars nowhere.
  const [rawGold, setRawGold] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorList, setVendorList] = useState([]);
  const [query, setQuery] = useState("");
  // Active categories/subcategories from Master Inventory.
  const [master, setMaster] = useState([]);
  const [status, setStatus] = useState("All statuses");
  const [vendor, setVendor] = useState("All Suppliers");
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
  const [bulkHeaders, setBulkHeaders] = useState({ JEWELLERY: emptyBulkHeader(), RAW_GOLD: emptyBulkHeader() });
  const bulkHeader = bulkHeaders[bulkType];
  const setBulkHeader = useCallback((next) => {
    setBulkHeaders((prev) => ({ ...prev, [bulkType]: typeof next === "function" ? next(prev[bulkType]) : next }));
  }, [bulkType]);
  // Next free Item Code number per prefix ({ BF: 3 }), fetched from the server.
  const [nextCodes, setNextCodes] = useState({});
  // Each type keeps its OWN rows. They used to share one array, so switching
  // from Jewellery to Raw Gold showed the jewellery rows still sitting there -
  // and submitting then sent HUIDs, categories and stone charges to the raw-gold
  // endpoint. Clearing the grid on switch would have fixed the bleed by throwing
  // away what the user had typed; keeping a set per type fixes it without
  // losing anything.
  const [bulkRowsByType, setBulkRowsByType] = useState({
    JEWELLERY: [emptyBulkRow()],
    RAW_GOLD: [{ ...emptyBulkRow(), purity: "24K" }], // bars are usually 24K
  });

  const bulkRows = bulkRowsByType[bulkType];
  const setBulkRows = useCallback((next) => {
    setBulkRowsByType((prev) => ({
      ...prev,
      [bulkType]: typeof next === "function" ? next(prev[bulkType]) : next,
    }));
  }, [bulkType]);
  const [bulkSaving, setBulkSaving] = useState(false);
  // The lot-mismatch dialog: { weight, lotW, qty, lotQ } while it is open.
  const [lotConfirm, setLotConfirm] = useState(null);

  // Auto-save (5.9): an unfinished Add / Bulk Purchase survives a reload or
  // navigating away. Restored once on mount (the photo never — re-attach it),
  // saved ~1s after typing stops, cleared on a successful save or Discard.
  const [addDraftAt, setAddDraftAt] = useState(null);
  const [bulkDraftAt, setBulkDraftAt] = useState(null);
  useEffect(() => {
    const a = loadDraft("add");
    if (a?.form) { setAddForm({ ...EMPTY_PURCHASE, ...a.form, photoFile: null, photo: null }); setAddDraftAt(a.savedAt); }
    const b = loadDraft("bulk");
    if ((b?.headers || b?.header) && b?.rows) {
      // Older drafts saved one shared header; newer ones one per type.
      setBulkHeaders((h) => ({
        JEWELLERY: { ...h.JEWELLERY, ...(b.headers?.JEWELLERY || b.header) },
        RAW_GOLD: { ...h.RAW_GOLD, ...(b.headers?.RAW_GOLD || b.header) },
      }));
      setBulkRowsByType((r) => ({ ...r, ...b.rows }));
      if (b.type) setBulkType(b.type);
      setBulkDraftAt(b.savedAt);
    }
  }, []);
  useEffect(() => {
    if (!showAdd) return;
    const { photoFile, photo, ...form } = addForm;
    if (!form.name.trim() && !form.gross && !form.huid.trim() && !form.itemCode.trim()) return;
    const t = setTimeout(() => { if (saveDraft("add", { form })) setAddDraftAt(Date.now()); }, 1000);
    return () => clearTimeout(t);
  }, [addForm, showAdd]);
  useEffect(() => {
    if (!showBulk) return;
    const typed = Object.values(bulkRowsByType).some((rows) => rows.some((r) => r.name.trim() || r.gross || r.net || r.ident.trim()))
      || Object.values(bulkHeaders).some((h) => h.lotWeight || h.lotQty);
    if (!typed) return;
    const t = setTimeout(() => {
      if (saveDraft("bulk", { headers: bulkHeaders, rows: bulkRowsByType, type: bulkType })) setBulkDraftAt(Date.now());
    }, 1000);
    return () => clearTimeout(t);
  }, [bulkHeaders, bulkRowsByType, bulkType, showBulk]);
  const discardAddDraft = () => { clearDraft("add"); setAddDraftAt(null); setAddForm({ ...EMPTY_PURCHASE, purchaseDate: nowLocalInput() }); };
  const discardBulkDraft = () => {
    clearDraft("bulk"); setBulkDraftAt(null);
    setBulkHeaders({ JEWELLERY: emptyBulkHeader(nowLocalInput()), RAW_GOLD: emptyBulkHeader(nowLocalInput()) });
    setBulkRowsByType({ JEWELLERY: [newBulkRow("JEWELLERY")], RAW_GOLD: [newBulkRow("RAW_GOLD")] });
  };
  const draftStamp = (at) => at ? `Draft saved ${new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "";

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
      // Never let raw gold failing blank the jewellery table beside it.
      billingService.listRawGold().then(setRawGold).catch(() => setRawGold([]));
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

  // Fetch the rate once, so the Add Purchase form can price the gold live.
  // carryForward: a purchase booked just after midnight, before the morning
  // rate is entered, used to open with an empty rate field and get a figure
  // typed in from memory. The last published rate is carried forward instead -
  // bounded server-side, and labelled below with the day it came from, so it is
  // never mistaken for today's.
  useEffect(() => {
    goldRateService.getTodayRate({ carryForward: true })
      .then(setTodayRate)
      .catch(() => setTodayRate(null));
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

  // The carried-forward rate keeps its own effective_date, so the form can say
  // which day it priced from rather than implying it is today's.
  const rateEffectiveLabel = todayRate?.effective_date || todayRate?.effectiveDate || null;
  const rateIsCarriedForward = !!rateEffectiveLabel &&
    rateEffectiveLabel !== istToday();

  // Gold is gold. A bar in the safe is as much of this shop's metal as a bangle
  // in the case, so "Total gold in inventory" counts both - it read 23.00 g
  // while 15.000 g of 24K bullion sat in the same room, unaccounted.
  const rawGoldInStock = useMemo(
    () => rawGold.filter((r) => r.stockStatus === "IN_STOCK"),
    [rawGold]
  );
  const totalGold = useMemo(
    () => items.filter(i=>i.status==="In Stock").reduce((s,i)=>s+i.net,0)
       + rawGoldInStock.reduce((s,r)=>s+(Number(r.netGoldWeightGrams)||0),0),
    [items, rawGoldInStock]
  );
  const vendorNames = useMemo(() => vendorList.map((v) => v.name), [vendorList]);
  // Picking a supplier pre-fills Delivered By with its registered staff member;
  // still editable when someone else brings the goods.
  const staffOf = (name) => vendorList.find((v) => v.name === name)?.contactPerson || "";
  // Supplier choices read "CODE — Store name"; the value stays the name. An
  // inactive supplier cannot be purchased from, so it is not offered.
  const vendorOptions = useMemo(() => vendorList.filter((v) => v.isActive !== false).map((v) => ({ value: v.name, label: v.code ? `${v.code} — ${v.name}` : v.name })), [vendorList]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(i => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || (i.huid || "").toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
      const matchesStatus = status==="All statuses" || i.status===status;
      const matchesVendor = vendor==="All Suppliers" || i.vendor===vendor;
      const matchesCat = category==="All Categories" || i.category===category;
      const matchesSub = subCategory==="All Sub-categories" || i.sub===subCategory;
      const matchesPurity = purity==="All Purity" || i.purity===purity;
      return matchesQ && matchesStatus && matchesVendor && matchesCat && matchesSub && matchesPurity;
    });
  }, [items, query, status, vendor, category, subCategory, purity]);
  // The bar list follows the same search box and supplier filter.
  const filteredRawGold = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawGold.filter((r) =>
      (!q || (r.serialNumber || "").toLowerCase().includes(q) || (r.productName || "").toLowerCase().includes(q))
      && (vendor === "All Suppliers" || r.vendorName === vendor));
  }, [rawGold, query, vendor]);

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
    // Bullion belongs in the purity breakdown too. Left out, the composition
    // read "22K 100%" for a shop also holding 24K bars - a true statement about
    // the jewellery case presented as the whole inventory. Grouped by category
    // it lands under its own heading, because a bar has no jewellery category.
    rawGoldInStock.forEach((r) => {
      const key = compByCategory ? `Raw gold & bullion|${r.purity}` : (r.purity || "—");
      map.set(key, (map.get(key) || 0) + (Number(r.netGoldWeightGrams) || 0));
    });
    return [...map.entries()]
      .map(([k, g]) => compByCategory
        ? (() => { const [cat, pur] = k.split("|"); return { cat, pur, g }; })()
        : { cat: null, pur: k, g })
      .sort((a, b) => b.g - a.g);
  }, [filtered, compByCategory, rawGoldInStock]);

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

  // THE derivation for a single purchase - the mirror of rowWeights for a bulk
  // row. The slip states gross and stone, so net is what is left: a 45 g piece
  // carrying 5 g of stones is 40 g of gold. The operator may override the net
  // when the scale disagrees, and then BOTH figures are kept and shown - an
  // override is never silent, and never quietly becomes the computed one.
  const addWeights = useMemo(() => {
    const gross = Number(addForm.gross) || 0;
    const stone = Math.max(0, Number(addForm.stoneWt) || 0);
    const computedNet = Math.max(0, gross - stone);
    const overrideNet = Number(addForm.netOverride) || 0;
    const overridden = !!addForm.netOverridden && addForm.netOverride !== "";
    return {
      gross,
      stone,
      computedNet,
      net: overridden ? overrideNet : computedNet,
      overridden,
      // Only a DIFFERENCE is worth reporting; an override that happens to equal
      // the computed figure is not a discrepancy.
      differs: overridden && Math.abs(overrideNet - computedNet) > 0.0005,
    };
  }, [addForm.gross, addForm.stoneWt, addForm.netOverride, addForm.netOverridden]);
  const stoneWeight = addWeights.stone;

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
  //
  // addWeights is declared ABOVE this on purpose. Both are `const` and both are
  // evaluated during the SAME render pass, and this one names addWeights in its
  // dependency array — an array that is built immediately, not on a click. The
  // other way round it threw "Cannot access 'addWeights' before initialization"
  // on first render. Same rule as rowWeights/bulkRowBase and rowTunchPct below:
  // in this file, a derivation is declared before whatever reads it.
  const addAmounts = useMemo(() => {
    const net = addWeights.net;
    const rate24 = Number(addForm.rate) || 0;
    const karat = parseInt(addForm.purity, 10) || 0;
    // From the supplier's Tunch Number, exactly as in Bulk (0 when blank).
    const tunchPct = tunchFromNumber(addForm.tunchNo, addForm.purity).pct;
    const fineGrams = karat > 0 ? net * karat / 24 : 0;
    const tunchGrams = fineGrams * tunchPct / 100;
    const base = fineGrams * rate24;
    const tunchAmt = tunchGrams * rate24;
    // Stones are not gold: no purity conversion, no Tunch. A 45 g stone-set
    // piece with 5 g of stones is 40 g of gold (that is the gross/net split)
    // plus a flat rupee cost for the stones themselves.
    const other = Number(addForm.other) || 0;
    // Rounded per leg exactly as the backend rounds its payable, so a typed
    // whole price lands on the paisa instead of one paisa off.
    const r2 = (x) => Math.round(x * 100) / 100;
    const goldValue = r2(base) + r2(tunchAmt);
    const auto = goldValue + other;
    // `stone` is derived: whatever the typed whole price is above gold + other.
    // The V/A total is everything non-gold. Money, never metal.
    const { extra: stone, below } = amountOver(addForm.amount, auto);
    const valueAddition = stone + other;
    return {
      base, rate24, fineGrams, tunchGrams, tunchPct, stone, other, valueAddition, goldValue, auto, below,
      payableGrams: fineGrams + tunchGrams,
      tunchAmt, final: goldValue + valueAddition,
      gst: gstOn(true, BULK_GST_PERCENT, goldValue + valueAddition),
    };
  }, [addWeights.net, addForm.rate, addForm.purity, addForm.tunchNo, addForm.other, addForm.amount]);


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
    if (!f.name.trim()) { toast("Product Name is required"); return; }
    const matchedVendor = vendorList.find(v => v.name === f.vendor);
    if (!matchedVendor) { toast("Select a supplier"); return; }
    if (!f.purchaseDate) { toast("Purchase Date is required"); return; }
    if (!f.huid.trim() && (!f.category || !f.subCategory)) { toast("Pick the category and sub-category - the Item Code is made from them"); return; }
    if (!f.huid.trim() && !addCode.code) { toast("The Item Code is still being generated - try again in a moment"); return; }
    if (tunchFromNumber(f.tunchNo, f.purity).error) { toast(`Tunch Number: ${tunchFromNumber(f.tunchNo, f.purity).error}`); return; }
    if (!(Number(f.gross) > 0)) { toast("Gross Weight is required"); return; }
    // The rule read from the direction the slip is now typed in. Net is derived,
    // so what can actually be wrong is the stone weight.
    if (addWeights.stone > addWeights.gross) { toast("Stone weight cannot exceed gross"); return; }
    if (!(addWeights.net > 0)) { toast("Net gold weight must be greater than zero"); return; }
    if (!(Number(f.rate) > 0)) { toast("Purchase Rate/g is required"); return; }
    if (addAmounts.below) { toast(`Purchase Amount cannot be less than the gold value + other charges (${money(addAmounts.auto)})`); return; }
    if (f.paymentMode === "PARTIAL" && !(Number(f.paidNow) > 0)) { toast("Enter the amount paid now"); return; }

    setSaving(true);
    // Set only if the catalogue publish fails; the purchase itself is separate.
    let publishFailed = "";
    try {
      const imageStoragePath = await billingService.uploadStagingImage(f.photoFile);
      // Item Code XOR HUID. A HUID piece bills Online (rate locked) and the
      // server uses the HUID as its product_code; otherwise the typed Item Code
      // is kept, or the server allocates one - that piece bills Offline.
      // Selling-price rules (making/wastage/profit/tax/pricing) are omitted →
      // backend inherits the store's configured defaults.
      const created = await billingService.createInventoryItem({
        productCode: f.huid.trim() ? undefined : addCode.code,
        productName: f.name.trim(),
        category: f.category,
        subcategory: f.subCategory,
        huid: f.huid.trim() || undefined,
        purity: f.purity,
        grossWeightGrams: addWeights.gross,
        // Derived, not typed (or the operator's explicit override - see
        // addWeights). The gold math has always run on net, and still does.
        netGoldWeightGrams: addWeights.net,
        stoneWeightGrams: addWeights.stone,
        vendorId: matchedVendor.id,
        vendorName: matchedVendor.name,
        purchaseDate: dateOnly(f.purchaseDate),
        purchaseAt: f.purchaseDate || undefined,
        purchaseInvoiceRef: f.invoice || undefined,
        purchaseReferenceType: "INVOICE",
        purchaseRatePerGram: Number(f.rate),
        // Final Purchase Amount (Base + Tunch) — required purchase_cost. The
        // vendor payable below re-derives the same figure authoritatively.
        purchaseCost: Number(addAmounts.final.toFixed(2)),
        // Carried onto the item so the sell side bills the stones back instead
        // of the store absorbing their cost.
        stoneChargeAmount: Number(addAmounts.stone.toFixed(2)),
        // V/A "Other" is NOT carried onto the item: it is a purchase cost on the
        // vendor payable only (below), exactly as Bulk Purchase does. Sending it
        // here would add it to the customer's bill as "Other Charges".
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
          purchaseDate: dateOnly(f.purchaseDate),
          purchaseAt: f.purchaseDate || undefined,
          invoiceRef: f.invoice || undefined,
          referenceType: "INVOICE",
          deliveredBy: f.deliveredBy.trim() || undefined,
          weightGrams: addWeights.net,
          stoneWeightGrams: addWeights.stone,
          ratePerGram: Number(f.rate),
          purity: f.purity,
          // Always sent (0 without a Tunch Number) so the supplier's stored
          // default never slips in.
          vendorChargePercent: tunchFromNumber(f.tunchNo, f.purity).pct,
          stoneChargeAmount: Number(addAmounts.stone.toFixed(2)),
          otherChargesAmount: f.other !== "" ? Number(f.other) : 0,
          gstApplied: true,
          gstPercent: BULK_GST_PERCENT,
          inventoryItemId: created.id,
          paymentMode: f.paymentMode,
          paidNow: f.paymentMode === "PARTIAL" ? Number(f.paidNow) : undefined,
          // Mode of payment for the initial settlement; CREDIT moves no money.
          paymentMethod: f.paymentMode === "CREDIT" ? "CASH" : f.paymentMethod,
          paymentDate: dateOnly(f.purchaseDate),
        });
        // The publish is a SEPARATE call from the purchase. Swallowing its
        // failure and then reporting "published" told the user something that
        // had not happened: the item sat in stock, absent from the catalogue,
        // and nobody found out until a customer could not see it.
        if (f.addToCatalogue) {
          try {
            await billingService.publishToCatalogue(created.id);
          } catch (e) {
            publishFailed = e?.message || "the catalogue rejected it";
          }
        }
      }

      setShowAdd(false);
      setAddForm(EMPTY_PURCHASE);
      setNextCodes({});
      clearDraft("add"); setAddDraftAt(null);
      await load();
      // The purchase itself IS recorded, so say so either way - only the
      // publish is in doubt.
      if (publishFailed) {
        toast(`Purchase recorded, but publishing to the catalogue failed — ${publishFailed}`);
      } else {
        toast(f.addToCatalogue ? "Purchase recorded and published to catalogue" : "Purchase recorded");
      }
    } catch (err) {
      toast(err?.message || "Purchase failed");
    } finally {
      setSaving(false);
    }
  };

  // THE one place a bulk row's three weights are derived. The slip states GROSS
  // and STONE weight, so the net is what is left — derived, never typed, which
  // is why two weights can never disagree with a third field. Every total,
  // card, row hint and payload reads from HERE and nowhere else.
  //
  // Declared ABOVE bulkRowBase on purpose, for exactly the reason rowTunchPct
  // records below: as a `const` arrow it sits in the temporal dead zone until
  // this line runs, and bulkRowBase is evaluated in the same render pass.
  // Declared after, the first render threw "Cannot access 'rowWeights' before
  // initialization".
  const rowWeights = (r) => {
    // Bullion has no stones: the bar's weight IS its net gold weight, typed
    // straight into Net. Gross is recorded equal to it.
    if (bulkType === "RAW_GOLD") {
      const net = Math.max(0, Number(r.net) || 0);
      return { gross: net, stone: 0, net };
    }
    const gross = Number(r.gross) || 0;
    // Clamped to gross: a stone cannot outweigh the piece it is set in, and a
    // typo must not produce a negative net that then prices as negative gold.
    // The row is still REJECTED on submit (see handleBulkAdd) - the clamp only
    // keeps the live preview sane while the operator is still typing.
    const stone = Math.min(Math.max(0, Number(r.stoneWt) || 0), gross);
    return { gross, stone, net: Math.max(0, gross - stone) };
  };
  // Each row's Cost/g is the 24K rate, so the row's base is its PURE gold
  // content (net × karat/24) at that rate — the purity never changes the rate.
  const rowPurity = (r) => (bulkType === "RAW_GOLD" ? "24K" : r.purity); // raw gold is 24K only
  const bulkRowBase = (r) => rowWeights(r).net * ((parseInt(rowPurity(r), 10) || 0) / 24) * (Number(r.rate) || 0);
  // A new row opens with today's 24K rate already in it, so the common case
  // needs no typing at all; the field stays editable for a back-dated invoice.
  const newBulkRow = useCallback((type = bulkType) => {
    const live = rate24kPerGram(todayRate);
    // Raw gold opens at 24K (bars usually are); jewellery at 22K.
    return { ...emptyBulkRow(), purity: type === "RAW_GOLD" ? "24K" : "22K", rate: live != null ? String(live) : "" };
  }, [todayRate, bulkType]);

  // Seed the OPEN grid's first row with the live 24K rate. Only the grid that
  // happened to be active when the modal opened used to be seeded, so switching
  // to Raw Gold gave an empty 24K COST/G and the first bullion row had to be
  // priced by hand. Only ever touches a row nobody has typed into.
  useEffect(() => {
    if (!showBulk) return;
    setBulkRows((rows) =>
      rows.length === 1 && !rows[0].ident && !rows[0].name && !rows[0].net && !rows[0].rate
        ? [newBulkRow()]
        : rows,
    );
  }, [showBulk, bulkType, newBulkRow, setBulkRows]);


  // Tunch percentage for one row. Zero for bullion, whatever the row happens to
  // be carrying: a bar has no tunch, so it must not appear in a raw-gold line
  // total or its summary.
  //
  // Declared ABOVE bulkBreakdown on purpose. As a `const` arrow it lives in the
  // temporal dead zone until this line runs, and bulkBreakdown's useMemo factory
  // runs during the same render pass — declared after, the first render threw
  // "Cannot access 'rowTunchPct' before initialization" the moment a bulk row
  // had a net weight and purity.
  const rowTunchPct = (r) =>
    bulkType === "JEWELLERY" ? tunchFromNumber(r.tunchNo, r.purity).pct : 0;
  // A row's auto price (gold + Tunch + other) and the value addition in the
  // whole price the admin typed over it. Raw gold has neither.
  const rowAmounts = (r) => {
    const base = bulkRowBase(r);
    const other = bulkType === "JEWELLERY" ? Number(r.other) || 0 : 0;
    const r2 = (x) => Math.round(x * 100) / 100; // per leg, as the backend rounds
    const auto = r2(base) + r2(base * rowTunchPct(r) / 100) + other;
    return { auto, ...(bulkType === "JEWELLERY" ? amountOver(r.amount, auto) : { extra: 0, below: false }) };
  };

  // Purity-wise settlement. Every figure here mirrors what the backend
  // derives, so the preview and the recorded payable agree to the paisa:
  //   fine (24K equivalent) = net x karat/24
  //   base                  = fine x that row's 24K rate
  //   Tunch                 = base x that row's Tunch %   (the fine-gold base,
  //                           matching TUNCH_ON_FULL_NET_WEIGHT = False)
  //   payable               = base + Tunch
  // Rows are grouped by purity because that is how a vendor's slip reads, and
  // the Tunch column shows "mixed" when one purity carries more than one rate.
  const bulkBreakdown = useMemo(() => {
    const groups = new Map();
    let netTotal = 0, fineTotal = 0, tunchGTotal = 0, baseTotal = 0, tunchAmtTotal = 0, stoneTotal = 0, stoneGTotal = 0;
    let grossTotal = 0, qty = 0, otherChargesTotal = 0;
    const rates = new Set();

    for (const r of bulkRows) {
      const { gross, net, stone: stoneG } = rowWeights(r);
      const other = bulkType === "JEWELLERY" ? Number(r.other) || 0 : 0;
      const karat = parseInt(rowPurity(r), 10) || 0;
      const rate = Number(r.rate) || 0;
      if (net <= 0 || karat <= 0) continue;
      const pct = rowTunchPct(r);
      const fine = net * karat / 24;
      const base = fine * rate;
      const tunchAmt = base * pct / 100;
      const tunchG = fine * pct / 100;

      // Stones are money, not metal: they never enter a GOLD gram total. Their
      // own weight is tracked separately (rowWeights) so the receipt can state
      // both. `stone` here is the RUPEE charge and is a different thing.
      const stone = rowAmounts(r).extra;

      if (rate > 0) rates.add(rate);
      otherChargesTotal += other;
      grossTotal += gross; qty += 1;
      netTotal += net; fineTotal += fine; tunchGTotal += tunchG;
      baseTotal += base; tunchAmtTotal += tunchAmt; stoneTotal += stone; stoneGTotal += stoneG;

      const key = rowPurity(r);
      const g = groups.get(key) || { purity: key, rows: 0, net: 0, fine: 0, tunchG: 0, base: 0, tunchAmt: 0, stone: 0, stoneG: 0, pcts: new Set() };
      g.rows += 1; g.net += net; g.fine += fine; g.tunchG += tunchG;
      g.base += base; g.tunchAmt += tunchAmt; g.stone += stone; g.stoneG += stoneG; g.pcts.add(pct);
      groups.set(key, g);
    }

    // Highest purity first — the order a jeweller reads a slip in.
    const rowsOut = [...groups.values()].sort(
      (a, b) => (parseInt(b.purity, 10) || 0) - (parseInt(a.purity, 10) || 0)
    );
    return {
      groups: rowsOut,
      // qty counts the rows that actually carry a weight and a purity — the
      // same rows every money total above is built from. An empty row the
      // operator has not filled in yet is not a piece of stock.
      grossTotal, qty,
      netTotal, fineTotal, tunchGTotal, baseTotal, tunchAmtTotal, stoneTotal, stoneGTotal,
      otherChargesTotal,
      // The V/A card total for the whole receipt: stones plus everything else
      // non-gold. Money, never metal - it is in no gram figure above.
      valueAdditionTotal: stoneTotal + otherChargesTotal,
      payableGrams: fineTotal + tunchGTotal,
      // Base and Tunch rounded as the backend rounds them (each total to the
      // paisa), so this equals the recorded payable and the row's Total Cost.
      finalAmount: Math.round(baseTotal * 100) / 100 + Math.round(tunchAmtTotal * 100) / 100 + stoneTotal + otherChargesTotal,
      // One rate across the receipt is the normal case; a mixed receipt shows
      // the blended rate instead of pretending there was a single one.
      singleRate: rates.size === 1 ? [...rates][0] : null,
      blendedRate: fineTotal > 0 ? baseTotal / fineTotal : 0,
    };
    // bulkType matters: rowTunchPct returns 0 for anything that is not
    // JEWELLERY, so switching type has to recompute the whole settlement.
  }, [bulkRows, bulkType]);

  // GST on the whole receipt - compulsory - on the same (paisa-rounded)
  // subtotal the server uses.
  const bulkGst = gstOn(true, BULK_GST_PERCENT, bulkBreakdown.finalAmount || 0);

  // What the rows entered so far take out of the lot: weight (jewellery: the
  // gross, as weighed; raw gold: the bar's net) and pieces (one per row).
  const bulkLotUsed = useMemo(() => {
    let weight = 0, qty = 0;
    for (const r of bulkRows) {
      const g = rowWeights(r).gross;
      if (g > 0) { weight += g; qty += 1; }
    }
    return { weight, qty };
    // rowWeights reads bulkType.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkRows, bulkType]);

  // Fetch the next free number for every prefix the open rows need.
  useEffect(() => {
    if (!showBulk && !showAdd) return;
    const want = new Set();
    if (showAdd && !addForm.huid.trim()) {
      const p = bulkCodePrefix("JEWELLERY", addForm);
      if (p && nextCodes[p] == null) want.add(p);
    }
    if (showBulk) for (const [type, rows] of Object.entries(bulkRowsByType)) {
      for (const r of rows) {
        if (type === "JEWELLERY" && r.ident.trim()) continue;
        const p = bulkCodePrefix(type, r);
        if (p && nextCodes[p] == null) want.add(p);
      }
    }
    if (!want.size) return;
    let alive = true;
    billingService.nextItemCodes([...want]).then((m) => { if (alive) setNextCodes((c) => ({ ...c, ...m })); }).catch(() => {});
    return () => { alive = false; };
  }, [showBulk, showAdd, bulkRowsByType, addForm, nextCodes]);

  // The Add Purchase piece's Item Code - same rule as Bulk.
  const addCode = useMemo(() => {
    if (addForm.huid.trim()) return { code: "", note: "Not used — HUID piece" };
    const p = bulkCodePrefix("JEWELLERY", addForm);
    if (!p) return { code: "", note: addForm.category ? "Pick a sub-category" : "Pick a category" };
    if (nextCodes[p] == null) return { code: "", note: "Generating…" };
    return { code: `${p}${String(nextCodes[p]).padStart(4, "0")}`, note: "" };
  }, [addForm, nextCodes]);

  // The Item Code each row will be saved with. A HUID piece has none (it bills
  // Online by its HUID); a raw-gold row gets one as soon as it has content.
  const bulkCodes = useMemo(() => {
    const seq = {};
    return bulkRows.map((r) => {
      if (bulkType === "JEWELLERY" && r.ident.trim()) return { code: "", note: "HUID piece" };
      if (bulkType === "RAW_GOLD" && !(r.name.trim() || r.net || r.category.trim())) return { code: "", note: "Auto" };
      const p = bulkCodePrefix(bulkType, r);
      if (!p) return { code: "", note: r.category ? "Pick sub-category" : "Pick category" };
      if (nextCodes[p] == null) return { code: "", note: "Generating…" };
      seq[p] = (seq[p] ?? -1) + 1;
      return { code: `${p}${String(nextCodes[p] + seq[p]).padStart(4, "0")}`, note: "" };
    });
  }, [bulkRows, bulkType, nextCodes]);

  // force === true only from the lot dialog's "Record anyway" (the button's
  // click event is never `true`).
  const handleBulkAdd = async (force) => {
    const h = bulkHeader;
    const matchedVendor = vendorList.find(v => v.name === h.vendor);
    if (!matchedVendor) { toast("Select a supplier"); return; }
    if (!h.date) { toast("Purchase Date is required"); return; }
    if (!(Number(h.lotWeight) > 0)) { toast("Enter the Total Gold Weight of the lot"); return; }
    if (!(Number(h.lotQty) > 0)) { toast("Enter the Total Quantity of the lot"); return; }
    const rows = bulkRows
      .map((r, i) => ({ ...r, code: bulkCodes[i]?.code || "" }))
      .filter(r => r.ident.trim() || r.name.trim() || r.gross || r.stoneWt || r.net || r.category);
    if (!rows.length) { toast("Add at least one row"); return; }
    for (const r of rows) {
      // Every row carries an Item Code, except a jewellery piece with a HUID.
      if (bulkType === "JEWELLERY" && !r.ident.trim() && (!r.category || !r.subCategory)) { toast("Pick the category and sub-category on every row - the Item Code is made from them"); return; }
      if (!(bulkType === "JEWELLERY" && r.ident.trim()) && !r.code) { toast("Item Codes are still being generated - try again in a moment"); return; }
      if (r.name.trim().length < 2) { toast("Product Name required (min 2 chars)"); return; }
      if (bulkType === "JEWELLERY" && tunchFromNumber(r.tunchNo, r.purity).error) { toast(`Tunch Number on "${r.name.trim()}": ${tunchFromNumber(r.tunchNo, r.purity).error}`); return; }
      if (bulkType === "RAW_GOLD") {
        if (!(rowWeights(r).net > 0)) { toast("Net Weight is required on every row"); return; }
        if (!(Number(r.rate) > 0)) { toast("24K Cost/g is required on every row"); return; }
        continue;
      }
      if (!(Number(r.gross) > 0)) { toast("Gross Weight is required on every row"); return; }
      // Read from the stone side, the direction the grid is now typed in. The
      // live preview clamps a too-heavy stone so the figures stay sane while
      // typing; submitting one is still an error rather than a silent clamp.
      if ((Number(r.stoneWt) || 0) > Number(r.gross)) { toast("Stone weight cannot exceed gross on any row"); return; }
      if (!(rowWeights(r).net > 0)) { toast("Net gold weight must be greater than zero on every row"); return; }
      if (!(Number(r.rate) > 0)) { toast("24K Cost/g is required on every row"); return; }
      if (rowAmounts(r).below) { toast(`Total Cost for "${r.name.trim()}" cannot be less than its gold value + other (${money(rowAmounts(r).auto)})`); return; }
    }
    if (h.paymentMode === "PARTIAL" && !(Number(h.paidNow) > 0)) { toast("Enter the amount paid now"); return; }
    // The lot check: the rows should add up to what the supplier handed over.
    const lotW = Number(h.lotWeight), lotQ = Number(h.lotQty);
    if (force !== true && (Math.abs(lotW - bulkLotUsed.weight) >= 0.0005 || lotQ !== bulkLotUsed.qty)) {
      setLotConfirm({ weight: bulkLotUsed.weight, lotW, qty: bulkLotUsed.qty, lotQ });
      return;
    }
    setLotConfirm(null);

    setBulkSaving(true);
    try {
      const payload = {
        vendorId: matchedVendor.id,
        purchaseDate: dateOnly(h.date),
        purchaseAt: h.date || undefined,
        invoiceRef: h.invoice || undefined,
        referenceType: "INVOICE",
        deliveredBy: h.deliveredBy.trim() || undefined,
        // No header Tunch any more — every row sends its own and the server
        // sums them, so a mixed-Tunch receipt is priced correctly.
        paymentMode: h.paymentMode,
        paidNow: h.paidNow,
        gstApplied: true,
        gstPercent: BULK_GST_PERCENT,
        paymentMethod: h.paymentMode === "CREDIT" ? "CASH" : h.paymentMethod,
        paymentDate: dateOnly(h.date),
        // Only the fields this kind of stock actually has. Raw gold has no
        // HUID, no category and no stone: sending them anyway is how jewellery
        // fields end up recorded against a bar of bullion.
        items: rows.map(r => (bulkType === "RAW_GOLD"
          ? {
            // The bar's Item Code is its identifier; billing looks it up by it.
            serial: r.code,
            name: r.name.trim(),
            // Typed in the grid, and accepted by the raw-gold endpoint - they
            // used to be dropped here, so a bar's category never saved.
            category: (r.category || "").trim() || undefined,
            subCategory: (r.subCategory || "").trim() || undefined,
            purity: "24K",
            gross: rowWeights(r).gross,
            net: rowWeights(r).net,
            rate: r.rate,
          }
          : {
            huid: r.ident.trim() || undefined,
            itemCode: r.ident.trim() ? undefined : r.code,
            name: r.name.trim(),
            category: r.category || undefined,
            subCategory: r.subCategory || undefined,
            purity: r.purity,
            gross: r.gross,
            net: rowWeights(r).net,
            stoneWt: rowWeights(r).stone,
            rate: r.rate,
            // Always sent, 0 when no Tunch Number: omitted, the server would
            // fall back to the supplier's default.
            tunch: String(tunchFromNumber(r.tunchNo, r.purity).pct),
            stone: Number(rowAmounts(r).extra.toFixed(2)),
            other: r.other,
          })),
      };
      const res = bulkType === "RAW_GOLD"
        ? await billingService.bulkPurchaseRawGold(payload)
        : await billingService.bulkPurchase(payload);
      const final = res?.purchase?.purchaseAmount;
      setShowBulk(false);
      // Both grids, not just the one submitted - a stale draft of the other
      // kind reappearing after a completed receipt is the same confusion.
      setBulkRowsByType({ JEWELLERY: [newBulkRow("JEWELLERY")], RAW_GOLD: [newBulkRow("RAW_GOLD")] });
      clearDraft("bulk"); setBulkDraftAt(null);
      setNextCodes({});
      setBulkHeaders({ JEWELLERY: emptyBulkHeader(nowLocalInput()), RAW_GOLD: emptyBulkHeader(nowLocalInput()) });
      await load();
      // Grouped like every other money figure — this was the one place a raw
      // number still reached the screen.
      toast(final != null ? `Bulk purchase recorded — ${money(final)} payable` : "Bulk purchase recorded");
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

  // The add-vendor link (Add + Bulk) opens the ONE supplier form (the same one Purchase
  // History uses), so a store added mid-purchase gets its code name and owner
  // too, and the new store is selected on the open purchase.
  const onVendorCreated = (v) => {
    setShowAddVendor(false);
    if (!v) return;
    setVendorList(prev => [...prev, v]);
    setAddForm(f => ({ ...f, vendor: v.name }));
    setBulkHeader(h => ({ ...h, vendor: v.name, deliveredBy: h.deliveredBy || v.contactPerson || "" }));
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1400px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Inventory</h2>
          <p className="mt-1 text-sm text-muted">Receive finished jewellery / artefacts into stock — every piece carries an <span className="font-mono text-xs">Item Code</span> (Offline) or a <span className="font-mono text-xs">HUID</span> (Online).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The store's pricing defaults are its costs and its margin - what
              the shop pays and what it intends to earn. The server has always
              refused Staff here (403 on read and on write); the button was
              offered to them anyway, so clicking it produced a red error for
              something they were never meant to see. */}
          {seesStoreDefaults && (
            <Button variant="outline" size="sm" onClick={openDefaults}>Store Pricing Defaults</Button>
          )}
          {/* Both forms open stamped with NOW, date and time. Still editable:
              back-dating a slip that arrived yesterday is ordinary retail
              practice, so the field is defaulted, never locked. An already
              half-filled form keeps whatever the operator typed. */}
          <Button variant="outline" size="sm" onClick={() => { setBulkHeaders(p => Object.fromEntries(Object.entries(p).map(([k, h]) => [k, { ...h, date: h.dateEdited && h.date ? h.date : nowLocalInput() }]))); setNextCodes({}); setShowBulk(true); }}>Bulk Purchase</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => { setAddForm(f => ({ ...f, purchaseDate: f.purchaseDateEdited && f.purchaseDate ? f.purchaseDate : nowLocalInput() })); setNextCodes({}); setShowAdd(true); }}>Add Purchase</Button>
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
          <SearchInput placeholder="Search item code, HUID or product" value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 min-w-[200px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold">Filters</span>
          <Select value={status} onValueChange={setStatus} options={STATUS_OPTS} className="w-[140px]" />
          <Select value={vendor} onValueChange={setVendor} options={["All Suppliers", ...vendorNames]} className="w-[160px]" />
          <Select value={category} onValueChange={setCategory} options={["All Categories", ...catOptions]} className="w-[140px]" />
          <Select value={subCategory} onValueChange={setSubCategory} options={["All Sub-categories", ...subOptions]} className="w-[170px]" />
          <Select value={purity} onValueChange={setPurity} options={["All Purity", ...PURITY_OPTIONS]} className="w-[140px]" />
          {/* Clear used to call setProductName, which does not exist on this
              component, so the click threw a ReferenceError and nothing reset.
              Every filter this screen owns is listed here, and the control is
              right-aligned with the destructive treatment used elsewhere. */}
          {(query || status !== "All statuses" || vendor !== "All Suppliers" || category !== "All Categories" || subCategory !== "All Sub-categories" || purity !== "All Purity") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("All statuses");
                setVendor("All Suppliers");
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

      {/* Raw gold / bullion. Received by the same Bulk Purchase dialog and
          then invisible until now: nothing in the API ever returned this
          table, and /billing/inventory only selects hallmarked pieces. Shown
          as its own list because a bar has a serial number where a piece has a
          HUID, and none of the making/wastage columns beside it apply. */}
      {filteredRawGold.length > 0 && (
        <Card data-motion="reveal" className="mb-4 overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-3">
            <h3 className="text-sm font-extrabold">Raw gold &amp; bullion</h3>
            <span className="text-[11px] text-muted">
              {filteredRawGold.length} bar{filteredRawGold.length === 1 ? "" : "s"} ·{" "}
              <span className="num font-semibold">
                {filteredRawGold.reduce((s, r) => s + (Number(r.netGoldWeightGrams) || 0), 0).toFixed(3)} g
              </span>{" "}
              net · 24K · tracked by item code
            </span>
          </div>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/40 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5">Item Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Purity</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5 text-right">Cost</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRawGold.map((r) => (
                  <tr key={r.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">{r.serialNumber}</td>
                    <td className="px-4 py-2.5 font-semibold">{r.productName}</td>
                    <td className="px-4 py-2.5"><Badge tone="neutral">{r.purity}</Badge></td>
                    <td className="num px-4 py-2.5 text-right">{Number(r.grossWeightGrams).toFixed(3)} g</td>
                    <td className="num px-4 py-2.5 text-right font-semibold">{Number(r.netGoldWeightGrams).toFixed(3)} g</td>
                    <td className="px-4 py-2.5 text-muted">{r.vendorName || "—"}</td>
                    <td className="num px-4 py-2.5 text-right">{r.purchaseCost != null ? money(r.purchaseCost) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.stockStatus === "IN_STOCK" ? "success" : r.stockStatus === "SOLD" ? "warning" : "neutral"} dot>
                        {{ IN_STOCK: "In Stock", SOLD: "Sold" }[r.stockStatus] || String(r.stockStatus || "").replace(/_/g, " ").toLowerCase().replace(/^./, (ch) => ch.toUpperCase())}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3"><h3 className="text-sm font-extrabold">Product list</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {/* Fixed column widths: the Name cell truncates instead of pushing
              into Category, and the full value stays available on hover. */}
          <table className="w-full min-w-[1210px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[130px]" /><col className="w-[220px]" /><col className="w-[130px]" />
              <col className="w-[140px]" /><col className="w-[90px]" /><col className="w-[110px]" />
              <col className="w-[150px]" /><col className="w-[90px]" /><col className="w-[110px]" />
              <col className="w-[110px]" /><col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left align-middle text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Item Code / HUID</th><th className="px-3 py-3">Name</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Sub-category</th><th className="px-3 py-3">Purity</th><th className="px-3 py-3 text-right">Net Weight</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3 text-right">Tunch</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Catalogue</th><th className="py-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id || p.code} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold">{p.huid || p.code || "Not provided"}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted" title={p.tag ? `Tag ${p.tag}` : undefined}>
                      {p.huid ? "HUID · Online" : "Item Code · Offline"}
                    </div>
                  </td>
                  <td className="px-3 py-3.5"><span className="block truncate font-semibold leading-snug" title={p.name}>{p.name}</span></td>
                  <td className="px-3 py-3.5"><span className="block truncate" title={p.category || ""}>{p.category || "—"}</span></td>
                  <td className="px-3 py-3.5"><span className="block truncate text-muted" title={p.sub || ""}>{p.sub || "—"}</span></td>
                  <td className="px-3 py-3.5"><Badge tone="neutral">{p.purity}</Badge></td>
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">{p.net} g</td>
                  <td className="px-3 py-3.5"><span className="block truncate text-xs" title={p.vendor}>{p.vendor || "—"}</span></td>
                  {/* The tunch this piece was bought at - the vendor's own
                      charge, which sets this piece's billing floors. A dash
                      means the lot never recorded one, not 0%. */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">{p.tunch != null ? `${p.tunch}%` : "—"}</td>
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
                <tr><td colSpan={11} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={11} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load inventory</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={11} className="px-6 py-14 text-center"><div className="font-bold">No purchases found</div><p className="mt-1 text-sm text-muted">Add a purchase or adjust filters.</p></td></tr>
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
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><div className="flex items-center gap-3"><h3 className="text-base font-extrabold">Add Purchase</h3>{addDraftAt && <span className="text-[11px] text-muted">{draftStamp(addDraftAt)} · <button type="button" onClick={discardAddDraft} className="font-bold text-danger underline underline-offset-2">Discard</button></span>}</div><button onClick={()=>setShowAdd(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Same header as Bulk: every control 44px, labels on one line. */}
              <div className="rounded-xl border border-line bg-canvas/30 p-4">
                <h4 className="mb-3 text-xs font-extrabold uppercase tracking-widest">Supplier / Purchase</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <HeaderField label="Supplier *" action={!showAddVendor && (
                      <button type="button" onClick={()=>setShowAddVendor(true)} className="text-[11px] font-bold text-accent underline">+ Add new supplier</button>
                    )}>
                      <Select value={addForm.vendor} onValueChange={v=>setAddForm({...addForm, vendor:v, deliveredBy: addForm.deliveredBy || staffOf(v)})} options={vendorOptions} placeholder={vendorOptions.length ? "Select supplier…" : "No suppliers — add one"} />
                    </HeaderField>
                  </div>
                  <HeaderField label="Purchase Date & Time *">
                    <Input type="datetime-local" value={addForm.purchaseDate} onChange={e=>setAddForm({...addForm, purchaseDate:e.target.value, purchaseDateEdited:true})} className="h-11" title="Defaults to now; change it for a slip received earlier" />
                  </HeaderField>
                  <HeaderField label="Invoice Number">
                    <Input value={addForm.invoice} onChange={e=>setAddForm({...addForm, invoice:e.target.value})} placeholder="INV-..." className="h-11" />
                  </HeaderField>
                  <HeaderField label="Delivered By">
                    <Input placeholder="Supplier staff who brought it" value={addForm.deliveredBy} onChange={e=>setAddForm({...addForm, deliveredBy:e.target.value})} className="h-11" />
                  </HeaderField>
                  <HeaderField label="Entered By">
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3.5 text-sm font-semibold text-ink-soft" title="Recorded automatically against your sign-in">
                      <span className="truncate">{staffName || "Signed-in user"}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">You</span>
                    </div>
                  </HeaderField>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold">Photo *</div>
                <label className="mt-1.5 flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 text-xs text-muted hover:border-accent"><input type="file" accept="image/*" className="hidden" onChange={e=>{ const file=e.target.files?.[0]; if(file) setAddForm({...addForm, photoFile: file, photo: URL.createObjectURL(file)});}} />{addForm.photo ? <img src={addForm.photo} alt="photo" className="h-full w-full rounded-xl object-cover" /> : <span>Upload Photo</span>}</label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Item Code XOR HUID. Entering a HUID erases the Item Code:
                    the piece then bills Online at the locked rate. */}
                <div className="grid content-start gap-1.5">
                  <span className="text-xs font-bold">Item Code</span>
                  <div className={`flex h-10 items-center rounded-xl border px-3.5 ${addCode.code ? "border-accent-line bg-accent-soft/40 font-mono text-sm font-bold tracking-wide text-accent-strong" : "border-dashed border-line bg-canvas/40 text-xs font-semibold text-muted"}`}>
                    {addCode.code || addCode.note}
                  </div>
                  <span className="text-[11px] text-muted">Generated from category + sub-category. Bills <b>Offline</b> — rate/g editable.</span>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">HUID</span>
                  <Input placeholder="Hallmark Unique ID (optional)" value={addForm.huid} onChange={e=>setAddForm({...addForm, huid:e.target.value})} />
                  <span className="text-[11px] text-muted">If entered, replaces the Item Code. Bills <b>Online</b> — rate/g locked.</span>
                </label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><Input placeholder="e.g. Gold Bangle" value={addForm.name} onChange={e=>setAddForm({...addForm, name:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Category</span><Select value={addForm.category} onValueChange={v=>setAddForm({...addForm, category:v, subCategory:""})} options={catChoices} placeholder={catChoices.length ? "Select category" : "Add categories in Master Inventory"} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Sub-category</span><Select value={addForm.subCategory} onValueChange={v=>setAddForm({...addForm, subCategory:v})} options={subChoicesFor(addForm.category)} placeholder={addForm.category ? "Select sub-category" : "Pick a category first"} /></label>
                {/* Both cells in this row carry one helper line, so the two
                    controls sit on the same baseline and the row below starts
                    level - the grid used to pair Purity with an empty cell. */}
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purity</span><Select value={addForm.purity} onValueChange={v=>setAddForm({...addForm, purity:v})} options={PURITY_OPTIONS} />
                  <span className="text-[11px] text-muted">Converts the net weight into pure gold — {addForm.purity} = {((parseInt(addForm.purity,10)||0)*100/24).toFixed(2)}% of net.</span>
                </label>
                {/* The slip states GROSS and STONE WEIGHT. Net is what is left
                    and is derived, never typed, so two weights can never
                    disagree with a third field. */}
                <label className="grid gap-1.5"><span className="text-xs font-bold">Gross Weight (g) *</span><Input type="number" value={addForm.gross} onChange={e=>setAddForm({...addForm, gross:e.target.value})} />
                  <span className="text-[11px] text-muted">Whole piece, stones included.</span>
                </label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Stone Weight (g)</span><Input type="number" value={addForm.stoneWt} onChange={e=>setAddForm({...addForm, stoneWt:e.target.value})} placeholder="0" />
                  {addWeights.stone > addWeights.gross && addWeights.gross > 0
                    ? <span className="text-[11px] font-semibold text-danger">Stone weight cannot exceed gross.</span>
                    : <span className="text-[11px] text-muted">Deducted from gross to give the net gold. Weight only — its cost goes in Value Addition.</span>}
                </label>
              </div>

              {/* Net gold: computed, shown, and overridable — a locked field
                  makes the operator abandon the form when the scale disagrees,
                  but an override is never silent: both figures stay on screen. */}
              <div className="rounded-xl border border-accent-line bg-accent-soft/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-accent-strong">Net Gold Weight</div>
                    <div className="num mt-1 text-2xl font-extrabold">{addWeights.net.toFixed(3)} <span className="text-base font-bold">g</span></div>
                    <div className="text-[11px] text-muted">Gross {addWeights.gross.toFixed(3)} g − Stone {addWeights.stone.toFixed(3)} g</div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-accent)]"
                      checked={!!addForm.netOverridden}
                      onChange={e=>setAddForm({...addForm, netOverridden: e.target.checked, netOverride: e.target.checked ? String(addWeights.computedNet || "") : ""})}
                    />
                    <span title="Tick only if the scale shows a different net than Gross − Stone. Normally leave it unticked.">Scale net differs</span>
                  </label>
                </div>
                {addForm.netOverridden && (
                  <div className="mt-3 grid gap-1.5 sm:max-w-[240px]">
                    <Input type="number" value={addForm.netOverride} onChange={e=>setAddForm({...addForm, netOverride:e.target.value})} placeholder="Weighed net" />
                    {addWeights.differs
                      ? <span className="text-[11px] font-semibold text-warning">Differs from the computed {addWeights.computedNet.toFixed(3)} g by {Math.abs(addWeights.net - addWeights.computedNet).toFixed(3)} g. The entered figure is used.</span>
                      : <span className="text-[11px] text-muted">Same as the computed figure.</span>}
                  </div>
                )}
                {addAmounts.fineGrams > 0 && (
                  <div className="mt-3 border-t border-accent-line/60 pt-3 text-[11px] font-semibold text-accent-strong">
                    ≈ {addAmounts.fineGrams.toFixed(3)} g pure gold (24K equivalent = Net × {addForm.purity}/24) · + Tunch {addAmounts.tunchGrams.toFixed(3)} g = <strong>{addAmounts.payableGrams.toFixed(3)} g payable</strong>
                  </div>
                )}
              </div>

              {/* Value Addition (V/A) — every non-gold RUPEE cost on the slip.
                  The rule that must not be broken: nothing in this card is
                  metal. It enters no gram total, is never purity-converted, and
                  Tunch is never charged on it. */}
              <div className="rounded-xl border border-line bg-canvas/40 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-widest">Value Addition (V/A)</h4>
                  <span className="num text-sm font-extrabold">{money(addAmounts.valueAddition)}</span>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-1.5">
                    <span className="text-xs font-bold">Over gold value</span>
                    <div className="num flex h-10 items-center rounded-xl border border-line bg-canvas/60 px-3.5 font-mono text-sm tabular-nums">{money(addAmounts.stone)}</div>
                    <span className="text-[11px] text-muted">Whatever the Final Purchase Amount below is above the gold value — stones, work.</span>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold">Other Charges (₹)</span>
                    <MoneyInput value={addForm.other} onValueChange={v=>setAddForm({...addForm, other:v})} maxDigits={8} placeholder="0" />
                    <span className="text-[11px] text-muted">Polish, certification, packing — anything non-gold.</span>
                  </label>
                </div>
                <p className="mt-3 text-[11px] text-muted">Money, not metal: no purity conversion and no Tunch on anything in this card.</p>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4">
                <div className="grid items-start gap-4 sm:grid-cols-3">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Rate (₹/g) — 24K *</span><Input type="number" value={addForm.rate} onChange={e=>setAddForm({...addForm, rate:e.target.value})} /><span className="text-[11px] text-muted">{rate24kPerGram(todayRate) != null ? (rateIsCarriedForward ? `Always the 24K (pure gold) rate — auto-filled from the rate published on ${rateEffectiveLabel}, as today's is not published yet. Check it before saving.` : "Always the 24K (pure gold) rate — auto-filled from today's 24K rate, editable. Purity only converts the net weight.") : "No live 24K rate set today — enter the 24K rate manually."}</span></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Tunch No.</span>
                    <Input inputMode="decimal" value={addForm.tunchNo ?? ""} onChange={e=>setAddForm({...addForm, tunchNo: e.target.value.replace(/[^\d.]/g, "").slice(0, 6)})} placeholder={String(PURITY_FINENESS[addForm.purity] ?? "")} />
                    <span className="text-[11px] text-muted">Purity raised by the Tunch — e.g. 22K 916 + 4% = 952.6. Blank = no Tunch.</span>
                  </label>
                  {(() => {
                    const t = tunchFromNumber(addForm.tunchNo, addForm.purity);
                    return (
                      <div className="grid content-start gap-1.5">
                        <span className="text-xs font-bold">Tunch %</span>
                        <div className={`num flex h-10 items-center justify-end rounded-xl border px-3.5 font-mono text-sm tabular-nums ${t.error ? "border-danger bg-danger-soft/40 text-danger" : "border-line bg-canvas/60"}`}>{t.pct.toFixed(2)}%</div>
                        <span className={`text-[11px] ${t.error ? "font-semibold text-danger" : "text-muted"}`}>{t.error || "Of the 24K-equivalent gold value. Never added to the rate/g."}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-xl border border-accent-soft bg-accent-soft/40 p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-accent-strong">Purchase Amount</h4>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted">Gold at {addForm.purity} — {addAmounts.fineGrams.toFixed(3)} g pure @ 24K</span><span className="num font-mono tabular-nums">₹{addAmounts.base.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted">Tunch {addAmounts.tunchPct}% of the 24K value — {addAmounts.tunchGrams.toFixed(3)} g pure</span><span className="num font-mono tabular-nums">₹{addAmounts.tunchAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
                  <div className="flex items-center justify-between border-t border-line-soft pt-1.5"><span className="text-muted">Payable gold — {addAmounts.payableGrams.toFixed(3)} g pure × ₹{addAmounts.rate24.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/g (24K)</span>{/* The share of the net weight actually being paid for, derived from
                        the payable grams themselves. It used to add the purity and
                        Tunch percentages together (91.67 + 4 = 95.67%), which is the
                        OTHER Tunch convention - Tunch on the full net weight - and so
                        contradicted the 42.900 g on the same line. */}
                    <span className="num font-mono tabular-nums text-muted">{addWeights.net > 0 ? `${(addAmounts.payableGrams / addWeights.net * 100).toFixed(2)}% of net` : "—"}</span></div>
                  {addAmounts.valueAddition > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Value addition (V/A){stoneWeight > 0 ? ` — ${stoneWeight.toFixed(3)} g of stone` : ""} · no Tunch</span>
                      <span className="num font-mono tabular-nums">{money(addAmounts.valueAddition)}</span>
                    </div>
                  )}
                  <label className="mt-1 grid gap-1.5 border-t border-line pt-2">
                    <span className="font-bold">Final Purchase Amount (₹)</span>
                    <MoneyInput allowDecimal value={addForm.amount ?? (addAmounts.auto > 0 ? addAmounts.auto.toFixed(2) : "")} onValueChange={v=>setAddForm({...addForm, amount:v})} maxDigits={10} placeholder="0" />
                    <span className={`text-[11px] ${addAmounts.below ? "font-semibold text-danger" : "text-muted"}`}>
                      {addAmounts.below ? `Cannot be less than the gold value + other charges (${money(addAmounts.auto)}).` : addForm.amount == null ? "Calculated from gold + Tunch + other. Edit it to the product's whole price — anything above the gold value shows as Value Addition." : `Edited. Calculated price is ${money(addAmounts.auto)}.`}
                      {addForm.amount != null && <button type="button" onClick={()=>setAddForm({...addForm, amount:null})} className="ml-1.5 font-bold text-accent underline">Use calculated</button>}
                    </span>
                  </label>
                </div>
                <div className="mt-3 grid gap-1 border-t border-accent-line pt-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted">+ GST {BULK_GST_PERCENT}% on {money(addAmounts.final)}</span><span className="num font-mono tabular-nums">{money(addAmounts.gst)}</span></div>
                  <div className="flex items-center justify-between"><span className="font-extrabold">Payable to supplier</span><span className="num font-mono text-base font-extrabold tabular-nums">{money(addAmounts.final + addAmounts.gst)}</span></div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Gold = (24K equivalent × 24K rate) + Tunch % — Tunch is never added to the per-gram rate, and never to the value addition. Backend re-derives this authoritatively.</p>
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
          <div className="relative w-full max-w-[1440px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-3"><h3 className="text-base font-extrabold">Bulk Purchase Receiving</h3>{bulkDraftAt && <span className="text-[11px] text-muted">{draftStamp(bulkDraftAt)} · <button type="button" onClick={discardBulkDraft} className="font-bold text-danger underline underline-offset-2">Discard</button></span>}</div>
              <button onClick={()=>setShowBulk(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Type toggle */}
              <div className="inline-flex rounded-xl border border-line p-1">
                {[["JEWELLERY","Jewellery / Artefacts"],["RAW_GOLD","Raw Gold / Bullion"]].map(([val,label])=>(
                  <button key={val} onClick={()=>setBulkType(val)} className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${bulkType===val ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>{label}</button>
                ))}
              </div>

              {/* Header - three even columns, every control 44px tall. */}
              <div className="grid gap-4 rounded-xl border border-line bg-canvas/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <HeaderField label="Supplier *" action={!showAddVendor && (
                  <button type="button" onClick={()=>setShowAddVendor(true)} className="text-[11px] font-bold text-accent underline">+ Add new supplier</button>
                )}>
                  <Select value={bulkHeader.vendor} onValueChange={v=>setBulkHeader({...bulkHeader, vendor:v, deliveredBy: bulkHeader.deliveredBy || staffOf(v)})} options={vendorOptions} placeholder={vendorOptions.length ? "Select supplier…" : "No suppliers — add one"} />
                </HeaderField>
                <HeaderField label="Purchase Date & Time *">
                  <Input type="datetime-local" value={bulkHeader.date} onChange={e=>setBulkHeader({...bulkHeader, date:e.target.value, dateEdited:true})} className="h-11" title="Defaults to now; editable for a back-dated slip" />
                </HeaderField>
                <HeaderField label="Invoice Number">
                  <Input value={bulkHeader.invoice} onChange={e=>setBulkHeader({...bulkHeader, invoice:e.target.value})} placeholder="INV-..." className="h-11" />
                </HeaderField>
                <HeaderField label="Delivered By">
                  <Input placeholder="Supplier staff who brought it" value={bulkHeader.deliveredBy} onChange={e=>setBulkHeader({...bulkHeader, deliveredBy:e.target.value})} className="h-11" />
                </HeaderField>
                <HeaderField label="Entered By">
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3.5 text-sm font-semibold text-ink-soft" title="Recorded automatically against your sign-in">
                    <span className="truncate">{staffName || "Signed-in user"}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">You</span>
                  </div>
                </HeaderField>
                <div className="hidden lg:block" aria-hidden="true" />
                <HeaderField label="Payment Type">
                  <Select value={bulkHeader.paymentMode} onValueChange={v=>setBulkHeader({...bulkHeader, paymentMode:v})} options={PAYMENT_MODES} />
                </HeaderField>
                {bulkHeader.paymentMode !== "CREDIT" && (
                  <HeaderField label="Mode of Payment">
                    <Select value={bulkHeader.paymentMethod} onValueChange={v=>setBulkHeader({...bulkHeader, paymentMethod:v})} options={PAY_METHOD_OPTS} />
                  </HeaderField>
                )}
                {bulkHeader.paymentMode === "PARTIAL" && (
                  <HeaderField label="Paid Now *">
                    <MoneyInput value={bulkHeader.paidNow} onValueChange={v=>setBulkHeader({...bulkHeader, paidNow:v})} className="h-11" />
                  </HeaderField>
                )}
              </div>

              {/* The lot: the admin types what the supplier handed over; each
                  row entered counts down. Zero left on both = the slip is
                  complete. Jewellery also shows stone weight and V/A. */}
              <div className={`grid gap-3 sm:grid-cols-2 ${bulkType === "JEWELLERY" ? "lg:grid-cols-4" : ""}`}>
                <LotCard label="Total Gold Weight" unit="g" decimals value={bulkHeader.lotWeight} onChange={v=>setBulkHeader(h=>({...h, lotWeight:v}))} used={bulkLotUsed.weight}
                  hint={bulkType === "JEWELLERY" ? "Each row deducts its gross weight, as weighed" : "Each bar deducts its net weight"} />
                <LotCard label="Total Quantity" unit="pcs" value={bulkHeader.lotQty} onChange={v=>setBulkHeader(h=>({...h, lotQty:v}))} used={bulkLotUsed.qty}
                  hint={bulkType === "JEWELLERY" ? "Each row is one piece" : "Each row is one bar"} />
                {bulkType === "JEWELLERY" && <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Stone Weight</div>
                  <div className="num mt-2 text-2xl font-extrabold">{bulkBreakdown.stoneGTotal.toFixed(3)} <span className="text-base font-bold">g</span></div>
                  <div className="mt-1 text-xs text-muted">Deducted from gross · not gold</div>
                  <div className="mt-1 text-xs text-muted">Net gold {bulkBreakdown.netTotal.toFixed(3)} g</div>
                </div>}
                {/* Money, not metal - it is in none of the gram figures. */}
                {bulkType === "JEWELLERY" && (
                  <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Value Addition (V/A)</div>
                    <div className="num mt-2 text-2xl font-extrabold">{money(bulkBreakdown.valueAdditionTotal)}</div>
                    <div className="mt-1 text-xs text-muted">Over gold {money(bulkBreakdown.stoneTotal)} · Other {money(bulkBreakdown.otherChargesTotal)}</div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-line">
                <table className={`table-fixed ${bulkType === "JEWELLERY" ? "w-[1990px]" : "w-[1330px]"} border-collapse text-sm`}>
                  <thead><tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    {/* Jewellery: Item Code (blank = auto, Offline) XOR HUID
                        (Online, replaces the Item Code). Raw gold: serial. */}
                    <th className="px-3 py-2 w-[150px]">Item Code</th>
                    {bulkType === "JEWELLERY" && <th className="px-3 py-2 w-[150px]">HUID</th>}
                    <th className="px-2 py-2 w-[180px]">Product Name *</th>
                    <th className="px-2 py-2 w-[170px]">Category</th>
                    <th className="px-2 py-2 w-[190px]">Sub-category</th>
                    <th className="px-2 py-2 w-[130px]">Purity</th>
                    {bulkType === "JEWELLERY" && <th className="py-2 w-[100px]">Gross (g) *</th>}
                    {bulkType === "JEWELLERY" && <th className="py-2 w-[100px]">Stone (g)</th>}
                    {/* Jewellery: derived, not typed - see rowWeights. Raw gold:
                        typed, it is the only weight a bar has. */}
                    <th className="py-2 w-[110px]">{bulkType === "JEWELLERY" ? "Net (g)" : "Net Weight (g) *"}</th>
                    <th className="py-2 w-[120px]">24K Cost/g (₹) *</th>
                    {/* Bullion has no tunch. It is bought at rate x weight:
                        there is no craftsman's charge on a bar. */}
                    {bulkType === "JEWELLERY" && <th className="py-2 w-[110px]" title="Purity raised by the Tunch %: 22K 916 + 4% = 952.6">Tunch No.</th>}
                    {bulkType === "JEWELLERY" && <th className="py-2 w-[100px]">Tunch %</th>}
                    {/* Jewellery only: bullion is gold and nothing else. */}
                    {/* The V/A card, per row: the non-gold rupees that are not
                        stones. Money, never metal. */}
                    {bulkType === "JEWELLERY" && <th className="py-2 w-[120px]">Other (₹)</th>}
                    <th className="py-2 w-[150px] text-right">{bulkType === "JEWELLERY" ? "Total Cost (₹)" : "Total Cost"}</th>
                    <th className="py-2 w-[44px]"></th>
                  </tr></thead>
                  <tbody>
                    {bulkRows.map((r,i)=>{
                      const setCell = (k,v)=>{const c=bulkRows.map((row,ix)=>ix===i?{...row,[k]:v}:row);setBulkRows(c);};
                      const lineTotal = bulkRowBase(r);
                      const ra = rowAmounts(r);
                      return (
                        <tr key={i} className="border-t border-line-soft align-top">
                          <td className="px-2 py-2">
                            {/* Generated, never typed: category + sub-category initials + 4 digits. */}
                            <div title={bulkCodes[i]?.code ? "Generated from the category and sub-category" : undefined}
                              className={`flex h-9 items-center rounded-xl border px-3 ${bulkCodes[i]?.code ? "border-accent-line bg-accent-soft/40 font-mono text-sm font-bold tracking-wide text-accent-strong" : "border-dashed border-line bg-canvas/40 text-[11px] font-semibold text-muted"}`}>
                              {bulkCodes[i]?.code || bulkCodes[i]?.note}
                            </div>
                          </td>
                          {bulkType === "JEWELLERY" && (
                            <td className="px-2 py-2"><Input value={r.ident} onChange={e=>setCell("ident",e.target.value)} placeholder="Optional" className="h-9 text-sm" /></td>
                          )}
                          <td className="px-2 py-2"><Input value={r.name} onChange={e=>setCell("name",e.target.value)} placeholder="Name" className="h-9 text-sm" /></td>
                          <td className="px-2 py-2">{bulkType==="JEWELLERY"
                            ? <Select value={r.category||""} onValueChange={v=>setCell("category",v)} options={catChoices} placeholder="Category" />
                            : <Input value={r.category} onChange={e=>setCell("category",e.target.value)} placeholder="e.g. Bar" className="h-9 text-sm" />}</td>
                          <td className="px-2 py-2">{bulkType==="JEWELLERY"
                            ? <Select value={r.subCategory||""} onValueChange={v=>setCell("subCategory",v)} options={subChoicesFor(r.category)} placeholder="Sub-category" />
                            : <Input value={r.subCategory} onChange={e=>setCell("subCategory",e.target.value)} placeholder="Optional" className="h-9 text-sm" />}</td>
                          <td className="px-2 py-2">{bulkType === "RAW_GOLD"
                            // Raw gold is 24K only - shown, not chosen.
                            ? <div className="num flex h-9 items-center rounded-xl border border-accent-line bg-accent-soft/40 px-3 text-sm font-bold text-accent-strong">{purityLabel("24K")}</div>
                            : <Select value={r.purity} onValueChange={v=>setCell("purity",v)} options={PURITY_OPTIONS} />}</td>
                          {bulkType === "JEWELLERY" && (
                            <td className="px-2 py-2"><Input type="number" value={r.gross} onChange={e=>setCell("gross",e.target.value)} className="h-9" /></td>
                          )}
                          {bulkType === "JEWELLERY" && (
                            <td className="px-2 py-2"><Input type="number" value={r.stoneWt} onChange={e=>setCell("stoneWt",e.target.value)} placeholder="0" className="h-9" />
                              {(Number(r.stoneWt) || 0) > (Number(r.gross) || 0) && (Number(r.gross) || 0) > 0 && (
                                <span className="mt-1 block text-[10px] font-semibold text-danger">Exceeds gross</span>
                              )}
                            </td>
                          )}
                          {/* Net is stated, not asked for: gross minus stone.
                              Read-only here on purpose - the bulk grid has no
                              room for an override control, and a row whose
                              scale disagrees belongs in Add Purchase, which
                              has one. */}
                          <td className="px-2 py-2">
                            {bulkType === "JEWELLERY" ? (
                              <div className="num flex h-9 items-center justify-end rounded-xl border border-line bg-canvas/60 px-3 font-mono text-sm tabular-nums">
                                {rowWeights(r).net.toFixed(3)}
                              </div>
                            ) : (
                              <Input type="number" value={r.net} onChange={e=>setCell("net",e.target.value)} placeholder="0.000" className="h-9" />
                            )}
                          </td>
                          <td className="px-2 py-2"><Input type="number" value={r.rate} onChange={e=>setCell("rate",e.target.value)} className="h-9" /></td>
                          {/* One digit only: Tunch is quoted in whole single digits. */}
                          {/* maxDigits was 1, so a 12% lot could not be typed at
                              all - the second digit was swallowed. */}
                          {bulkType === "JEWELLERY" && (
                            <td className="px-2 py-2"><Input inputMode="decimal" value={r.tunchNo ?? ""} onChange={e=>setCell("tunchNo", e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} placeholder={String(PURITY_FINENESS[r.purity] ?? "")} className="h-9" /></td>
                          )}
                          {bulkType === "JEWELLERY" && (() => {
                            const t = tunchFromNumber(r.tunchNo, r.purity);
                            return (
                              <td className="px-2 py-2">
                                <div className={`num flex h-9 items-center justify-end rounded-xl border px-3 font-mono text-sm tabular-nums ${t.error ? "border-danger bg-danger-soft/40 text-danger" : "border-line bg-canvas/60"}`}>{t.pct.toFixed(2)}%</div>
                                {t.error && <span className="mt-1 block text-[10px] font-semibold text-danger">{t.error}</span>}
                              </td>
                            );
                          })()}
                          {bulkType === "JEWELLERY" && (
                            <td className="px-2 py-2">
                              <MoneyInput value={r.other} onValueChange={v=>setCell("other",v)} maxDigits={8} placeholder="0" className="h-9" />
                            </td>
                          )}
                          {bulkType === "JEWELLERY" ? (
                            <td className="px-2 py-2">
                              {/* The whole price of this piece. Blank = the auto
                                  figure (placeholder); anything typed above it is
                                  the row's value addition. */}
                              <MoneyInput allowDecimal value={r.amount ?? (ra.auto > 0 ? ra.auto.toFixed(2) : "")} onValueChange={v=>setCell("amount",v)} maxDigits={10} placeholder="0" className={`h-9 ${ra.below ? "border-danger" : ""}`} />
                              {ra.below && <span className="mt-1 block text-[10px] font-semibold text-danger">Below gold value</span>}
                              {ra.extra > 0 && <span className="mt-1 block text-[10px] font-semibold text-muted">V/A {money(ra.extra)}</span>}
                              {r.amount != null && <button type="button" onClick={()=>setCell("amount",null)} className="mt-0.5 block text-[10px] font-bold text-accent underline">Use calculated</button>}
                            </td>
                          ) : (
                            <td className="px-2 py-2 text-right font-mono tabular-nums">{lineTotal ? money(ra.auto) : "—"}</td>
                          )}
                          <td className="px-2 py-2"><Button size="sm" variant="outline" onClick={()=>setBulkRows(bulkRows.length>1 ? bulkRows.filter((_,ix)=>ix!==i) : [newBulkRow()])}>×</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <Button variant="outline" size="sm" onClick={()=>setBulkRows([...bulkRows, newBulkRow()])}>Add Row</Button>
              </div>

              {/* Settlement breakdown — the same four steps as the vendor's slip:
                  weight by purity, its 24K equivalent, Tunch, then money. */}
              {bulkBreakdown.groups.length > 0 && (
                <div className="rounded-xl border border-accent-line bg-accent-soft/25 p-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-accent-strong">Settlement breakdown</div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-accent-line text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                          <th className="py-2 pr-3">Purity</th>
                          <th className="py-2 pr-3 text-right">Net weight</th>
                          <th className="py-2 pr-3 text-right">24K equivalent</th>
                          {bulkType === "JEWELLERY" && <th className="py-2 pr-3 text-right">Tunch</th>}
                          {bulkType === "JEWELLERY" && <th className="py-2 pr-3 text-right">Payable gold</th>}
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkBreakdown.groups.map((g) => {
                          const pcts = [...g.pcts].sort((a, b) => a - b);
                          return (
                            <tr key={g.purity} className="border-b border-accent-line/40 last:border-0">
                              <td className="py-2 pr-3">
                                <span className="font-bold">{purityLabel(g.purity)}</span>
                                <span className="ml-1.5 text-[11px] text-muted">{g.rows} {g.rows === 1 ? "item" : "items"}</span>
                              </td>
                              <td className="num py-2 pr-3 text-right font-mono tabular-nums">{g.net.toFixed(3)} g</td>
                              <td className="num py-2 pr-3 text-right font-mono tabular-nums">{g.fine.toFixed(3)} g</td>
                              {bulkType === "JEWELLERY" && <td className="num py-2 pr-3 text-right font-mono tabular-nums">
                                {g.tunchG.toFixed(3)} g
                                <span className="ml-1 text-[11px] font-sans text-muted">
                                  {pcts.length === 1 ? `@ ${pcts[0]}%` : `@ mixed ${pcts.join("/")}%`}
                                </span>
                              </td>}
                              {bulkType === "JEWELLERY" && <td className="num py-2 pr-3 text-right font-mono font-bold tabular-nums">{(g.fine + g.tunchG).toFixed(3)} g</td>}
                              <td className="num py-2 text-right font-mono font-bold tabular-nums">{money(Math.round(g.base * 100) / 100 + Math.round(g.tunchAmt * 100) / 100 + g.stone)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-accent-line text-[13px]">
                          <td className="py-2.5 pr-3 font-extrabold">Total</td>
                          <td className="num py-2.5 pr-3 text-right font-mono font-bold tabular-nums">{bulkBreakdown.netTotal.toFixed(3)} g</td>
                          <td className="num py-2.5 pr-3 text-right font-mono font-bold tabular-nums">{bulkBreakdown.fineTotal.toFixed(3)} g</td>
                          {bulkType === "JEWELLERY" && <td className="num py-2.5 pr-3 text-right font-mono font-bold tabular-nums">{bulkBreakdown.tunchGTotal.toFixed(3)} g</td>}
                          {bulkType === "JEWELLERY" && <td className="num py-2.5 pr-3 text-right font-mono font-extrabold tabular-nums text-accent-strong">{bulkBreakdown.payableGrams.toFixed(3)} g</td>}
                          <td className="num py-2.5 text-right font-mono font-extrabold tabular-nums">{money(bulkBreakdown.finalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* The money, stated as the arithmetic it is. */}
                  <div className="mt-3 grid gap-1 border-t border-accent-line pt-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">
                        {bulkBreakdown.fineTotal.toFixed(3)} g pure gold ×{" "}
                        {bulkBreakdown.singleRate != null
                          ? `${money(bulkBreakdown.singleRate)}/g (24K)`
                          : `${money(bulkBreakdown.blendedRate)}/g (24K, blended — rows differ)`}
                      </span>
                      <span className="num font-mono font-bold tabular-nums">{money(bulkBreakdown.baseTotal)}</span>
                    </div>
                    {bulkType === "JEWELLERY" && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">+ Tunch {bulkBreakdown.tunchGTotal.toFixed(3)} g (each row at its own %)</span>
                        <span className="num font-mono font-bold tabular-nums">{money(bulkBreakdown.tunchAmtTotal)}</span>
                      </div>
                    )}
                    {/* Shown as soon as there IS stone in the receipt, even
                        before it is priced - a row carrying 5 g of stone at Rs 0
                        is a figure the buyer needs to see, not a hidden line. */}
                    {bulkType === "JEWELLERY" && (bulkBreakdown.valueAdditionTotal > 0 || bulkBreakdown.stoneGTotal > 0) && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">
                          + Value addition (V/A, no Tunch)
                          {bulkBreakdown.stoneGTotal > 0 && <span className="num"> — {bulkBreakdown.stoneGTotal.toFixed(3)} g of stone</span>}
                        </span>
                        <span className={`num font-mono font-bold tabular-nums ${bulkBreakdown.valueAdditionTotal > 0 ? "" : "text-muted"}`}>{money(bulkBreakdown.valueAdditionTotal)}</span>
                      </div>
                    )}
                    {(
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">+ GST {BULK_GST_PERCENT}% on {money(bulkBreakdown.finalAmount)}</span>
                        <span className="num font-mono font-bold tabular-nums">{money(bulkGst)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 border-t border-accent-line pt-1.5">
                      <span className="font-extrabold">Final payable — {bulkBreakdown.payableGrams.toFixed(3)} g of pure gold{bulkType === "JEWELLERY" && bulkBreakdown.valueAdditionTotal > 0 ? " + V/A" : ""} + GST</span>
                      <span className="num font-mono text-base font-extrabold tabular-nums">{money(bulkBreakdown.finalAmount + bulkGst)}</span>
                    </div>
                    {/* The settlement, on the same slip as the payable. One
                        aggregate vendor_purchases row covers the whole receipt,
                        so this is the row's own paid/outstanding - nothing is
                        apportioned across the items. The server re-derives both
                        from the payment ledger; these are the figures it will
                        arrive at, shown before the button is pressed. */}
                    {(() => {
                      const total = (bulkBreakdown.finalAmount || 0) + bulkGst;
                      const mode = bulkHeader.paymentMode;
                      const typed = Number(bulkHeader.paidNow);
                      const paid = mode === "CASH" ? total : mode === "CREDIT" ? 0 : (typed > 0 ? typed : 0);
                      const balance = Math.max(0, Number((total - paid).toFixed(2)));
                      // A part payment at or above the total is not a part
                      // payment; the server refuses it, so say so here.
                      const over = mode === "PARTIAL" && typed > 0 && typed >= total;
                      return (
                        <div className="mt-2 grid gap-1 border-t border-accent-line pt-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">
                              Paying now
                              <span className="ml-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-accent-strong">{mode}</span>
                              {mode !== "CREDIT" && <span className="ml-1.5 text-[11px] text-muted">by {bulkHeader.paymentMethod}</span>}
                            </span>
                            <span className="num font-mono font-bold tabular-nums">{money(paid)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className={balance > 0 ? "font-extrabold text-accent-strong" : "text-muted"}>
                              Balance owed to vendor
                            </span>
                            <span className={`num font-mono font-extrabold tabular-nums ${balance > 0 ? "text-accent-strong" : ""}`}>{money(balance)}</span>
                          </div>
                          <div className="text-[11px] text-muted">
                            {over
                              ? `A part payment must be less than ${money(total)} \u2014 use CASH to settle in full.`
                              : mode === "PARTIAL" && !(typed > 0)
                                ? "Enter the amount being paid now."
                                : balance > 0
                                  ? "Recorded as one outstanding payable for this receipt; settle it later from Purchase History."
                                  : "Settled in full \u2014 nothing left outstanding on this receipt."}
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-[11px] text-muted">
                      Tunch is a percentage of the 24K-equivalent gold value and is never added to the rate per gram.
                      The server re-derives every figure row by row when the purchase is recorded.
                    </p>
                  </div>
                </div>
              )}
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
              <p className="mb-4 text-xs text-muted">Pre-fill for new items only. Never changes saved inventory or a raised bill.</p>
              {defaultsLoading || !defaults ? (
                <div className="py-10 text-center text-sm font-bold text-muted">Loading…</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Type</span><Select value={defaults.makingType} onValueChange={v=>setDefaults({...defaults, makingType:v})} options={["PERCENTAGE","FIXED","PER_GRAM"]} /></label>
                  {/* A PERCENTAGE rule is two digits; a FIXED / PER_GRAM rule is
                      rupees and needs real room (a Rs 500 flat making charge is an
                      ordinary figure). The cap follows the unit, exactly as the
                      server validates it. */}
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Value {defaults.makingType === "PERCENTAGE" ? <span className="font-normal text-muted">— 0-99 %</span> : <span className="font-normal text-muted">— ₹</span>}</span><DigitsInput value={defaults.makingValue} onValueChange={v=>setDefaults({...defaults, makingValue:v})} maxDigits={defaults.makingType === "PERCENTAGE" ? 2 : 7} />{defaults.makingType === "PERCENTAGE" && <span className="text-[11px] text-muted">Half gold profit, half negotiable. Default 6%.</span>}</label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Type</span><Select value={defaults.wastageType} onValueChange={v=>setDefaults({...defaults, wastageType:v})} options={["PERCENTAGE","FIXED","PER_GRAM"]} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Value {defaults.wastageType === "PERCENTAGE" ? <span className="font-normal text-muted">— 0-99 %</span> : <span className="font-normal text-muted">— ₹</span>}</span><DigitsInput value={defaults.wastageValue} onValueChange={v=>setDefaults({...defaults, wastageValue:v})} maxDigits={defaults.wastageType === "PERCENTAGE" ? 2 : 7} /></label>
                  {/* Gold Profit is gone from the counter: the store's margin
                      is the making charge (14% list, 11% break-even), so a
                      second margin default here would quietly add itself to
                      every bill on top of the one the counter sets. The stored
                      value is preserved for invoices already raised against it
                      and sent back unchanged - it is simply no longer edited. */}
                  {/* Running cost — the shop's own, and the half of break-even
                      that was never visible. break-even = tunch + running cost,
                      and the tunch comes from the lot the piece was bought on,
                      so this is the only part of it the shop sets. */}
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Running Cost % <span className="font-normal text-muted">— 0-99</span></span><DigitsInput value={defaults.runningCost} onValueChange={v=>setDefaults({...defaults, runningCost:v})} maxDigits={2} /><span className="text-[11px] text-muted">Rent, wages, power. Default 4%.</span></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Tax / GST % <span className="font-normal text-muted">— 0-9</span></span><DigitsInput value={defaults.tax} onValueChange={v=>setDefaults({...defaults, tax:v})} maxDigits={1} /><span className="text-[11px] text-muted">Jewellery is 3%.</span></label>
                  {/* One mode exists, so this was a dropdown that could only ever
                      pick what it already showed. Read-only until a second mode is
                      a real product decision. */}
                  {/* The rule in one line. It was three paragraphs, which grew
                      the dialog until Save sat below the fold - a settings box
                      should be readable at a glance, not studied. */}
                  <p className="sm:col-span-2 rounded-xl border border-line bg-canvas/60 px-3.5 py-2.5 text-[11px] text-muted">
                    Billing charges <b className="text-ink">Making Value + Running Cost + the lot&rsquo;s tunch</b>. Only half the Making Value is discountable.
                  </p>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <span className="text-xs font-bold">Pricing Mode</span>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3.5">
                      <span className="text-sm font-bold text-ink">Auto</span>
                      <span className="text-[11px] text-muted">— priced from the live rate and these defaults.</span>
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
      {/* Lot mismatch - the rows entered do not add up to the lot yet. */}
      {lotConfirm && showBulk && (() => {
        const lines = [
          { label: "Gold weight", unit: "g", used: lotConfirm.weight, lot: lotConfirm.lotW, fmt: (x) => x.toFixed(3) },
          { label: "Pieces", unit: "pcs", used: lotConfirm.qty, lot: lotConfirm.lotQ, fmt: (x) => String(Math.round(x)) },
        ];
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="lot-confirm-title">
            <button className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setLotConfirm(null)} aria-label="Keep editing" />
            <div className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
              <div className="flex items-start gap-3 px-6 pt-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                </span>
                <div>
                  <h3 id="lot-confirm-title" className="text-base font-extrabold">The rows don&apos;t match the lot yet</h3>
                  <p className="mt-0.5 text-sm text-muted">What you entered is not the full lot the supplier handed over.</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5 px-6">
                {lines.map((l) => {
                  const diff = l.lot - l.used;
                  const done = Math.abs(diff) < (l.unit === "g" ? 0.0005 : 0.5);
                  const pct = l.lot > 0 ? Math.min(100, (l.used / l.lot) * 100) : 0;
                  return (
                    <div key={l.label} className={`rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50/60" : diff < 0 ? "border-danger-line bg-danger-soft/40" : "border-amber-200 bg-amber-50/60"}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold">{l.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${done ? "bg-emerald-100 text-emerald-800" : diff < 0 ? "bg-danger-soft text-danger" : "bg-amber-100 text-amber-800"}`}>
                          {done ? "✓ Matches" : diff < 0 ? `Over by ${l.fmt(-diff)} ${l.unit}` : `${l.fmt(diff)} ${l.unit} short`}
                        </span>
                      </div>
                      <div className="num mt-1.5 flex items-baseline justify-between text-xs text-muted">
                        <span>Entered <b className="text-ink">{l.fmt(l.used)} {l.unit}</b></span>
                        <span>Lot <b className="text-ink">{l.fmt(l.lot)} {l.unit}</b></span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className={`h-full rounded-full ${done ? "bg-emerald-500" : diff < 0 ? "bg-danger" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="px-6 pt-3 text-[11px] text-muted">Keep editing to add the missing rows, or record now if the supplier&apos;s slip itself differs.</p>
              <div className="mt-5 flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
                <Button variant="outline" size="sm" onClick={() => setLotConfirm(null)} autoFocus>Keep editing</Button>
                <Button size="sm" disabled={bulkSaving} className="bg-accent hover:bg-accent-strong" onClick={() => handleBulkAdd(true)}>{bulkSaving ? "Saving…" : "Record anyway"}</Button>
              </div>
            </div>
          </div>
        );
      })()}

      {showAddVendor && <VendorForm vendor={null} onClose={() => setShowAddVendor(false)} onSaved={onVendorCreated} />}
    </div>
  );
}
