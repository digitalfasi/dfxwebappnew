"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ShoppingBag } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function ProductDetailPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <button
        onClick={() => router.push('/customer/catalogue')}
        className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold transition-colors duration-150"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <ComingSoonPlaceholder
        icon={<ShoppingBag className="w-7 h-7" />}
        title="Catalogue Coming Soon"
        description="Product details aren't available yet. This feature will be available in a future release."
      />
    </div>
  );
}
