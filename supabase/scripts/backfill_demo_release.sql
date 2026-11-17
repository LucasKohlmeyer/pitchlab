-- One-off data backfill, run once after migration 0003.
-- Gives the demo account's existing pitches plausible release-point values
-- and sets its handedness, so the demo shows complete Stuff+ grades.
-- It only writes the three columns added in 0003 and the new profiles table.
-- New seeds get these values from src/lib/seed/generate.ts instead.

with demo as (select id from auth.users where email = 'demo@pitchlab.example')
update public.pitches p set
  release_height = round((case pitch_type when 'FF' then 5.95 when 'FT' then 5.85 else 5.80 end + (random() + random() + random() - 1.5) * 2 * 0.07)::numeric, 2),
  release_side   = round((case pitch_type when 'FF' then -2.00 when 'FT' then -2.15 else -2.25 end + (random() + random() + random() - 1.5) * 2 * 0.10)::numeric, 2),
  extension      = round((case pitch_type when 'FF' then 6.25 when 'FT' then 6.20 else 5.95 end + (random() + random() + random() - 1.5) * 2 * 0.10)::numeric, 2)
from demo
where p.user_id = demo.id;

insert into public.pitcher_profiles (user_id, throws)
select id, 'L' from auth.users where email = 'demo@pitchlab.example'
on conflict (user_id) do nothing;
