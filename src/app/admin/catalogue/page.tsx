"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package, ImageOff, Wand2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/shared/ErrorState';
import { catalogueService, Product } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';

/**
 * Catalogue Studio — Product Studio redesign. This page is now just the
 * product grid: a single guided per-product wizard
 * (/admin/catalogue/studio/[productId]) replaced the previous 6-tab layout
 * (Products / Media Library / AI Enhancement / Templates / Marketing
 * Assets / Generated Catalogue). Every real capability those tabs exposed
 * is still reachable — Templates and rendering live in the wizard's Steps
 * 4-6 — except the AI Enhancement tab, which was a stub for a still-
 * unconfigured AI provider and has no place in this offline-only redesign.
 */
export default function CatalogueStudioPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProducts(await catalogueService.getProducts());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = products.filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
              Catalogue Studio
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-[10px] font-bold text-gold-dark uppercase tracking-wide">
              Product Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            One guided flow per product — details, images, editing, templates, preview, and publish.
          </p>
        </div>
        <Button onClick={() => router.push('/admin/catalogue/studio/new')} className="gap-1.5 shrink-0">
          <Wand2 className="w-4 h-4" />
          <span>New Product</span>
        </Button>
      </div>

      {/* SEARCH */}
      {!loading && !loadError && products.length > 0 && (
        <div className="max-w-sm">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" />
        </div>
      )}

      {/* PRODUCT GRID */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && loadError && <ErrorState message={loadError} onRetry={loadProducts} />}

      {!loading && !loadError && products.length === 0 && (
        <Card>
          <EmptyState
            icon={<Package className="h-7 w-7 text-gold" />}
            title="No products yet"
            description="Start the guided Product Studio to add your first jewellery product."
            actionLabel="New Product"
            onAction={() => router.push('/admin/catalogue/studio/new')}
          />
        </Card>
      )}

      {!loading && !loadError && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <Card
              key={product.id}
              hoverable
              onClick={() => router.push(`/admin/catalogue/studio/${product.id}`)}
              className="overflow-hidden cursor-pointer group"
            >
              <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                {product.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.primaryImageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <ImageOff className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <div className="p-3.5">
                <p className="text-sm font-bold text-[#0B0E23] truncate">{product.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {product.imageCount} image{product.imageCount === 1 ? '' : 's'}
                  </span>
                  {!product.isActive && <Badge variant="inactive">Inactive</Badge>}
                </div>
                {(product.purity || product.price) && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {product.purity && <Badge variant="gold">{product.purity}</Badge>}
                    {product.price != null && (
                      <span className="text-[11px] font-bold text-slate-600">₹{product.price.toLocaleString('en-IN')}</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-xs text-slate-400 py-8">No products match &quot;{search}&quot;.</p>
          )}
        </div>
      )}
    </div>
  );
}
