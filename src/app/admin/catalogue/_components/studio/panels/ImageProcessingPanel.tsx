"use client";

import React from 'react';
import { ArrowRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudio } from '../StudioContext';
import { ImageAdjustSection } from '../sections/ImageAdjustSection';
import { BackgroundSection } from '../sections/BackgroundSection';
import { QualitySection } from '../sections/QualitySection';
import { WatermarkSection } from '../sections/WatermarkSection';

export const ImageProcessingPanel: React.FC = React.memo(() => {
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
    <div className="space-y-3">
      <ImageAdjustSection />
      <BackgroundSection />
      <QualitySection />
      <WatermarkSection />
      <Button onClick={() => setCurrentStep(4)} className="w-full gap-1.5">
        <span>Continue to Templates</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});
ImageProcessingPanel.displayName = 'ImageProcessingPanel';
