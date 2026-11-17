"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PITCH_COLORS, PITCH_LABELS, formatDate } from "@/lib/pitch";
import type { FatiguePoint } from "@/lib/stats/fatigue";
import type { MixRow, OutingVelocityRow } from "@/lib/stats/summary";
import type { PitchType } from "@/lib/types";

const GRID = "#2f2f2c";
const TICK = { fill: "#8f8e84", fontSize: 12 };
const AXIS_LINE = { stroke: "#2f2f2c" };
const INK = "#f0efec";

type TipEntry = {
  name?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};
type TipProps = { active?: boolean; payload?: ReadonlyArray<TipEntry>; label?: string | number };

function TipBox({ title, rows }: { title?: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-lg">
      {title && <p className="mb-1 font-medium text-ink">{title}</p>}
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-ink-2">
          {row.color && <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />}
          <span>{row.label}</span>
          <span className="num ml-auto pl-3 font-medium text-ink">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Legend that names each pitch type next to its color, so color never carries identity alone. */
export function PitchLegend({ types }: { types: PitchType[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {types.map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PITCH_COLORS[type] }} />
          {PITCH_LABELS[type]}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Velocity across outings ---------- */

export function VelocityTrendChart({ rows, types }: { rows: OutingVelocityRow[]; types: PitchType[] }) {
  const data = rows.map((r) => ({ ...r, label: formatDate(r.date) }));
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
            <YAxis
              tick={TICK}
              axisLine={false}
              tickLine={false}
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
              unit=" mph"
              width={72}
            />
            <Tooltip
              cursor={{ stroke: "#8f8e84", strokeDasharray: "3 3" }}
              content={(props) => {
                const { active, payload, label } = props as TipProps;
                if (!active || !payload?.length) return null;
                return (
                  <TipBox
                    title={String(label)}
                    rows={payload.map((entry) => ({
                      color: entry.color,
                      label: PITCH_LABELS[entry.dataKey as PitchType],
                      value: `${Number(entry.value).toFixed(1)} mph`,
                    }))}
                  />
                );
              }}
            />
            {types.map((type) => (
              <Line
                key={type}
                dataKey={type}
                stroke={PITCH_COLORS[type]}
                strokeWidth={2}
                dot={{ r: 3, fill: PITCH_COLORS[type], strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "#1a1a19", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Velocity within an outing ---------- */

export type OutingPitchPoint = { n: number; velocity: number; pitchType: PitchType };

export function OutingVelocityChart({ points }: { points: OutingPitchPoint[] }) {
  const types = [...new Set(points.map((p) => p.pitchType))];
  const maxN = Math.max(1, ...points.map((p) => p.n));
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              type="number"
              dataKey="n"
              domain={[0, maxN + 1]}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              allowDecimals={false}
              label={{ value: "Pitch count", position: "insideBottom", offset: -10, fill: "#8f8e84", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="velocity"
              tick={TICK}
              axisLine={false}
              tickLine={false}
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
              unit=" mph"
              width={72}
            />
            <Tooltip
              cursor={{ stroke: "#8f8e84", strokeDasharray: "3 3" }}
              content={(props) => {
                const { active, payload } = props as TipProps;
                const point = payload?.[0]?.payload as OutingPitchPoint | undefined;
                if (!active || !point) return null;
                return (
                  <TipBox
                    title={`Pitch ${point.n}`}
                    rows={[
                      {
                        color: PITCH_COLORS[point.pitchType],
                        label: PITCH_LABELS[point.pitchType],
                        value: `${point.velocity.toFixed(1)} mph`,
                      },
                    ]}
                  />
                );
              }}
            />
            {types.map((type) => (
              <Scatter
                key={type}
                name={type}
                data={points.filter((p) => p.pitchType === type)}
                fill={PITCH_COLORS[type]}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Dashboard wrapper: pick an outing, see every pitch by pitch count. */
export function OutingVelocityExplorer({
  outings,
}: {
  outings: { id: string; label: string; points: OutingPitchPoint[] }[];
}) {
  const [selected, setSelected] = useState(outings.length ? outings[outings.length - 1].id : "");
  const current = outings.find((o) => o.id === selected);
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-xs text-ink-2">
        Outing
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="field w-auto py-1.5">
          {outings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {current && <OutingVelocityChart points={current.points} />}
    </div>
  );
}

/* ---------- Fatigue ---------- */

export function FatigueChart({
  points,
  baseline,
  threshold,
  onset,
  color,
}: {
  points: FatiguePoint[];
  baseline: number | null;
  threshold: number | null;
  onset: number | null;
  color: string;
}) {
  const data = points.map((p) => ({ n: p.pitchNumber, velocity: p.velocity, rolling: p.rolling }));
  const maxN = Math.max(1, ...data.map((d) => d.n));
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, opacity: 0.55 }} />
          Each fastball
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: INK }} />
          Rolling average
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-ink-3" />
          Baseline
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-bad" />
          Fatigue threshold
        </li>
      </ul>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              type="number"
              dataKey="n"
              domain={[0, maxN + 1]}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              allowDecimals={false}
              label={{ value: "Pitch count", position: "insideBottom", offset: -10, fill: "#8f8e84", fontSize: 12 }}
            />
            <YAxis
              tick={TICK}
              axisLine={false}
              tickLine={false}
              domain={[(min: number) => Math.floor(min - 0.5), (max: number) => Math.ceil(max + 0.5)]}
              unit=" mph"
              width={72}
            />
            {onset !== null && <ReferenceArea x1={onset} x2={maxN + 1} fill="#e66767" fillOpacity={0.08} stroke="none" />}
            {baseline !== null && <ReferenceLine y={baseline} stroke="#8f8e84" strokeDasharray="4 4" />}
            {threshold !== null && <ReferenceLine y={threshold} stroke="#e66767" strokeDasharray="4 4" />}
            {onset !== null && (
              <ReferenceLine
                x={onset}
                stroke="#e66767"
                label={{ value: `Onset: pitch ${onset}`, position: "insideTopRight", fill: "#f0efec", fontSize: 12 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: "#8f8e84", strokeDasharray: "3 3" }}
              content={(props) => {
                const { active, payload } = props as TipProps;
                const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !d) return null;
                const rows = [{ color, label: "Velocity", value: `${d.velocity.toFixed(1)} mph` }];
                if (d.rolling !== null) rows.push({ color: INK, label: "Rolling avg", value: `${d.rolling.toFixed(1)} mph` });
                return <TipBox title={`Pitch ${d.n}`} rows={rows} />;
              }}
            />
            <Line
              dataKey="velocity"
              stroke="none"
              dot={{ r: 3, fill: color, fillOpacity: 0.55, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, stroke: "#1a1a19", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line dataKey="rolling" stroke={INK} strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Pitch mix by count ---------- */

export function PitchMixChart({ rows, types }: { rows: MixRow[]; types: PitchType[] }) {
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 16, left: -16 }} barCategoryGap="18%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="count"
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              interval={0}
              label={{ value: "Count (balls-strikes)", position: "insideBottom", offset: -10, fill: "#8f8e84", fontSize: 12 }}
            />
            <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" width={56} />
            <Tooltip
              cursor={{ fill: "#ffffff", fillOpacity: 0.04 }}
              content={(props) => {
                const { active, payload, label } = props as TipProps;
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as MixRow;
                return (
                  <TipBox
                    title={`${label} count · ${row.total} pitches`}
                    rows={payload.map((entry) => ({
                      color: entry.color,
                      label: PITCH_LABELS[entry.dataKey as PitchType],
                      value: `${Number(entry.value).toFixed(0)}%`,
                    }))}
                  />
                );
              }}
            />
            {types.map((type) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="mix"
                fill={PITCH_COLORS[type]}
                stroke="#1a1a19"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Strike / whiff / chase by pitch type ---------- */

export type RateRow = { metric: string } & Partial<Record<PitchType, number | null>>;

export function RatesChart({ rows, types }: { rows: RateRow[]; types: PitchType[] }) {
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} barCategoryGap="22%" barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="metric" tick={TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" width={56} />
            <Tooltip
              cursor={{ fill: "#ffffff", fillOpacity: 0.04 }}
              content={(props) => {
                const { active, payload, label } = props as TipProps;
                if (!active || !payload?.length) return null;
                return (
                  <TipBox
                    title={String(label)}
                    rows={payload.map((entry) => ({
                      color: entry.color,
                      label: PITCH_LABELS[entry.dataKey as PitchType],
                      value: `${Number(entry.value).toFixed(1)}%`,
                    }))}
                  />
                );
              }}
            />
            {types.map((type) => (
              <Bar key={type} dataKey={type} fill={PITCH_COLORS[type]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Movement plot ---------- */

export type MovementPoint = { hb: number; ivb: number; pitchType: PitchType; velocity: number | null };

export function MovementChart({ points }: { points: MovementPoint[] }) {
  const types = [...new Set(points.map((p) => p.pitchType))];
  const extent = Math.max(20, ...points.map((p) => Math.max(Math.abs(p.hb), Math.abs(p.ivb))));
  const limit = Math.ceil(extent / 5) * 5;
  const ticks = [-limit, -limit / 2, 0, limit / 2, limit];
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mx-auto mt-3 aspect-square w-full max-w-md">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="hb"
              domain={[-limit, limit]}
              ticks={ticks}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              label={{ value: "Horizontal break (in)", position: "insideBottom", offset: -12, fill: "#8f8e84", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="ivb"
              domain={[-limit, limit]}
              ticks={ticks}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              width={44}
              label={{ value: "Induced vertical break (in)", angle: -90, position: "insideLeft", offset: 12, fill: "#8f8e84", fontSize: 12, style: { textAnchor: "middle" } }}
            />
            <ReferenceLine x={0} stroke="#8f8e84" />
            <ReferenceLine y={0} stroke="#8f8e84" />
            <Tooltip
              cursor={false}
              content={(props) => {
                const { active, payload } = props as TipProps;
                const point = payload?.[0]?.payload as MovementPoint | undefined;
                if (!active || !point) return null;
                const rows = [
                  { label: "Horizontal", value: `${point.hb.toFixed(1)} in` },
                  { label: "Induced vertical", value: `${point.ivb.toFixed(1)} in` },
                ];
                if (point.velocity !== null) rows.push({ label: "Velocity", value: `${point.velocity.toFixed(1)} mph` });
                return <TipBox title={PITCH_LABELS[point.pitchType]} rows={rows} />;
              }}
            />
            {types.map((type) => (
              <Scatter
                key={type}
                name={type}
                data={points.filter((p) => p.pitchType === type)}
                fill={PITCH_COLORS[type]}
                fillOpacity={0.55}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
