"use client";

import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function CataloguePage() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div>
        <h1 className="font-display font-bold text-base text-ink">Catalogue</h1>
        <p className="text-[11px] text-slate-muted">Certified Hallmark Gold & Fine Diamonds</p>
      </div>

      <ComingSoonPlaceholder
        icon={<ShoppingBag className="w-7 h-7" />}
        title="Catalogue Coming Soon"
        description="Browsing and shopping for jewellery pieces isn't available yet. This feature will be available in a future release."
      />
    </div>
  );
}
