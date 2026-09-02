"use client";

import React from 'react';
import { STUDIO_STEPS, useStudio } from '../StudioContext';
import { ProductDetailsPanel } from '../panels/ProductDetailsPanel';
import { UploadImagesPanel } from '../panels/UploadImagesPanel';
import { AutoFitPanel } from '../panels/AutoFitPanel';
import { ImageProcessingPanel } from '../panels/ImageProcessingPanel';
import { TemplatesPanel } from '../panels/TemplatesPanel';
import { PreviewExportPanel } from '../panels/PreviewExportPanel';

interface StudioRightPanelProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const STEP_HINTS = [
  'The essentials — this becomes a real, saved product the moment you continue.',
  'Drag & drop multiple photos, tag each with a shot angle.',
  'Trim empty space, center, or scale the product within the frame.',
  'Fine-tune the image, then set background, quality & watermark.',
  'Pick a design template — it renders live in the canvas.',
  'Compare, save a version, export, or generate a PDF.',
];

/**
 * The ONLY region that changes per step (besides the canvas's own content).
 * The header/nav/canvas around it stay exactly as they were — this
 * component just swaps its children, it never touches the rest of the
 * workspace tree.
 */
export const StudioRightPanel: React.FC<StudioRightPanelProps> = React.memo(({ onToast }) => {
  const { currentStep } = useStudio();

  let content: React.ReactNode;
  switch (currentStep) {
    case 0:
      content = <ProductDetailsPanel onToast={onToast} />;
      break;
    case 1:
      content = <UploadImagesPanel onToast={onToast} />;
      break;
    case 2:
      content = <AutoFitPanel />;
      break;
    case 3:
      content = <ImageProcessingPanel />;
      break;
    case 4:
      content = <TemplatesPanel />;
      break;
    default:
      content = <PreviewExportPanel onToast={onToast} />;
  }

  return (
    <aside className="w-[380px] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <h2 className="font-display font-bold text-sm text-ink">{STUDIO_STEPS[currentStep]}</h2>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-relaxed">{STEP_HINTS[currentStep]}</p>
      </div>
      <div key={currentStep} className="flex-1 overflow-y-auto px-5 py-4 animate-fade-in-up">
        {content}
      </div>
    </aside>
  );
});
StudioRightPanel.displayName = 'StudioRightPanel';
