"use client";

import React, { useMemo } from 'react';
import { Check, FileText, UploadCloud, Scan, SlidersHorizontal, LayoutTemplate, Download, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STUDIO_STEPS, useStudio } from '../StudioContext';

const STEP_ICONS = [FileText, UploadCloud, Scan, SlidersHorizontal, LayoutTemplate, Download];

const STEP_DESCRIPTIONS = [
  'Name, category & pricing',
  'Add product photography',
  'Trim, center & size',
  'Adjust, background & quality',
  'Pick a design template',
  'Compare, save & export',
];

/**
 * Vertical step nav — always mounted, alongside the header and canvas.
 * Replaces the old horizontal pill row with a Canva-style sidebar: icon +
 * label + one-line hint + progress. Clicking an unlocked step only updates
 * `currentStep` (no navigation), so the canvas next to it never remounts.
 */
export const StudioLeftNav: React.FC = React.memo(() => {
  const { currentStep, setCurrentStep, furthestUnlockedStep, isNewProduct } = useStudio();

  const progressPercent = useMemo(
    () => Math.round(((furthestUnlockedStep + 1) / STUDIO_STEPS.length) * 100),
    [furthestUnlockedStep]
  );

  return (
    <nav className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Progress</span>
          <span className="text-[11px] font-bold text-gold-dark">{progressPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex-1 px-2.5 pb-4 space-y-1">
        {STUDIO_STEPS.map((label, index) => {
          const Icon = STEP_ICONS[index];
          const isActive = index === currentStep;
          const isDone = index < furthestUnlockedStep;
          const isUnlocked = index <= furthestUnlockedStep;
          const isCreateGate = index === 0 && isNewProduct;

          return (
            <button
              key={label}
              onClick={() => isUnlocked && setCurrentStep(index)}
              disabled={!isUnlocked}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                isActive
                  ? 'bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/30 shadow-sm'
                  : isUnlocked
                    ? 'border border-transparent hover:bg-slate-50 cursor-pointer'
                    : 'border border-transparent cursor-not-allowed opacity-50'
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-150',
                  isActive
                    ? 'bg-gold text-white shadow-glow'
                    : isDone
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                )}
              >
                {isDone && !isActive ? (
                  <Check className="w-4 h-4" />
                ) : !isUnlocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className={cn('block text-xs font-bold truncate', isActive ? 'text-ink' : 'text-slate-700')}>
                  {label}
                </span>
                <span className="block text-[10.5px] text-slate-400 font-medium truncate">
                  {isCreateGate ? 'Creates the product' : STEP_DESCRIPTIONS[index]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
StudioLeftNav.displayName = 'StudioLeftNav';
