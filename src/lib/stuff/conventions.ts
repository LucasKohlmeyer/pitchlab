import { FASTBALLS } from "../pitch";
import type { Pitch, PitchType } from "../types";

/**
 * Units and sign conventions for the Stuff+ models and MLB comps.
 * This is the TypeScript twin of ml/conventions.py; both are tested against
 * ml/tests/convention_cases.json.
 *
 * PitchLab stores pitches in the TrackMan convention:
 *   horizontal break   inches, pitcher's view, + = toward the pitcher's right
 *   induced vertical   inches, + = up
 *   release side       feet, pitcher's view, + = toward the pitcher's right
 *   release height     feet;  extension  feet
 *
 * Statcast reports break and release side in feet from the catcher's view, so
 *   hb = -12 * pfx_x,  ivb = 12 * pfx_z,  release_side = -release_pos_x.
 *
 * The models take "arm-side positive" inputs, so a left-hander's horizontal
 * values are negated. A lefty and a righty with mirror-image pitches then
 * produce identical features.
 */

export type Throws = "L" | "R";
export type PitchGroup = "fastball" | "breaking" | "offspeed";

export const PITCH_GROUP: Record<PitchType, PitchGroup> = {
  FF: "fastball",
  FT: "fastball",
  FC: "fastball",
  SL: "breaking",
  SV: "breaking",
  CU: "breaking",
  CH: "offspeed",
  FS: "offspeed",
};

export const GROUP_LABELS: Record<PitchGroup, string> = {
  fastball: "Fastballs",
  breaking: "Breaking balls",
  offspeed: "Offspeed",
};

/** Model input order. Must match FEATURES in ml/conventions.py. */
export const FEATURES = [
  "velo",
  "spin",
  "hb_arm",
  "ivb",
  "rel_height",
  "rel_side_arm",
  "extension",
  "velo_diff",
  "hb_diff",
  "ivb_diff",
] as const;
export type FeatureName = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  velo: "Velocity",
  spin: "Spin rate",
  hb_arm: "Horizontal break (arm side +)",
  ivb: "Induced vertical break",
  rel_height: "Release height",
  rel_side_arm: "Release side (arm side +)",
  extension: "Extension",
  velo_diff: "Velocity vs. primary fastball",
  hb_diff: "Horizontal break vs. primary fastball",
  ivb_diff: "Vertical break vs. primary fastball",
};

export type StatcastPitch = {
  pfx_x: number;
  pfx_z: number;
  release_pos_x: number;
  release_pos_z: number;
  release_extension: number;
};

export function statcastToPitchLab(s: StatcastPitch) {
  return {
    hb: -12 * s.pfx_x,
    ivb: 12 * s.pfx_z,
    release_side: -s.release_pos_x,
    release_height: s.release_pos_z,
    extension: s.release_extension,
  };
}

/** Mirror a pitcher's-view horizontal value so that + always means arm side. */
export function armSidePositive(value: number, throws: Throws): number {
  return throws === "L" ? -value : value;
}

/** Average shape of the pitcher's most-thrown fastball, arm-side positive. */
export type FastballReference = { pitchType: PitchType; velo: number; hbArm: number; ivb: number };

const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

export function fastballReference(pitches: Pitch[], throws: Throws): FastballReference | null {
  let best: FastballReference | null = null;
  let bestCount = 0;
  for (const type of FASTBALLS) {
    const usable = pitches.filter((p) => p.pitch_type === type && p.velocity !== null && p.hb !== null && p.ivb !== null);
    if (usable.length > bestCount) {
      bestCount = usable.length;
      best = {
        pitchType: type,
        velo: avg(usable.map((p) => p.velocity as number)),
        hbArm: avg(usable.map((p) => armSidePositive(p.hb as number, throws))),
        ivb: avg(usable.map((p) => p.ivb as number)),
      };
    }
  }
  return best;
}

/** True when the pitch has the minimum the models need: velocity and both break values. */
export function isGradable(p: Pitch): boolean {
  return p.velocity !== null && p.hb !== null && p.ivb !== null;
}

/**
 * Model inputs for one pitch, in FEATURES order. Missing values are NaN; the
 * trees were trained with missing release and spin data, so they route NaN
 * down a learned default branch.
 */
export function buildFeatures(p: Pitch, throws: Throws, fastball: FastballReference | null): number[] {
  const hbArm = p.hb === null ? NaN : armSidePositive(p.hb, throws);
  const velo = p.velocity ?? NaN;
  const ivb = p.ivb ?? NaN;
  return [
    velo,
    p.spin_rate ?? NaN,
    hbArm,
    ivb,
    p.release_height ?? NaN,
    p.release_side === null ? NaN : armSidePositive(p.release_side, throws),
    p.extension ?? NaN,
    fastball ? velo - fastball.velo : NaN,
    fastball ? hbArm - fastball.hbArm : NaN,
    fastball ? ivb - fastball.ivb : NaN,
  ];
}

/**
 * Best guess at handedness when the pitcher has not set it: a fastball's
 * horizontal break points to the arm side, which is + for a right-hander.
 */
export function inferThrows(pitches: Pitch[]): Throws | null {
  const fastballs = pitches.filter((p) => (p.pitch_type === "FF" || p.pitch_type === "FT") && p.hb !== null);
  if (fastballs.length < 5) return null;
  return avg(fastballs.map((p) => p.hb as number)) >= 0 ? "R" : "L";
}
