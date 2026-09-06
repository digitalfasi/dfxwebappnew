/**
 * Shared line/area chart with real Y ticks + X labels and gridlines. `series`
 * is [{x, y}] oldest→newest. Uniform scaling (no preserveAspectRatio="none")
 * keeps axis text crisp on any width.
 *
 *   scale="zero" — plot 0 → max (dashboard trends).
 *   scale="fit"  — frame min → max with 12% headroom (gold-rate trend).
 *
 * fmtY/fmtX format the tick labels; all geometry/label sizing is prop-driven
 * so a caller can reproduce its exact prior look. Extracted from the near
 * identical charts that previously lived in Dashboard and GoldRate.
 */
export function LineChart({
  series,
  accent,
  gradId,
  className = "h-48",
  W = 640,
  H = 232,
  x0 = 46,
  x1 = W - 12,
  yTop = 12,
  yBot = H - 26,
  scale = "zero",
  fmtY,
  fmtX = (x) => x,
  pointR = 2.2,
  strokeWidth = 2.25,
  yLabelDx = 6,
  yLabelSize = 9,
  xLabelDy = 16,
  xLabelSize = 9,
  ariaLabel = "Trend chart",
  empty = "No data in this period",
}) {
  const pts = (series ?? []).filter((p) => p && Number.isFinite(Number(p.y)));
  const maxRaw = pts.length ? Math.max(...pts.map((p) => Number(p.y) || 0)) : 0;
  if (pts.length < 2 || (scale === "zero" && maxRaw <= 0)) {
    return <div className={`flex ${className} items-center justify-center rounded-lg bg-canvas/40 px-4 text-center text-xs font-medium text-muted`}>{empty}</div>;
  }
  let min = 0, max = maxRaw;
  if (scale === "fit") {
    const ys = pts.map((p) => Number(p.y));
    min = Math.min(...ys); max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const headroom = (max - min) * 0.12; min -= headroom; max += headroom;
  }
  const span = (max - min) || 1;
  const px = (i) => x0 + (i / (pts.length - 1)) * (x1 - x0);
  const py = (v) => yBot - ((Number(v) - min) / span) * (yBot - yTop);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${px(pts.length - 1).toFixed(1)},${yBot} L${x0},${yBot} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: min + f * span, y: yBot - f * (yBot - yTop) }));
  const step = Math.max(1, Math.ceil(pts.length / 6));
  const xTicks = pts.map((p, i) => ({ i, x: p.x })).filter((t) => t.i % step === 0 || t.i === pts.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${className} w-full`} role="img" aria-label={ariaLabel}>
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity="0.18" /><stop offset="100%" stopColor={accent} stopOpacity="0" /></linearGradient></defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={x0} y1={t.y} x2={x1} y2={t.y} stroke="var(--color-line-soft)" strokeWidth="1" />
          <text x={x0 - yLabelDx} y={t.y + 3} textAnchor="end" className="fill-muted" fontSize={yLabelSize} fontWeight="600">{fmtY(t.v)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={accent} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" data-motion="draw" />
      {pts.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r={pointR} fill={accent} />)}
      {xTicks.map((t) => <text key={t.i} x={px(t.i)} y={yBot + xLabelDy} textAnchor="middle" className="fill-muted" fontSize={xLabelSize} fontWeight="600">{fmtX(t.x)}</text>)}
    </svg>
  );
}
