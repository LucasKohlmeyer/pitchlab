import { PITCH_TYPES, type Outing, type Pitch, type PitchType } from "../types";
import {
  PITCH_GROUP,
  buildFeatures,
  fastballReference,
  isGradable,
  type FastballReference,
  type PitchGroup,
  type Throws,
} from "./conventions";
import { predict, toStuffPlus, type TreeModel } from "./model";
import breaking from "./models/breaking.json";
import fastball from "./models/fastball.json";
import meta from "./models/meta.json";
import offspeed from "./models/offspeed.json";

export const MODELS: Record<PitchGroup, TreeModel> = { fastball, breaking, offspeed };
export const MODEL_META = meta;

export type PitchGrade = {
  stuffPlus: number;
  /** True when release point, extension, or spin was missing and the model used its default branches. */
  partial: boolean;
};

/** Stuff+ for one pitch, or null when it lacks velocity or break. */
export function gradePitch(p: Pitch, throws: Throws, fastballRef: FastballReference | null): PitchGrade | null {
  if (!isGradable(p)) return null;
  const group = PITCH_GROUP[p.pitch_type];
  const scale = meta.groups[group];
  const prediction = predict(MODELS[group], buildFeatures(p, throws, fastballRef));
  return {
    stuffPlus: toStuffPlus(prediction, scale.mean, scale.sd),
    partial: p.release_height === null || p.release_side === null || p.extension === null || p.spin_rate === null,
  };
}

export type StuffSummary = {
  pitchType: PitchType;
  /** Pitches that could be graded. */
  graded: number;
  total: number;
  stuffPlus: number;
  /** Share of graded pitches that were missing release or spin inputs. */
  partialShare: number;
};

export type OutingStuff = {
  outingId: string;
  date: string;
  graded: number;
  /** Average over every graded pitch in the outing. */
  stuffPlus: number | null;
  byType: Partial<Record<PitchType, number>>;
};

export type StuffReport = {
  fastball: FastballReference | null;
  byType: StuffSummary[];
  byOuting: OutingStuff[];
  graded: number;
  overall: number | null;
};

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

/**
 * Grades every pitch and rolls the grades up by pitch type and by outing.
 * Differentials use the pitcher's primary fastball across all of the pitches
 * passed in, which matches how the training data defines it (per season).
 */
export function buildStuffReport(outings: Outing[], pitches: Pitch[], throws: Throws): StuffReport {
  const fastballRef = fastballReference(pitches, throws);
  const grades = new Map<string, PitchGrade>();
  for (const p of pitches) {
    const grade = gradePitch(p, throws, fastballRef);
    if (grade) grades.set(p.id, grade);
  }

  const byType: StuffSummary[] = [];
  for (const type of PITCH_TYPES) {
    const ofType = pitches.filter((p) => p.pitch_type === type);
    const graded = ofType.map((p) => grades.get(p.id)).filter((g): g is PitchGrade => g !== undefined);
    if (graded.length === 0) continue;
    byType.push({
      pitchType: type,
      graded: graded.length,
      total: ofType.length,
      stuffPlus: mean(graded.map((g) => g.stuffPlus)),
      partialShare: graded.filter((g) => g.partial).length / graded.length,
    });
  }

  const byOuting: OutingStuff[] = [];
  for (const outing of outings) {
    const inOuting = pitches.filter((p) => p.outing_id === outing.id && grades.has(p.id));
    if (inOuting.length === 0) continue;
    const byTypeInOuting: Partial<Record<PitchType, number>> = {};
    for (const type of PITCH_TYPES) {
      const values = inOuting.filter((p) => p.pitch_type === type).map((p) => (grades.get(p.id) as PitchGrade).stuffPlus);
      if (values.length) byTypeInOuting[type] = mean(values);
    }
    byOuting.push({
      outingId: outing.id,
      date: outing.outing_date,
      graded: inOuting.length,
      stuffPlus: mean(inOuting.map((p) => (grades.get(p.id) as PitchGrade).stuffPlus)),
      byType: byTypeInOuting,
    });
  }

  const all = [...grades.values()].map((g) => g.stuffPlus);
  return { fastball: fastballRef, byType, byOuting, graded: all.length, overall: all.length ? mean(all) : null };
}
