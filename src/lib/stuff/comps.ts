import type { Pitch, PitchType } from "../types";

/**
 * MLB comps: the nearest left-handed MLB pitcher-seasons to one of the user's
 * pitch types, by standardized distance over pitch characteristics.
 */

export const COMP_FEATURES = ["velo", "spin", "hb", "ivb", "relHeight", "extension"] as const;
export type CompFeature = (typeof COMP_FEATURES)[number];

export const COMP_FEATURE_LABELS: Record<CompFeature, string> = {
  velo: "Velocity",
  spin: "Spin",
  hb: "Horizontal break",
  ivb: "Induced vertical break",
  relHeight: "Release height",
  extension: "Extension",
};

export type MlbPitch = {
  name: string;
  season: number;
  pitchType: string;
  pitches: number;
  stuffPlus: number;
} & Record<CompFeature, number>;

export type CompsFile = { columns: string[]; rows: (string | number)[][] };

/** Expands the compact column/row file into objects. */
export function parseCompsFile(file: CompsFile): MlbPitch[] {
  return file.rows.map((row) => Object.fromEntries(file.columns.map((c, i) => [c, row[i]])) as MlbPitch);
}

/**
 * Which Statcast pitch types each PitchLab type is compared against.
 * Statcast calls a two-seam a sinker, splits sweepers from sliders, and
 * rarely tags a slurve, so a slurve is compared with every breaking ball.
 */
export const COMP_POOL: Record<PitchType, string[]> = {
  FF: ["FF"],
  FT: ["SI"],
  FC: ["FC"],
  SL: ["SL", "ST"],
  SV: ["SV", "SL", "ST", "CU", "KC"],
  CU: ["CU", "KC"],
  CH: ["CH"],
  FS: ["FS", "FO"],
};

export type PitchProfile = Record<CompFeature, number | null> & { pitches: number };

const average = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
};

/** The user's average for each comp feature (null where they have no readings). */
export function pitchProfile(pitches: Pitch[]): PitchProfile {
  return {
    pitches: pitches.length,
    velo: average(pitches.map((p) => p.velocity)),
    spin: average(pitches.map((p) => p.spin_rate)),
    hb: average(pitches.map((p) => p.hb)),
    ivb: average(pitches.map((p) => p.ivb)),
    relHeight: average(pitches.map((p) => p.release_height)),
    extension: average(pitches.map((p) => p.extension)),
  };
}

export type Scale = Record<CompFeature, { mean: number; sd: number }>;

/** Mean and population SD of each feature across a pool of MLB pitches. */
export function poolScale(pool: MlbPitch[]): Scale {
  const scale = {} as Scale;
  for (const feature of COMP_FEATURES) {
    const values = pool.map((p) => p[feature]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    scale[feature] = { mean, sd: Math.sqrt(variance) || 1 };
  }
  return scale;
}

/**
 * Distance in standard deviations: root mean square of the z-score gaps over
 * the features the user actually has. Using the mean rather than the sum keeps
 * distances comparable when some features are missing.
 */
export function standardizedDistance(profile: PitchProfile, comp: MlbPitch, scale: Scale): number {
  let total = 0;
  let used = 0;
  for (const feature of COMP_FEATURES) {
    const value = profile[feature];
    if (value === null) continue;
    total += ((value - comp[feature]) / scale[feature].sd) ** 2;
    used++;
  }
  return used === 0 ? Infinity : Math.sqrt(total / used);
}

/** 100 for an identical pitch, about 61 at one SD apart on average, about 14 at two. */
export function similarityScore(distance: number): number {
  return 100 * Math.exp(-(distance ** 2) / 2);
}

export type Comp = { pitch: MlbPitch; distance: number; similarity: number };

export type CompResult = {
  pitchType: PitchType;
  profile: PitchProfile;
  /** Features that went into the distance. */
  featuresUsed: CompFeature[];
  poolSize: number;
  comps: Comp[];
};

export const MIN_COMP_FEATURES = 3;

/** The k nearest MLB pitches, one per pitcher (their closest season). */
export function findComps(pitchType: PitchType, profile: PitchProfile, all: MlbPitch[], k = 5): CompResult {
  const pool = all.filter((p) => COMP_POOL[pitchType].includes(p.pitchType));
  const featuresUsed = COMP_FEATURES.filter((f) => profile[f] !== null);
  if (pool.length === 0 || featuresUsed.length < MIN_COMP_FEATURES) {
    return { pitchType, profile, featuresUsed, poolSize: pool.length, comps: [] };
  }
  const scale = poolScale(pool);
  const ranked = pool
    .map((pitch) => {
      const distance = standardizedDistance(profile, pitch, scale);
      return { pitch, distance, similarity: similarityScore(distance) };
    })
    .sort((a, b) => a.distance - b.distance || a.pitch.name.localeCompare(b.pitch.name));

  const seen = new Set<string>();
  const comps: Comp[] = [];
  for (const candidate of ranked) {
    if (seen.has(candidate.pitch.name)) continue;
    seen.add(candidate.pitch.name);
    comps.push(candidate);
    if (comps.length === k) break;
  }
  return { pitchType, profile, featuresUsed, poolSize: pool.length, comps };
}
