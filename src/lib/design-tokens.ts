/**
 * DFX Solution Design Tokens
 * Centralized design source of truth for colors, typography, spacing, shadows, and radii.
 */

export const DESIGN_TOKENS = {
  colors: {
    primary: {
      default: '#2C6FBD',
      light: '#60A3E6',
      dark: '#1E4E8C',
      dim: 'rgba(44,111,189, 0.14)',
      border: 'rgba(44,111,189, 0.28)',
    },
    secondary: {
      default: '#0B0E23',
      light: '#151C3A',
      soft: '#2A3352',
    },
    background: {
      warm: '#F7F8FC',
      canvas: '#ECEEF7',
      surface: '#FFFFFF',
    },
    status: {
      success: {
        text: '#15803D',
        bg: '#F0FDF4',
        border: '#BBF7D0',
        dot: '#22C55E',
      },
      warning: {
        text: '#B45309',
        bg: '#FFFBEB',
        border: '#FDE68A',
        dot: '#F59E0B',
      },
      danger: {
        text: '#B91C1C',
        bg: '#FEF2F2',
        border: '#FECACA',
        dot: '#EF4444',
      },
      info: {
        text: '#1D4ED8',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        dot: '#3B82F6',
      },
    },
  },
  typography: {
    fonts: {
      display: 'var(--font-display), Golos Text, sans-serif',
      body: 'var(--font-body), Inter, sans-serif',
      mono: 'var(--font-mono), JetBrains Mono, monospace',
    },
    scale: {
      h1: 'text-2xl lg:text-3xl font-extrabold tracking-tight',
      h2: 'text-xl lg:text-2xl font-bold tracking-tight',
      h3: 'text-lg font-bold',
      sectionTitle: 'text-sm font-bold uppercase tracking-wider text-slate-500',
      cardTitle: 'text-base font-bold text-[#0B0E23]',
      body: 'text-sm font-medium text-slate-700',
      caption: 'text-xs text-slate-500 font-medium',
      label: 'text-xs font-bold uppercase tracking-wider text-[#0B0E23]',
      tableHeader: 'text-[11px] font-bold uppercase tracking-wider text-slate-500',
      button: 'text-xs font-bold tracking-wide',
    },
  },
  radii: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    xl: 'rounded-3xl',
    full: 'rounded-full',
  },
  shadows: {
    xs: 'shadow-xs',
    sm: 'shadow-sm',
    card: 'shadow-[0_4px_20px_-2px_rgba(11,14,35,0.06)]',
    modal: 'shadow-[0_25px_50px_-12px_rgba(11,14,35,0.2)]',
    glow: 'shadow-[0_0_20px_rgba(44,111,189,0.25)]',
  },
  spacing: {
    pagePadding: 'p-4 sm:p-6 lg:p-8',
    cardPadding: 'p-5 sm:p-6',
    tablePadding: 'px-4 py-3.5',
    gapGrid: 'gap-4 sm:gap-6',
  },
  iconSizes: {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  },
} as const;
