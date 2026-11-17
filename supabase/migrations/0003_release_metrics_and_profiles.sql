-- Stuff+ and MLB comps need release-point data and the pitcher's handedness.
-- Additive only: three nullable columns on pitches and one new table.
-- Rollback: supabase/rollbacks/0003_release_metrics_and_profiles.down.sql

alter table public.pitches
  add column release_height numeric(4, 2) check (release_height between 0 and 9),   -- ft above ground
  add column release_side numeric(4, 2) check (release_side between -6 and 6),      -- ft from rubber center, pitcher's view (+ = right)
  add column extension numeric(4, 2) check (extension between 2 and 9);             -- ft in front of the rubber

create table public.pitcher_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  throws text not null check (throws in ('L', 'R')),
  updated_at timestamptz not null default now()
);

alter table public.pitcher_profiles enable row level security;

create policy "profiles: owner can read" on public.pitcher_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Same rule as outings and pitches: the demo account can never write.
create policy "profiles: owner can insert" on public.pitcher_profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  );

create policy "profiles: owner can update" on public.pitcher_profiles
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  )
  with check (user_id = (select auth.uid()));
