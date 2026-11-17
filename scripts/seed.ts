/**
 * Seeds the public demo account with a realistic season of data.
 *
 *   npm run seed
 *
 * Reads .env.local. Two modes:
 *
 * 1. With SUPABASE_SERVICE_ROLE_KEY set (recommended): creates the demo user
 *    if needed (confirmed, flagged app_metadata.demo = true), replaces its
 *    data, and works any number of times.
 *
 * 2. Without it: signs in as DEMO_EMAIL / DEMO_PASSWORD with the publishable
 *    key and inserts through row level security. This only works before the
 *    account has been flagged as a demo, because demo accounts are read-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { generateSeason } from "../src/lib/seed/generate";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;

function fail(message: string): never {
  console.error(`seed: ${message}`);
  process.exit(1);
}

async function adminClient(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const created = await supabase.auth.admin.createUser({
    email: email!,
    password: password!,
    email_confirm: true,
    app_metadata: { demo: true },
  });
  if (created.data.user) return { supabase, userId: created.data.user.id };

  // Already exists: look it up.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(error.message);
    const match = data.users.find((u) => u.email === email);
    if (match) return { supabase, userId: match.id };
    if (data.users.length < 200) break;
  }
  fail(`could not create or find ${email}: ${created.error?.message ?? "unknown error"}`);
}

async function userClient(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = createClient(url!, publishableKey!, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
  if (error || !data.user) fail(`could not sign in as ${email}: ${error?.message ?? "no user"}`);
  if (data.user.app_metadata?.demo === true) {
    fail("the demo account is read-only. Set SUPABASE_SERVICE_ROLE_KEY in .env.local to reseed it.");
  }
  return { supabase, userId: data.user.id };
}

async function main() {
  if (!url || !publishableKey) fail("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required");
  if (!email || !password) fail("DEMO_EMAIL and DEMO_PASSWORD are required");

  const { supabase, userId } = serviceKey ? await adminClient() : await userClient();
  console.log(`seed: using ${serviceKey ? "service role" : "demo sign-in"} for ${email}`);

  const cleared = await supabase.from("outings").delete().eq("user_id", userId);
  if (cleared.error) fail(cleared.error.message);

  const season = generateSeason();
  let pitchCount = 0;
  for (const outing of season) {
    const inserted = await supabase
      .from("outings")
      .insert({
        user_id: userId,
        outing_date: outing.outing_date,
        outing_type: outing.outing_type,
        opponent: outing.opponent,
        notes: outing.notes,
        source: "seed",
      })
      .select("id")
      .single();
    if (inserted.error) fail(inserted.error.message);

    const rows = outing.pitches.map((p) => ({ ...p, outing_id: inserted.data.id, user_id: userId }));
    const { error } = await supabase.from("pitches").insert(rows);
    if (error) fail(error.message);
    pitchCount += rows.length;
  }
  console.log(`seed: inserted ${season.length} outings and ${pitchCount} pitches`);
}

main();
