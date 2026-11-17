import { FASTBALLS, ZONE, inZone } from "../pitch";
import { sigmoid } from "../stats/descriptive";
import type { OutingType, PitchInput, PitchResult, PitchType } from "../types";

/**
 * Deterministic generator for a realistic season of data: a left-handed
 * college pitcher sitting 88 to 91 mph with a four-seam, two-seam, and slurve.
 *
 * Games are simulated batter by batter. Pitch selection depends on the count,
 * swings depend on location, and whiffs are drawn from a known logistic model,
 * so the app's fitted whiff model has real signal to recover. Some games
 * include a late velocity fade so fatigue detection has something to find.
 */

export type SeedOuting = {
  outing_date: string;
  outing_type: OutingType;
  opponent: string | null;
  notes: string | null;
  pitches: PitchInput[];
};

/** mulberry32: small, fast, seedable PRNG. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mu = 0, sd = 1) => {
    // Box-Muller transform.
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const int = (lo: number, hi: number) => lo + Math.floor(uniform() * (hi - lo + 1));
  return { uniform, normal, int };
}

type Rng = ReturnType<typeof createRng>;

type PitchProfile = {
  velo: [number, number];
  spin: [number, number];
  hb: [number, number];
  ivb: [number, number];
  /** Aim point (catcher's view, ft) and command scatter. */
  target: { x: number; z: number };
  scatter: { x: number; z: number };
};

/** Left-hander: arm-side run is negative HB, the slurve sweeps glove side. */
export const ARSENAL: Record<"FF" | "FT" | "SV", PitchProfile> = {
  FF: {
    velo: [89.6, 0.8],
    spin: [2180, 85],
    hb: [-9.4, 1.6],
    ivb: [16.3, 1.5],
    target: { x: 0.1, z: 2.85 },
    scatter: { x: 0.72, z: 0.78 },
  },
  FT: {
    velo: [88.7, 0.8],
    spin: [2060, 85],
    hb: [-15.1, 1.6],
    ivb: [9.6, 1.7],
    target: { x: -0.35, z: 2.2 },
    scatter: { x: 0.7, z: 0.7 },
  },
  SV: {
    velo: [76.9, 1.1],
    spin: [2430, 110],
    hb: [9.6, 2.0],
    ivb: [-5.6, 2.0],
    target: { x: 0.45, z: 1.85 },
    scatter: { x: 0.78, z: 0.82 },
  },
};

/** The "true" whiff model used to draw swing outcomes. */
export const TRUE_WHIFF_MODEL = {
  intercept: -1.6,
  offspeed: 0.95,
  veloPerMph: 0.22,
  movementPerInch: 0.1,
  distancePerFoot: 1.1,
  twoStrikes: 0.4,
} as const;

const ZONE_CENTER_Z = (ZONE.bottom + ZONE.top) / 2;

