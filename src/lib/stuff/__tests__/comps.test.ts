import { describe, expect, it } from "vitest";
import type { Pitch } from "../../types";
import {
  COMP_FEATURES,
  COMP_POOL,
  findComps,
  parseCompsFile,
  pitchProfile,
  poolScale,
  similarityScore,
  standardizedDistance,
  type MlbPitch,
  type PitchProfile,
} from "../comps";
import compsFile from "../mlb-lhp-comps.json";

const mlb = (name: string, overrides: Partial<MlbPitch> = {}): MlbPitch => ({
  name,
  season: 2026,
  pitchType: "FF",
  pitches: 500,
  stuffPlus: 100,
  velo: 93,
  spin: 2300,
  hb: -8,
  ivb: 16,
  relHeight: 6,
  extension: 6.4,
  ...overrides,
});

const profile = (overrides: Partial<PitchProfile> = {}): PitchProfile => ({
  pitches: 100,
  velo: 93,
  spin: 2300,
  hb: -8,
  ivb: 16,
  relHeight: 6,
  extension: 6.4,
  ...overrides,
});

describe("poolScale", () => {
  it("computes the mean and population SD per feature", () => {
    const scale = poolScale([mlb("a", { velo: 90 }), mlb("b", { velo: 94 })]);
    expect(scale.velo.mean).toBe(92);
    expect(scale.velo.sd).toBe(2);
  });

  it("falls back to an SD of 1 when a feature does not vary, to avoid dividing by zero", () => {
    expect(poolScale([mlb("a"), mlb("b")]).spin.sd).toBe(1);
  });
});

describe("standardizedDistance and similarityScore", () => {
  const pool = [mlb("a", { velo: 90, ivb: 14 }), mlb("b", { velo: 94, ivb: 18 })];
  const scale = poolScale(pool); // velo sd 2, ivb sd 2, everything else sd 1 with no gap

  it("is zero for an identical pitch", () => {
    expect(standardizedDistance(profile({ velo: 90, ivb: 14 }), pool[0], scale)).toBe(0);
    expect(similarityScore(0)).toBe(100);
  });

  it("is the root mean square of z-score gaps", () => {
    // velo gap 4 mph = 2 SD, ivb gap 4 in = 2 SD, four other features identical.
    const d = standardizedDistance(profile({ velo: 94, ivb: 18 }), pool[0], scale);
    expect(d).toBeCloseTo(Math.sqrt((4 + 4) / 6), 12);
  });

  it("ignores features the user does not have and stays comparable", () => {
    const partial = profile({ velo: 94, ivb: 18, relHeight: null, extension: null });
    const d = standardizedDistance(partial, pool[0], scale);
    expect(d).toBeCloseTo(Math.sqrt((4 + 4) / 4), 12);
    expect(standardizedDistance({ pitches: 0, velo: null, spin: null, hb: null, ivb: null, relHeight: null, extension: null }, pool[0], scale)).toBe(Infinity);
  });

  it("does not depend on units: rescaling a feature leaves the distance unchanged", () => {
    const inFeet = (p: MlbPitch): MlbPitch => ({ ...p, ivb: p.ivb / 12 });
    const d1 = standardizedDistance(profile({ ivb: 17 }), pool[0], scale);
    const d2 = standardizedDistance(profile({ ivb: 17 / 12 }), inFeet(pool[0]), poolScale(pool.map(inFeet)));
    expect(d2).toBeCloseTo(d1, 12);
  });

  it("maps distance to similarity on a fixed curve", () => {
    expect(similarityScore(1)).toBeCloseTo(60.65, 2);
    expect(similarityScore(2)).toBeCloseTo(13.53, 2);
    expect(similarityScore(0.5)).toBeGreaterThan(similarityScore(1));
  });
});

