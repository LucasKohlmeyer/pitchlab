-- PitchLab schema: outings -> pitches, owner-only row level security.
-- Demo accounts (app_metadata.demo = true) can read their rows but never write.

create table public.outings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  outing_date date not null,
  outing_type text not null check (outing_type in ('bullpen', 'game')),
  opponent text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'rapsodo', 'trackman', 'seed')),
  created_at timestamptz not null default now()
);

create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pitch_number integer not null check (pitch_number > 0),
  pitch_type text not null check (pitch_type in ('FF', 'FT', 'FC', 'SL', 'SV', 'CU', 'CH', 'FS')),
  velocity numeric(4, 1) check (velocity between 40 and 110),        -- mph
  spin_rate integer check (spin_rate between 0 and 4000),            -- rpm
  hb numeric(4, 1) check (hb between -35 and 35),                    -- horizontal break, in (+ = pitcher's right)
  ivb numeric(4, 1) check (ivb between -35 and 35),                  -- induced vertical break, in
  plate_x numeric(4, 2) check (plate_x between -5 and 5),            -- ft from plate center, catcher's view (+ = right)
  plate_z numeric(4, 2) check (plate_z between -2 and 8),            -- ft above ground
  balls smallint check (balls between 0 and 3),
  strikes smallint check (strikes between 0 and 2),
  result text check (result in ('ball', 'called_strike', 'whiff', 'foul', 'in_play')),
  created_at timestamptz not null default now(),
  unique (outing_id, pitch_number)
);

create index outings_user_date_idx on public.outings (user_id, outing_date desc);
create index pitches_user_idx on public.pitches (user_id);
create index pitches_outing_idx on public.pitches (outing_id, pitch_number);

alter table public.outings enable row level security;
alter table public.pitches enable row level security;

-- Read: owners only.
create policy "outings: owner can read" on public.outings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pitches: owner can read" on public.pitches
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Write: owners only, and never the demo account.
-- app_metadata lives in the signed JWT and cannot be edited by the user.
create policy "outings: owner can insert" on public.outings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  );

create policy "outings: owner can update" on public.outings
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  )
  with check (user_id = (select auth.uid()));

create policy "outings: owner can delete" on public.outings
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  );

create policy "pitches: owner can insert" on public.pitches
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
    and exists (
      select 1 from public.outings o
      where o.id = outing_id and o.user_id = (select auth.uid())
    )
  );

create policy "pitches: owner can update" on public.pitches
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  )
  with check (user_id = (select auth.uid()));

create policy "pitches: owner can delete" on public.pitches
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'demo')::boolean, false)
  );
