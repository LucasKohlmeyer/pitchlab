import { inZone, isSwing } from "../pitch";
import { PITCH_TYPES, type Outing, type Pitch, type PitchType } from "../types";
import { mean, pct } from "./descriptive";

/** Pitch types present in the data, in canonical order. */
export function typesPresent(pitches: Pitch[]): PitchType[] {
  const seen = new Set(pitches.map((p) => p.pitch_type));
  return PITCH_TYPES.filter((t) => seen.has(t));
}

const avgOf = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? mean(present) : null;
};

export type PitchTypeSummary = {
  pitchType: PitchType;
  count: number;
  usagePct: number;
  avgVelo: number | null;
  maxVelo: number | null;
  avgSpin: number | null;
  avgHb: number | null;
  avgIvb: number | null;
  /** Strikes (called, swinging, foul, in play) per pitch with a recorded result. */
  strikePct: number | null;
  /** Swings and misses per swing. */
  whiffPct: number | null;
  /** Swings at pitches outside the zone per pitch outside the zone. */
  chasePct: number | null;
  /** Share of located pitches inside the strike zone. */
  zonePct: number | null;
  withResult: number;
  swings: number;
  outOfZone: number;
};

export function summarizePitches(pitchType: PitchType, pitches: Pitch[], total: number): PitchTypeSummary {
  const withResult = pitches.filter((p) => p.result !== null);
  const strikes = withResult.filter((p) => p.result !== "ball").length;
  const swings = withResult.filter((p) => isSwing(p.result));
  const whiffs = swings.filter((p) => p.result === "whiff").length;

  const located = pitches.filter((p) => p.plate_x !== null && p.plate_z !== null);
  const inZoneCount = located.filter((p) => inZone(p.plate_x as number, p.plate_z as number)).length;
  const outOfZone = located.filter((p) => p.result !== null && !inZone(p.plate_x as number, p.plate_z as number));
  const chases = outOfZone.filter((p) => isSwing(p.result)).length;

  const velos = pitches.map((p) => p.velocity).filter((v): v is number => v !== null);
  return {
    pitchType,
    count: pitches.length,
    usagePct: pct(pitches.length, total) ?? 0,
    avgVelo: velos.length ? mean(velos) : null,
    maxVelo: velos.length ? Math.max(...velos) : null,
    avgSpin: avgOf(pitches.map((p) => p.spin_rate)),
    avgHb: avgOf(pitches.map((p) => p.hb)),
    avgIvb: avgOf(pitches.map((p) => p.ivb)),
    strikePct: pct(strikes, withResult.length),
    whiffPct: pct(whiffs, swings.length),
    chasePct: pct(chases, outOfZone.length),
    zonePct: pct(inZoneCount, located.length),
    withResult: withResult.length,
    swings: swings.length,
    outOfZone: outOfZone.length,
  };
}

export function summarizeByPitchType(pitches: Pitch[]): PitchTypeSummary[] {
  return typesPresent(pitches).map((type) =>
    summarizePitches(
      type,
      pitches.filter((p) => p.pitch_type === type),
      pitches.length,
    ),
  );
}

export const COUNTS = ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"] as const;

export type MixRow = { count: string; total: number } & Partial<Record<PitchType, number>>;

/** Pitch usage (percent of pitches) in each ball-strike count. Counts never seen are omitted. */
export function pitchMixByCount(pitches: Pitch[]): MixRow[] {
  const types = typesPresent(pitches);
  const rows: MixRow[] = [];
  for (const count of COUNTS) {
    const [balls, strikes] = count.split("-").map(Number);
    const inCount = pitches.filter((p) => p.balls === balls && p.strikes === strikes);
    if (inCount.length === 0) continue;
    const row: MixRow = { count, total: inCount.length };
    for (const type of types) {
      row[type] = (100 * inCount.filter((p) => p.pitch_type === type).length) / inCount.length;
    }
    rows.push(row);
  }
  return rows;
}

export type OutingVelocityRow = { outingId: string; date: string; label: string } & Partial<Record<PitchType, number>>;

/** Average velocity per pitch type for each outing, in chronological order. */
export function velocityByOuting(outings: Outing[], pitches: Pitch[]): OutingVelocityRow[] {
  const types = typesPresent(pitches);
  const byOuting = new Map<string, Pitch[]>();
  for (const p of pitches) {
    const list = byOuting.get(p.outing_id) ?? [];
    list.push(p);
    byOuting.set(p.outing_id, list);
  }
  const rows: OutingVelocityRow[] = [];
  for (const outing of outings) {
    const list = byOuting.get(outing.id);
    if (!list) continue;
    const row: OutingVelocityRow = { outingId: outing.id, date: outing.outing_date, label: outing.outing_date };
    let any = false;
    for (const type of types) {
      const velos = list.filter((p) => p.pitch_type === type && p.velocity !== null).map((p) => p.velocity as number);
      if (velos.length) {
        row[type] = mean(velos);
        any = true;
      }
    }
    if (any) rows.push(row);
  }
  return rows;
}

export type HeatmapGrid = {
  /** counts[row][col]; row 0 is the top of the grid. */
  counts: number[][];
  max: number;
  total: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  cols: number;
  rows: number;
};

export const HEATMAP_BOUNDS = { xMin: -1.75, xMax: 1.75, zMin: 0.5, zMax: 4.5 } as const;

/** Bins plate locations into a grid (catcher's view). Pitches outside the bounds are clamped to the edge cells. */
export function locationGrid(pitches: Pitch[], cols = 7, rows = 8): HeatmapGrid {
  const { xMin, xMax, zMin, zMax } = HEATMAP_BOUNDS;
  const counts = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  let total = 0;
  for (const p of pitches) {
    if (p.plate_x === null || p.plate_z === null) continue;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(((p.plate_x - xMin) / (xMax - xMin)) * cols)));
    const fromTop = Math.min(rows - 1, Math.max(0, Math.floor(((zMax - p.plate_z) / (zMax - zMin)) * rows)));
    counts[fromTop][col]++;
    total++;
  }
  return { counts, max: Math.max(0, ...counts.flat()), total, xMin, xMax, zMin, zMax, cols, rows };
}
