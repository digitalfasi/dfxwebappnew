import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { SearchInput } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { catalogueService } from "../services/catalogueService";

const CAT_QUICK = ["Chains", "Bangles", "Necklaces", "Rings", "Pendants", "Earrings"];
const PURITY_QUICK = ["18K", "22K", "916", "24K"];
const OFFER_QUICK = ["15% Off on Making Value", "Zero Making Charges", "BIG SALE", "Festive Offer"];
const TAG_QUICK = ["Bestseller", "New Arrival", "Trending", "Exclusive", "Festive", "Ready to Ship"];

export default function CatalogueStudio() {
  const scope = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  usePageMotion(scope, [loading]);
  usePressFeedback(scope);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [subCategoryFilter, setSubCategoryFilter] = useState("All Sub-categories");
  const [purityFilter, setPurityFilter] = useState("All Purity");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [view, setView] = useState("catalogue");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({ name: "", price: "", purity: "", category: "", details: "", photo: null });
  const [form, setForm] = useState({ name: "", category: "", price: "", sku: "", purity: "", weight: "", offerDiscount: "", offerLabel: "", tags: [], customTag: "", description: "", image: null });
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setProducts(await catalogueService.getProducts());
    } catch (err) {
      setLoadError(err?.message || "Could not load catalogue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.subCategory && p.subCategory.toLowerCase().includes(q)) || (p.sku && p.sku.toLowerCase().includes(q));
      const matchesCat = categoryFilter === "All Categories" || p.category === categoryFilter;
      const matchesSub = subCategoryFilter === "All Sub-categories" || p.subCategory === subCategoryFilter;
      const matchesPurity = purityFilter === "All Purity" || p.purity === purityFilter;
      const matchesStatus = statusFilter === "All Status" || p.status === statusFilter;
      return matchesSearch && matchesCat && matchesSub && matchesPurity && matchesStatus;
    });
  }, [products, search, categoryFilter, subCategoryFilter, purityFilter, statusFilter]);

  function handleImage(e, target) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (target === "quick") setQuick({ ...quick, photo: url, photoFile: file });
    else { setForm({ ...form, image: url, imageFile: file }); setPreview(url); }
  }

  async function saveQuick() {
    if (!quick.name.trim() || !quick.price) { toast("Fill name and price"); return; }
    if (saving) return;
    setSaving(true);
    try {
      const created = await catalogueService.createProduct({
        name: quick.name.trim(),
        category: quick.category || undefined,
        purity: quick.purity || undefined,
        price: Number(quick.price),
        description: quick.details || undefined,
      });
      if (quick.photoFile && created?.id) {
        try { await catalogueService.uploadImage(created.id, quick.photoFile); }
        catch { toast("Product saved, image upload failed"); }
      }
      setQuick({ name: "", price: "", purity: "", category: "", details: "", photo: null, photoFile: null });
      setQuickOpen(false);
      await load();
      toast("Product saved");
    } catch (err) {
      toast(err?.message || "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  function validate() {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (!form.category.trim()) e.category = "Category is required";
    if (!form.price || Number(form.price) <= 0) e.price = "Price must be greater than 0";
    if (!form.purity.trim()) e.purity = "Purity is required";
    if (!form.weight || Number(form.weight) <= 0) e.weight = "Weight must be greater than 0";
    return e;
  }

  async function handleSave() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Complete the required fields"); return; }
    if (saving) return;
    setSaving(true);
    try {
      const created = await catalogueService.createProduct({
        name: form.name.trim(),
        category: form.category || undefined,
        sku: form.sku || undefined,
        purity: form.purity || undefined,
        price: Number(form.price),
        weightGrams: form.weight ? Number(form.weight) : undefined,
        tags: form.tags,
        makingChargeDiscountPercent: form.offerDiscount ? Number(form.offerDiscount) : undefined,
        makingChargeDiscountLabel: form.offerLabel || undefined,
        description: form.description || undefined,
      });
      if (form.imageFile && created?.id) {
        try { await catalogueService.uploadImage(created.id, form.imageFile); }
        catch { toast("Product created, image upload failed"); }
      }
      setForm({ name: "", category: "", price: "", sku: "", purity: "", weight: "", offerDiscount: "", offerLabel: "", tags: [], customTag: "", description: "", image: null, imageFile: null });
      setPreview(null);
      setErrors({});
      setView("catalogue");
      await load();
      toast("Product created");
    } catch (err) {
      toast(err?.message || "Could not create product");
    } finally {
      setSaving(false);
    }
  }

  if (view === "quick") {
    return (
      <div ref={scope} className="mx-auto max-w-[1100px]">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => setView("catalogue")} className="flex items-center gap-2 text-sm font-bold hover:text-accent"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back</button>
          <h2 className="text-lg font-extrabold">New Product — Quick Form</h2>
        </div>
        <Card className="p-6">
          <h3 className="font-extrabold">New Product — Quick Form</h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-[1.1fr_1.2fr]">
            <div>
              <div className="text-xs font-bold">Photo</div>
              <label className="mt-1.5 flex h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/30 text-xs font-medium text-muted hover:border-accent hover:bg-canvas/50">
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImage(e, "quick")} />
                {quick.photo ? <img src={quick.photo} alt="quick" className="h-full w-full rounded-xl object-cover" /> : <span>Add photo</span>}
              </label>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><input value={quick.name} onChange={e => setQuick({ ...quick, name: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Price (₹)</span><input type="number" value={quick.price} onChange={e => setQuick({ ...quick, price: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purity</span><input value={quick.purity} onChange={e => setQuick({ ...quick, purity: e.target.value })} placeholder="22K" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Category</span><input value={quick.category} onChange={e => setQuick({ ...quick, category: e.target.value })} placeholder="Necklaces" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label>
              </div>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Details</span><textarea value={quick.details} onChange={e => setQuick({ ...quick, details: e.target.value })} rows={3} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent" /></label>
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" size="sm" onClick={() => { setView("catalogue"); setQuick({ name: "", price: "", purity: "", category: "", details: "", photo: null }); }}>Cancel</Button><Button size="sm" disabled={saving} onClick={() => { saveQuick(); setView("catalogue"); }}>{saving ? "Saving…" : "Save Product"}</Button></div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "create") {
    return (
      <div ref={scope} className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={() => setView("catalogue")} className="flex items-center gap-2 text-sm font-bold hover:text-accent"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back</button>
          <div className="flex gap-2"><span className="text-lg font-extrabold">Create Product</span></div>
          <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save Product"}</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-bold">Product Image</h3>
            <div className="mt-4">
              {preview ? <img src={preview} alt="preview" className="h-64 w-full rounded-xl object-cover border border-line" /> : <label className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 text-sm text-muted hover:border-accent"><input type="file" accept="image/*" className="hidden" onChange={e => handleImage(e, "full")} /><span className="font-bold">Upload Image</span><span className="text-xs">Click to select</span></label>}
              {!preview && null}
              {preview && <label className="mt-3 inline-flex cursor-pointer rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold hover:bg-canvas"><input type="file" accept="image/*" className="hidden" onChange={e => handleImage(e, "full")} />Change Image</label>}
            </div>
            <div className="mt-4 rounded-xl border border-line-soft bg-canvas/60 p-3 text-xs leading-relaxed text-muted">
              Image is added automatically when the product is created<br />Original photo is kept as uploaded<br />No cropping or resizing
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-bold">Product Details</h3>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Gold Ring" className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.name ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.name && <span className="text-xs font-semibold text-danger">{errors.name}</span>}</label>
                <div><div className="text-xs font-bold">Category *</div><div className="mt-1.5 flex flex-wrap gap-1.5">{CAT_QUICK.map(c => <button key={c} onClick={() => setForm({ ...form, category: c })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.category === c ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted hover:border-accent-line"}`}>{c}</button>)}</div><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Category" className={`mt-2 h-10 w-full rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.category ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.category && <span className="text-xs font-semibold text-danger">{errors.category}</span>}</div>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Price (₹) *</span><input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.price ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.price && <span className="text-xs font-semibold text-danger">{errors.price}</span>}</label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">SKU</span><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="SKU" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
                <div><div className="text-xs font-bold">Purity *</div><div className="mt-1.5 flex flex-wrap gap-1.5">{PURITY_QUICK.map(p => <button key={p} onClick={() => setForm({ ...form, purity: p })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.purity === p ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted"}`}>{p}</button>)}</div><input value={form.purity} onChange={e => setForm({ ...form, purity: e.target.value })} placeholder="22K" className={`mt-2 h-10 w-full rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.purity ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.purity && <span className="text-xs font-semibold text-danger">{errors.purity}</span>}</div>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Weight (g) *</span><input type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.weight ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.weight && <span className="text-xs font-semibold text-danger">{errors.weight}</span>}</label>
                <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5"><span className="text-xs font-bold">Making-Charge Discount (%)</span><input value={form.offerDiscount} onChange={e => setForm({ ...form, offerDiscount: e.target.value })} placeholder="10" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label><label className="grid gap-1.5"><span className="text-xs font-bold">Discount Label</span><input value={form.offerLabel} onChange={e => setForm({ ...form, offerLabel: e.target.value })} placeholder="Festive" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label></div>
                <div><div className="text-xs font-bold">Offer quick options:</div><div className="mt-1.5 flex flex-wrap gap-1.5">{OFFER_QUICK.map(o => <button key={o} onClick={() => setForm({ ...form, offerLabel: o })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.offerLabel === o ? "border-accent bg-accent text-white" : "border-line bg-white text-muted"}`}>{o}</button>)}</div></div>
                <div><div className="text-xs font-bold">Tags</div><div className="mt-1.5 flex flex-wrap gap-1.5">{TAG_QUICK.map(t => <button key={t} onClick={() => setForm({ ...form, tags: form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t] })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.tags.includes(t) ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted"}`}>{t}</button>)}</div><div className="mt-2 flex gap-2"><input value={form.customTag} onChange={e => setForm({ ...form, customTag: e.target.value })} placeholder="Custom tag" className="h-9 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" /><Button size="sm" variant="outline" onClick={() => { if (form.customTag.trim()) { setForm({ ...form, tags: [...form.tags, form.customTag.trim()], customTag: "" }); } }}>Add</Button></div>{form.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{form.tags.map(t => <Badge key={t} tone="accent">{t}</Badge>)}</div>}</div>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Description</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Product description" className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent" /></label>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-bold">Live Customer Preview</h3>
              <p className="text-xs text-muted">How this product appears to customers.</p>
              <div className="mt-3 flex gap-4 rounded-xl border border-line bg-canvas/40 p-4">
                <img src={preview || "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=200"} alt="live" className="h-20 w-20 rounded-lg object-cover border border-line" />
                <div><div className="font-bold">{form.name || "Product name"}</div><div className="text-sm font-bold text-accent-strong">₹{form.price || "—"}</div></div>
              </div>
            </Card>

            {Object.keys(errors).length > 0 && (
              <div className="rounded-xl border border-danger-line bg-danger-soft p-3 text-xs font-semibold text-danger">
                Complete the required fields: {Object.keys(errors).join(", ")}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      {/* Header */}
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Catalogue Studio</h2>
        <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Product Studio</p>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">Add a product in seconds, or open Product Studio for images, editing, and templates.</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setView("create")}>Product Studio</Button>
          <Button size="sm" variant="outline" onClick={() => setView("quick")}>+ New Product</Button>
        </div>
      </div>

      {/* Search & filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search by name, category, sub-category or SKU" value={search} onChange={e => setSearch(e.target.value)} className="min-w-[260px] flex-1 max-w-md" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter} options={["All Categories", "Bangles", "Chain", "Rings", "Necklaces", "Pendants", "Earrings", "Coins"]} className="w-[160px]" />
        <Select value={subCategoryFilter} onValueChange={setSubCategoryFilter} options={["All Sub-categories", "Traditional", "Long Chain", "CHAIN", "Stone Studded", "Bridal", "Jhumka", "Solitaire", "Diamond", "Bracelet", "24K Coin", "Mangalsutra"]} className="w-[170px]" />
        <Select value={purityFilter} onValueChange={setPurityFilter} options={["All Purity", "22K", "18K", "24K", "916"]} className="w-[130px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter} options={["All Status", "Active", "Draft", "Inactive"]} className="w-[130px]" />
        {(search || categoryFilter !== "All Categories" || subCategoryFilter !== "All Sub-categories" || purityFilter !== "All Purity" || statusFilter !== "All Status") && (
          <button onClick={() => { setSearch(""); setCategoryFilter("All Categories"); setSubCategoryFilter("All Sub-categories"); setPurityFilter("All Purity"); setStatusFilter("All Status"); }} className="text-xs font-bold text-accent underline">Clear</button>
        )}
        <div className="ml-auto text-xs font-semibold text-muted">Showing {filtered.length} of {products.length}</div>
      </div>

      {/* Product grid — four-column */}
      {loading ? (
        <div className="rounded-xl border border-line-soft bg-canvas/40 p-8 text-center text-sm font-semibold text-muted">Loading catalogue…</div>
      ) : loadError ? (
        <div className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm font-semibold text-danger">{loadError}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-line-soft bg-canvas/40 p-8 text-center text-sm font-semibold text-muted">No products found</div>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map(p => (
          <Card key={p.id} className="overflow-hidden p-0 flex flex-col">
            <div className="relative">
              {p.img ? (
                <img src={p.img} alt={p.name} className="h-48 w-full object-cover" />
              ) : (
                <div className="grid h-48 w-full place-items-center bg-canvas/40 text-xs font-semibold text-muted">No image</div>
              )}
              <button onClick={() => toast(`${p.name} images`)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink shadow hover:bg-white" aria-label="Images">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
              </button>
            </div>
            <div className="p-4 flex flex-1 flex-col">
              <div className="font-bold leading-tight">{p.name || "—"}</div>
              <div className="mt-1 text-xs text-muted">{p.category}{p.subCategory ? ` / ${p.subCategory}` : ""}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <Badge tone="success" dot>{p.status}</Badge>
                <span className="text-xs text-muted">{p.stock}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted">Purity</span><div className="font-bold">{p.purity}</div></div>
                <div><span className="text-muted">Weight</span><div className="font-bold">{p.weight} g</div></div>
              </div>
              <div className="mt-2 font-extrabold text-ink">{p.price != null ? `₹${p.price.toLocaleString("en-IN")}` : "—"}</div>
            </div>
          </Card>
        ))}
      </div>
      )}

      {quickOpen && (
        <Card className="mt-6 p-5">
          <h3 className="font-extrabold">New Product — Quick Form</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-bold">Photo</div>
              <label className="mt-1 flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 text-xs text-muted hover:border-accent">
                <input type="file" accept="image/*" className="hidden" onChange={e => handleImage(e, "quick")} />
                {quick.photo ? <img src={quick.photo} alt="quick" className="h-full w-full rounded-xl object-cover" /> : <><span>Add photo</span></>}
              </label>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Product Name *</span><input value={quick.name} onChange={e => setQuick({ ...quick, name: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] outline-none" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Price (₹)</span><input type="number" value={quick.price} onChange={e => setQuick({ ...quick, price: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm focus:border-accent outline-none" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Purity</span><input value={quick.purity} onChange={e => setQuick({ ...quick, purity: e.target.value })} placeholder="22K" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Category</span><input value={quick.category} onChange={e => setQuick({ ...quick, category: e.target.value })} placeholder="Necklaces" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label>
              </div>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Details</span><textarea value={quick.details} onChange={e => setQuick({ ...quick, details: e.target.value })} rows={2} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent" /></label>
              <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={() => setQuickOpen(false)}>Cancel</Button><Button size="sm" disabled={saving} onClick={saveQuick}>{saving ? "Saving…" : "Save Product"}</Button></div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
