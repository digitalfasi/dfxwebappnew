"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { useGoldRate } from '@/hooks/useGoldRate';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

export const RateTicker: React.FC = () => {
  const router = useRouter();
  const { goldRate, silverRate } = useGoldRate();

  return (
    <div
      onClick={() => router.push('/customer/rates')}
      className="flex items-center justify-between bg-white border border-slate-line rounded-xl px-3.5 py-2.5 shadow-sm cursor-pointer hover:border-gold transition-colors mb-4"
    >
      <div className="flex items-center gap-2 text-xs font-bold">
        <span>🥇 Gold</span>
        <span className="text-ink">{formatCurrency(goldRate.price24k)}/g</span>
        <Badge variant={goldRate.up ? "success" : "danger"}>
          {goldRate.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {goldRate.change24h}%
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-xs font-bold">
        <span>🥈 Silver</span>
        <span className="text-ink">₹{silverRate.price999}/g</span>
        <Badge variant={silverRate.up ? "success" : "danger"}>
          {silverRate.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(silverRate.change24h)}%
        </Badge>
      </div>
    </div>
  );
};
