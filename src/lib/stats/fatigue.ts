import { FASTBALLS } from "../pitch";
import type { Pitch, PitchType } from "../types";
import { mean, sampleSd } from "./descriptive";

/**
 * Fatigue detection.
 *
 * Within one outing, for one fastball type:
 *   1. Baseline: mean (m0) and sample SD (s0) of the first `baselineSize` pitches.
 *   2. For each later pitch, take the mean of the most recent `window` pitches
 *      (windows never overlap the baseline).
 *   3. Compare the two means with a z statistic that accounts for the noise
 *      in both:  z = (rolling - m0) / (s0 * sqrt(1/window + 1/baselineSize)).
 *   4. A window is flagged when the drop is both statistically significant
 *      (z <= -zThreshold, one-sided) and practically meaningful
 *      (drop >= minDropMph).
 *   5. Fatigue is reported only after `sustain` consecutive flagged windows,
 *      and onset is the first pitch of that run. Because overlapping windows
 *      are correlated, this is what keeps the per-outing false-alarm rate low.
 */

export type FatigueOptions = {
  /** Pitches used to establish the outing baseline. */
  baselineSize: number;
  /** Rolling window length. */
  window: number;
  /** Minimum drop in mph that counts, regardless of significance. */
  minDropMph: number;
  /** One-sided z threshold (2.5 is roughly a 0.6% false-alarm rate per window). */
  zThreshold: number;
  /** Floor on the baseline SD so an unusually tight start cannot make tiny drops "significant". */
  sdFloor: number;
  /** Consecutive flagged windows required before fatigue is reported. */
  sustain: number;
};

export const DEFAULT_FATIGUE_OPTIONS: FatigueOptions = {
  baselineSize: 10,
  window: 8,
  minDropMph: 1.0,
  zThreshold: 2.5,
  sdFloor: 0.5,
  sustain: 3,
};

export type VelocityPoint = { pitchNumber: number; velocity: number };

export type FatiguePoint = VelocityPoint & {
  /** Rolling mean ending at this pitch; null inside the baseline or warm-up of the window. */
  rolling: number | null;
  z: number | null;
  flagged: boolean;
};

export type FatigueResult = {
  status: "insufficient" | "steady" | "fatigued";
  baselineMean: number | null;
  baselineSd: number | null;
  /** Rolling means at or below this velocity are flagged. */
  threshold: number | null;
  points: FatiguePoint[];
  /** Pitch number (within the outing) where a sustained drop begins. */
  onsetPitchNumber: number | null;
  /** Largest drop of the rolling mean below baseline, in mph. */
  maxDrop: number | null;
  options: FatigueOptions;
};

export function detectFatigue(series: VelocityPoint[], overrides: Partial<FatigueOptions> = {}): FatigueResult {
  const options = { ...DEFAULT_FATIGUE_OPTIONS, ...overrides };
  const { baselineSize, window, minDropMph, zThreshold, sdFloor, sustain } = options;
  const points: FatiguePoint[] = series.map((p) => ({ ...p, rolling: null, z: null, flagged: false }));

  if (series.length < baselineSize + window) {
    return {
      status: "insufficient",
      baselineMean: null,
      baselineSd: null,
      threshold: null,
      points,
      onsetPitchNumber: null,
      maxDrop: null,
      options,
    };
  }

  const baseline = series.slice(0, baselineSize).map((p) => p.velocity);
  const m0 = mean(baseline);
  const s0 = Math.max(sampleSd(baseline), sdFloor);
  const se = s0 * Math.sqrt(1 / window + 1 / baselineSize);
  const requiredDrop = Math.max(minDropMph, zThreshold * se);

  let maxDrop = 0;
  for (let i = baselineSize + window - 1; i < series.length; i++) {
    const recent = series.slice(i - window + 1, i + 1).map((p) => p.velocity);
    const rolling = mean(recent);
    const drop = m0 - rolling;
    points[i].rolling = rolling;
    points[i].z = (rolling - m0) / se;
    // Small epsilon so a drop exactly at the threshold is not lost to float error.
    points[i].flagged = drop >= requiredDrop - 1e-9;
    if (drop > maxDrop) maxDrop = drop;
  }

  // Onset: the first pitch of the first run of `sustain` consecutive flagged windows.
  let onsetPitchNumber: number | null = null;
  let run = 0;
  for (let i = baselineSize + window - 1; i < points.length; i++) {
    run = points[i].flagged ? run + 1 : 0;
    if (run >= sustain) {
      onsetPitchNumber = points[i - sustain + 1].pitchNumber;
      break;
    }
  }

  return {
    status: onsetPitchNumber === null ? "steady" : "fatigued",
    baselineMean: m0,
    baselineSd: s0,
    threshold: m0 - requiredDrop,
    points,
    onsetPitchNumber,
    maxDrop,
    options,
  };
}

/** The fastball type thrown most in this set of pitches (with a velocity reading), if any. */
export function primaryFastball(pitches: Pitch[]): PitchType | null {
  const counts = new Map<PitchType, number>();
  for (const p of pitches) {
    if (p.velocity !== null && FASTBALLS.includes(p.pitch_type)) {
      counts.set(p.pitch_type, (counts.get(p.pitch_type) ?? 0) + 1);
    }
  }
  let best: PitchType | null = null;
  let bestCount = 0;
  for (const type of FASTBALLS) {
    const c = counts.get(type) ?? 0;
    if (c > bestCount) {
      best = type;
      bestCount = c;
    }
  }
  return best;
}

/** Runs fatigue detection on an outing's primary fastball. */
export function fatigueForOuting(
  pitches: Pitch[],
  overrides: Partial<FatigueOptions> = {},
): { pitchType: PitchType | null; result: FatigueResult } {
  const pitchType = primaryFastball(pitches);
  const series: VelocityPoint[] = pitches
    .filter((p) => p.pitch_type === pitchType && p.velocity !== null)
    .sort((a, b) => a.pitch_number - b.pitch_number)
    .map((p) => ({ pitchNumber: p.pitch_number, velocity: p.velocity as number }));
  return { pitchType, result: detectFatigue(series, overrides) };
}
