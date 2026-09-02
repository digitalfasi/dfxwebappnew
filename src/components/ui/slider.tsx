import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the value shown next to the label (e.g. "1.2x", "45°"). */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * A native `<input type="range">`, styled to match this design system —
 * this codebase has no existing numeric-slider primitive (form-controls.tsx
 * only has Select/Textarea/Checkbox/Switch), so this is a small, real
 * addition rather than a workaround.
 */
export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  disabled = false,
  className,
}) => {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{label}</label>
          <span className="text-[11px] font-bold text-[#0B0E23] tabular-nums">
            {formatValue ? formatValue(value) : value}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 accent-gold"
        style={{
          background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${percent}%, #E2E8F0 ${percent}%, #E2E8F0 100%)`,
        }}
      />
    </div>
  );
};
