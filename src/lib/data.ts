import "server-only";
import { createClient } from "./supabase/server";
import type { Outing, Pitch } from "./types";

const OUTING_COLUMNS = "id, outing_date, outing_type, opponent, notes, source";
const PITCH_COLUMNS =
  "id, outing_id, pitch_number, pitch_type, velocity, spin_rate, hb, ivb, plate_x, plate_z, balls, strikes, result, release_height, release_side, extension";
const PAGE = 1000; // PostgREST caps a single response at 1000 rows.

type PitchRow = Omit<Pitch, "velocity" | "hb" | "ivb" | "plate_x" | "plate_z" | "release_height" | "release_side" | "extension"> & {
  release_height: number | string | null;
  release_side: number | string | null;
  extension: number | string | null;
  velocity: number | string | null;
  hb: number | string | null;
  ivb: number | string | null;
  plate_x: number | string | null;
  plate_z: number | string | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

function toPitch(row: PitchRow): Pitch {
  return {
    ...row,
    velocity: num(row.velocity),
    hb: num(row.hb),
    ivb: num(row.ivb),
    plate_x: num(row.plate_x),
    plate_z: num(row.plate_z),
    release_height: num(row.release_height),
    release_side: num(row.release_side),
    extension: num(row.extension),
  };
}

/** All outings for the signed-in user, oldest first. RLS scopes the rows. */
export async function getOutings(): Promise<Outing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outings")
    .select(OUTING_COLUMNS)
    .order("outing_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Outing[];
}

export async function getOuting(id: string): Promise<Outing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("outings").select(OUTING_COLUMNS).eq("id", id).maybeSingle();
  if (error) return null; // malformed id, etc.
  return data as Outing | null;
}

/** The signed-in pitcher's throwing hand, if they have set it. */
export async function getThrows(): Promise<"L" | "R" | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pitcher_profiles").select("throws").maybeSingle();
  if (error || !data) return null;
  return data.throws === "L" || data.throws === "R" ? data.throws : null;
}

/** Every pitch for the user (or for one outing), paged past the row cap. */
export async function getPitches(outingId?: string): Promise<Pitch[]> {
  const supabase = await createClient();
  const all: Pitch[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("pitches")
      .select(PITCH_COLUMNS)
      .order("outing_id", { ascending: true })
      .order("pitch_number", { ascending: true })
      .range(from, from + PAGE - 1);
    if (outingId) query = query.eq("outing_id", outingId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as PitchRow[];
    all.push(...rows.map(toPitch));
    if (rows.length < PAGE) break;
  }
  return all;
}
