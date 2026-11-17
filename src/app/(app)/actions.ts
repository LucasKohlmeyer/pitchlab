"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OutingSource, OutingType } from "@/lib/types";
import { validatePitch, type PitchDraft, type RawPitch } from "@/lib/validate";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const DEMO_ERROR = "The demo account is read-only. Create an account to log your own outings.";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Signed-in, non-demo user or an error. RLS enforces the same rule in the database. */
async function writer(): Promise<{ error: string } | { error: null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are signed out. Sign in and try again." };
  if (user.isDemo) return { error: DEMO_ERROR };
  return { error: null };
}

function outingFields(input: { date: string; type: string; opponent?: string; notes?: string }) {
  if (!DATE_RE.test(input.date) || Number.isNaN(Date.parse(input.date))) return { error: "Enter a valid date." };
  if (input.type !== "bullpen" && input.type !== "game") return { error: "Choose bullpen or game." };
  return {
    error: null,
    row: {
      outing_date: input.date,
      outing_type: input.type as OutingType,
      opponent: input.opponent?.trim().slice(0, 80) || null,
      notes: input.notes?.trim().slice(0, 500) || null,
    },
  };
}

export async function createOuting(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await writer();
  if (auth.error) return { ok: false, error: auth.error };

  const fields = outingFields({
    date: String(formData.get("date") ?? ""),
    type: String(formData.get("type") ?? ""),
    opponent: String(formData.get("opponent") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (fields.error !== null) return { ok: false, error: fields.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from("outings").insert(fields.row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outings");
  redirect(`/outings/${data.id}`);
}

export async function deleteOuting(outingId: string): Promise<ActionResult> {
  const auth = await writer();
  if (auth.error) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from("outings").delete().eq("id", outingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outings");
  redirect("/outings");
}

export async function addPitch(outingId: string, raw: RawPitch): Promise<ActionResult> {
  const auth = await writer();
  if (auth.error) return { ok: false, error: auth.error };

  const checked = validatePitch(raw);
  if (!checked.pitch) return { ok: false, error: checked.errors.join(". ") };

  const supabase = await createClient();
  const last = await supabase
    .from("pitches")
    .select("pitch_number")
    .eq("outing_id", outingId)
    .order("pitch_number", { ascending: false })
    .limit(1);
  if (last.error) return { ok: false, error: last.error.message };
  const pitchNumber = (last.data[0]?.pitch_number ?? 0) + 1;

  const { error } = await supabase
    .from("pitches")
    .insert({ ...checked.pitch, outing_id: outingId, pitch_number: pitchNumber });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outings/${outingId}`);
  return { ok: true };
}

export async function deletePitch(outingId: string, pitchId: string): Promise<ActionResult> {
  const auth = await writer();
  if (auth.error) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from("pitches").delete().eq("id", pitchId).eq("outing_id", outingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outings/${outingId}`);
  return { ok: true };
}

const MAX_IMPORT = 2000;

/** Creates an outing from an imported CSV. Every pitch is re-validated on the server. */
export async function importOuting(input: {
  date: string;
  type: string;
  opponent?: string;
  notes?: string;
  source: OutingSource;
  pitches: RawPitch[];
}): Promise<ActionResult> {
  const auth = await writer();
  if (auth.error) return { ok: false, error: auth.error };

  const fields = outingFields(input);
  if (fields.error !== null) return { ok: false, error: fields.error };
  if (input.source !== "rapsodo" && input.source !== "trackman") return { ok: false, error: "Unknown import source." };
  if (!Array.isArray(input.pitches) || input.pitches.length === 0) return { ok: false, error: "There are no pitches to import." };
  if (input.pitches.length > MAX_IMPORT) return { ok: false, error: `Import at most ${MAX_IMPORT} pitches at a time.` };

  const pitches: PitchDraft[] = [];
  for (const [i, raw] of input.pitches.entries()) {
    const checked = validatePitch(raw);
    if (!checked.pitch) return { ok: false, error: `Pitch ${i + 1}: ${checked.errors.join(". ")}` };
    pitches.push(checked.pitch);
  }

  const supabase = await createClient();
  const outing = await supabase
    .from("outings")
    .insert({ ...fields.row, source: input.source })
    .select("id")
    .single();
  if (outing.error) return { ok: false, error: outing.error.message };

  const rows = pitches.map((p, i) => ({ ...p, outing_id: outing.data.id, pitch_number: i + 1 }));
  for (let from = 0; from < rows.length; from += 500) {
    const { error } = await supabase.from("pitches").insert(rows.slice(from, from + 500));
    if (error) {
      // Do not leave a half-imported outing behind.
      await supabase.from("outings").delete().eq("id", outing.data.id);
      return { ok: false, error: error.message };
    }
  }
  revalidatePath("/outings");
  return { ok: true, id: outing.data.id };
}
