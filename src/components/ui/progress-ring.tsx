import React from 'react';

interface ProgressRingProps {
  percentage: number;
  accumulatedWeight: number;
  targetWeight: number;
  size?: number;
  strokeWidth?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  accumulatedWeight,
  targetWeight,
  size = 140,
  strokeWidth = 12,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E3E6F0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--gold, #2C6FBD)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="font-display font-bold text-2xl text-ink">
          {percentage}%
        </span>
        <span className="text-[11px] font-medium text-slate-muted">
          {accumulatedWeight.toFixed(3)} / {targetWeight.toFixed(3)} g
        </span>
      </div>
    </div>
  );
};
