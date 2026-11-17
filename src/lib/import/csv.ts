import Papa from "papaparse";
import type { PitchResult, PitchType } from "../types";
import { validatePitch, type PitchDraft } from "../validate";

/**
 * CSV import for Rapsodo and TrackMan exports.
 *
 *   parseCsv      text -> header row + records (skips Rapsodo's metadata preamble)
 *   detectSource  guess the vendor from the header names
 *   suggestMapping  guess which CSV column feeds each PitchLab field
 *   mapRows       apply a mapping, normalize units and vocabulary, validate every row
 */

export type ImportSource = "rapsodo" | "trackman";

export const IMPORT_FIELDS = [
  { key: "pitch_type", label: "Pitch type", required: true },
  { key: "velocity", label: "Velocity (mph)", required: false },
  { key: "spin_rate", label: "Spin rate (rpm)", required: false },
  { key: "hb", label: "Horizontal break (in)", required: false },
  { key: "ivb", label: "Induced vertical break (in)", required: false },
  { key: "plate_x", label: "Plate side", required: false },
  { key: "plate_z", label: "Plate height", required: false },
  { key: "balls", label: "Balls", required: false },
  { key: "strikes", label: "Strikes", required: false },
  { key: "result", label: "Result", required: false },
  { key: "release_height", label: "Release height (ft)", required: false },
  { key: "release_side", label: "Release side (ft)", required: false },
  { key: "extension", label: "Extension (ft)", required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** CSV column name for each field, or null when the file does not have it. */
export type Mapping = Record<ImportField, string | null>;

export type ImportOptions = {
  /** Unit of the plate location columns. Rapsodo exports inches, TrackMan feet. */
  locationUnit: "in" | "ft";
  /** Flip the sign of horizontal break, plate side, and release side, for files that use the opposite convention. */
  flipHorizontal: boolean;
};

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

/** Lowercase and strip everything but letters and digits: "HB (trajectory)" -> "hbtrajectory". */
export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header aliases per field, most specific first. All are normalized. */
const ALIASES: Record<ImportField, string[]> = {
  pitch_type: ["taggedpitchtype", "pitchtype", "autopitchtype", "pitch", "type"],
  velocity: ["relspeed", "velocity", "velo", "speed", "pitchspeed"],
  spin_rate: ["spinrate", "totalspin", "spin", "truespin"],
  hb: ["horzbreak", "hbtrajectory", "horizontalbreak", "hb", "hbspin"],
  ivb: ["inducedvertbreak", "vbtrajectory", "inducedverticalbreak", "ivb", "verticalbreak", "vb", "vbspin"],
  plate_x: ["platelocside", "strikezoneside", "platex", "plateside"],
  plate_z: ["platelocheight", "strikezoneheight", "platez", "plateheight"],
  balls: ["balls"],
  strikes: ["strikes"],
  result: ["pitchcall", "result", "pitchresult", "outcome"],
  release_height: ["relheight", "releaseheight"],
  release_side: ["relside", "releaseside"],
  extension: ["extension", "releaseextension"],
};

const KNOWN_HEADERS = new Set(Object.values(ALIASES).flat());

const PITCH_TYPE_ALIASES: Record<string, PitchType> = {
  ff: "FF", fastball: "FF", fourseam: "FF", fourseamfastball: "FF", "4seam": "FF", "4seamfastball": "FF", fb: "FF",
  ft: "FT", twoseam: "FT", twoseamfastball: "FT", "2seam": "FT", "2seamfastball": "FT", sinker: "FT", si: "FT",
  fc: "FC", cutter: "FC", cutfastball: "FC",
  sl: "SL", slider: "SL", sweeper: "SL",
  sv: "SV", slurve: "SV",
  cu: "CU", cb: "CU", curve: "CU", curveball: "CU", knucklecurve: "CU",
  ch: "CH", changeup: "CH", change: "CH",
  fs: "FS", splitter: "FS", split: "FS", splitfinger: "FS",
};

const RESULT_ALIASES: Record<string, PitchResult> = {
  ball: "ball", ballcalled: "ball", ballindirt: "ball", ballintentional: "ball", hitbypitch: "ball",
  calledstrike: "called_strike", strikecalled: "called_strike",
  whiff: "whiff", strikeswinging: "whiff", swingingstrike: "whiff", swingandmiss: "whiff",
  foul: "foul", foulball: "foul", foulballnotfieldable: "foul", foulballfieldable: "foul", foultip: "foul",
  inplay: "in_play",
};

const BLANKS = new Set(["", "-", "--", "na", "n/a", "null", "undefined", "nan"]);
const isBlank = (v: string | undefined) => v === undefined || BLANKS.has(v.trim().toLowerCase());

export function parseCsv(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const table = parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));
  if (table.length === 0) return { headers: [], rows: [] };

  // Rapsodo files start with a few lines of player metadata. The header is the
  // first of the leading rows that contains the most recognizable column names.
  let headerIndex = 0;
  let best = 0;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const score = table[i].filter((cell) => KNOWN_HEADERS.has(normalize(cell))).length;
    if (score > best) {
      best = score;
      headerIndex = i;
    }
  }

  const headers = table[headerIndex].map((h, i) => h || `Column ${i + 1}`);
  const rows = table.slice(headerIndex + 1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = cells[i] ?? ""));
    return record;
  });
  return { headers, rows };
}

