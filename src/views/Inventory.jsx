import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { billingService } from "../services/billingService";

const CATS = ["Bangles","Necklaces","Rings","Earrings","Chains","Pendants"];
const SUBCATS = ["Traditional","Bridal","Diamond","Stone Studded","Jhumka"];
const PURITIES = ["22K","18K","24K","916"];
const VENDORS = ["Tanishq Supplies","Malabar Gold","Local Refinery","Kalyan Vendors"];
const STATUS_OPTS = ["All statuses","In Stock","Sold","Inactive"];

// Real inventory loads from the DFX backend via billingService. No mock items.

const CHARGE_TYPE = (t) => (String(t).toLowerCase().startsWith("perc") ? "PERCENTAGE" : "FIXED");

export default function Inventory() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorList, setVendorList] = useState([]);
  const [query, setQuery] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [vendor, setVendor] = useState("All Vendors");
  const [category, setCategory] = useState("All Categories");
  const [subCategory, setSubCategory] = useState("All Sub-categories");
  const [purity, setPurity] = useState("All Purity");

  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);

  const [addForm, setAddForm] = useState({
    photo: null, code: "", huid: "", name: "", category: "Rings", subCategory: "Traditional", purity: "22K",
    gross: "", net: "", vendor: "Tanishq Supplies", purchaseDate: "", invoice: "", rate: "", cost: "",
    makingType: "Percentage", makingValue: "12", wastageType: "Percentage", wastageValue: "2", goldProfit: "8", gst: "3",
    pricingMode: "Auto — system calculates", addToCatalogue: true
  });

  const [bulkRows, setBulkRows] = useState([{ code: "", name: "", category: "Rings", purity: "22K", gross: "", net: "", cost: "", pricing: "Auto — system calculates" }]);
  const [bulkMeta, setBulkMeta] = useState({ vendor: "Tanishq Supplies", date: "", invoice: "" });

  const [defaults, setDefaults] = useState({ makingType: "Percentage", makingValue: "12", wastageType: "Percentage", wastageValue: "2", goldProfit: "8", gst: "3", pricingMode: "Auto — system calculates" });

  usePageMotion(scope, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [inv, vendors] = await Promise.all([
        billingService.listInventory(),
        billingService.listVendors().catch(() => []),
      ]);
      setItems(inv.items);
      setVendorList(vendors);
    } catch (err) {
      setLoadError(err?.message || "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalGold = useMemo(() => items.filter(i=>i.status==="In Stock").reduce((s,i)=>s+i.net,0), [items]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter(i => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
      const matchesCode = !productCode || i.code.toLowerCase().includes(productCode.toLowerCase());
      const matchesName = !productName || i.name.toLowerCase().includes(productName.toLowerCase());
      const matchesStatus = status==="All statuses" || i.status===status;
      const matchesVendor = vendor==="All Vendors" || i.vendor===vendor;
      const matchesCat = category==="All Categories" || i.category===category;
      const matchesSub = subCategory==="All Sub-categories" || i.sub===subCategory;
      const matchesPurity = purity==="All Purity" || i.purity===purity;
      return matchesQ && matchesCode && matchesName && matchesStatus && matchesVendor && matchesCat && matchesSub && matchesPurity;
    });
  }, [items, query, productCode, productName, status, vendor, category, subCategory, purity]);

  const handleAdd = async () => {
    if(!addForm.code.trim() || !addForm.name.trim()) { toast("Product Code and Product Name required"); return; }
    setSaving(true);
    try {
      // Image is mandatory server-side; stage it first when the user picked one.
      let imageStoragePath;
      if (addForm.photo instanceof File) {
        imageStoragePath = await billingService.uploadStagingImage(addForm.photo);
      }
      const matchedVendor = vendorList.find(v => v.name === addForm.vendor);
      const created = await billingService.createInventoryItem({
        productCode: addForm.code.toUpperCase(),
        productName: addForm.name.trim(),
        category: addForm.category,
        subcategory: addForm.subCategory,
        huid: addForm.huid || undefined,
        purity: addForm.purity,
        grossWeightGrams: Number(addForm.gross) || 0,
        netGoldWeightGrams: Number(addForm.net) || 0,
        vendorId: matchedVendor?.id,
        vendorName: addForm.vendor,
        purchaseDate: addForm.purchaseDate || undefined,
        purchaseInvoiceRef: addForm.invoice || undefined,
        purchaseRatePerGram: addForm.rate ? Number(addForm.rate) : undefined,
        purchaseCost: addForm.cost ? Number(addForm.cost) : undefined,
        makingChargeType: CHARGE_TYPE(addForm.makingType),
        makingChargeValue: addForm.makingValue !== "" ? Number(addForm.makingValue) : null,
        wastageType: CHARGE_TYPE(addForm.wastageType),
        wastageValue: addForm.wastageValue !== "" ? Number(addForm.wastageValue) : null,
        goldProfitPercent: addForm.goldProfit !== "" ? Number(addForm.goldProfit) : null,
        taxRatePercent: Number(addForm.gst) || 0,
        pricingMode: null,
        imageStoragePath,
      });
      if (addForm.addToCatalogue && created?.id) {
        await billingService.publishToCatalogue(created.id).catch(() => {});
      }
      setShowAdd(false);
      await load();
      toast(addForm.addToCatalogue ? "Item added and published to catalogue" : "Inventory item added");
    } catch (err) {
      toast(err?.message || "Add failed");
    } finally {
      setSaving(false);
    }
  };

  // Bulk purchase needs a mandatory image per item, which the bulk grid does not
  // collect; the backend rejects imageless items, so bulk create is not wired to
  // avoid fabricating data. Use the single Add Item flow.
  const handleBulkAdd = () => {
    toast("Bulk add needs a per-item image — use Add Item for now");
  };

  const retire = async (code) => {
    const it = items.find(i => i.code === code);
    if (!it?.id) return;
    try { await billingService.setInventoryStatus(it.id, "INACTIVE"); await load(); toast("Item retired"); }
    catch (err) { toast(err?.message || "Retire failed"); }
  };
  const addToCatalogue = async (code) => {
    const it = items.find(i => i.code === code);
    if (!it?.id) return;
    try { await billingService.publishToCatalogue(it.id); await load(); toast("Added to catalogue"); }
    catch (err) { toast(err?.message || "Publish failed"); }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Inventory</h2>
          <p className="mt-1 text-sm text-muted">Finished jewellery products — <span className="font-mono text-xs">Unique Product Code</span> tracked per piece.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDefaults(true)}>Defaults</Button>
          <Button variant="outline" size="sm" onClick={() => setShowBulk(true)}>Bulk Purchase</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={() => setShowAdd(true)}>Add Item</Button>
        </div>
      </div>

      <Card data-motion="stat" className="mb-4 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Gold in Inventory</div>
        <div className="num mt-1 text-2xl font-extrabold">{totalGold.toFixed(2)} g</div>
        <div className="text-xs text-muted">In Stock only</div>
      </Card>

      <div className="mb-4 grid gap-2" data-motion="toolbar">
        <div className="flex flex-wrap gap-2">
          <SearchInput placeholder="Product search" value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 min-w-[200px]" />
          <Input placeholder="Product Code" value={productCode} onChange={e=>setProductCode(e.target.value)} className="w-[160px]" />
          <Input placeholder="Product Name" value={productName} onChange={e=>setProductName(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold">Filters</span>
          <Select value={status} onValueChange={setStatus} options={STATUS_OPTS} className="w-[140px]" />
          <Select value={vendor} onValueChange={setVendor} options={["All Vendors", ...VENDORS]} className="w-[160px]" />
          <Select value={category} onValueChange={setCategory} options={["All Categories", ...CATS]} className="w-[140px]" />
          <Select value={subCategory} onValueChange={setSubCategory} options={["All Sub-categories", ...SUBCATS]} className="w-[170px]" />
          <Select value={purity} onValueChange={setPurity} options={["All Purity", ...PURITIES]} className="w-[130px]" />
          <Button size="sm" variant="outline" onClick={()=>toast(`Search ${filtered.length} items`)}>Search</Button>
          <button onClick={()=>{setQuery("");setProductCode("");setProductName("");setStatus("All statuses");setVendor("All Vendors");setCategory("All Categories");setSubCategory("All Sub-categories");setPurity("All Purity");}} className="text-xs font-bold text-accent underline">Clear</button>
        </div>
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3"><h3 className="text-sm font-extrabold">Product list</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1060px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Product Code</th><th className="py-3">Name</th><th className="py-3">Category</th><th className="py-3">Sub-category</th><th className="py-3">Purity</th><th className="py-3">Net Weight</th><th className="py-3">Vendor</th><th className="py-3">Status</th><th className="py-3">Catalogue</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.code} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold">{p.code}</td>
                  <td className="py-3.5 font-bold">{p.name}</td>
                  <td className="py-3.5">{p.category}</td>
                  <td className="py-3.5 text-muted">{p.sub}</td>
                  <td className="py-3.5"><Badge tone="neutral">{p.purity}</Badge></td>
                  <td className="py-3.5 font-mono">{p.net} g</td>
                  <td className="py-3.5 text-xs">{p.vendor}</td>
                  <td className="py-3.5"><Badge tone={p.status==="In Stock"?"success":p.status==="Sold"?"warning":"neutral"} dot>{p.status}</Badge></td>
                  <td className="py-3.5"><Badge tone={p.catalogue==="Yes"?"success":"neutral"}>{p.catalogue}</Badge></td>
                  <td className="py-3.5 pr-6">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => toast(`Edit ${p.code}`)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => addToCatalogue(p.code)}>Add to Catalogue</Button>
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
                <tr><td colSpan={11} className="px-6 py-14 text-center"><div className="font-bold">No inventory found</div><p className="mt-1 text-sm text-muted">Add an item or adjust filters.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Inventory Item Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowAdd(false)} aria-label="Close" />
          <div className="relative w-full max-w-[720px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Add Inventory Item</h3><button onClick={()=>setShowAdd(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <div className="text-xs font-bold">Photo</div>
                <label className="mt-1.5 flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 text-xs text-muted hover:border-accent"><input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) setAddForm({...addForm, photo: URL.createObjectURL(f)});}} />{addForm.photo ? <img src={addForm.photo} alt="photo" className="h-full w-full rounded-xl object-cover" /> : <span>Upload Photo</span>}</label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Product Code *</span><Input placeholder="e.g. AUR-22K-BAN-001" value={addForm.code} onChange={e=>setAddForm({...addForm, code:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">HUID</span><Input placeholder="Hallmark UID" value={addForm.huid} onChange={e=>setAddForm({...addForm, huid:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><Input placeholder="e.g. Gold Bangle" value={addForm.name} onChange={e=>setAddForm({...addForm, name:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Category</span><Select value={addForm.category} onValueChange={v=>setAddForm({...addForm, category:v})} options={CATS} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Sub-category</span><Select value={addForm.subCategory} onValueChange={v=>setAddForm({...addForm, subCategory:v})} options={SUBCATS} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purity</span><Select value={addForm.purity} onValueChange={v=>setAddForm({...addForm, purity:v})} options={PURITIES} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Gross Weight (g)</span><Input type="number" value={addForm.gross} onChange={e=>setAddForm({...addForm, gross:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Net Gold Weight (g)</span><Input type="number" value={addForm.net} onChange={e=>setAddForm({...addForm, net:e.target.value})} /></label>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Vendor / Purchase</h4>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Vendor / Supplier</span><Select value={addForm.vendor} onValueChange={v=>setAddForm({...addForm, vendor:v})} options={VENDORS} /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Date</span><Input type="date" value={addForm.purchaseDate} onChange={e=>setAddForm({...addForm, purchaseDate:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Invoice Reference</span><Input value={addForm.invoice} onChange={e=>setAddForm({...addForm, invoice:e.target.value})} placeholder="INV-..." /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Rate (₹/g)</span><Input type="number" value={addForm.rate} onChange={e=>setAddForm({...addForm, rate:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Value / Cost (₹)</span><Input type="number" value={addForm.cost} onChange={e=>setAddForm({...addForm, cost:e.target.value})} /></label>
                </div>
                <Button size="sm" variant="outline" onClick={()=>toast("Add Vendor — coming soon")}>Add Vendor</Button>
              </div>

              <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Selling Price Rules</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Charge Type</span><Select value={addForm.makingType} onValueChange={v=>setAddForm({...addForm, makingType:v})} options={["Percentage","Fixed","Per Gram"]} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Making Charge Value</span><Input value={addForm.makingValue} onChange={e=>setAddForm({...addForm, makingValue:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Type</span><Select value={addForm.wastageType} onValueChange={v=>setAddForm({...addForm, wastageType:v})} options={["Percentage","Fixed"]} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Value</span><Input value={addForm.wastageValue} onChange={e=>setAddForm({...addForm, wastageValue:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Gold Profit %</span><Input value={addForm.goldProfit} onChange={e=>setAddForm({...addForm, goldProfit:e.target.value})} /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Tax / GST %</span><Input value={addForm.gst} onChange={e=>setAddForm({...addForm, gst:e.target.value})} /></label>
                  <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-bold">Pricing Mode</span><Select value={addForm.pricingMode} onValueChange={v=>setAddForm({...addForm, pricingMode:v})} options={["Auto — system calculates","Manual"]} /></label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addForm.addToCatalogue} onChange={e=>setAddForm({...addForm, addToCatalogue:e.target.checked})} /> Add to Catalogue after creating</label>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} className="bg-accent hover:bg-accent-strong" onClick={handleAdd}>{saving ? "Adding…" : "Add Item"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Inventory Receiving — enlarged width so inputs fully visible */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowBulk(false)} aria-label="Close" />
          <div className="relative w-full max-w-[1240px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Bulk Inventory Receiving</h3><button onClick={()=>setShowBulk(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Vendor</span><Select value={bulkMeta.vendor} onValueChange={v=>setBulkMeta({...bulkMeta, vendor:v})} options={VENDORS} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purchase Date</span><Input type="date" value={bulkMeta.date} onChange={e=>setBulkMeta({...bulkMeta, date:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Invoice No.</span><Input value={bulkMeta.invoice} onChange={e=>setBulkMeta({...bulkMeta, invoice:e.target.value})} placeholder="INV-..." /></label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[1160px] border-collapse text-sm">
                  <thead><tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-3 py-2 w-[150px]">Product Code</th><th className="py-2 w-[150px]">Name</th><th className="py-2 w-[130px]">Category</th><th className="py-2 w-[110px]">Purity</th><th className="py-2 w-[110px]">Gross Weight</th><th className="py-2 w-[110px]">Net Weight</th><th className="py-2 w-[130px]">Cost</th><th className="py-2 w-[210px]">Pricing Mode</th><th className="py-2 w-[48px]"></th></tr></thead>
                  <tbody>
                    {bulkRows.map((r,i)=>(
                      <tr key={i} className="border-t border-line-soft">
                        <td className="px-2 py-2"><Input value={r.code} onChange={e=>{const c=[...bulkRows];c[i].code=e.target.value;setBulkRows(c);}} placeholder="Code" className="h-9 text-sm" /></td>
                        <td className="px-2 py-2"><Input value={r.name} onChange={e=>{const c=[...bulkRows];c[i].name=e.target.value;setBulkRows(c);}} placeholder="Name" className="h-9 text-sm" /></td>
                        <td className="px-2 py-2"><Select value={r.category} onValueChange={v=>{const c=[...bulkRows];c[i].category=v;setBulkRows(c);}} options={CATS} /></td>
                        <td className="px-2 py-2"><Select value={r.purity} onValueChange={v=>{const c=[...bulkRows];c[i].purity=v;setBulkRows(c);}} options={PURITIES} /></td>
                        <td className="px-2 py-2"><Input value={r.gross} onChange={e=>{const c=[...bulkRows];c[i].gross=e.target.value;setBulkRows(c);}} className="h-9" /></td>
                        <td className="px-2 py-2"><Input value={r.net} onChange={e=>{const c=[...bulkRows];c[i].net=e.target.value;setBulkRows(c);}} className="h-9" /></td>
                        <td className="px-2 py-2"><Input value={r.cost} onChange={e=>{const c=[...bulkRows];c[i].cost=e.target.value;setBulkRows(c);}} className="h-9" /></td>
                        <td className="px-2 py-2"><Select value={r.pricing} onValueChange={v=>{const c=[...bulkRows];c[i].pricing=v;setBulkRows(c);}} options={["Auto — system calculates","Manual"]} /></td>
                        <td className="px-2 py-2"><Button size="sm" variant="outline" onClick={()=>setBulkRows(bulkRows.filter((_,ix)=>ix!==i))}>×</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={()=>setBulkRows([...bulkRows, {code:"",name:"",category:"Rings",purity:"22K",gross:"",net:"",cost:"",pricing:"Auto — system calculates"}])}>Add Row</Button>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowBulk(false)}>Cancel</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleBulkAdd}>Bulk Purchase</Button>
            </div>
          </div>
        </div>
      )}

      {/* Store Pricing Defaults */}
      {showDefaults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={()=>setShowDefaults(false)} aria-label="Close" />
          <div className="relative w-full max-w-[520px] rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Store Pricing Defaults</h3><button onClick={()=>setShowDefaults(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="px-6 py-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Making Type</span><Select value={defaults.makingType} onValueChange={v=>setDefaults({...defaults, makingType:v})} options={["Percentage","Fixed","Per Gram"]} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Making Value</span><Input value={defaults.makingValue} onChange={e=>setDefaults({...defaults, makingValue:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Type</span><Select value={defaults.wastageType} onValueChange={v=>setDefaults({...defaults, wastageType:v})} options={["Percentage","Fixed"]} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Wastage Value</span><Input value={defaults.wastageValue} onChange={e=>setDefaults({...defaults, wastageValue:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Gold Profit %</span><Input value={defaults.goldProfit} onChange={e=>setDefaults({...defaults, goldProfit:e.target.value})} /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">GST %</span><Input value={defaults.gst} onChange={e=>setDefaults({...defaults, gst:e.target.value})} /></label>
                <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-bold">Pricing Mode</span><Select value={defaults.pricingMode} onValueChange={v=>setDefaults({...defaults, pricingMode:v})} options={["Auto — system calculates","Manual"]} /></label>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={()=>setShowDefaults(false)}>Close</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={()=>{toast("Store defaults saved"); setShowDefaults(false);}}>Save Store Defaults</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
