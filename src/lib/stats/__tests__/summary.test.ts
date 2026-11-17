import { describe, expect, it } from "vitest";
import { generateSeason } from "../../seed/generate";
import type { Outing, Pitch, PitchResult, PitchType } from "../../types";
import { mean, pct, sampleSd } from "../descriptive";
import { fatigueForOuting } from "../fatigue";
import { locationGrid, pitchMixByCount, summarizeByPitchType, velocityByOuting } from "../summary";
import { fitWhiffModel } from "../whiff-model";

let nextId = 1;
function p(
  type: PitchType,
  result: PitchResult | null,
  x: number | null = 0,
  z: number | null = 2.5,
  extra: Partial<Pitch> = {},
): Pitch {
  const id = nextId++;
  return {
    id: String(id),
    outing_id: "o1",
    pitch_number: id,
    pitch_type: type,
    velocity: 90,
    spin_rate: 2200,
    hb: -9,
    ivb: 16,
    plate_x: x,
    plate_z: z,
    balls: 0,
    strikes: 0,
    result,
    ...extra,
  };
}

describe("descriptive helpers", () => {
  it("computes mean, sample SD, and safe percentages", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBeNull();
  });
});

describe("summarizeByPitchType", () => {
  const pitches = [
    // In the zone: called strike, whiff, foul, in play.
    p("FF", "called_strike"),
    p("FF", "whiff"),
    p("FF", "foul"),
    p("FF", "in_play"),
    // Out of the zone: two takes, one chase that is a whiff, one chase fouled off.
    p("FF", "ball", 2, 2.5),
    p("FF", "ball", 0, 5),
    p("FF", "whiff", 0, 0.8),
    p("FF", "foul", -1.5, 2.5),
    // A bullpen pitch: located but no result.
    p("FF", null, 0, 2.5),
    p("SV", "ball", 1.5, 1),
  ];
  const [ff, sv] = summarizeByPitchType(pitches);

  it("orders by canonical pitch type and computes usage", () => {
    expect(ff.pitchType).toBe("FF");
    expect(sv.pitchType).toBe("SV");
    expect(ff.count).toBe(9);
    expect(ff.usagePct).toBe(90);
  });

  it("strike% counts every non-ball over pitches with a result", () => {
    expect(ff.withResult).toBe(8);
    expect(ff.strikePct).toBe(75); // 6 of 8
  });

  it("whiff% is whiffs per swing", () => {
    expect(ff.swings).toBe(5);
    expect(ff.whiffPct).toBe(40); // 2 of 5
  });

  it("chase% is swings at out-of-zone pitches per out-of-zone pitch", () => {
    expect(ff.outOfZone).toBe(4);
    expect(ff.chasePct).toBe(50); // 2 of 4
  });

  it("zone% uses every located pitch, including bullpen pitches", () => {
    expect(ff.zonePct).toBeCloseTo((5 / 9) * 100, 10);
  });

  it("returns null rates when there is no denominator", () => {
    expect(sv.whiffPct).toBeNull();
    expect(sv.chasePct).toBe(0);
    const [noResult] = summarizeByPitchType([p("CH", null, null, null)]);
    expect(noResult.strikePct).toBeNull();
    expect(noResult.chasePct).toBeNull();
    expect(noResult.zonePct).toBeNull();
  });
});

describe("pitchMixByCount", () => {
  it("gives usage percentages per count that sum to 100 and skips unseen counts", () => {
    const rows = pitchMixByCount([
      p("FF", "ball", 0, 2.5, { balls: 0, strikes: 0 }),
      p("FF", "ball", 0, 2.5, { balls: 0, strikes: 0 }),
      p("SV", "ball", 0, 2.5, { balls: 0, strikes: 0 }),
      p("SV", "whiff", 0, 2.5, { balls: 1, strikes: 2 }),
      p("FF", null, 0, 2.5, { balls: null, strikes: null }),
    ]);
    expect(rows.map((r) => r.count)).toEqual(["0-0", "1-2"]);
    expect(rows[0].total).toBe(3);
    expect(rows[0].FF).toBeCloseTo(66.667, 2);
    expect(rows[0].SV).toBeCloseTo(33.333, 2);
    expect(rows[1].SV).toBe(100);
    expect(rows[1].FF).toBe(0);
  });
});

