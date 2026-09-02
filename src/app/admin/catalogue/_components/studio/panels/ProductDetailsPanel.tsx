"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-controls';
import { catalogueService, ProductFormData } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { useStudio } from '../StudioContext';

interface PanelProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export const ProductDetailsPanel: React.FC<PanelProps> = React.memo(({ onToast }) => {
  const router = useRouter();
  const { product, isNewProduct, setProduct, setCurrentStep } = useStudio();

  const [form, setForm] = useState<ProductFormData>({
    name: product?.name ?? '',
    category: product?.category ?? '',
    sku: product?.sku ?? '',
    purity: product?.purity ?? '',
    price: product?.price ?? undefined,
    weightGrams: product?.weightGrams ?? undefined,
    description: product?.description ?? '',
    tags: product?.tags ?? [],
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!(form.tags ?? []).includes(tag)) {
      setForm((f) => ({ ...f, tags: [...(f.tags ?? []), tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.name.trim().length < 2) {
      onToast('Product name must be at least 2 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = isNewProduct
        ? await catalogueService.createProduct(form)
        : await catalogueService.updateProduct(product!.id, form);
      setProduct(saved);
      if (isNewProduct) {
        router.replace(`/admin/catalogue/studio/${saved.id}`);
      }
      onToast('Product details saved');
      setCurrentStep(1);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save product details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
          Product Name <span className="text-red-500">*</span>
        </label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Royal Kundan Necklace"
          required
          minLength={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Category</label>
          <Input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Necklace, Ring…"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">SKU</label>
          <Input
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            placeholder="RKN-2201"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Purity</label>
          <Input
            value={form.purity}
            onChange={(e) => setForm({ ...form, purity: e.target.value })}
            placeholder="22K, 916"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Weight (g)</label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.weightGrams ?? ''}
            onChange={(e) => setForm({ ...form, weightGrams: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Price (₹)</label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={form.price ?? ''}
          onChange={(e) => setForm({ ...form, price: e.target.value ? parseFloat(e.target.value) : undefined })}
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Craftsmanship notes, occasion, styling tips…"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Tags</label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Type & press Enter"
          />
          <Button type="button" variant="outline" size="default" onClick={addTag} className="shrink-0">
            <Tag className="w-3.5 h-3.5" />
          </Button>
        </div>
        {(form.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {(form.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold"
              >
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" isLoading={saving} className="w-full gap-1.5">
        <span>{isNewProduct ? 'Create & Continue' : 'Save & Continue'}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </form>
  );
});
ProductDetailsPanel.displayName = 'ProductDetailsPanel';
