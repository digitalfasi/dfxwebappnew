import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { grams } from "@/_shared/utils";
import { masterInventoryService } from "@/modules/procurement/master-inventory/masterInventoryService";

// Master Inventory — the category / subcategory taxonomy every stock item,
// catalogue product and per-category report is labelled with.
//
// It holds NAMES ONLY. Item counts and net weights are computed by the backend
// from inventory_items on every request, so this screen can never drift from
// Inventory. Nothing on this page is summed in the browser.
//
// The one filter that matters here is "which category am I working on", so the
// category picker focuses the table instead of a row of chips.
const ALL = "__all__";

const ICON = {
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  chevron: <path d="M9 18l6-6-6-6" />,
  box: <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />,
};

function Icon({ d, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

/** A small square icon action, with the reason it is unavailable in its title. */
function IconAction({ icon, label, onClick, disabled, danger, blockedReason }) {
  const blocked = !!blockedReason;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || blocked}
      title={blockedReason || label}
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "hover:border-danger hover:bg-danger hover:text-white disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-muted"
          : "hover:border-accent-line hover:text-accent"
      }`}
    >
      <Icon d={icon} />
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{label} </span>
      <span className="num font-bold text-ink">{value}</span>
    </span>
  );
}

export default function MasterInventory({ onNavigate }) {
  const scope = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState([]);
  const [importable, setImportable] = useState([]);
  const [importing, setImporting] = useState(false);

  const [focus, setFocus] = useState(ALL); // category id, or every category
  const [expanded, setExpanded] = useState({}); // subcategory id -> open

  // One form drives all four write actions; `mode` says which.
  const [form, setForm] = useState(null); // { mode, id, categoryId, name, code }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState(null); // { kind, id, name, blocked }
  const [busy, setBusy] = useState(false);

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await masterInventoryService.getMaster();
      setCategories(res.categories);
      setImportable(res.importable);
    } catch (err) {
      setLoadError(err?.message || "Could not load the category master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => (focus === ALL ? categories : categories.filter((c) => c.id === focus)),
    [categories, focus]
  );

  // Store-wide totals, straight from the per-category figures the server sent.
  const storeTotals = useMemo(
    () => ({
      categories: categories.length,
      subcategories: categories.reduce((n, c) => n + c.subcategories.length, 0),
      items: categories.reduce((n, c) => n + c.stock.inStockCount, 0),
      weight: categories.reduce((n, c) => n + c.stock.inStockNetWeight, 0),
    }),
    [categories]
  );

  const openAddCategory = () => { setFormError(""); setForm({ mode: "category-add", name: "", code: "" }); };
  const openEditCategory = (c) => { setFormError(""); setForm({ mode: "category-edit", id: c.id, name: c.name, code: c.code }); };
  const openAddSubcategory = (categoryId) => {
    setFormError("");
    setForm({
      mode: "sub-add",
      categoryId: categoryId || (focus !== ALL ? focus : categories[0]?.id || ""),
      name: "",
      code: "",
    });
  };
  const openEditSubcategory = (s) => {
    setFormError("");
    setForm({ mode: "sub-edit", id: s.id, categoryId: s.categoryId, name: s.name, code: s.code });
  };

  async function submitForm() {
    if (!form) return;
    const name = form.name.trim();
    if (name.length < 2) { setFormError("Enter a name of at least 2 characters."); return; }
    if (form.mode.startsWith("sub") && !form.categoryId) { setFormError("Pick the category it belongs to."); return; }
    setSaving(true);
    setFormError("");
    try {
      if (form.mode === "category-add") {
        await masterInventoryService.createCategory({ name, code: form.code.trim() });
        toast(`Category added — ${name}`);
      } else if (form.mode === "category-edit") {
        await masterInventoryService.updateCategory(form.id, { name, code: form.code.trim() });
        toast(`Category updated — ${name}`);
      } else if (form.mode === "sub-add") {
        await masterInventoryService.createSubcategory({ categoryId: form.categoryId, name, code: form.code.trim() });
        toast(`Subcategory added — ${name}`);
      } else {
        await masterInventoryService.updateSubcategory(form.id, {
          categoryId: form.categoryId, name, code: form.code.trim(),
        });
        toast(`Subcategory updated — ${name}`);
      }
      setForm(null);
      await load();
    } catch (err) {
      // The server's message carries the real reason (duplicate name, missing
      // parent), so it is shown as-is rather than reworded here.
      setFormError(err?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      if (removing.kind === "category") await masterInventoryService.deleteCategory(removing.id);
      else await masterInventoryService.deleteSubcategory(removing.id);
      toast(`Deleted — ${removing.name}`);
      setRemoving(null);
      await load();
    } catch (err) {
      toast(err?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = await masterInventoryService.importExisting();
      const made = res.categoriesCreated + res.subcategoriesCreated;
      toast(made
        ? `Imported ${res.categoriesCreated} categor${res.categoriesCreated === 1 ? "y" : "ies"} and ${res.subcategoriesCreated} subcategor${res.subcategoriesCreated === 1 ? "y" : "ies"}`
        : "Nothing new to import");
      await load();
    } catch (err) {
      toast(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // "View items" hands the labels to Inventory, which reads them once on mount
  // and applies its own category/subcategory filters — the same filters the
  // list endpoint already supports.
  function viewItems(categoryName, subcategoryName) {
    try {
      sessionStorage.setItem(
        "dfx:inventoryFilter",
        JSON.stringify({ category: categoryName, subCategory: subcategoryName || "" })
      );
    } catch { /* a blocked storage must not stop the navigation */ }
    onNavigate?.("inventory");
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div ref={scope} className="mx-auto w-full max-w-[1240px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Master Inventory</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted">
            The categories and subcategories every stock item is filed under. Item counts and gold
            weight are read live from Inventory — this screen never stores a quantity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={categories.length === 0} onClick={() => openAddSubcategory()}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            Add subcategory
          </Button>
          <Button size="sm" onClick={openAddCategory}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            Add category
          </Button>
        </div>
      </div>

      {/* One-click adoption for a store that has been typing categories by hand.
          Only rendered while there is actually something to import. */}
      {!loading && importable.length > 0 && (
        <Card data-motion="reveal" className="mb-4 border-accent-line bg-accent-soft/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-accent-strong">
                {importable.length} categor{importable.length === 1 ? "y" : "ies"} already used on stock
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-ink">{importable.join(" · ")}</p>
              <p className="mt-0.5 text-xs text-muted">
                Import them to manage them here. Your items keep their labels exactly as they are.
              </p>
            </div>
            <Button size="sm" disabled={importing} onClick={runImport}>
              {importing ? "Importing…" : "Import them"}
            </Button>
          </div>
        </Card>
      )}

      <Card data-motion="reveal" className="mb-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Select category</span>
            <Select
              value={focus}
              onValueChange={setFocus}
              options={[{ value: ALL, label: `All categories (${categories.length})` }, ...categoryOptions]}
              className="w-[260px]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold">
            <Stat label="Categories" value={storeTotals.categories} />
            <Stat label="Subcategories" value={storeTotals.subcategories} />
            <Stat label="Items in stock" value={storeTotals.items} />
            <Stat label="Net gold" value={grams(storeTotals.weight)} />
          </div>
        </div>
      </Card>

      {loading && (
        <Card className="p-14 text-center"><div className="font-bold">Loading…</div></Card>
      )}

      {!loading && loadError && (
        <Card className="p-14 text-center">
          <div className="font-bold text-danger">Couldn’t load the category master</div>
          <p className="mt-1 text-sm text-muted">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && categories.length === 0 && (
        <Card className="p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon d={ICON.box} className="h-5 w-5" />
          </span>
          <div className="mt-3 text-base font-extrabold">No categories yet</div>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">
            A category is the top level an item is filed under — Bangles, Chains, Rings. Add one,
            then add the subcategories your store actually buys.
          </p>
          <Button size="sm" className="mt-4" onClick={openAddCategory}>Add the first category</Button>
        </Card>
      )}

      {!loading && !loadError && shown.map((cat) => (
        <Card key={cat.id} data-motion="reveal" className="mb-4 overflow-hidden">
          {/* Category band — identity on the left, its live totals on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-accent-soft/30 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent-line bg-surface text-accent">
                <Icon d={ICON.box} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-extrabold">{cat.name}</h3>
                  {cat.code && <span className="num rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted">{cat.code}</span>}
                  {!cat.isActive && <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted">Inactive</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] font-semibold">
                  <Stat label="Subcategories" value={cat.subcategories.length} />
                  <Stat label="Items in stock" value={cat.stock.inStockCount} />
                  <Stat label="Net gold" value={grams(cat.stock.inStockNetWeight)} />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openAddSubcategory(cat.id)}>
                <Icon d={ICON.plus} className="h-3.5 w-3.5" />
                Subcategory
              </Button>
              <IconAction icon={ICON.edit} label={`Edit ${cat.name}`} onClick={() => openEditCategory(cat)} />
              <IconAction
                icon={ICON.trash}
                label={`Delete ${cat.name}`}
                danger
                blockedReason={
                  cat.stock.totalItemCount > 0
                    ? `Cannot delete — ${cat.stock.totalItemCount} item(s) are filed under ${cat.name}.`
                    : ""
                }
                onClick={() => setRemoving({ kind: "category", id: cat.id, name: cat.name })}
              />
            </div>
          </div>

          <CardContent className="px-0 pb-0">
            {cat.subcategories.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="text-sm font-bold">No subcategories under {cat.name}</div>
                <p className="mx-auto mt-1 max-w-[44ch] text-xs text-muted">
                  {cat.stock.inStockCount > 0
                    ? `${cat.stock.inStockCount} item(s) sit directly on this category. Add subcategories to file them properly.`
                    : "Add the ones your store buys — Gold Bangles, Kundan Bangles."}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => openAddSubcategory(cat.id)}>Add subcategory</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="whitespace-nowrap border-b border-line bg-canvas/60 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-muted">
                      <th className="px-5 py-2.5">Subcategory</th>
                      <th className="px-4 py-2.5 text-right">Items in stock</th>
                      <th className="px-4 py-2.5 text-right">Net gold weight</th>
                      <th className="px-4 py-2.5 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.subcategories.map((sub) => {
                      const open = !!expanded[sub.id];
                      const blocked = sub.stock.totalItemCount > 0;
                      return (
                        <tr key={sub.id} className="border-b border-line-soft last:border-0 transition-colors hover:bg-canvas/60">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => setExpanded((p) => ({ ...p, [sub.id]: !open }))}
                                aria-expanded={open}
                                aria-label={open ? `Hide details of ${sub.name}` : `Show details of ${sub.name}`}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-accent"
                              >
                                <Icon d={ICON.chevron} className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
                              </button>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold leading-tight">{sub.name}</span>
                                  {!sub.isActive && <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted">Inactive</span>}
                                </div>
                                {sub.code && <div className="num font-mono text-[11px] text-muted">{sub.code}</div>}
                                {open && (
                                  <div className="mt-1.5 grid gap-0.5 text-[11px] text-muted">
                                    <span>Sold and retired items included: <span className="num font-bold text-ink">{sub.stock.totalItemCount}</span></span>
                                    <span>{blocked ? "Delete is blocked while any item carries this name." : "No item carries this name — it can be deleted."}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="num px-4 py-3 text-right">
                            <span className="inline-flex min-w-[2.5rem] justify-center rounded-full bg-canvas px-2.5 py-1 text-xs font-bold">{sub.stock.inStockCount}</span>
                          </td>
                          <td className="num px-4 py-3 text-right font-bold whitespace-nowrap">{grams(sub.stock.inStockNetWeight)}</td>
                          <td className="px-4 py-3 pr-5">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => viewItems(cat.name, sub.name)}>View items</Button>
                              <IconAction icon={ICON.edit} label={`Edit ${sub.name}`} onClick={() => openEditSubcategory(sub)} />
                              <IconAction
                                icon={ICON.trash}
                                label={`Delete ${sub.name}`}
                                danger
                                blockedReason={blocked ? `Cannot delete — ${sub.stock.totalItemCount} item(s) carry ${sub.name}.` : ""}
                                onClick={() => setRemoving({ kind: "subcategory", id: sub.id, name: sub.name })}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Items on the category but not on any of its subcategories. Shown
                so the rows above and the category total always reconcile. */}
            {cat.unassignedInStockCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-warn-soft/40 px-5 py-3">
                <span className="text-xs font-semibold text-ink">
                  <span className="num font-bold">{cat.unassignedInStockCount}</span> item(s) in stock have no subcategory from this list.
                </span>
                <Button variant="outline" size="sm" onClick={() => viewItems(cat.name, "")}>View items</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Add / edit — one dialog for all four actions, because the fields are
          identical and a second near-copy would drift from this one. */}
      {form && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mi-form-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="border-b border-line px-6 py-4">
              <h3 id="mi-form-title" className="text-base font-extrabold">
                {form.mode === "category-add" ? "Add category"
                  : form.mode === "category-edit" ? "Edit category"
                  : form.mode === "sub-add" ? "Add subcategory"
                  : "Edit subcategory"}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {form.mode === "category-edit" || form.mode === "sub-edit"
                  ? "Renaming also relabels the stock and catalogue items holding the old name, so nothing drops out of the counts."
                  : "Names are matched case-insensitively, so the same one cannot be added twice."}
              </p>
            </div>
            <div className="grid gap-4 px-6 py-5">
              {form.mode.startsWith("sub") && (
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Category<span className="text-danger">*</span></span>
                  <Select
                    value={form.categoryId || ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                    options={categoryOptions}
                    placeholder="Pick a category"
                  />
                </label>
              )}
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Name<span className="text-danger">*</span></span>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={form.mode.startsWith("sub") ? "e.g. Gold Bangles" : "e.g. Bangles"}
                  autoFocus
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Code <span className="font-normal text-muted">— optional</span></span>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. H001"
                  className="num font-mono"
                />
                <span className="text-[11px] text-muted">Your own short reference, shown beside the name.</span>
              </label>
              {formError && <p role="alert" className="text-xs font-semibold text-danger">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setForm(null)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={submitForm}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mi-del-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pt-5">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-danger">
                Delete {removing.kind}
              </div>
              <h4 id="mi-del-title" className="mt-1 text-base font-extrabold">{removing.name}</h4>
              <p className="mt-2 text-sm text-muted">
                {removing.kind === "category"
                  ? "The category and its subcategories are removed. This cannot be undone."
                  : "The subcategory is removed. This cannot be undone."}
              </p>
              <p className="mt-2 rounded-xl border border-line bg-canvas/50 p-3 text-xs text-muted">
                Only possible while no item carries the name — sold items count too, because their
                invoices still show it. The server refuses otherwise and says how many hold it.
              </p>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button>
              <Button size="sm" className="bg-danger text-white hover:bg-danger/90" disabled={busy} onClick={confirmRemove}>
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
