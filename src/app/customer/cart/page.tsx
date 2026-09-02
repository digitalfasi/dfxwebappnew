"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ShoppingBag } from 'lucide-react';
import { ComingSoonPlaceholder } from '@/components/shared/ComingSoonPlaceholder';

export default function CartPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/customer/catalogue')}
          className="flex items-center gap-1 text-xs font-bold text-slate hover:text-ink transition-colors duration-150"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back to Catalogue</span>
        </button>
      </div>

      <ComingSoonPlaceholder
        icon={<ShoppingBag className="w-7 h-7" />}
        title="Cart Coming Soon"
        description="Shopping cart and checkout aren't available yet. This feature will be available in a future release."
      />
    </div>
  );
}