export function detectSource(headers: string[]): ImportSource | null {
  const set = new Set(headers.map(normalize));
  const has = (...names: string[]) => names.filter((n) => set.has(n)).length;
  const trackman = has("relspeed", "pitchcall", "taggedpitchtype", "inducedvertbreak", "platelocside", "horzbreak");
  const rapsodo = has("totalspin", "strikezoneside", "hbtrajectory", "vbtrajectory", "spinefficiency", "gyrodegree");
  if (trackman === 0 && rapsodo === 0) return null;
  return trackman >= rapsodo ? "trackman" : "rapsodo";
}

export function suggestMapping(headers: string[]): Mapping {
  const byNormalized = new Map(headers.map((h) => [normalize(h), h]));
  const mapping = {} as Mapping;
  for (const field of IMPORT_FIELDS) {
    const match = ALIASES[field.key].find((alias) => byNormalized.has(alias));
    mapping[field.key] = match ? (byNormalized.get(match) as string) : null;
  }
  return mapping;
}

export function defaultOptions(source: ImportSource | null): ImportOptions {
  return { locationUnit: source === "trackman" ? "ft" : "in", flipHorizontal: false };
}

/** First parseable date in a "Date" column, as YYYY-MM-DD. */
export function detectDate(parsed: ParsedCsv): string | null {
  const header = parsed.headers.find((h) => ["date", "gamedate", "sessiondate"].includes(normalize(h)));
  if (!header) return null;
  for (const row of parsed.rows.slice(0, 5)) {
    const value = row[header];
    if (isBlank(value)) continue;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(value);
    if (us) {
      const year = us[3].length === 2 ? `20${us[3]}` : us[3];
      return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    }
  }
  return null;
}

export type RowIssue = {
  /** 1-based data row number (the header is row 0). */
  row: number;
  level: "error" | "warning";
  message: string;
};

export type MapResult = {
  pitches: PitchDraft[];
  issues: RowIssue[];
  /** Rows dropped because of errors. */
  skipped: number;
  total: number;
};

export function mapRows(rows: Record<string, string>[], mapping: Mapping, options: ImportOptions): MapResult {
  const pitches: PitchDraft[] = [];
  const issues: RowIssue[] = [];
  let skipped = 0;
  const cell = (row: Record<string, string>, field: ImportField) => {
    const column = mapping[field];
    return column ? row[column] : undefined;
  };

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const rawType = cell(row, "pitch_type");
    if (isBlank(rawType)) {
      // Rapsodo files often end with summary or blank-type rows; these are not pitches.
      skipped++;
      issues.push({ row: rowNumber, level: "error", message: "No pitch type" });
      return;
    }
    const pitchType = PITCH_TYPE_ALIASES[normalize(rawType as string)];
    if (!pitchType) {
      skipped++;
      issues.push({ row: rowNumber, level: "error", message: `Unrecognized pitch type "${rawType}"` });
      return;
    }

    let result: PitchResult | null = null;
    const rawResult = cell(row, "result");
    if (!isBlank(rawResult)) {
      result = RESULT_ALIASES[normalize(rawResult as string)] ?? null;
      if (!result) issues.push({ row: rowNumber, level: "warning", message: `Result "${rawResult}" not recognized; left blank` });
    }

    const number = (field: ImportField): string | number | null => {
      const value = cell(row, field);
      if (isBlank(value)) return null;
      const n = Number((value as string).replace(/,/g, ""));
      if (!Number.isFinite(n)) return value as string; // let validation report it
      if (field === "plate_x" || field === "plate_z") {
        const feet = options.locationUnit === "in" ? n / 12 : n;
        return field === "plate_x" && options.flipHorizontal ? -feet : feet;
      }
      if ((field === "hb" || field === "release_side") && options.flipHorizontal) return -n;
      return n;
    };

    const checked = validatePitch({
      pitch_type: pitchType,
      result,
      velocity: number("velocity"),
      spin_rate: number("spin_rate"),
      hb: number("hb"),
      ivb: number("ivb"),
      plate_x: number("plate_x"),
      plate_z: number("plate_z"),
      balls: number("balls"),
      strikes: number("strikes"),
      release_height: number("release_height"),
      release_side: number("release_side"),
      extension: number("extension"),
    });
    if (!checked.pitch) {
      skipped++;
      for (const message of checked.errors) issues.push({ row: rowNumber, level: "error", message });
      return;
    }
    if (checked.pitch.velocity === null) issues.push({ row: rowNumber, level: "warning", message: "No velocity reading" });
    pitches.push(checked.pitch);
  });

  return { pitches, issues, skipped, total: rows.length };
}
