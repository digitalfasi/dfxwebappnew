import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/_shared/ui/card";
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
// Inventory. Nothing here is summed in the browser.
//
// Layout: one category at a time. A jeweller works on Bangles, then on Chains
// — showing all 29 at once turns a maintenance screen into a wall of numbers.

const ICON = {
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  chevron: <path d="M9 18l6-6-6-6" />,
  ring: <><circle cx="12" cy="13" r="6.5" /><path d="M9.5 4.5h5" /></>,
};

function Icon({ d, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

/** Quiet square icon action. Carries its own reason when unavailable. */
function IconAction({ icon, label, onClick, danger, blockedReason }) {
  const blocked = !!blockedReason;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={blocked}
      title={blockedReason || label}
      aria-label={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-canvas hover:text-accent"
      }`}
    >
      <Icon d={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

export default function MasterInventory({ onNavigate }) {
  const scope = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState([]);
  const [importable, setImportable] = useState([]);
  const [importing, setImporting] = useState(false);

  const [focusId, setFocusId] = useState("");
  const [expanded, setExpanded] = useState({});

  // One form drives all four write actions; `mode` says which.
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState(null);
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
      // Keep the admin on the category they were working on; fall back to the
      // first one so the screen is never pointed at nothing.
      setFocusId((prev) => (res.categories.some((c) => c.id === prev) ? prev : res.categories[0]?.id || ""));
    } catch (err) {
      setLoadError(err?.message || "Could not load the category master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const category = useMemo(
    () => categories.find((c) => c.id === focusId) || null,
    [categories, focusId]
  );
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const openAddCategory = () => { setFormError(""); setForm({ mode: "category-add", name: "", code: "" }); };
  const openEditCategory = (c) => { setFormError(""); setForm({ mode: "category-edit", id: c.id, name: c.name, code: c.code }); };
  const openAddSubcategory = () => { setFormError(""); setForm({ mode: "sub-add", categoryId: focusId, name: "", code: "" }); };
  const openEditSubcategory = (s) => { setFormError(""); setForm({ mode: "sub-edit", id: s.id, categoryId: s.categoryId, name: s.name, code: s.code }); };

  async function submitForm() {
    if (!form) return;
    const name = form.name.trim();
    if (name.length < 2) { setFormError("Enter a name of at least 2 characters."); return; }
    if (form.mode.startsWith("sub") && !form.categoryId) { setFormError("Pick the category it belongs to."); return; }
    setSaving(true);
    setFormError("");
    try {
      if (form.mode === "category-add") {
        const created = await masterInventoryService.createCategory({ name, code: form.code.trim() });
        if (created?.id) setFocusId(created.id);
        toast(`Category added — ${name}`);
      } else if (form.mode === "category-edit") {
        await masterInventoryService.updateCategory(form.id, { name, code: form.code.trim() });
        toast(`Category updated — ${name}`);
      } else if (form.mode === "sub-add") {
        await masterInventoryService.createSubcategory({ categoryId: form.categoryId, name, code: form.code.trim() });
        setFocusId(form.categoryId);
        toast(`Subcategory added — ${name}`);
      } else {
        await masterInventoryService.updateSubcategory(form.id, { categoryId: form.categoryId, name, code: form.code.trim() });
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
      toast(made ? `Imported ${res.categoriesCreated} categories and ${res.subcategoriesCreated} subcategories` : "Nothing new to import");
      await load();
    } catch (err) {
      toast(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // "View items" hands the labels to Inventory, which reads them once on mount
  // and applies its own category/subcategory filters.
  function viewItems(subcategoryName) {
    if (!category) return;
    try {
      sessionStorage.setItem(
        "dfx:inventoryFilter",
        JSON.stringify({ category: category.name, subCategory: subcategoryName || "" })
      );
    } catch { /* a blocked storage must not stop the navigation */ }
    onNavigate?.("inventory");
  }

  return (
    <div ref={scope} className="mx-auto w-full max-w-[1120px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Master Inventory</h2>
          <p className="mt-1 text-sm text-muted">
            View stock details by category and sub-category with item count and weight.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" disabled={!category} onClick={openAddSubcategory}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            Add New Subcategory
          </Button>
          <Button size="sm" onClick={openAddCategory}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            Add New Category
          </Button>
        </div>
      </div>

      {/* Adoption for a store that has been typing categories by hand. Kept to
          one line — it is a one-off action, not part of the daily screen. */}
      {!loading && importable.length > 0 && (
        <div data-motion="reveal" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-line bg-accent-soft/30 px-4 py-2.5">
          <span className="text-xs font-semibold text-ink">
            <span className="num font-bold">{importable.length}</span> categor{importable.length === 1 ? "y" : "ies"} used on stock are not in this list yet.
          </span>
          <button type="button" disabled={importing} onClick={runImport} className="text-xs font-bold text-accent-strong underline disabled:opacity-50">
            {importing ? "Importing…" : "Import them"}
          </button>
        </div>
      )}

      <Card data-motion="reveal" className="mb-5 px-5 py-4">
        <label className="grid max-w-[340px] gap-1.5">
          <span className="text-xs font-bold">Select Category</span>
          <Select value={focusId} onValueChange={setFocusId} options={categoryOptions} placeholder="No categories yet" />
        </label>
      </Card>

      {loading && <Card className="p-16 text-center text-sm font-bold text-muted">Loading…</Card>}

      {!loading && loadError && (
        <Card className="p-16 text-center">
          <div className="font-bold text-danger">Couldn’t load the category master</div>
          <p className="mt-1 text-sm text-muted">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && categories.length === 0 && (
        <Card className="px-6 py-16 text-center">
          <div className="text-base font-extrabold">No categories yet</div>
          <p className="mx-auto mt-1.5 max-w-[44ch] text-sm text-muted">
            A category is the top level an item is filed under — Bangles, Chains, Rings.
          </p>
          <Button size="sm" className="mt-5" onClick={openAddCategory}>Add New Category</Button>
        </Card>
      )}

      {!loading && !loadError && category && (
        <Card data-motion="reveal" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold text-muted">
                  <th className="px-6 py-3.5 font-bold">Subcategory</th>
                  <th className="px-4 py-3.5 font-bold">Item Count</th>
                  <th className="px-4 py-3.5 font-bold">Net Weight (g)</th>
                  <th className="px-6 py-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Category band — its identity on the left, its live totals on
                    the right, exactly where the eye lands after the header. */}
                <tr className="border-b border-line bg-accent-soft/25">
                  <td colSpan={2} className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent-line bg-surface text-accent">
                        <Icon d={ICON.ring} />
                      </span>
                      <span className="text-[15px] font-extrabold">{category.name}</span>
                      {category.code && (
                        <span className="num font-mono text-xs font-semibold text-muted">({category.code})</span>
                      )}
                    </div>
                  </td>
                  <td colSpan={2} className="px-6 py-3.5">
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-semibold text-muted">
                      <span>Total Subcategories: <span className="num font-bold text-ink">{category.subcategories.length}</span></span>
                      <span className="text-line">|</span>
                      <span>Total Items: <span className="num font-bold text-ink">{category.stock.inStockCount}</span></span>
                      <span className="text-line">|</span>
                      <span>Total Weight: <span className="num font-bold text-accent-strong">{grams(category.stock.inStockNetWeight)}</span></span>
                      <span className="ml-1 flex items-center">
                        <IconAction icon={ICON.edit} label={`Edit ${category.name}`} onClick={() => openEditCategory(category)} />
                        <IconAction
                          icon={ICON.trash}
                          label={`Delete ${category.name}`}
                          danger
                          blockedReason={category.stock.totalItemCount > 0 ? `Cannot delete — ${category.stock.totalItemCount} item(s) are filed under ${category.name}.` : ""}
                          onClick={() => setRemoving({ kind: "category", id: category.id, name: category.name })}
                        />
                      </span>
                    </div>
                  </td>
                </tr>

                {category.subcategories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-14 text-center">
                      <div className="text-sm font-bold">No subcategories under {category.name}</div>
                      <p className="mx-auto mt-1.5 max-w-[42ch] text-xs text-muted">
                        {category.stock.inStockCount > 0
                          ? `${category.stock.inStockCount} item(s) sit directly on this category.`
                          : "Add the ones your store buys — Gold Bangles, Kundan Bangles."}
                      </p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={openAddSubcategory}>Add New Subcategory</Button>
                    </td>
                  </tr>
                ) : (
                  category.subcategories.map((sub) => {
                    const open = !!expanded[sub.id];
                    const blocked = sub.stock.totalItemCount > 0;
                    return (
                      <tr key={sub.id} className="group border-b border-line-soft last:border-0 transition-colors hover:bg-canvas/40">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => setExpanded((p) => ({ ...p, [sub.id]: !open }))}
                              aria-expanded={open}
                              aria-label={open ? `Hide details of ${sub.name}` : `Show details of ${sub.name}`}
                              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-muted transition-colors hover:text-accent"
                            >
                              <Icon d={ICON.chevron} className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold leading-tight">{sub.name}</span>
                                {!sub.isActive && (
                                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-muted">Inactive</span>
                                )}
                              </div>
                              {sub.code && <div className="num mt-0.5 font-mono text-xs text-muted">({sub.code})</div>}
                              {open && (
                                <p className="mt-2 text-xs text-muted">
                                  <span className="num font-bold text-ink">{sub.stock.totalItemCount}</span> item(s) in total, sold and retired included
                                  {blocked ? " — so this name cannot be deleted." : "."}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="num inline-flex min-w-[2.75rem] justify-center rounded-full bg-canvas px-2.5 py-1 text-xs font-bold">
                            {sub.stock.inStockCount}
                          </span>
                        </td>
                        <td className="num px-4 py-4 font-semibold whitespace-nowrap">{grams(sub.stock.inStockNetWeight)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => viewItems(sub.name)}>View Items</Button>
                            {/* Maintenance sits behind the primary action and
                                stays quiet until the row is hovered or focused,
                                so a delete is never the obvious thing to press. */}
                            <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <IconAction icon={ICON.edit} label={`Edit ${sub.name}`} onClick={() => openEditSubcategory(sub)} />
                              <IconAction
                                icon={ICON.trash}
                                label={`Delete ${sub.name}`}
                                danger
                                blockedReason={blocked ? `Cannot delete — ${sub.stock.totalItemCount} item(s) carry ${sub.name}.` : ""}
                                onClick={() => setRemoving({ kind: "subcategory", id: sub.id, name: sub.name })}
                              />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Items on the category but not on any of its subcategories. One
              quiet line, so the rows above and the category total reconcile. */}
          {category.unassignedInStockCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/40 px-6 py-3">
              <span className="text-xs text-muted">
                <span className="num font-bold text-ink">{category.unassignedInStockCount}</span> item(s) in stock have no subcategory from this list.
              </span>
              <button type="button" onClick={() => viewItems("")} className="text-xs font-bold text-accent-strong underline">
                View items
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Add / edit — one dialog for all four actions, because the fields are
          identical and a second near-copy would drift from this one. */}
      {form && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mi-form-title">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pb-4 pt-5">
              <h3 id="mi-form-title" className="text-base font-extrabold">
                {form.mode === "category-add" ? "Add New Category"
                  : form.mode === "category-edit" ? "Edit Category"
                  : form.mode === "sub-add" ? "Add New Subcategory"
                  : "Edit Subcategory"}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {form.mode.endsWith("edit")
                  ? "Renaming also relabels the items holding the old name, so nothing drops out of the counts."
                  : "Names are matched case-insensitively, so the same one cannot be added twice."}
              </p>
            </div>
            <div className="grid gap-4 border-t border-line px-6 py-5">
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
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pt-5">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-danger">Delete {removing.kind}</div>
              <h4 id="mi-del-title" className="mt-1 text-base font-extrabold">{removing.name}</h4>
              <p className="mt-2 text-sm text-muted">
                {removing.kind === "category"
                  ? "The category and its subcategories are removed. This cannot be undone."
                  : "The subcategory is removed. This cannot be undone."}
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
