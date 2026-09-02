"use client";

import React from 'react';
import { ArrowRight, Check, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useStudio } from '../StudioContext';

// Quick visual swatch per template key so the gallery browses fast without
// firing a real render call per tile — the real backend render only runs
// for whichever template is actually selected (drawn live in the canvas).
const SWATCH_CLASS: Record<string, string> = {
  LUXURY_WHITE: 'bg-white border-2 border-gold/60',
  LUXURY_BLACK: 'bg-[#0A0A0A] border-2 border-gold',
  ROYAL_BLUE: 'bg-gradient-to-br from-[#0B1F3A] to-[#1E3A6E] border-2 border-gold/50',
  WEDDING: 'bg-gradient-to-br from-rose-50 to-amber-50 border-2 border-rose-200',
  FESTIVAL: 'bg-gradient-to-br from-amber-100 via-orange-100 to-red-100 border-2 border-amber-300',
  INSTAGRAM: 'bg-gradient-to-br from-fuchsia-50 via-rose-50 to-amber-50 border-2 border-fuchsia-200',
  WHATSAPP: 'bg-emerald-50 border-2 border-emerald-300',
  SQUARE: 'bg-slate-50 border-2 border-slate-200',
  PORTRAIT: 'bg-slate-50 border-2 border-slate-200',
  LANDSCAPE: 'bg-slate-50 border-2 border-slate-200',
};

export const TemplatesPanel: React.FC = React.memo(() => {
  const { effectiveImage, selectedTemplateKey, selectTemplate, setCurrentStep, templates, templatesLoading } =
    useStudio();

  if (templatesLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">Selecting a template renders it live in the canvas.</p>
      <div className="grid grid-cols-2 gap-3">
        {templates.map((tpl) => {
          const isSelected = selectedTemplateKey === tpl.key;
          return (
            <button
              key={tpl.key}
              onClick={() => selectTemplate(tpl.key, tpl.canvas)}
              className="flex flex-col gap-1.5 text-left"
            >
              <div
                className={cn(
                  'relative aspect-square rounded-xl overflow-hidden flex items-center justify-center transition-all duration-150',
                  SWATCH_CLASS[tpl.key] ?? 'bg-slate-50 border-2 border-slate-200',
                  isSelected ? 'ring-2 ring-gold ring-offset-2' : 'hover:ring-2 hover:ring-slate-200'
                )}
              >
                {effectiveImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effectiveImage.url} alt={tpl.label} className="w-3/5 h-3/5 object-contain drop-shadow-md" />
                ) : (
                  <ImageOff className="w-5 h-5 opacity-30" />
                )}
                {isSelected && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <p className="text-[10.5px] font-bold text-ink text-center truncate">{tpl.label}</p>
            </button>
          );
        })}
      </div>

      <Button onClick={() => setCurrentStep(5)} disabled={!selectedTemplateKey} className="w-full gap-1.5">
        <span>Continue to Preview & Export</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});
TemplatesPanel.displayName = 'TemplatesPanel';