describe("velocityByOuting", () => {
  it("averages velocity per pitch type per outing in outing order", () => {
    const outings: Outing[] = [
      { id: "a", outing_date: "2026-03-01", outing_type: "game", opponent: null, notes: null, source: "manual" },
      { id: "b", outing_date: "2026-03-08", outing_type: "game", opponent: null, notes: null, source: "manual" },
      { id: "empty", outing_date: "2026-03-09", outing_type: "bullpen", opponent: null, notes: null, source: "manual" },
    ];
    const rows = velocityByOuting(outings, [
      p("FF", null, 0, 2.5, { outing_id: "a", velocity: 89 }),
      p("FF", null, 0, 2.5, { outing_id: "a", velocity: 91 }),
      p("SV", null, 0, 2.5, { outing_id: "a", velocity: 77 }),
      p("FF", null, 0, 2.5, { outing_id: "b", velocity: 90.5 }),
      p("SV", null, 0, 2.5, { outing_id: "b", velocity: null }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].FF).toBe(90);
    expect(rows[0].SV).toBe(77);
    expect(rows[1].FF).toBe(90.5);
    expect(rows[1].SV).toBeUndefined();
  });
});

describe("locationGrid", () => {
  it("bins by location with row 0 at the top and clamps strays to the edges", () => {
    const grid = locationGrid(
      [p("FF", null, 0, 2.5), p("FF", null, 0, 2.5), p("FF", null, -9, 9), p("FF", null, 9, -9), p("FF", null, null, null)],
      7,
      8,
    );
    expect(grid.total).toBe(4);
    expect(grid.max).toBe(2);
    expect(grid.counts[4][3]).toBe(2); // center column, just below mid-height
    expect(grid.counts[0][0]).toBe(1); // high and left
    expect(grid.counts[7][6]).toBe(1); // low and right
  });
});

describe("seeded season", () => {
  const season = generateSeason();
  const outings: Outing[] = season.map((o, i) => ({
    id: `o${i}`,
    outing_date: o.outing_date,
    outing_type: o.outing_type,
    opponent: o.opponent,
    notes: o.notes,
    source: "seed",
  }));
  const pitches: Pitch[] = season.flatMap((o, i) =>
    o.pitches.map((pitch) => ({ ...pitch, id: `o${i}-${pitch.pitch_number}`, outing_id: `o${i}` })),
  );

  it("is deterministic", () => {
    expect(generateSeason()).toEqual(season);
    expect(generateSeason(1)).not.toEqual(season);
  });

  it("looks like a lefty sitting 88 to 91 with three pitches", () => {
    const summary = summarizeByPitchType(pitches);
    expect(summary.map((s) => s.pitchType)).toEqual(["FF", "FT", "SV"]);
    const [ff, ft, sv] = summary;
    expect(ff.avgVelo).toBeGreaterThan(88);
    expect(ff.avgVelo).toBeLessThan(91);
    expect(ft.avgVelo).toBeGreaterThan(87.5);
    expect(ft.avgVelo).toBeLessThan(ff.avgVelo as number);
    expect(sv.avgVelo).toBeGreaterThan(74);
    expect(sv.avgVelo).toBeLessThan(80);
    // Left-hander: fastballs run arm side (negative), slurve sweeps glove side.
    expect(ff.avgHb).toBeLessThan(0);
    expect(ft.avgHb).toBeLessThan(ff.avgHb as number);
    expect(sv.avgHb).toBeGreaterThan(0);
    // Plausible rates.
    expect(ff.strikePct).toBeGreaterThan(55);
    expect(ff.strikePct).toBeLessThan(75);
    expect(sv.whiffPct).toBeGreaterThan(ff.whiffPct as number);
    expect(sv.chasePct).toBeGreaterThan(15);
  });

  it("bullpens carry no count or result; games always do", () => {
    season.forEach((o) => {
      const withResult = o.pitches.filter((pitch) => pitch.result !== null).length;
      expect(withResult).toBe(o.outing_type === "game" ? o.pitches.length : 0);
    });
  });

  it("flags fatigue in the games built with a velocity fade", () => {
    const flagged = season.map((_, i) => fatigueForOuting(pitches.filter((pitch) => pitch.outing_id === `o${i}`)).result.status);
    const fatiguedDates = outings.filter((_, i) => flagged[i] === "fatigued").map((o) => o.outing_date);
    for (const date of ["2026-02-21", "2026-03-07", "2026-03-21", "2026-04-04"]) {
      expect(fatiguedDates).toContain(date);
    }
    // Bullpens are too short and too steady to flag.
    outings.forEach((o, i) => {
      if (o.outing_type === "bullpen") expect(flagged[i]).not.toBe("fatigued");
    });
  });

  it("the whiff model recovers the direction of every effect built into the data", () => {
    const model = fitWhiffModel(pitches);
    expect(model.status).toBe("ok");
    if (model.status !== "ok") return;
    expect(model.fit.converged).toBe(true);
    const byKey = Object.fromEntries(model.coefficients.map((c) => [c.feature.key, c]));
    expect(byKey.offspeed.coefficient).toBeGreaterThan(0);
    expect(byKey.distance.coefficient).toBeGreaterThan(0);
    expect(byKey.distance.pValue).toBeLessThan(0.05);
    expect(model.fit.auc).toBeGreaterThan(0.6);
    expect(model.fit.logLoss).toBeLessThan(model.fit.nullLogLoss);
    for (const c of model.coefficients) {
      expect(c.oddsRatioLow).toBeLessThan(c.oddsRatio);
      expect(c.oddsRatioHigh).toBeGreaterThan(c.oddsRatio);
    }
  });

  it("reports insufficient data instead of fitting on a handful of swings", () => {
    const model = fitWhiffModel(pitches.slice(0, 40));
    expect(model.status).toBe("insufficient");
  });
});