describe("pitchProfile", () => {
  it("averages each feature over the readings that exist", () => {
    const base = { id: "1", outing_id: "o", pitch_number: 1, pitch_type: "FF", plate_x: null, plate_z: null, balls: null, strikes: null, result: null } as const;
    const pitches: Pitch[] = [
      { ...base, velocity: 90, spin_rate: 2200, hb: -9, ivb: 16, release_height: 5.9, release_side: -2, extension: null },
      { ...base, velocity: 92, spin_rate: null, hb: -11, ivb: 18, release_height: 6.1, release_side: -2, extension: null },
    ];
    expect(pitchProfile(pitches)).toEqual({ pitches: 2, velo: 91, spin: 2200, hb: -10, ivb: 17, relHeight: 6, extension: null });
  });
});

describe("findComps", () => {
  const pool = [
    mlb("Close One", { velo: 93.2 }),
    mlb("Close One", { season: 2025, velo: 93.1 }),
    mlb("Far Away", { velo: 99, ivb: 20 }),
    mlb("Middle", { velo: 95 }),
    mlb("Sinker Guy", { pitchType: "SI", velo: 93 }),
    mlb("Third", { velo: 91.5, ivb: 15 }),
  ];

  it("returns the nearest pitches in order, one per pitcher, from the right pitch-type pool", () => {
    const result = findComps("FF", profile(), pool, 3);
    expect(result.poolSize).toBe(5);
    expect(result.comps.map((c) => c.pitch.name)).toEqual(["Close One", "Middle", "Third"]);
    expect(result.comps[0].pitch.season).toBe(2025); // the closer of his two seasons
    const distances = result.comps.map((c) => c.distance);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(result.comps[0].similarity).toBeGreaterThan(result.comps[2].similarity);
    expect(result.featuresUsed).toEqual([...COMP_FEATURES]);
  });

  it("compares a two-seam with MLB sinkers and a slurve with every breaking ball", () => {
    expect(findComps("FT", profile(), pool).comps.map((c) => c.pitch.name)).toEqual(["Sinker Guy"]);
    expect(COMP_POOL.SV).toEqual(expect.arrayContaining(["SV", "SL", "ST", "CU", "KC"]));
  });

  it("returns no comps when the user has too few features or the pool is empty", () => {
    const thin = profile({ spin: null, hb: null, ivb: null, relHeight: null, extension: null });
    expect(findComps("FF", thin, pool).comps).toEqual([]);
    expect(findComps("FS", profile(), pool).comps).toEqual([]);
  });
});

describe("the shipped comps file", () => {
  const all = parseCompsFile(compsFile);

  it("parses into complete rows of left-handed MLB pitches", () => {
    expect(compsFile.throws).toBe("L");
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) {
      expect(p.pitches).toBeGreaterThanOrEqual(compsFile.minPitches);
      for (const f of COMP_FEATURES) expect(Number.isFinite(p[f])).toBe(true);
    }
  });

  it("is in pitcher's-view conventions: left-handed four-seams run arm side (negative) with positive ride, released from the left", () => {
    const fourSeams = all.filter((p) => p.pitchType === "FF");
    const share = (test: (p: MlbPitch) => boolean) => fourSeams.filter(test).length / fourSeams.length;
    expect(share((p) => p.hb < 0)).toBeGreaterThan(0.95);
    expect(share((p) => p.ivb > 5)).toBeGreaterThan(0.95);
    expect(share((p) => p.velo > 85 && p.velo < 102)).toBe(1);
    expect(share((p) => p.relHeight > 3.5 && p.relHeight < 7.5)).toBeGreaterThan(0.98); // a few sidearmers release lower
  });

  it("finds five distinct comps for a typical college lefty fastball", () => {
    const result = findComps("FF", profile({ velo: 89.1, spin: 2180, hb: -9.4, ivb: 16.1, relHeight: 5.95, extension: 6.25 }), all);
    expect(result.comps).toHaveLength(5);
    expect(new Set(result.comps.map((c) => c.pitch.name)).size).toBe(5);
    for (const c of result.comps) expect(c.similarity).toBeGreaterThan(0);
  });
});
