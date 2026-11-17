import type { PitchResult, PitchType } from "./types";

export const PITCH_LABELS: Record<PitchType, string> = {
  FF: "Four-seam",
  FT: "Two-seam",
  FC: "Cutter",
  SL: "Slider",
  SV: "Slurve",
  CU: "Curveball",
  CH: "Changeup",
  FS: "Splitter",
};

/**
 * Categorical colors, assigned per pitch type (never by rank) so a pitch keeps
 * its color in every chart. Order follows a colorblind-validated palette.
 */
export const PITCH_COLORS: Record<PitchType, string> = {
  FF: "#3987e5",
  FT: "#d95926",
  SV: "#199e70",
  CH: "#c98500",
  SL: "#d55181",
  CU: "#0ca30c",
  FC: "#9085e9",
  FS: "#e66767",
};

export const RESULT_LABELS: Record<PitchResult, string> = {
  ball: "Ball",
  called_strike: "Called strike",
  whiff: "Whiff",
  foul: "Foul",
  in_play: "In play",
};

export const FASTBALLS: PitchType[] = ["FF", "FT", "FC"];

/** Strike zone in feet, including one ball radius on each side edge. */
export const ZONE = { left: -0.83, right: 0.83, bottom: 1.5, top: 3.5 } as const;

export function inZone(x: number, z: number): boolean {
  return x >= ZONE.left && x <= ZONE.right && z >= ZONE.bottom && z <= ZONE.top;
}

export function isSwing(result: PitchResult | null): boolean {
  return result === "whiff" || result === "foul" || result === "in_play";
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
