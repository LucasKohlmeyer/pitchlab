export const PITCH_TYPES = ["FF", "FT", "FC", "SL", "SV", "CU", "CH", "FS"] as const;
export type PitchType = (typeof PITCH_TYPES)[number];

export const RESULTS = ["ball", "called_strike", "whiff", "foul", "in_play"] as const;
export type PitchResult = (typeof RESULTS)[number];

export type OutingType = "bullpen" | "game";
export type OutingSource = "manual" | "rapsodo" | "trackman" | "seed";

export type Outing = {
  id: string;
  outing_date: string; // YYYY-MM-DD
  outing_type: OutingType;
  opponent: string | null;
  notes: string | null;
  source: OutingSource;
};

export type Pitch = {
  id: string;
  outing_id: string;
  pitch_number: number;
  pitch_type: PitchType;
  velocity: number | null; // mph
  spin_rate: number | null; // rpm
  hb: number | null; // in, + = pitcher's right
  ivb: number | null; // in
  plate_x: number | null; // ft, catcher's view, + = right
  plate_z: number | null; // ft above ground
  balls: number | null;
  strikes: number | null;
  result: PitchResult | null;
  release_height: number | null; // ft above ground
  release_side: number | null; // ft from rubber center, pitcher's view, + = right
  extension: number | null; // ft in front of the rubber
};

/** A pitch before it is saved. */
export type PitchInput = Omit<Pitch, "id" | "outing_id">;
