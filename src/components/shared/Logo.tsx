import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
  /** Tailwind height utility controlling the wrapper's height (e.g. "h-10",
   * "h-14") — callers range from "h-8" in a collapsed sidebar to "h-20" on
   * the login page. The wordmark itself is a fixed, legible size and
   * simply centers within whatever height is given, rather than scaling
   * pixel-for-pixel with it (a plain CSS height utility can't drive a
   * proportional font-size without a container-query setup this codebase
   * doesn't otherwise need for one component). */
  className?: string;
}

/**
 * A real, working text wordmark — not a placeholder awaiting a real asset.
 * No `/dfx-logo.png` (or any other image) exists anywhere in this repo, so
 * an `<img>` tag here would be a broken reference on every page that
 * renders it (login, signup, reset-password, verify-email, both sidebars —
 * confirmed via a full-repo search during the GitHub-readiness audit).
 * This renders unconditionally, needs no static asset, and is a drop-in
 * swap for an `<img>`-based version later: only this file would change.
 */
export const Logo: React.FC<LogoProps> = ({ className = 'h-10' }) => (
  <div className={cn('inline-flex items-center gap-2', className)} role="img" aria-label="DFX Solution">
    <span className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-gold via-gold-light to-gold-dark text-white font-display font-extrabold text-[11px] leading-none shadow-sm">
      DFX
    </span>
    <span className="font-display font-extrabold text-base leading-none text-ink whitespace-nowrap">
      Solution
    </span>
  </div>
);
