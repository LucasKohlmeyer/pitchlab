-- Rollback for supabase/migrations/0003_release_metrics_and_profiles.sql
-- Removes only what that migration added. Data in the three columns and in
-- pitcher_profiles is lost; nothing that existed before 0003 is touched.

drop table if exists public.pitcher_profiles;

alter table public.pitches
  drop column if exists release_height,
  drop column if exists release_side,
  drop column if exists extension;
