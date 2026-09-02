"use client";

import { useState } from 'react';
import { GoldRate, SilverRate } from '@/types';
import { INITIAL_GOLD_RATE, INITIAL_SILVER_RATE } from '@/constants';

export function useGoldRate() {
  const [goldRate] = useState<GoldRate>(INITIAL_GOLD_RATE);
  const [silverRate] = useState<SilverRate>(INITIAL_SILVER_RATE);

  return {
    goldRate,
    silverRate,
  };
}
