import { useState } from "react";

/**
 * Shared line/area chart with real Y ticks + X labels and gridlines. `series`
 * is [{x, y}] oldest→newest. Uniform scaling (no preserveAspectRatio="none")
 * keeps axis text crisp on any width.
 *
 *   scale="zero" — plot 0 → max (dashboard trends).
 *   scale="fit"  — frame min → max with 12% headroom (gold-rate trend).
 *
 * fmtTip (opt-in): hover / tap a point to see its label and full value.
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
  fmtTip,
}) {
  const [hover, setHover] = useState(null);
  const pts = (series ?? []).filter((p) => p && Number.isFinite(Number(p.y)));
  const maxRaw = pts.length ? Math.max(...pts.map((p) => Number(p.y) || 0)) : 0;
  // A single point is data, not the absence of it. "Today" returns exactly one
  // bucket, so rejecting length < 2 made every Today chart claim "No data in
  // this period" while the cards above it showed the day's real takings. One
  // point draws as a flat line at its own value with the marker centred.
  if (!pts.length || (scale === "zero" && maxRaw <= 0)) {
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
  // Guard the divide: with one point (i / 0) is NaN and the whole svg vanishes.
  const px = (i) => (pts.length === 1 ? (x0 + x1) / 2 : x0 + (i / (pts.length - 1)) * (x1 - x0));
  const py = (v) => yBot - ((Number(v) - min) / span) * (yBot - yTop);
  const line = pts.length === 1
    ? `M${x0},${py(pts[0].y).toFixed(1)} L${x1},${py(pts[0].y).toFixed(1)}`
    : pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = pts.length === 1
    ? `${line} L${x1},${yBot} L${x0},${yBot} Z`
    : `${line} L${px(pts.length - 1).toFixed(1)},${yBot} L${x0},${yBot} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: min + f * span, y: yBot - f * (yBot - yTop) }));
  const step = Math.max(1, Math.ceil(pts.length / 6));
  // The last label always shows; a regular tick too close before it is dropped
  // so the two never collide.
  const last = pts.length - 1;
  const xTicks = pts.map((p, i) => ({ i, x: p.x })).filter((t) => t.i === last || (t.i % step === 0 && last - t.i >= step));
  // Pointer -> nearest point. The svg scales uniformly (xMidYMid meet), so map
  // the client x back into viewBox units before picking the index.
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H) || 1;
    const vx = (e.clientX - r.left - (r.width - W * s) / 2) / s;
    const i = pts.length === 1 ? 0 : Math.round(((vx - x0) / (x1 - x0)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };
  const tip = fmtTip && hover != null && pts[hover] ? (() => {
    const p = pts[hover];
    const label = String(fmtX(p.x)), value = String(fmtTip(Number(p.y)));
    const w = Math.max(label.length * 5.6, value.length * 7.2) + 20, h = 38;
    const cx = px(hover), cy = py(p.y);
    // Above the point when it fits; otherwise beside it (left if there is
    // room, else right) so the box never sits on top of the line.
    if (cy - h - 10 >= yTop - 8) return { cx, cy, tx: Math.max(x0, Math.min(x1 - w, cx - w / 2)), ty: cy - h - 10, w, h, label, value };
    const tx = cx - w - 12 >= x0 ? cx - w - 12 : Math.min(cx + 12, x1 - w);
    const ty = Math.max(yTop - 8, Math.min(yBot - h, cy - h / 2));
    return { cx, cy, tx, ty, w, h, label, value };
  })() : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${className} w-full`} role="img" aria-label={ariaLabel}
      style={fmtTip ? { touchAction: "pan-y" } : undefined}
      onPointerMove={fmtTip ? pick : undefined}
      onPointerDown={fmtTip ? pick : undefined}
      onPointerLeave={fmtTip ? (e) => { if (e.pointerType === "mouse") setHover(null); } : undefined}>
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
      {/* End labels anchor inward so "Oct 2026" at the right edge is not clipped. */}
      {tip && (
        <g pointerEvents="none">
          <line x1={tip.cx} y1={yTop} x2={tip.cx} y2={yBot} stroke={accent} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={tip.cx} cy={tip.cy} r={pointR + 2.8} fill="white" stroke={accent} strokeWidth="2" />
          {/* Tooltip in the chart's own accent (burgundy on the dashboard). */}
          <rect x={tip.tx} y={tip.ty + 1.5} width={tip.w} height={tip.h} rx="7" fill={accent} fillOpacity="0.25" />
          <rect x={tip.tx} y={tip.ty} width={tip.w} height={tip.h} rx="7" fill={accent} />
          <text x={tip.tx + tip.w / 2} y={tip.ty + 14} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#ffffff" fillOpacity="0.78">{tip.label}</text>
          <text x={tip.tx + tip.w / 2} y={tip.ty + 30} textAnchor="middle" fontSize="12" fontWeight="800" fill="#ffffff">{tip.value}</text>
        </g>
      )}
      {xTicks.map((t) => <text key={t.i} x={px(t.i)} y={yBot + xLabelDy} textAnchor={pts.length > 1 && t.i === 0 ? "start" : pts.length > 1 && t.i === pts.length - 1 ? "end" : "middle"} className="fill-muted" fontSize={xLabelSize} fontWeight="600">{fmtX(t.x)}</text>)}
    </svg>
  );
}
