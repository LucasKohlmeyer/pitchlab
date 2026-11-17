import { describe, expect, it } from "vitest";
import { createRng } from "../../seed/generate";
import type { Pitch } from "../../types";
import { detectFatigue, fatigueForOuting, primaryFastball, type VelocityPoint } from "../fatigue";

const series = (velocities: number[]): VelocityPoint[] =>
  velocities.map((velocity, i) => ({ pitchNumber: i + 1, velocity }));

describe("detectFatigue", () => {
  it("reports insufficient data when there are fewer pitches than baseline + window", () => {
    const result = detectFatigue(series(new Array(17).fill(90)));
    expect(result.status).toBe("insufficient");
    expect(result.onsetPitchNumber).toBeNull();
  });

  it("does not flag a steady outing", () => {
    const rng = createRng(1);
    const result = detectFatigue(series(Array.from({ length: 60 }, () => rng.normal(90, 0.6))));
    expect(result.status).toBe("steady");
    expect(result.points.some((p) => p.flagged)).toBe(false);
  });

  it("flags a clear, sustained velocity drop and finds the onset near the change point", () => {
    const rng = createRng(2);
    const velocities = Array.from({ length: 60 }, (_, i) => rng.normal(i < 40 ? 90 : 87.5, 0.5));
    const result = detectFatigue(series(velocities));
    expect(result.status).toBe("fatigued");
    // The rolling window needs a few slow pitches before its mean crosses the threshold.
    expect(result.onsetPitchNumber).toBeGreaterThanOrEqual(41);
    expect(result.onsetPitchNumber).toBeLessThanOrEqual(49);
    expect(result.maxDrop).toBeGreaterThan(2);
  });

  it("computes baseline, threshold, and z exactly on a hand-checkable series", () => {
    // Baseline: ten pitches alternating 89 and 91 -> mean 90, sample SD sqrt(10/9).
    const baseline = [89, 91, 89, 91, 89, 91, 89, 91, 89, 91];
    const result = detectFatigue(series([...baseline, ...new Array(10).fill(88)]));
    const s0 = Math.sqrt(10 / 9);
    const se = s0 * Math.sqrt(1 / 8 + 1 / 10);
    expect(result.baselineMean).toBeCloseTo(90, 10);
    expect(result.baselineSd).toBeCloseTo(s0, 10);
    expect(result.threshold).toBeCloseTo(90 - Math.max(1, 2.5 * se), 10);
    const last = result.points[19];
    expect(last.rolling).toBeCloseTo(88, 10);
    expect(last.z).toBeCloseTo(-2 / se, 10);
    expect(last.flagged).toBe(true);
    // Windows ending at pitches 18, 19, 20 are the first three flagged in a row.
    expect(result.onsetPitchNumber).toBe(18);
  });

  it("ignores a statistically significant drop that is smaller than the minimum mph", () => {
    // Very tight baseline (SD floor applies), then a 0.8 mph drop: significant but under 1.0 mph.
    const result = detectFatigue(series([...new Array(10).fill(90), ...new Array(15).fill(89.2)]));
    expect(result.status).toBe("steady");
    expect(result.maxDrop).toBeCloseTo(0.8, 10);
  });

  it("requires the drop to be significant when the baseline is noisy", () => {
    // SD ~2.1 -> required drop = 2.5 * 2.1 * sqrt(1/8 + 1/10) = 2.5 mph, so a 1.5 mph drop is not enough.
    const baseline = [88, 92, 88, 92, 88, 92, 88, 92, 88, 92];
    const result = detectFatigue(series([...baseline, ...new Array(10).fill(88.5)]));
    expect(result.status).toBe("steady");
  });

  it("does not let one slow pitch trigger an onset", () => {
    const velocities = new Array(40).fill(90);
    velocities[25] = 82; // a slipped changeup grip, say
    const result = detectFatigue(series(velocities), { window: 5 });
    // The window containing the outlier dips 1.6 mph for five pitches, which is sustained...
    expect(result.points[25].flagged).toBe(true);
    // ...but a window of 1 would be judged pitch by pitch and never sustain.
    const single = detectFatigue(series(velocities), { window: 1, minDropMph: 1 });
    expect(single.status).toBe("steady");
  });

  it("respects option overrides", () => {
    const velocities = [...new Array(10).fill(90), ...new Array(10).fill(88.8)];
    expect(detectFatigue(series(velocities)).status).toBe("fatigued");
    expect(detectFatigue(series(velocities), { minDropMph: 1.5 }).status).toBe("steady");
  });
});

const pitch = (n: number, type: Pitch["pitch_type"], velocity: number | null): Pitch => ({
  id: String(n),
  outing_id: "o",
  pitch_number: n,
  pitch_type: type,
  velocity,
  spin_rate: null,
  hb: null,
  ivb: null,
  plate_x: null,
  plate_z: null,
  balls: null,
  strikes: null,
  result: null,
});

describe("fatigueForOuting", () => {
  it("picks the most-thrown fastball and ignores other pitch types", () => {
    const pitches: Pitch[] = [];
    let n = 1;
    for (let i = 0; i < 30; i++) {
      pitches.push(pitch(n++, "FF", i < 18 ? 90 : 87));
      pitches.push(pitch(n++, "SV", 77)); // slow pitches must not look like fatigue
      if (i % 3 === 0) pitches.push(pitch(n++, "FT", 89));
    }
    expect(primaryFastball(pitches)).toBe("FF");
    const { pitchType, result } = fatigueForOuting(pitches);
    expect(pitchType).toBe("FF");
    expect(result.points).toHaveLength(30);
    expect(result.status).toBe("fatigued");
    // Onset is reported as the pitch number within the whole outing.
    const onsetPitch = pitches.find((p) => p.pitch_number === result.onsetPitchNumber);
    expect(onsetPitch?.pitch_type).toBe("FF");
  });

  it("returns insufficient when there is no fastball", () => {
    const { pitchType, result } = fatigueForOuting([pitch(1, "SV", 77), pitch(2, "CH", 80)]);
    expect(pitchType).toBeNull();
    expect(result.status).toBe("insufficient");
  });
});
