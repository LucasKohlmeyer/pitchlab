import { PITCH_TYPES, RESULTS, type PitchInput, type PitchResult, type PitchType } from "./types";

/** Allowed ranges. These mirror the CHECK constraints in the database. */
export const RANGES = {
  velocity: { min: 40, max: 110, label: "Velocity", unit: "mph" },
  spin_rate: { min: 0, max: 4000, label: "Spin rate", unit: "rpm" },
  hb: { min: -35, max: 35, label: "Horizontal break", unit: "in" },
  ivb: { min: -35, max: 35, label: "Induced vertical break", unit: "in" },
  plate_x: { min: -5, max: 5, label: "Plate side", unit: "ft" },
  plate_z: { min: -2, max: 8, label: "Plate height", unit: "ft" },
  balls: { min: 0, max: 3, label: "Balls", unit: "" },
  strikes: { min: 0, max: 2, label: "Strikes", unit: "" },
} as const;

export type NumericField = keyof typeof RANGES;
export const NUMERIC_FIELDS = Object.keys(RANGES) as NumericField[];

export type PitchDraft = Omit<PitchInput, "pitch_number">;

/** Loosely typed pitch as it arrives from a form or CSV row. */
export type RawPitch = { pitch_type: unknown; result?: unknown } & Partial<Record<NumericField, unknown>>;

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const DIGITS: Record<NumericField, number> = {
  velocity: 1,
  spin_rate: 0,
  hb: 1,
  ivb: 1,
  plate_x: 2,
  plate_z: 2,
  balls: 0,
  strikes: 0,
};

/**
 * Validates one pitch. Returns the cleaned pitch, or the reasons it was rejected.
 * Blank optional fields become null; out-of-range or non-numeric values are errors.
 */
export function validatePitch(raw: RawPitch): { pitch: PitchDraft; errors: [] } | { pitch: null; errors: string[] } {
  const errors: string[] = [];

  if (!PITCH_TYPES.includes(raw.pitch_type as PitchType)) {
    errors.push(raw.pitch_type ? `Unknown pitch type "${String(raw.pitch_type)}"` : "Pitch type is missing");
  }

  let result: PitchResult | null = null;
  if (raw.result !== undefined && raw.result !== null && raw.result !== "") {
    if (RESULTS.includes(raw.result as PitchResult)) result = raw.result as PitchResult;
    else errors.push(`Unknown result "${String(raw.result)}"`);
  }

  const numbers = {} as Record<NumericField, number | null>;
  for (const field of NUMERIC_FIELDS) {
    const value = raw[field];
    const { min, max, label, unit } = RANGES[field];
    if (value === undefined || value === null || value === "") {
      numbers[field] = null;
      continue;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
      errors.push(`${label} "${String(value)}" is not a number`);
      continue;
    }
    const rounded = round(n, DIGITS[field]);
    if (rounded < min || rounded > max) {
      errors.push(`${label} ${rounded} is outside ${min} to ${max}${unit ? ` ${unit}` : ""}`);
      continue;
    }
    numbers[field] = rounded;
  }

  if (errors.length) return { pitch: null, errors };
  return { pitch: { pitch_type: raw.pitch_type as PitchType, result, ...numbers }, errors: [] };
}
