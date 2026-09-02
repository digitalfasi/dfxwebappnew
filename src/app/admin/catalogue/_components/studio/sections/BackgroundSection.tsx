"use client";

import React from 'react';
import { PaintBucket, Check } from 'lucide-react';
import { Collapsible } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useStudio } from '../StudioContext';
import type { BackgroundReplaceMode } from '@/services/catalogueService';

interface Preset {
  key: string;
  label: string;
  mode: BackgroundReplaceMode;
  color?: string;
  gradientColor2?: string;
  swatchClass: string;
}

const PRESETS: Preset[] = [
  { key: 'WHITE', label: 'White', mode: 'WHITE', swatchClass: 'bg-white border border-slate-300' },
  { key: 'LUXURY_WHITE', label: 'Luxury White', mode: 'CUSTOM', color: '#FAF7F0', swatchClass: 'bg-[#FAF7F0] border border-slate-300' },
  { key: 'DARK', label: 'Dark', mode: 'BLACK', swatchClass: 'bg-[#0A0A0A]' },
  {
    key: 'GRADIENT',
    label: 'Gradient',
    mode: 'GRADIENT',
    color: '#FDEDE4',
    gradientColor2: '#F5D6BA',
    swatchClass: 'bg-gradient-to-br from-[#FDEDE4] to-[#F5D6BA]',
  },
  { key: 'TRANSPARENT', label: 'Transparent', mode: 'TRANSPARENT', swatchClass: 'bg-[repeating-conic-gradient(#e2e8f0_0_25%,white_0_50%)] bg-[length:10px_10px]' },
];

export const BackgroundSection: React.FC = () => {
  const { editOperations, applyEditOperation, removeEditOperationType } = useStudio();
  const current = editOperations.find((o) => o.type === 'BACKGROUND_REPLACE');
  const [customColor, setCustomColor] = React.useState('#D4AF37');

  const applyPreset = (preset: Preset) => {
    applyEditOperation({
      type: 'BACKGROUND_REPLACE',
      mode: preset.mode,
      color: preset.color,
      gradient_color_2: preset.gradientColor2,
    });
  };

  const isActive = (preset: Preset) =>
    current?.mode === preset.mode && (preset.mode !== 'CUSTOM' || current?.color === preset.color);

  return (
    <Collapsible
      title="Background"
      icon={PaintBucket}
      badge={
        current && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Active</span>
        )
      }
    >
      <p className="text-[11px] text-slate-500 -mt-1">
        Classical-CV background replacement — a best-effort approximation on plain-backdrop product shots, not a
        pixel-perfect AI cutout.
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => applyPreset(preset)}
            className={cn(
              'relative rounded-xl overflow-hidden h-14 flex items-center justify-center transition-all duration-150',
              preset.swatchClass,
              isActive(preset) ? 'ring-2 ring-gold ring-offset-2' : 'hover:ring-2 hover:ring-slate-200'
            )}
            title={preset.label}
          >
            {isActive(preset) && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        ))}
        <div
          className={cn(
            'relative rounded-xl overflow-hidden h-14 flex items-center justify-center transition-all duration-150 border border-slate-200',
            current?.mode === 'CUSTOM' && current?.color === customColor ? 'ring-2 ring-gold ring-offset-2' : ''
          )}
          style={{ backgroundColor: customColor }}
        >
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            onBlur={() => applyEditOperation({ type: 'BACKGROUND_REPLACE', mode: 'CUSTOM', color: customColor })}
            className="absolute inset-0 opacity-0 cursor-pointer"
            title="Custom color"
          />
          <span className="text-[9px] font-bold text-white drop-shadow">Custom</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 text-center">
        {[...PRESETS.map((p) => p.label), 'Custom'].map((label) => (
          <span key={label} className="text-[10px] font-semibold text-slate-500">{label}</span>
        ))}
      </div>
      {current && (
        <button
          onClick={() => removeEditOperationType('BACKGROUND_REPLACE')}
          className="text-[11px] font-bold text-slate-500 hover:text-red-600 transition-colors"
        >
          Remove background replacement
        </button>
      )}
    </Collapsible>
  );
};
