"use client";

import { useActionState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { setThrows, type ActionResult } from "@/app/(app)/actions";
import { PITCH_COLORS, PITCH_LABELS } from "@/lib/pitch";
import type { PitchType } from "@/lib/types";
import { AXIS_LINE, GRID, PitchLegend, TICK, TipBox, type TipProps } from "./charts";

/* ---------- Stuff+ by outing ---------- */

export type StuffTrendRow = { date: string; label: string } & Partial<Record<PitchType, number>>;

export function StuffTrendChart({ rows, types }: { rows: StuffTrendRow[]; types: PitchType[] }) {
  return (
    <div>
      <PitchLegend types={types} />
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
            <YAxis
              tick={TICK}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={[(min: number) => Math.floor(Math.min(min, 100) / 5) * 5 - 5, (max: number) => Math.ceil(Math.max(max, 100) / 5) * 5 + 5]}
            />
            <ReferenceLine
              y={100}
              stroke="#8f8e84"
              strokeDasharray="4 4"
              label={{ value: "MLB average", position: "insideTopRight", fill: "#8f8e84", fontSize: 12 }}
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
                      value: Number(entry.value).toFixed(0),
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

/* ---------- Movement overlay: the user's pitch against its MLB comps ---------- */

export type CompPoint = { rank: number; name: string; hb: number; ivb: number; velo: number };

type ShapeProps = { cx?: number; cy?: number; payload?: CompPoint };

export function CompMovementChart({
  pitchType,
  user,
  comps,
}: {
  pitchType: PitchType;
  user: { hb: number; ivb: number; velo: number | null };
  comps: CompPoint[];
}) {
  const color = PITCH_COLORS[pitchType];
  const all = [user, ...comps];
  const pad = 4;
  const round = (v: number, up: boolean) => (up ? Math.ceil(v / 2) * 2 : Math.floor(v / 2) * 2);
  const xDomain = [round(Math.min(...all.map((p) => p.hb)) - pad, false), round(Math.max(...all.map((p) => p.hb)) + pad, true)];
  const yDomain = [round(Math.min(...all.map((p) => p.ivb)) - pad, false), round(Math.max(...all.map((p) => p.ivb)) + pad, true)];

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
          Your {PITCH_LABELS[pitchType].toLowerCase()}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="num flex h-4 w-4 items-center justify-center rounded-full border border-ink-3 text-[10px] text-ink">1</span>
          MLB comps, numbered as in the table
        </li>
      </ul>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="hb"
              domain={xDomain}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              label={{ value: "Horizontal break (in)", position: "insideBottom", offset: -12, fill: "#8f8e84", fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="ivb"
              domain={yDomain}
              tick={TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              width={44}
              label={{ value: "Induced vertical break (in)", angle: -90, position: "insideLeft", offset: 12, fill: "#8f8e84", fontSize: 12, style: { textAnchor: "middle" } }}
            />
            <Tooltip
              cursor={false}
              content={(props) => {
                const { active, payload } = props as TipProps;
                const point = payload?.[0]?.payload as (CompPoint & { isUser?: boolean }) | undefined;
                if (!active || !point) return null;
                const rows = [
                  { label: "Horizontal", value: `${point.hb.toFixed(1)} in` },
                  { label: "Induced vertical", value: `${point.ivb.toFixed(1)} in` },
                ];
                if (point.velo) rows.push({ label: "Velocity", value: `${point.velo.toFixed(1)} mph` });
                return <TipBox title={point.name} rows={rows} />;
              }}
            />
            <Scatter
              data={comps}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const { cx = 0, cy = 0, payload } = props as ShapeProps;
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={9} fill="#1a1a19" stroke="#8f8e84" strokeWidth={1.5} />
                    <text x={cx} y={cy} dy={3.5} textAnchor="middle" fontSize={10} fill="#f0efec">
                      {payload?.rank}
                    </text>
                  </g>
                );
              }}
            />
            <Scatter
              data={[{ ...user, rank: 0, name: `Your ${PITCH_LABELS[pitchType].toLowerCase()}`, velo: user.velo ?? 0, isUser: true }]}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const { cx = 0, cy = 0 } = props as ShapeProps;
                return <circle cx={cx} cy={cy} r={8} fill={color} stroke="#1a1a19" strokeWidth={2} />;
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Handedness setting ---------- */

export function ThrowsForm({ current, readOnly }: { current: "L" | "R" | null; readOnly: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setThrows, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-2">Throws</span>
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Throwing hand">
        {(["L", "R"] as const).map((hand) => (
          <button
            key={hand}
            type="submit"
            name="throws"
            value={hand}
            disabled={readOnly || pending}
            aria-pressed={current === hand}
            className={`rounded-md px-3 py-1 text-sm disabled:cursor-not-allowed ${
              current === hand ? "bg-raised text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {hand === "L" ? "Left" : "Right"}
          </button>
        ))}
      </div>
      {state && !state.ok && (
        <span role="alert" className="text-sm text-bad">
          {state.error}
        </span>
      )}
    </form>
  );
}
