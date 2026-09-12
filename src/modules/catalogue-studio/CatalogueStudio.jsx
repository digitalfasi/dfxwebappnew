import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { Badge } from "@/_shared/ui/badge";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { catalogueService } from "@/modules/catalogue-studio/catalogueService";
import { money as formatINR } from "@/_shared/utils";

const CAT_QUICK = ["Chains", "Bangles", "Necklaces", "Rings", "Pendants", "Earrings"];
// The one purity vocabulary, shared with billing (PURITY_KARATS). Ordered
// purest-first, the way a jeweller reads them.
const PURITY_OPTIONS = ["24K", "22K", "20K", "18K", "14K", "9K"];
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
  const [editId, setEditId] = useState(null);
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

  function startCreate() {
    setEditId(null);
    setForm({ name: "", category: "", price: "", sku: "", purity: "", weight: "", offerDiscount: "", offerLabel: "", tags: [], customTag: "", description: "", image: null, imageFile: null });
    setPreview(null);
    setErrors({});
    setView("create");
  }

  // Existing Product path: select an existing catalogue product and edit it via
  // the real PUT /catalogue/products/{id}. No inventory linking is faked here.
  function openEdit(p) {
    setEditId(p.id);
    setForm({
      name: p.name || "", category: p.category || "", price: p.price != null ? String(p.price) : "",
      sku: p.sku || "", purity: p.purity || "", weight: p.weight !== "" && p.weight != null ? String(p.weight) : "",
      // Seeded from the product, not blanked. These used to be hardcoded ""
      // over whatever the product carried.
      offerDiscount: p.offerDiscount !== "" && p.offerDiscount != null ? String(p.offerDiscount) : "",
      offerLabel: p.offerLabel || "",
      tags: Array.isArray(p.tags) ? p.tags : [], customTag: "",
      description: p.description || "", image: p.img || null, imageFile: null,
    });
    setPreview(p.img || null);
    setErrors({});
    setView("create");
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
      const payload = {
        name: form.name.trim(),
        category: form.category || undefined,
        sku: form.sku || undefined,
        purity: form.purity || undefined,
        price: Number(form.price),
        weightGrams: form.weight ? Number(form.weight) : undefined,
        tags: form.tags,
        description: form.description || undefined,
        // Sent on BOTH paths. This used to ride the create branch only, which
        // is why an edit silently dropped whatever was typed here.
        makingChargeDiscountPercent: form.offerDiscount === "" ? "" : Number(form.offerDiscount),
        makingChargeDiscountLabel: form.offerLabel || "",
      };
      let target;
      if (editId) {
        target = await catalogueService.updateProduct(editId, payload);
      } else {
        target = await catalogueService.createProduct(payload);
      }
      if (form.imageFile && target?.id) {
        try { await catalogueService.uploadImage(target.id, form.imageFile); }
        catch { toast(editId ? "Product saved, image upload failed" : "Product created, image upload failed"); }
      }
      const wasEdit = !!editId;
      setEditId(null);
      setForm({ name: "", category: "", price: "", sku: "", purity: "", weight: "", offerDiscount: "", offerLabel: "", tags: [], customTag: "", description: "", image: null, imageFile: null });
      setPreview(null);
      setErrors({});
      setView("catalogue");
      await load();
      toast(wasEdit ? "Product updated" : "Product created");
    } catch (err) {
      toast(err?.message || (editId ? "Could not update product" : "Could not create product"));
    } finally {
      setSaving(false);
    }
  }

  if (view === "create") {
    return (
      <div ref={scope} className="mx-auto max-w-[1200px]">
        <div className="sticky top-0 z-20 -mx-2 mb-6 flex items-center justify-between border-b border-line bg-canvas/95 px-2 py-3 backdrop-blur">
          <button onClick={() => { setEditId(null); setView("catalogue"); }} className="flex items-center gap-2 text-sm font-bold hover:text-accent"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back</button>
          <div className="flex gap-2"><span className="text-lg font-extrabold">{editId ? "Edit Product" : "Create Product"}</span></div>
          <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : editId ? "Save Changes" : "Save Product"}</Button>
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
                <div><div className="text-xs font-bold">Purity *</div><div className="mt-1.5 flex flex-wrap gap-1.5">{PURITY_OPTIONS.map(p => <button key={p} onClick={() => setForm({ ...form, purity: p })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.purity === p ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted"}`}>{p}</button>)}</div>{form.purity && !PURITY_OPTIONS.includes(form.purity) && <div className="mt-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">This product is saved as "{form.purity}", which is not one of the standard purities. Pick the correct one above.</div>}{!form.purity && <div className="mt-2 text-xs font-semibold text-muted">Purity not set — choose one above.</div>}{errors.purity && <span className="mt-1 block text-xs font-semibold text-danger">{errors.purity}</span>}</div>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Weight (g) *</span><input type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none ${errors.weight ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.weight && <span className="text-xs font-semibold text-danger">{errors.weight}</span>}</label>
                <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5"><span className="text-xs font-bold">Making-Charge Discount (%)</span><input value={form.offerDiscount} onChange={e => setForm({ ...form, offerDiscount: e.target.value })} placeholder="10" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label><label className="grid gap-1.5"><span className="text-xs font-bold">Discount Label</span><input value={form.offerLabel} onChange={e => setForm({ ...form, offerLabel: e.target.value })} placeholder="Festive" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent" /></label></div>
                <div><div className="text-xs font-bold">Offer quick options:</div><div className="mt-1.5 flex flex-wrap gap-1.5">{OFFER_QUICK.map(o => <button key={o} onClick={() => setForm({ ...form, offerLabel: o })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.offerLabel === o ? "border-accent bg-accent text-white" : "border-line bg-white text-muted"}`}>{o}</button>)}</div></div>
                <div><div className="text-xs font-bold">Tags</div><div className="mt-1.5 flex flex-wrap gap-1.5">{TAG_QUICK.map(t => <button key={t} onClick={() => setForm({ ...form, tags: form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t] })} className={`rounded-full border px-3 py-1 text-xs font-bold ${form.tags.includes(t) ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted"}`}>{t}</button>)}</div><div className="mt-2 flex gap-2"><input value={form.customTag} onChange={e => setForm({ ...form, customTag: e.target.value })} placeholder="Custom tag" className="h-9 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" /><Button size="sm" variant="outline" onClick={() => { const t = form.customTag.trim(); if (t && !form.tags.includes(t)) { setForm({ ...form, tags: [...form.tags, t], customTag: "" }); } else if (t) { setForm({ ...form, customTag: "" }); } }}>Add</Button></div>{form.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{form.tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-strong">
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      title={`Remove ${t}`}
                      onClick={() => setForm({ ...form, tags: form.tags.filter(x => x !== t) })}
                      className="grid h-4 w-4 place-items-center rounded-full text-accent-strong/70 transition hover:bg-accent hover:text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}</div>}</div>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Description</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Product description" className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent" /></label>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-bold">Live Customer Preview</h3>
              <p className="text-xs text-muted">How this product appears to customers. Nothing here is saved until you press Save.</p>
              <div className="mt-3 flex gap-4 rounded-xl border border-line bg-canvas/40 p-4">
                {/* A deliberate placeholder, not a stock photo: a product with no
                    image must LOOK like it has none, or the preview quietly
                    promises the customer something the catalogue cannot show. */}
                {preview ? (
                  <img src={preview} alt={form.name || "Product preview"} className="h-24 w-24 shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface text-center text-[10px] font-bold leading-tight text-muted">
                    No image<br />yet
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{form.name || "Product name"}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[form.category, form.purity, form.weight ? `${form.weight} g` : null].filter(Boolean).join(" · ") || "Category · Purity · Weight"}
                  </div>
                  <div className="mt-1.5 text-sm font-bold text-accent-strong">
                    {form.price ? formatINR(Number(form.price)) : "—"}
                  </div>
                  {form.offerLabel && (
                    <div className="mt-1.5 inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-strong">
                      {form.offerLabel}{form.offerDiscount ? ` — ${form.offerDiscount}% off making` : ""}
                    </div>
                  )}
                  {form.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {form.tags.map(t => <span key={t} className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-muted">{t}</span>)}
                    </div>
                  )}
                  {form.description && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted">{form.description}</p>
                  )}
                </div>
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
        <p className="mt-1 max-w-[60ch] text-sm text-muted">Add a <span className="font-semibold text-ink">new product</span>, or select an <span className="font-semibold text-ink">existing product</span> below to edit its details and images.</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={startCreate}>Add New Product</Button>
        </div>
      </div>

      {/* Search & filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search by name, category, sub-category or SKU" value={search} onChange={e => setSearch(e.target.value)} className="min-w-[260px] flex-1 max-w-md" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter} options={["All Categories", "Bangles", "Chain", "Rings", "Necklaces", "Pendants", "Earrings", "Coins"]} className="w-[160px]" />
        <Select value={subCategoryFilter} onValueChange={setSubCategoryFilter} options={["All Sub-categories", "Traditional", "Long Chain", "CHAIN", "Stone Studded", "Bridal", "Jhumka", "Solitaire", "Diamond", "Bracelet", "24K Coin", "Mangalsutra"]} className="w-[170px]" />
        <Select value={purityFilter} onValueChange={setPurityFilter} options={["All Purity", ...PURITY_OPTIONS]} className="w-[130px]" />
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
          <Card key={p.id} onClick={() => openEdit(p)} className="cursor-pointer overflow-hidden p-0 flex flex-col transition-shadow hover:shadow-card" title={`Edit ${p.name}`}>
            <div className="relative">
              {p.img ? (
                <img src={p.img} alt={p.name} className="h-48 w-full object-cover" />
              ) : (
                <div className="grid h-48 w-full place-items-center bg-canvas/40 text-xs font-semibold text-muted">No image</div>
              )}
              <button onClick={(e) => { e.stopPropagation(); toast(`${p.name} images`); }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink shadow hover:bg-white" aria-label="Images">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
              </button>
            </div>
            <div className="p-4 flex flex-1 flex-col">
              <div className="font-bold leading-tight">{p.name || "—"}</div>
              <div className="mt-1 text-xs text-muted">{p.category}{p.subCategory ? ` / ${p.subCategory}` : ""}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <Badge tone={p.status === "Active" ? "success" : "neutral"} dot>{p.status}</Badge>
                <span className="text-xs text-muted">{p.stock}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted">Purity</span><div className={`font-bold ${p.purity ? "" : "text-warning"}`}>{p.purity || "Not set"}</div></div>
                <div><span className="text-muted">Weight</span><div className="font-bold">{p.weight} g</div></div>
              </div>
              <div className="mt-2 font-extrabold text-ink">{p.price != null ? `₹${p.price.toLocaleString("en-IN")}` : "—"}</div>
              <div className="mt-3 pt-3 border-t border-line-soft">
                <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>Edit</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
