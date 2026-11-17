import { describe, expect, it } from "vitest";
import cases from "../../../../ml/tests/convention_cases.json";
import type { Pitch, PitchType } from "../../types";
import {
  FEATURES,
  armSidePositive,
  buildFeatures,
  fastballReference,
  inferThrows,
  isGradable,
  statcastToPitchLab,
  type Throws,
} from "../conventions";

function pitch(type: PitchType, overrides: Partial<Pitch> = {}): Pitch {
  return {
    id: "x",
    outing_id: "o",
    pitch_number: 1,
    pitch_type: type,
    velocity: 90,
    spin_rate: 2200,
    hb: 9,
    ivb: 16,
    plate_x: 0,
    plate_z: 2.5,
    balls: null,
    strikes: null,
    result: null,
    release_height: 5.9,
    release_side: 2,
    extension: 6.3,
    ...overrides,
  };
}

describe("Statcast to PitchLab conversions (shared cases with the Python pipeline)", () => {
  for (const c of cases.statcast_to_pitchlab) {
    it(c.name, () => {
      const out = statcastToPitchLab({ ...c.statcast });
      expect(out.hb).toBeCloseTo(c.pitchlab.hb, 9);
      expect(out.ivb).toBeCloseTo(c.pitchlab.ivb, 9);
      expect(out.release_side).toBeCloseTo(c.pitchlab.release_side, 9);
      expect(out.release_height).toBe(c.pitchlab.release_height);
      expect(out.extension).toBe(c.pitchlab.extension);
    });
  }
});

describe("handedness normalization (shared cases)", () => {
  for (const c of cases.arm_side_positive) {
    it(c.name, () => {
      expect(armSidePositive(c.value, c.throws as Throws)).toBeCloseTo(c.expected, 9);
    });
  }
  for (const c of cases.mirror_pairs) {
    it(c.name, () => {
      expect(armSidePositive(c.left.hb, "L")).toBe(armSidePositive(c.right.hb, "R"));
      expect(armSidePositive(c.left.release_side, "L")).toBe(armSidePositive(c.right.release_side, "R"));
    });
  }
});

describe("fastballReference", () => {
  it("uses the most-thrown fastball type and averages it arm-side positive", () => {
    const pitches = [
      pitch("FT", { velocity: 88, hb: -15, ivb: 9 }),
      pitch("FT", { velocity: 89, hb: -16, ivb: 10 }),
      pitch("FF", { velocity: 90, hb: -9, ivb: 16 }),
      pitch("SV", { velocity: 77, hb: 10, ivb: -5 }),
    ];
    const ref = fastballReference(pitches, "L");
    expect(ref).toEqual({ pitchType: "FT", velo: 88.5, hbArm: 15.5, ivb: 9.5 });
  });

  it("is null without a fastball that has velocity and break", () => {
    expect(fastballReference([pitch("SV"), pitch("FF", { hb: null })], "R")).toBeNull();
  });
});

describe("buildFeatures", () => {
  const leftyFastballs = [pitch("FF", { velocity: 90, hb: -9, ivb: 16 }), pitch("FF", { velocity: 92, hb: -11, ivb: 18 })];
  const ref = fastballReference(leftyFastballs, "L");

  it("returns values in the documented feature order", () => {
    const slurve = pitch("SV", { velocity: 77, spin_rate: 2400, hb: 10, ivb: -5, release_height: 5.8, release_side: -2.2, extension: 6 });
    const row = buildFeatures(slurve, "L", ref);
    const byName = Object.fromEntries(FEATURES.map((name, i) => [name, row[i]]));
    expect(byName).toEqual({
      velo: 77,
      spin: 2400,
      hb_arm: -10, // glove side for a lefty
      ivb: -5,
      rel_height: 5.8,
      rel_side_arm: 2.2,
      extension: 6,
      velo_diff: -14, // 77 - 91
      hb_diff: -20, // -10 - (+10)
      ivb_diff: -22, // -5 - 17
    });
  });

  it("gives a lefty and his mirror-image righty identical features", () => {
    const lefty = pitch("FF", { hb: -9.4, release_side: -2 });
    const righty = pitch("FF", { hb: 9.4, release_side: 2 });
    const leftRef = fastballReference([lefty], "L");
    const rightRef = fastballReference([righty], "R");
    expect(buildFeatures(lefty, "L", leftRef)).toEqual(buildFeatures(righty, "R", rightRef));
  });

  it("passes missing readings through as NaN instead of zero", () => {
    const partial = pitch("FF", { spin_rate: null, release_height: null, release_side: null, extension: null });
    const row = buildFeatures(partial, "R", null);
    expect(row[0]).toBe(90);
    for (const i of [1, 4, 5, 6, 7, 8, 9]) expect(Number.isNaN(row[i])).toBe(true);
  });
});

describe("isGradable and inferThrows", () => {
  it("requires velocity and both break values", () => {
    expect(isGradable(pitch("FF"))).toBe(true);
    expect(isGradable(pitch("FF", { velocity: null }))).toBe(false);
    expect(isGradable(pitch("FF", { ivb: null }))).toBe(false);
    expect(isGradable(pitch("FF", { extension: null }))).toBe(true);
  });

  it("infers handedness from fastball run, and declines with too little data", () => {
    const lefty = Array.from({ length: 6 }, () => pitch("FF", { hb: -9 }));
    const righty = Array.from({ length: 6 }, () => pitch("FT", { hb: 14 }));
    expect(inferThrows(lefty)).toBe("L");
    expect(inferThrows(righty)).toBe("R");
    expect(inferThrows(lefty.slice(0, 3))).toBeNull();
    expect(inferThrows([pitch("SV", { hb: 10 })])).toBeNull();
  });
});
