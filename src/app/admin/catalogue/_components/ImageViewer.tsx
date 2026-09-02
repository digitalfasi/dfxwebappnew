"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCcw,
  Columns2,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The primary image being viewed. */
  imageUrl: string;
  imageLabel?: string;
  /** If provided, a "Compare" toggle appears letting the user reveal this
   * image via a draggable slider over the primary one (e.g. Original vs
   * Enhanced) — Module 21 Phase 7's explicit requirement. */
  compareUrl?: string;
  compareLabel?: string;
}

const ZOOM_STEP = 0.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageLabel,
  compareUrl,
  compareLabel,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [sliderPercent, setSliderPercent] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset transient view state every time a different image is opened.
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setCompareMode(false);
      setSliderPercent(50);
    }
  }, [isOpen, imageUrl]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + (e.deltaY < 0 ? 0.25 : -0.25))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  };

  const stopPanning = () => setIsPanning(false);

  const handleSliderDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPercent(Math.min(100, Math.max(0, percent)));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="text-white text-xs font-bold">
          {compareMode ? `${compareLabel ?? 'Before'} vs ${imageLabel ?? 'After'}` : imageLabel}
        </div>
        <div className="flex items-center gap-1.5">
          {compareUrl && (
            <button
              onClick={() => setCompareMode((c) => !c)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                compareMode ? 'bg-gold text-white' : 'text-white/80 hover:bg-white/10'
              )}
              title="Compare original vs this version"
            >
              <Columns2 className="w-4 h-4" />
            </button>
          )}
          {!compareMode && (
            <>
              <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors" title="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors" title="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors" title="Reset zoom">
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={toggleFullscreen} className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors" title="Fullscreen">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors ml-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* VIEWER */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden bg-black">
        {compareMode && compareUrl ? (
          <div
            className="relative w-full h-full max-w-4xl max-h-[80vh] mx-auto cursor-col-resize select-none"
            onMouseMove={handleSliderDrag}
            onClick={handleSliderDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={compareUrl} alt={compareLabel ?? 'Before'} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{ clipPath: `inset(0 ${100 - sliderPercent}% 0 0)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={imageLabel ?? 'After'} className="w-full h-full object-contain" />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
              style={{ left: `${sliderPercent}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg">
                <Columns2 className="w-4 h-4 text-[#0B0E23]" />
              </div>
            </div>
            <span className="absolute bottom-3 left-3 text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded-full">
              {compareLabel ?? 'Before'}
            </span>
            <span className="absolute bottom-3 right-3 text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded-full">
              {imageLabel ?? 'After'}
            </span>
          </div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={stopPanning}
            onMouseLeave={stopPanning}
            style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={imageLabel ?? 'Preview'}
                className="max-w-full max-h-[80vh] object-contain transition-transform duration-100 select-none"
                style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
                draggable={false}
              />
            ) : (
              <ImageIcon className="w-12 h-12 text-white/30" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