function choosePitch(rng: Rng, balls: number, strikes: number): keyof typeof ARSENAL {
  let mix: [number, number, number]; // FF, FT, SV
  if (strikes === 2) mix = [0.38, 0.15, 0.47];
  else if (balls === 0 && strikes === 0) mix = [0.56, 0.24, 0.2];
  else if (balls > strikes) mix = [0.64, 0.25, 0.11];
  else mix = [0.45, 0.22, 0.33];
  const u = rng.uniform();
  return u < mix[0] ? "FF" : u < mix[0] + mix[1] ? "FT" : "SV";
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type OutingPlan = {
  date: string;
  type: OutingType;
  opponent: string | null;
  notes: string | null;
  /** Pitch number where a velocity fade starts (games only), if any. */
  fadeStart: number | null;
};

const PLANS: OutingPlan[] = [
  { date: "2026-02-07", type: "bullpen", opponent: null, notes: "First pen with the Rapsodo. Fastballs only early, mixed late.", fadeStart: null },
  { date: "2026-02-14", type: "game", opponent: "Ridgeline", notes: "Season opener.", fadeStart: null },
  { date: "2026-02-21", type: "game", opponent: "Lakeshore", notes: null, fadeStart: 60 },
  { date: "2026-02-25", type: "bullpen", opponent: null, notes: "Worked on slurve shape, staying through it.", fadeStart: null },
  { date: "2026-02-28", type: "game", opponent: "Marlow State", notes: null, fadeStart: null },
  { date: "2026-03-07", type: "game", opponent: "Summit Valley", notes: "Cold, windy.", fadeStart: 52 },
  { date: "2026-03-11", type: "bullpen", opponent: null, notes: "Two-seam command to the arm side.", fadeStart: null },
  { date: "2026-03-14", type: "game", opponent: "Northgate", notes: null, fadeStart: null },
  { date: "2026-03-21", type: "game", opponent: "Harlan", notes: "Conference opener.", fadeStart: 63 },
  { date: "2026-03-28", type: "game", opponent: "Eastfield", notes: null, fadeStart: null },
  { date: "2026-04-01", type: "bullpen", opponent: null, notes: "Short touch-and-feel pen.", fadeStart: null },
  { date: "2026-04-04", type: "game", opponent: "Ridgeline", notes: null, fadeStart: 56 },
  { date: "2026-04-11", type: "game", opponent: "Calder", notes: "Best fastball of the year.", fadeStart: null },
  { date: "2026-04-15", type: "bullpen", opponent: null, notes: null, fadeStart: null },
  { date: "2026-04-18", type: "game", opponent: "Lakeshore", notes: null, fadeStart: null },
];

function throwPitch(
  rng: Rng,
  type: keyof typeof ARSENAL,
  pitchNumber: number,
  dayOffset: number,
  fatigueMph: number,
  twoStrikes: boolean,
) {
  const profile = ARSENAL[type];
  // Fatigue costs velocity, a little spin, and some command.
  const velocity = rng.normal(profile.velo[0] + dayOffset - fatigueMph * (type === "SV" ? 0.6 : 1), profile.velo[1]);
  const spin = rng.normal(profile.spin[0] - fatigueMph * 18, profile.spin[1]);
  const hb = rng.normal(profile.hb[0], profile.hb[1]);
  const ivb = rng.normal(profile.ivb[0] - (type === "SV" ? 0 : fatigueMph * 0.4), profile.ivb[1]);
  const wild = 1 + fatigueMph * 0.12;
  // With two strikes the slurve is buried, the four-seam is elevated.
  const targetZ = profile.target.z + (twoStrikes ? (type === "SV" ? -0.45 : type === "FF" ? 0.35 : 0) : 0);
  const targetX = profile.target.x + (twoStrikes && type === "SV" ? 0.2 : 0);
  const plateX = rng.normal(targetX, profile.scatter.x * wild);
  const plateZ = rng.normal(targetZ, profile.scatter.z * wild);
  return {
    pitch_number: pitchNumber,
    pitch_type: type as PitchType,
    velocity: r1(clamp(velocity, 60, 100)),
    spin_rate: Math.round(clamp(spin, 1200, 3200)),
    hb: r1(hb),
    ivb: r1(ivb),
    plate_x: r2(clamp(plateX, -3.5, 3.5)),
    plate_z: r2(clamp(plateZ, -0.5, 6)),
  };
}

function drawResult(
  rng: Rng,
  pitch: ReturnType<typeof throwPitch>,
  balls: number,
  strikes: number,
): PitchResult {
  const { plate_x: x, plate_z: z } = pitch;
  const type = pitch.pitch_type as keyof typeof ARSENAL;
  const zone = inZone(x, z);
  const twoStrikes = strikes === 2;

  let swingProbability: number;
  if (zone) {
    swingProbability = twoStrikes ? 0.86 : balls === 0 && strikes === 0 ? 0.5 : balls === 3 && strikes === 0 ? 0.12 : 0.68;
  } else {
    const dx = Math.max(ZONE.left - x, 0, x - ZONE.right);
    const dz = Math.max(ZONE.bottom - z, 0, z - ZONE.top);
    const outside = Math.hypot(dx, dz);
    swingProbability = 0.58 * Math.exp(-outside / 0.42) * (type === "SV" ? 1.35 : 1) * (twoStrikes ? 1.35 : 1);
    swingProbability = Math.min(swingProbability, 0.8);
  }
  if (rng.uniform() >= swingProbability) return zone ? "called_strike" : "ball";

  const profile = ARSENAL[type];
  const m = TRUE_WHIFF_MODEL;
  const movement = Math.hypot(pitch.hb, pitch.ivb) - Math.hypot(profile.hb[0], profile.ivb[0]);
  const distance = Math.hypot(x, z - ZONE_CENTER_Z);
  const logit =
    m.intercept +
    (FASTBALLS.includes(pitch.pitch_type) ? 0 : m.offspeed) +
    m.veloPerMph * (pitch.velocity - profile.velo[0]) +
    m.movementPerInch * movement +
    m.distancePerFoot * (distance - 0.8) +
    (twoStrikes ? m.twoStrikes : 0);
  if (rng.uniform() < sigmoid(logit)) return "whiff";
  return rng.uniform() < (twoStrikes ? 0.52 : 0.44) ? "foul" : "in_play";
}

const NO_RELEASE = { release_height: null, release_side: null, extension: null };

/** Release point per pitch: [mean, sd]. A lefty releases to his left, so release side is negative. */
const RELEASE: Record<keyof typeof ARSENAL, { height: [number, number]; side: [number, number]; extension: [number, number] }> = {
  FF: { height: [5.95, 0.07], side: [-2.0, 0.1], extension: [6.25, 0.1] },
  FT: { height: [5.85, 0.07], side: [-2.15, 0.1], extension: [6.2, 0.1] },
  SV: { height: [5.8, 0.07], side: [-2.25, 0.1], extension: [5.95, 0.1] },
};

function simulateGame(rng: Rng, plan: OutingPlan, dayOffset: number): PitchInput[] {
  const total = rng.int(82, 100);
  const fadeRate = plan.fadeStart === null ? 0 : 0.065 + rng.uniform() * 0.03; // mph lost per pitch after onset
  const pitches: PitchInput[] = [];
  let balls = 0;
  let strikes = 0;

  for (let n = 1; n <= total; n++) {
    // Everyone loses a little over a start; a fade loses a lot.
    const drift = 0.003 * n;
    const fade = plan.fadeStart !== null && n > plan.fadeStart ? fadeRate * (n - plan.fadeStart) : 0;
    const type = choosePitch(rng, balls, strikes);
    const pitch = throwPitch(rng, type, n, dayOffset, drift + fade, strikes === 2);
    const result = drawResult(rng, pitch, balls, strikes);
    pitches.push({ ...pitch, balls, strikes, result, ...NO_RELEASE });

    if (result === "ball") balls++;
    else if (result === "called_strike" || result === "whiff") strikes++;
    else if (result === "foul" && strikes < 2) strikes++;
    if (result === "in_play" || balls === 4 || strikes === 3) {
      balls = 0;
      strikes = 0;
    }
  }
  return pitches;
}

function simulateBullpen(rng: Rng, dayOffset: number): PitchInput[] {
  const total = rng.int(28, 40);
  const pitches: PitchInput[] = [];
  for (let n = 1; n <= total; n++) {
    // Pens run in blocks: fastballs first, then mixing.
    const u = rng.uniform();
    const type: keyof typeof ARSENAL = n <= 8 ? (u < 0.75 ? "FF" : "FT") : u < 0.4 ? "FF" : u < 0.65 ? "FT" : "SV";
    // Bullpen intensity runs a tick below game speed. No hitter, so no count or result.
    const pitch = throwPitch(rng, type, n, dayOffset - 0.8, 0.004 * n, false);
    pitches.push({ ...pitch, balls: null, strikes: null, result: null, ...NO_RELEASE });
  }
  return pitches;
}

export function generateSeason(seed = 20260214): SeedOuting[] {
  const rng = createRng(seed);
  const releaseRng = createRng(seed ^ 0x5eed);
  return PLANS.map((plan, i) => {
    // Day-to-day variation plus a small build-up through the spring.
    const dayOffset = rng.normal(0, 0.45) + (i / (PLANS.length - 1)) * 0.7 - 0.35;
    const pitches = (plan.type === "game" ? simulateGame(rng, plan, dayOffset) : simulateBullpen(rng, dayOffset)).map((pitch) => {
      // Release data comes from its own random stream so adding it did not change any earlier value.
      const release = RELEASE[pitch.pitch_type as keyof typeof ARSENAL];
      return {
        ...pitch,
        release_height: r2(releaseRng.normal(...release.height)),
        release_side: r2(releaseRng.normal(...release.side)),
        extension: r2(releaseRng.normal(...release.extension)),
      };
    });
    return {
      outing_date: plan.date,
      outing_type: plan.type,
      opponent: plan.opponent,
      notes: plan.notes,
      pitches,
    };
  });
}
