import { describe, expect, it } from "vitest";
import { generateSeason } from "../../seed/generate";
import type { Outing, Pitch } from "../../types";
import { FEATURES, PITCH_GROUP, type PitchGroup } from "../conventions";
import { MODELS, MODEL_META, buildStuffReport, gradePitch } from "../grade";
import { predict, predictTree, toStuffPlus, type Tree } from "../model";
import parity from "./fixtures/parity.json";

const GROUPS: PitchGroup[] = ["fastball", "breaking", "offspeed"];

describe("predictTree", () => {
  // Root: x0 <= 5 ? (x1 <= 2 ? leaf0 : leaf1) : leaf2
  const tree: Tree = { f: [0, 1], t: [5, 2], n: [1, 0], l: [1, -1], r: [-3, -2], v: [10, 20, 30] };

  it("walks left on <= and right on >", () => {
    expect(predictTree(tree, [5, 2])).toBe(10); // both comparisons are inclusive
    expect(predictTree(tree, [5, 2.01])).toBe(20);
    expect(predictTree(tree, [5.01, 0])).toBe(30);
  });

  it("sends missing values down each node's own default branch", () => {
    expect(predictTree(tree, [NaN, 0])).toBe(10); // root: NaN goes left
    expect(predictTree(tree, [0, NaN])).toBe(20); // node 1: NaN goes right
    expect(predictTree(tree, [NaN, NaN])).toBe(20);
  });

  it("handles a tree that is a single leaf", () => {
    expect(predictTree({ f: [], t: [], n: [], l: [], r: [], v: [0.25] }, [1, 2])).toBe(0.25);
  });

  it("sums trees", () => {
    expect(predict({ group: "x", trees: [tree, tree] }, [9, 9])).toBe(60);
  });
});

describe("toStuffPlus", () => {
  it("is 100 at the mean, and a lower run value earns a higher grade", () => {
    expect(toStuffPlus(0.01, 0.01, 0.002)).toBe(100);
    expect(toStuffPlus(0.008, 0.01, 0.002)).toBeCloseTo(110, 9); // one SD better
    expect(toStuffPlus(0.014, 0.01, 0.002)).toBeCloseTo(80, 9); // two SD worse
  });
});

describe("parity with the Python models", () => {
  it("uses the feature order the models were trained with", () => {
    expect(parity.features).toEqual([...FEATURES]);
    expect(MODEL_META.features).toEqual([...FEATURES]);
  });

  for (const group of GROUPS) {
    it(`${group}: TypeScript predictions match LightGBM on real test rows, including rows with missing inputs`, () => {
      const fixture = parity.groups[group];
      const scale = MODEL_META.groups[group];
      expect(fixture.rows.length).toBe(40);
      let rowsWithMissing = 0;
      fixture.rows.forEach((row, i) => {
        const x = row.map((v) => (v === null ? NaN : v));
        if (x.some(Number.isNaN)) rowsWithMissing++;
        const prediction = predict(MODELS[group], x);
        expect(prediction).toBeCloseTo(fixture.predictions[i], 10);
        expect(toStuffPlus(prediction, scale.mean, scale.sd)).toBeCloseTo(fixture.stuffPlus[i], 6);
      });
      expect(rowsWithMissing).toBeGreaterThanOrEqual(8);
    });
  }

  it("every exported tree is structurally valid", () => {
    for (const group of GROUPS) {
      expect(MODELS[group].trees.length).toBe(MODEL_META.groups[group].trees);
      for (const tree of MODELS[group].trees) {
        const internal = tree.f.length;
        expect(tree.t.length).toBe(internal);
        expect(tree.v.length).toBe(internal + 1); // a binary tree has one more leaf than splits
        for (let i = 0; i < internal; i++) {
          expect(tree.f[i]).toBeLessThan(FEATURES.length);
          for (const child of [tree.l[i], tree.r[i]]) {
            if (child >= 0) expect(child).toBeLessThan(internal);
            else expect(~child).toBeLessThan(tree.v.length);
          }
        }
      }
    }
  });
});

describe("grading PitchLab pitches", () => {
  const season = generateSeason();
  const outings: Outing[] = season.map((o, i) => ({
    id: `o${i}`,
    outing_date: o.outing_date,
    outing_type: o.outing_type,
    opponent: o.opponent,
    notes: o.notes,
    source: "seed",
  }));
  const pitches: Pitch[] = season.flatMap((o, i) => o.pitches.map((p) => ({ ...p, id: `o${i}-${p.pitch_number}`, outing_id: `o${i}` })));
  const report = buildStuffReport(outings, pitches, "L");

  it("grades every seeded pitch and rolls up by type and outing", () => {
    expect(report.graded).toBe(pitches.length);
    expect(report.byType.map((s) => s.pitchType)).toEqual(["FF", "FT", "SV"]);
    expect(report.byOuting).toHaveLength(outings.length);
    expect(report.fastball?.pitchType).toBe("FF");
    for (const s of report.byType) {
      expect(s.partialShare).toBe(0);
      expect(Number.isFinite(s.stuffPlus)).toBe(true);
    }
    // The overall grade is the pitch-weighted mean of the per-type grades.
    const weighted = report.byType.reduce((sum, s) => sum + s.stuffPlus * s.graded, 0) / report.graded;
    expect(report.overall).toBeCloseTo(weighted, 9);
  });

  it("an 89 mph college fastball grades below the MLB average of 100", () => {
    const ff = report.byType.find((s) => s.pitchType === "FF");
    expect(ff?.stuffPlus).toBeLessThan(100);
    expect(ff?.stuffPlus).toBeGreaterThan(40);
  });

  it("more fastball velocity never grades meaningfully worse, other things equal", () => {
    const base = pitches.find((p) => p.pitch_type === "FF") as Pitch;
    const at = (velocity: number) => gradePitch({ ...base, velocity }, "L", report.fastball)?.stuffPlus as number;
    expect(at(97)).toBeGreaterThan(at(89));
    expect(at(93)).toBeGreaterThan(at(86));
  });

  it("mirror-image pitches from a lefty and a righty get the same grade", () => {
    const lefty = pitches.find((p) => p.pitch_type === "SV") as Pitch;
    const righty: Pitch = { ...lefty, hb: -(lefty.hb as number), release_side: -(lefty.release_side as number) };
    const leftRef = report.fastball;
    const rightRef = leftRef && { ...leftRef };
    expect(gradePitch(righty, "R", rightRef)?.stuffPlus).toBeCloseTo(gradePitch(lefty, "L", leftRef)?.stuffPlus as number, 9);
  });

  it("flags partial inputs and refuses pitches without velocity or break", () => {
    const base = pitches[0];
    expect(gradePitch({ ...base, extension: null }, "L", report.fastball)?.partial).toBe(true);
    expect(gradePitch({ ...base, spin_rate: null }, "L", report.fastball)?.partial).toBe(true);
    expect(gradePitch(base, "L", report.fastball)?.partial).toBe(false);
    expect(gradePitch({ ...base, velocity: null }, "L", report.fastball)).toBeNull();
    expect(gradePitch({ ...base, hb: null }, "L", report.fastball)).toBeNull();
  });

  it("uses the model for the pitch's group", () => {
    expect(PITCH_GROUP.SV).toBe("breaking");
    expect(PITCH_GROUP.FT).toBe("fastball");
    expect(PITCH_GROUP.CH).toBe("offspeed");
  });
});
