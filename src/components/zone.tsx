"use client";

import { useState } from "react";
import { PITCH_COLORS, PITCH_LABELS, ZONE } from "@/lib/pitch";
import type { HeatmapGrid } from "@/lib/stats/summary";
import type { PitchType } from "@/lib/types";

/** Shared plate geometry: feet -> SVG units (catcher's view). */
const BOUNDS = { xMin: -1.75, xMax: 1.75, zMin: 0.5, zMax: 4.5 };
const SCALE = 60; // px per foot
const W = (BOUNDS.xMax - BOUNDS.xMin) * SCALE;
const H = (BOUNDS.zMax - BOUNDS.zMin) * SCALE;
const sx = (x: number) => (x - BOUNDS.xMin) * SCALE;
const sy = (z: number) => (BOUNDS.zMax - z) * SCALE;

function ZoneOutline() {
  const zw = (ZONE.right - ZONE.left) * SCALE;
  const zh = (ZONE.top - ZONE.bottom) * SCALE;
  return (
    <g pointerEvents="none">
      <rect x={sx(ZONE.left)} y={sy(ZONE.top)} width={zw} height={zh} fill="none" stroke="#f0efec" strokeWidth={1.5} />
      {[1, 2].map((i) => (
        <g key={i} stroke="#f0efec" strokeOpacity={0.25}>
          <line x1={sx(ZONE.left) + (zw * i) / 3} y1={sy(ZONE.top)} x2={sx(ZONE.left) + (zw * i) / 3} y2={sy(ZONE.bottom)} />
          <line x1={sx(ZONE.left)} y1={sy(ZONE.top) - 0 + (zh * i) / 3} x2={sx(ZONE.right)} y2={sy(ZONE.top) + (zh * i) / 3} />
        </g>
      ))}
      {/* Home plate, for orientation. */}
      <path
        d={`M ${sx(-0.708)} ${H - 14} L ${sx(0.708)} ${H - 14} L ${sx(0.708)} ${H - 8} L ${sx(0)} ${H - 2} L ${sx(-0.708)} ${H - 8} Z`}
        fill="none"
        stroke="#8f8e84"
      />
    </g>
  );
}

/** Location heatmap for one pitch type. Cell opacity encodes share of pitches. */
export function LocationHeatmap({ grid, pitchType }: { grid: HeatmapGrid; pitchType: PitchType }) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const color = PITCH_COLORS[pitchType];
  const cw = W / grid.cols;
  const ch = H / grid.rows;
  const hovered = hover ? grid.counts[hover.row][hover.col] : null;

  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {PITCH_LABELS[pitchType]}
        </span>
        <span className="num text-xs text-ink-3">
          {hovered !== null
            ? `${hovered} pitches · ${grid.total ? ((100 * hovered) / grid.total).toFixed(0) : 0}%`
            : `${grid.total} pitches`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg bg-page"
        role="img"
        aria-label={`${PITCH_LABELS[pitchType]} location heatmap, catcher's view, ${grid.total} pitches`}
        onMouseLeave={() => setHover(null)}
      >
        {grid.counts.map((row, r) =>
          row.map((count, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * cw + 1}
              y={r * ch + 1}
              width={cw - 2}
              height={ch - 2}
              rx={3}
              fill={color}
              fillOpacity={grid.max ? (count / grid.max) * 0.95 : 0}
              stroke={hover?.row === r && hover.col === c ? "#f0efec" : "none"}
              onMouseEnter={() => setHover({ row: r, col: c })}
            />
          )),
        )}
        <ZoneOutline />
      </svg>
    </figure>
  );
}

/** Click-to-place plate location picker used by the pitch logger. */
export function ZonePicker({
  value,
  onChange,
  disabled,
}: {
  value: { x: number; z: number } | null;
  onChange: (value: { x: number; z: number }) => void;
  disabled?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full max-w-[220px] rounded-lg bg-page ${disabled ? "opacity-50" : "cursor-crosshair"}`}
      role="img"
      aria-label="Strike zone, catcher's view. Click to set the pitch location."
      onClick={(e) => {
        if (disabled) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = BOUNDS.xMin + ((e.clientX - rect.left) / rect.width) * (BOUNDS.xMax - BOUNDS.xMin);
        const z = BOUNDS.zMax - ((e.clientY - rect.top) / rect.height) * (BOUNDS.zMax - BOUNDS.zMin);
        onChange({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
      }}
    >
      <ZoneOutline />
      {value && <circle cx={sx(value.x)} cy={sy(value.z)} r={7} fill="#f0efec" stroke="#111110" strokeWidth={2} />}
    </svg>
  );
}
