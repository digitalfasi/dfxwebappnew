"use client";

import React from 'react';
import { Gauge } from 'lucide-react';
import { Collapsible } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useStudio } from '../StudioContext';
import type { RenderQuality } from '@/services/catalogueService';

const LEVELS: { key: RenderQuality; label: string; hint: string }[] = [
  { key: 'STANDARD', label: 'Standard', hint: 'Smaller files, faster' },
  { key: 'HIGH', label: 'High', hint: 'Recommended' },
  { key: 'ULTRA', label: 'Ultra', hint: 'Best quality' },
];

/** Quality — a real JPEG-quality render parameter (catalogue_render_service
 * .render_canvas()'s `quality`), not a cosmetic label. */
export const QualitySection: React.FC = () => {
  const { quality, setQuality } = useStudio();

  return (
    <Collapsible title="Quality" icon={Gauge}>
      <div className="grid grid-cols-3 gap-2.5">
        {LEVELS.map(({ key, label, hint }) => (
          <button
            key={key}
            onClick={() => setQuality(key)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-3 rounded-xl border transition-all duration-150',
              quality === key
                ? 'bg-gold text-white border-gold shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:border-gold/50'
            )}
          >
            <span className="text-xs font-bold">{label}</span>
            <span className={cn('text-[9px]', quality === key ? 'text-white/80' : 'text-slate-400')}>{hint}</span>
          </button>
        ))}
      </div>
    </Collapsible>
  );
};
