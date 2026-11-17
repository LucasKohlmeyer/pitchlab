import { FASTBALLS, ZONE, isSwing } from "../pitch";
import type { Pitch, PitchType } from "../types";
import { mean } from "./descriptive";
import { fitLogistic, predictProbability, type LogisticFit } from "./logistic";

/**
 * Whiff model: P(whiff | swing) as a logistic regression on pitch features.
 *
 * Velocity and movement are measured relative to the pitcher's own average
 * for that pitch type. Raw velocity mostly encodes which pitch was thrown
 * (a slurve is 12 mph slower than a fastball), so centering within pitch type
 * lets the coefficient answer the useful question: does an extra tick on the
 * same pitch miss more bats?
 */

export type WhiffFeature = {
  key: "offspeed" | "velo" | "movement" | "distance" | "twoStrikes";
  label: string;
  unit: string;
  /** Plain-language description of what the feature measures. */
  description: string;
  binary: boolean;
};

export const WHIFF_FEATURES: WhiffFeature[] = [
  {
    key: "offspeed",
    label: "Breaking or offspeed pitch",
    unit: "yes vs. no",
    description: "1 for anything that is not a fastball (slurve, slider, curveball, changeup, splitter).",
    binary: true,
  },
  {
    key: "velo",
    label: "Velocity vs. pitch-type average",
    unit: "mph",
    description: "How much harder or softer this pitch was than your average for that pitch type.",
    binary: false,
  },
  {
    key: "movement",
    label: "Movement vs. pitch-type average",
    unit: "in",
    description: "Total break (horizontal and induced vertical combined) relative to your average for that pitch type.",
    binary: false,
  },
  {
    key: "distance",
    label: "Distance from zone center",
    unit: "ft",
    description: "How far the pitch crossed the plate from the middle of the strike zone.",
    binary: false,
  },
  {
    key: "twoStrikes",
    label: "Two-strike count",
    unit: "yes vs. no",
    description: "1 when the pitch was thrown with two strikes.",
    binary: true,
  },
];

export const MIN_SWINGS = 60;
export const MIN_WHIFFS = 10;

const ZONE_CENTER = { x: (ZONE.left + ZONE.right) / 2, z: (ZONE.bottom + ZONE.top) / 2 };

type CompletePitch = Pitch & {
  velocity: number;
  hb: number;
  ivb: number;
  plate_x: number;
  plate_z: number;
  strikes: number;
};

function isComplete(p: Pitch): p is CompletePitch {
  return (
    p.velocity !== null &&
    p.hb !== null &&
    p.ivb !== null &&
    p.plate_x !== null &&
    p.plate_z !== null &&
    p.strikes !== null
  );
}

export type TypeAverages = Record<string, { velo: number; movement: number }>;

const movementOf = (p: { hb: number; ivb: number }) => Math.hypot(p.hb, p.ivb);

/** Per-pitch-type averages over every pitch with tracking data, not just swings. */
export function typeAverages(pitches: Pitch[]): TypeAverages {
  const groups = new Map<PitchType, { velo: number[]; movement: number[] }>();
  for (const p of pitches) {
    if (p.velocity === null || p.hb === null || p.ivb === null) continue;
    const g = groups.get(p.pitch_type) ?? { velo: [], movement: [] };
    g.velo.push(p.velocity);
    g.movement.push(movementOf({ hb: p.hb, ivb: p.ivb }));
    groups.set(p.pitch_type, g);
  }
  const out: TypeAverages = {};
  for (const [type, g] of groups) out[type] = { velo: mean(g.velo), movement: mean(g.movement) };
  return out;
}

export function featureRow(p: CompletePitch, averages: TypeAverages): number[] {
  const avg = averages[p.pitch_type];
  return [
    FASTBALLS.includes(p.pitch_type) ? 0 : 1,
    p.velocity - avg.velo,
    movementOf(p) - avg.movement,
    Math.hypot(p.plate_x - ZONE_CENTER.x, p.plate_z - ZONE_CENTER.z),
    p.strikes === 2 ? 1 : 0,
  ];
}

export type WhiffCoefficient = {
  feature: WhiffFeature;
  /** Log-odds change per +1 SD (continuous) or for yes vs. no (binary). */
  coefficient: number;
  standardError: number;
  z: number;
  pValue: number;
  /** exp(coefficient): multiplicative change in the odds of a whiff. */
  oddsRatio: number;
  /** 95% Wald interval for the odds ratio. */
  oddsRatioLow: number;
  oddsRatioHigh: number;
  /** One standard deviation of the feature in its own units (1 for binary features). */
  sd: number;
};

export type WhiffModel =
  | { status: "insufficient"; swings: number; whiffs: number }
  | {
      status: "ok";
      swings: number;
      whiffs: number;
      fit: LogisticFit;
      coefficients: WhiffCoefficient[];
      /** Predicted whiff probability for an average swing of each pitch type. */
      byPitchType: { pitchType: PitchType; swings: number; observed: number; predicted: number }[];
    };

export function fitWhiffModel(pitches: Pitch[]): WhiffModel {
  const averages = typeAverages(pitches);
  const swings = pitches.filter((p): p is CompletePitch => isSwing(p.result) && isComplete(p));
  const labels = swings.map((p) => (p.result === "whiff" ? 1 : 0));
  const whiffs = labels.reduce<number>((s, y) => s + y, 0);

  if (swings.length < MIN_SWINGS || whiffs < MIN_WHIFFS || swings.length - whiffs < MIN_WHIFFS) {
    return { status: "insufficient", swings: swings.length, whiffs };
  }

  const rows = swings.map((p) => featureRow(p, averages));
  const fit = fitLogistic(rows, labels, { standardize: WHIFF_FEATURES.map((f) => !f.binary) });

  const coefficients: WhiffCoefficient[] = WHIFF_FEATURES.map((feature, j) => {
    const coefficient = fit.coefficients[j];
    const standardError = fit.standardErrors[j + 1];
    return {
      feature,
      coefficient,
      standardError,
      z: fit.zScores[j + 1],
      pValue: fit.pValues[j + 1],
      oddsRatio: Math.exp(coefficient),
      oddsRatioLow: Math.exp(coefficient - 1.96 * standardError),
      oddsRatioHigh: Math.exp(coefficient + 1.96 * standardError),
      sd: fit.scales[j],
    };
  });

  const types = [...new Set(swings.map((p) => p.pitch_type))];
  const byPitchType = types
    .map((pitchType) => {
      const idx = swings.map((p, i) => (p.pitch_type === pitchType ? i : -1)).filter((i) => i >= 0);
      return {
        pitchType,
        swings: idx.length,
        observed: mean(idx.map((i) => labels[i])),
        predicted: mean(idx.map((i) => predictProbability(fit, rows[i]))),
      };
    })
    .sort((a, b) => b.swings - a.swings);

  return { status: "ok", swings: swings.length, whiffs, fit, coefficients, byPitchType };
}
