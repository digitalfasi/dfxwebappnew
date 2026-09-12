import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input, SearchInput } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { masterInventoryService } from "@/modules/procurement/master-inventory/masterInventoryService";

// Master Inventory — the category / subcategory names every stock item,
// catalogue product and per-category report is filed under.
//
// Scope is deliberately just the taxonomy: names, nothing else. Counts, weights
// and valuations belong on Inventory, which owns the items; repeating them here
// only creates a second set of numbers that can disagree with it.
//
// The one thing this screen must be excellent at is adding, renaming and
// removing a name — so each row carries its own actions, and a delete that
// cannot proceed says why and offers the action that can.

const ALL = "__all__";

const ICON = {
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.4 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  eye: <><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></>,
};

function Icon({ d, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

/**
 * Icon action. Always clickable — a delete that is merely greyed out leaves the
 * admin guessing why, so it stays live and the dialog explains the block and
 * offers the way forward instead.
 */
function IconAction({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-muted transition-colors ${
        danger
          ? "hover:border-danger-line hover:bg-danger-soft hover:text-danger"
          : "hover:border-accent-line hover:bg-accent-soft hover:text-accent-strong"
      }`}
    >
      <Icon d={icon} className="h-4 w-4" />
    </button>
  );
}

function CodeChip({ value }) {
  if (!value) return null;
  return (
    <span className="num rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-tight text-muted">
      {value}
    </span>
  );
}

/** Pieces, grams and what those grams are made of.
 *
 * The count is IN-STOCK only, which is what makes this screen answer "what do
 * I have" - a sold piece leaves this figure the moment it is billed, while
 * Inventory keeps listing it as SOLD. Two screens, two questions.
 */
function StockLine({ stock, small = false }) {
  const pcs = stock?.inStockCount ?? 0;
  const grams = stock?.inStockNetWeight ?? 0;
  const purities = (stock?.purityBreakdown ?? []).filter((p) => p.count > 0);
  const size = small ? "text-[10px]" : "text-[11px]";
  if (pcs === 0) {
    return <span className={`${size} font-semibold text-faint`}>No stock in hand</span>;
  }
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${size}`}>
      <span className="font-bold text-ink">
        <span className="num">{pcs}</span> {pcs === 1 ? "pc" : "pcs"}
      </span>
      <span className="text-faint">·</span>
      <span className="num font-bold text-ink">{grams.toFixed(3)} g</span>
      {purities.map((p) => (
        <span
          key={p.purity}
          className="rounded-full border border-accent-line bg-accent-soft/50 px-1.5 py-px font-bold text-accent-strong"
          title={`${p.count} piece(s) of ${p.purity}, ${p.netWeight.toFixed(3)} g`}
        >
          {p.purity} <span className="num font-extrabold">{p.count}</span>
          <span className="font-semibold text-muted"> · {p.netWeight.toFixed(3)} g</span>
        </span>
      ))}
    </div>
  );
}

/** Names compared the way a person reads them: case, spacing and punctuation
 * ignored, and a trailing plural folded away, so "Gold Ring" and "gold-rings"
 * are the same name. */
function normaliseName(v) {
  const base = String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return base.endsWith("s") ? base.slice(0, -1) : base;
}

/** Edit distance, capped - only used to catch a typo of an existing name. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** The existing category this name would duplicate, or null.
 *
 * Exact (normalised) matches are duplicates. So are near-misses: "Bnagles"
 * beside "Bangles" is a typo, and once both exist nobody can tell which one
 * the stock is filed under - which is the actual damage a duplicate does. */
function findConflictingCategory(name, categories, ignoreId) {
  const target = normaliseName(name);
  if (target.length < 2) return null;
  for (const c of categories) {
    if (c.id === ignoreId) continue;
    const other = normaliseName(c.name);
    if (other === target) return { category: c, exact: true };
    if (other.length >= 4 && editDistance(target, other) <= 1) {
      return { category: c, exact: false };
    }
  }
  return null;
}

export default function MasterInventory({ onNavigate, search = "" }) {
  const scope = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState([]);
  const [importable, setImportable] = useState([]);
  const [importing, setImporting] = useState(false);

  // Every category by default — the admin usually arrives to scan the list, not
  // to inspect one they have already decided on.
  const [focusId, setFocusId] = useState(ALL);
  const [query, setQuery] = useState("");

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
    } catch (err) {
      setLoadError(err?.message || "Could not load the category master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = (query || search).trim().toLowerCase();
  const shown = useMemo(() => {
    const scoped = focusId === ALL ? categories : categories.filter((c) => c.id === focusId);
    if (!q) return scoped;
    // A match on either level keeps the category visible, so searching for a
    // subcategory does not hide the parent it lives under.
    return scoped.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q) ||
        c.subcategories.some((s) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q))
    );
  }, [categories, focusId, q]);

  const categoryOptions = useMemo(
    () => [
      { value: ALL, label: `All categories (${categories.length})` },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories]
  );

  const openAddCategory = () => { setFormError(""); setForm({ mode: "category-add", name: "", code: "" }); };
  const openEditCategory = (c) => { setFormError(""); setForm({ mode: "category-edit", id: c.id, name: c.name, code: c.code }); };
  const openAddSubcategory = (categoryId) => {
    setFormError("");
    setForm({
      mode: "sub-add",
      categoryId: categoryId || (focusId !== ALL ? focusId : categories[0]?.id || ""),
      name: "",
      code: "",
    });
  };
  const openEditSubcategory = (s) => { setFormError(""); setForm({ mode: "sub-edit", id: s.id, categoryId: s.categoryId, name: s.name, code: s.code }); };

  async function submitForm() {
    if (!form) return;
    const name = form.name.trim();
    if (name.length < 2) { setFormError("Enter a name of at least 2 characters."); return; }
    if (form.mode.startsWith("sub") && !form.categoryId) { setFormError("Pick the category it belongs to."); return; }
    // Categories must stay unique - and not only letter-for-letter. Two
    // categories a person reads as the same word split the stock between them
    // and nobody can tell afterwards which one a piece is filed under.
    // Subcategories are deliberately NOT checked this way: the same
    // subcategory name under two different categories is legitimate.
    if (form.mode.startsWith("category")) {
      const clash = findConflictingCategory(name, categories, form.id);
      if (clash) {
        setFormError(
          clash.exact
            ? `"${clash.category.name}" already exists. Rename that one, or file this stock under it.`
            : `This is one character away from "${clash.category.name}". If they are meant to be the same, use that one; if not, give this a clearly different name.`
        );
        return;
      }
    }
    setSaving(true);
    setFormError("");
    try {
      if (form.mode === "category-add") {
        await masterInventoryService.createCategory({ name, code: form.code.trim() });
        toast(`Category added — ${name}`);
      } else if (form.mode === "category-edit") {
        await masterInventoryService.updateCategory(form.id, { name, code: form.code.trim() });
        toast(`Category renamed — ${name}`);
      } else if (form.mode === "sub-add") {
        await masterInventoryService.createSubcategory({ categoryId: form.categoryId, name, code: form.code.trim() });
        toast(`Subcategory added — ${name}`);
      } else {
        await masterInventoryService.updateSubcategory(form.id, { categoryId: form.categoryId, name, code: form.code.trim() });
        toast(`Subcategory renamed — ${name}`);
      }
      setForm(null);
      await load();
    } catch (err) {
      // The server's message is the real reason (duplicate name, missing
      // parent), so it is shown as-is rather than reworded here.
      setFormError(err?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing || removing.held > 0) return;
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

  /** The way forward when a delete is blocked: retire the name instead. */
  async function deactivateInstead() {
    if (!removing) return;
    setBusy(true);
    try {
      if (removing.kind === "category") {
        await masterInventoryService.updateCategory(removing.id, { name: removing.name, code: removing.code, isActive: false });
      } else {
        await masterInventoryService.updateSubcategory(removing.id, { name: removing.name, code: removing.code, isActive: false });
      }
      toast(`Deactivated — ${removing.name}. Existing items keep their label.`);
      setRemoving(null);
      await load();
    } catch (err) {
      toast(err?.message || "Could not deactivate");
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(kind, row) {
    setBusy(true);
    try {
      if (kind === "category") await masterInventoryService.updateCategory(row.id, { name: row.name, code: row.code, isActive: true });
      else await masterInventoryService.updateSubcategory(row.id, { name: row.name, code: row.code, isActive: true });
      toast(`Reactivated — ${row.name}`);
      await load();
    } catch (err) {
      toast(err?.message || "Could not reactivate");
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

  // Inventory reads these once on mount and applies its own filters.
  function viewItems(categoryName, subcategoryName) {
    try {
      sessionStorage.setItem(
        "dfx:inventoryFilter",
        JSON.stringify({ category: categoryName, subCategory: subcategoryName || "" })
      );
    } catch { /* a blocked storage must not stop the navigation */ }
    onNavigate?.("inventory");
  }

  return (
    <div ref={scope} className="mx-auto w-full max-w-[1000px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Master Inventory</h2>
          <p className="mt-1 text-sm text-muted">
            The categories and subcategories your stock is filed under.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openAddSubcategory()} disabled={categories.length === 0}
            title={categories.length === 0 ? "Add a category first" : "Add a subcategory to any category"}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            New subcategory
          </Button>
          <Button size="sm" onClick={openAddCategory}>
            <Icon d={ICON.plus} className="h-3.5 w-3.5" />
            New category
          </Button>
        </div>
      </div>

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

      {/* Two controls only: which category, and a search for a long list. */}
      <div data-motion="toolbar" className="mb-5 flex flex-wrap items-center gap-2.5">
        <Select value={focusId} onValueChange={setFocusId} options={categoryOptions} className="w-[240px]" />
        <SearchInput
          className="w-full max-w-xs sm:flex-1"
          placeholder="Search category or subcategory…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the category master"
        />
        {(query || focusId !== ALL) && (
          <button type="button" onClick={() => { setQuery(""); setFocusId(ALL); }} className="text-xs font-bold text-muted underline hover:text-ink">
            Reset
          </button>
        )}
      </div>

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
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Icon d={ICON.folder} className="h-5 w-5" />
          </span>
          <div className="mt-4 text-base font-extrabold">No categories yet</div>
          <p className="mx-auto mt-1.5 max-w-[42ch] text-sm text-muted">
            A category is the top level an item is filed under — Bangles, Chains, Rings. Subcategories
            go inside it.
          </p>
          <Button size="sm" className="mt-5" onClick={openAddCategory}>New category</Button>
        </Card>
      )}

      {!loading && !loadError && categories.length > 0 && shown.length === 0 && (
        <Card className="px-6 py-14 text-center">
          <div className="text-sm font-bold">Nothing matches “{q}”</div>
          <button type="button" onClick={() => { setQuery(""); setFocusId(ALL); }} className="mt-2 text-xs font-bold text-accent underline">
            Clear the search
          </button>
        </Card>
      )}

      <div className="grid gap-3">
        {!loading && !loadError && shown.map((cat) => (
          <Card key={cat.id} data-motion="reveal" className="overflow-hidden">
            {/* Category — name, code, and its own three actions. */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon d={ICON.folder} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-extrabold leading-tight">{cat.name}</h3>
                    <CodeChip value={cat.code} />
                    {!cat.isActive && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reactivate("category", cat)}
                        className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted transition-colors hover:border-accent-line hover:text-accent"
                        title="Not offered for new stock. Click to reactivate."
                      >
                        Inactive · reactivate
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {cat.subcategories.length === 0
                      ? "No subcategories"
                      : `${cat.subcategories.length} subcategor${cat.subcategories.length === 1 ? "y" : "ies"}`}
                  </p>
                  <div className="mt-1.5">
                    <StockLine stock={cat.stock} />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconAction icon={ICON.edit} label={`Rename ${cat.name}`} onClick={() => openEditCategory(cat)} />
                <IconAction
                  icon={ICON.trash}
                  label={`Delete ${cat.name}`}
                  danger
                  onClick={() => setRemoving({ kind: "category", id: cat.id, name: cat.name, code: cat.code, held: cat.stock.totalItemCount })}
                />
              </div>
            </div>

            {cat.subcategories.length > 0 && (
              <ul className="border-t border-line-soft">
                {cat.subcategories.map((sub) => (
                  <li key={sub.id} className="group flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-2.5 pl-[4.25rem] last:border-0 transition-colors hover:bg-canvas/50">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-2.5">
                      <Icon d={ICON.tag} className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="truncate text-sm font-semibold">{sub.name}</span>
                      <CodeChip value={sub.code} />
                      {!sub.isActive && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reactivate("subcategory", sub)}
                          className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted transition-colors hover:border-accent-line hover:text-accent"
                          title="Not offered for new stock. Click to reactivate."
                        >
                          Inactive · reactivate
                        </button>
                      )}
                      </div>
                      <StockLine stock={sub.stock} small />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconAction icon={ICON.eye} label={`View ${sub.name} items in Inventory`} onClick={() => viewItems(cat.name, sub.name)} />
                      <IconAction icon={ICON.edit} label={`Rename ${sub.name}`} onClick={() => openEditSubcategory(sub)} />
                      <IconAction
                        icon={ICON.trash}
                        label={`Delete ${sub.name}`}
                        danger
                        onClick={() => setRemoving({ kind: "subcategory", id: sub.id, name: sub.name, code: sub.code, held: sub.stock.totalItemCount })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      {/* One dialog for all four write actions — the fields are identical, and a
          near-copy of this form would drift from it. */}
      {form && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mi-form-title">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pb-4 pt-5">
              <h3 id="mi-form-title" className="text-base font-extrabold">
                {form.mode === "category-add" ? "New category"
                  : form.mode === "category-edit" ? "Rename category"
                  : form.mode === "sub-add" ? "New subcategory"
                  : "Rename subcategory"}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {form.mode.endsWith("edit")
                  ? "Renaming also relabels the items holding the old name, so nothing loses its category."
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
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
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

      {/* Delete. When items still carry the name the dialog says exactly why it
          cannot go ahead and offers the action that can — a greyed-out button
          would only leave the admin guessing. */}
      {removing && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mi-del-title">
          <div className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pt-5">
              <div className={`text-[11px] font-extrabold uppercase tracking-[0.08em] ${removing.held > 0 ? "text-muted" : "text-danger"}`}>
                {removing.held > 0 ? `Cannot delete this ${removing.kind}` : `Delete ${removing.kind}`}
              </div>
              <h4 id="mi-del-title" className="mt-1 text-base font-extrabold">{removing.name}</h4>
              {removing.held > 0 ? (
                <>
                  <p className="mt-2 text-sm text-ink">
                    <span className="num font-bold">{removing.held}</span> item{removing.held === 1 ? "" : "s"} {removing.held === 1 ? "is" : "are"} filed under this name — sold and retired ones included, because their invoices still show it.
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Deleting it would leave those items without a category. Deactivate it instead: it
                    stops being offered for new stock, and every existing item keeps its label.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  No item carries this name, so it can be removed cleanly.
                  {removing.kind === "category" ? " Its subcategories go with it." : ""} This cannot be undone.
                </p>
              )}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button>
              {removing.held > 0 ? (
                <Button size="sm" disabled={busy} onClick={deactivateInstead}>{busy ? "Deactivating…" : "Deactivate instead"}</Button>
              ) : (
                <Button size="sm" className="bg-danger text-white hover:bg-danger/90" disabled={busy} onClick={confirmRemove}>
                  {busy ? "Deleting…" : "Delete"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
