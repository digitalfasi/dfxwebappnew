"use client";

import React from 'react';
import { SlidersHorizontal, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Collapsible } from '@/components/ui/collapsible';
import { useStudio } from '../StudioContext';

/**
 * Image — Crop/Rotate/Flip/Brightness/Contrast/Saturation/Sharpness/White
 * Balance/Noise Reduction, all via Phase A's real, local Pillow/OpenCV
 * pipeline (POST .../edit/preview for the live preview, .../edit/save to
 * persist as a new EDITED variant — see StudioContext).
 */
export const ImageAdjustSection: React.FC = () => {
  const { editOperations, applyEditOperation, removeEditOperationType } = useStudio();
  const whiteBalanceApplied = editOperations.some((o) => o.type === 'WHITE_BALANCE');

  const valueFor = (type: string, key: string, fallback: number) => {
    const op = editOperations.find((o) => o.type === type) as any;
    return op?.[key] ?? fallback;
  };

  return (
    <Collapsible title="Image" icon={SlidersHorizontal} defaultOpen>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => applyEditOperation({ type: 'ROTATE', degrees: valueFor('ROTATE', 'degrees', 0) + 90 })}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate 90°</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => applyEditOperation({ type: 'FLIP', axis: 'HORIZONTAL' }, { stack: true })}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span>Flip H</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => applyEditOperation({ type: 'FLIP', axis: 'VERTICAL' }, { stack: true })}
          >
            <FlipVertical className="w-3.5 h-3.5" />
            <span>Flip V</span>
          </Button>
        </div>

        <Slider
          label="Rotation"
          min={-180}
          max={180}
          step={1}
          value={valueFor('ROTATE', 'degrees', 0)}
          formatValue={(v) => `${v}°`}
          onChange={(v) => applyEditOperation({ type: 'ROTATE', degrees: v })}
        />

        <Slider
          label="Brightness"
          min={0}
          max={2}
          step={0.05}
          value={valueFor('BRIGHTNESS', 'factor', 1)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => applyEditOperation({ type: 'BRIGHTNESS', factor: v })}
        />

        <Slider
          label="Contrast"
          min={0}
          max={2}
          step={0.05}
          value={valueFor('CONTRAST', 'factor', 1)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => applyEditOperation({ type: 'CONTRAST', factor: v })}
        />

        <Slider
          label="Saturation"
          min={0}
          max={2}
          step={0.05}
          value={valueFor('SATURATION', 'factor', 1)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => applyEditOperation({ type: 'SATURATION', factor: v })}
        />

        <Slider
          label="Sharpness"
          min={0}
          max={3}
          step={0.1}
          value={valueFor('SHARPNESS', 'factor', 1)}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => applyEditOperation({ type: 'SHARPNESS', factor: v })}
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">White Balance</span>
          <Button
            size="sm"
            variant={whiteBalanceApplied ? 'primary' : 'outline'}
            onClick={() =>
              whiteBalanceApplied
                ? removeEditOperationType('WHITE_BALANCE')
                : applyEditOperation({ type: 'WHITE_BALANCE' })
            }
          >
            {whiteBalanceApplied ? 'Applied — Click to Undo' : 'Auto Correct'}
          </Button>
        </div>

        <Slider
          label="Noise Reduction"
          min={0}
          max={30}
          step={1}
          value={valueFor('NOISE_REDUCTION', 'strength', 0)}
          formatValue={(v) => (v === 0 ? 'Off' : `${v}`)}
          onChange={(v) =>
            v === 0
              ? applyEditOperation({ type: 'NOISE_REDUCTION', strength: 0.01 })
              : applyEditOperation({ type: 'NOISE_REDUCTION', strength: v })
          }
        />
      </div>
    </Collapsible>
  );
};
