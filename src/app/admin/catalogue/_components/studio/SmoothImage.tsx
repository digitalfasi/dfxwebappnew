"use client";

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SmoothImageProps {
  src: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * The center canvas's core guarantee — "the preview must never disappear" —
 * comes from this component, not from CSS alone. A plain `<img src={x}>`
 * blanks to nothing the instant `src` changes, while the browser fetches
 * the new one; this preloads the next image off-screen first (a real
 * `Image()` preload, not a data attribute) and only swaps what's on screen
 * once it has fully loaded, so the previous frame stays visible the entire
 * time. The swap itself fades in via `animate-fade-in` (see globals.css).
 */
export const SmoothImage: React.FC<SmoothImageProps> = React.memo(({ src, alt, className, fallback }) => {
  const [displaySrc, setDisplaySrc] = useState<string | null>(src);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(null);
      return;
    }
    if (src === displaySrc) return;
    let cancelled = false;
    const preload = new Image();
    preload.src = src;
    const swap = () => {
      if (!cancelled) setDisplaySrc(src);
    };
    if (preload.complete) {
      // Already in the browser's own cache (e.g. re-selecting a previously
      // viewed image) — swap immediately, no need to wait on a load event.
      swap();
    } else {
      preload.onload = swap;
      preload.onerror = swap; // still swap so a broken image shows its alt text rather than getting stuck on the old one forever
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!displaySrc) return <>{fallback ?? null}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={displaySrc} src={displaySrc} alt={alt} className={cn('animate-fade-in', className)} />
  );
});
SmoothImage.displayName = 'SmoothImage';
