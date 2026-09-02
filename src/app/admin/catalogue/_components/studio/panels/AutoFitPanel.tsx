"use client";

import React from 'react';
import { ArrowRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudio } from '../StudioContext';
import { AutoFitSection } from '../sections/AutoFitSection';

export const AutoFitPanel: React.FC = React.memo(() => {
  const { product, setCurrentStep } = useStudio();
  const hasImages = (product?.images ?? []).some((i) => i.variantType === 'ORIGINAL' || i.variantType === 'EDITED');

  if (!hasImages) {
    return (
      <div className="py-8 text-center border border-dashed border-slate-200 rounded-2xl">
        <ImageOff className="w-6 h-6 text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500 font-medium mb-3">Upload at least one image first.</p>
        <Button size="sm" variant="outline" onClick={() => setCurrentStep(1)}>Back to Upload Images</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AutoFitSection />
      <Button onClick={() => setCurrentStep(3)} className="w-full gap-1.5">
        <span>Continue to Image Processing</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});
AutoFitPanel.displayName = 'AutoFitPanel';
