# PitchLab

Pitching analytics web app: outing logging, Rapsodo/TrackMan import, dashboards, fatigue detection, a whiff model, Stuff+ grades, and MLB comps. See README.md for the full description and the stats methods.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind 4, Recharts
- Supabase (Postgres, row level security, `@supabase/ssr`)
- Python 3.12 + LightGBM in `ml/` for offline model training only. The app never calls Python.
- Vercel hosting. Production is https://pitchlab-gold.vercel.app

Next.js 16 differs from older versions: middleware is `src/proxy.ts`, and Cache Components are turned off in `next.config.ts` because every page is per-user. Read `node_modules/next/dist/docs/` before using an unfamiliar Next API.

## Commands

- `npm run dev` start the app
- `npm test` Vitest (stats, import, Stuff+ evaluator parity, conversions, comps)
- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run seed` reseed the demo account (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)
- `ml/.venv/Scripts/python -m pytest ml/tests` Python conversion and feature tests

## Layout

- `src/lib/stats/` fatigue, logistic regression, whiff model, summaries. Pure functions, no dependencies.
- `src/lib/stuff/` Stuff+ and comps
  - `conventions.ts` units, sign conventions, handedness mirroring, model feature order
  - `model.ts` tree evaluator; `grade.ts` grades pitches and rolls up by type and outing
  - `comps.ts` nearest MLB comps; `mlb-lhp-comps.json` the comps pool
  - `models/*.json` exported trees; `models/meta.json` scaling and test metrics shown in the UI
- `src/lib/import/` CSV parsing, mapping, validation
- `src/lib/validate.ts` numeric ranges; these mirror the database CHECK constraints
- `src/app/(app)/` signed-in pages and `actions.ts` (all writes)
- `ml/` download, features, train, tune, comps, tests
- `supabase/migrations/` forward migrations; `supabase/rollbacks/` one `.down.sql` per migration from 0003 on

## Rules for this repo

- **Branches.** `master` is the production branch. Feature work happens on a branch and is not merged without the owner's say-so.
- **Database.** There is one Supabase project, shared by production and previews. Migrations must be additive: add tables or nullable columns, never modify or drop existing ones. Every new migration gets a matching rollback file.
- **Secrets.** `.env*` files are ignored except `.env.example`. Never commit keys. The service role key is only for `scripts/seed.ts` and must never get a `NEXT_PUBLIC_` name.
- **Demo account.** It is read-only in the database (RLS checks `app_metadata.demo`) and its credentials are frozen by a trigger. Server actions also refuse writes from it.
- **Conventions are shared.** `ml/conventions.py` and `src/lib/stuff/conventions.ts` must stay in step. Both test against `ml/tests/convention_cases.json`; add a case there when changing either. The `FEATURES` order must match in both files.
- **PitchLab units.** TrackMan convention: break in inches from the pitcher's view (+ = pitcher's right), plate location in feet from the catcher's view, release side in feet from the pitcher's view.
- **Tests.** Stats, conversions, the tree evaluator, and comps math all have tests. Keep them passing and add tests with new math.

## Retraining Stuff+

1. `ml/.venv/Scripts/python ml/download.py [seasons]` (cached per month in `ml/data/`, ignored by git)
2. Optionally `ml/tune.py` to compare settings on validation data only
3. `ml/.venv/Scripts/python ml/train.py` rewrites `src/lib/stuff/models/` and the parity fixtures
4. `ml/.venv/Scripts/python ml/comps.py` rewrites the comps file (uses the models from step 3)
5. `npm test` must pass; the parity test proves TypeScript matches LightGBM
6. Update the split dates and metrics table in README.md, and check that the wording in the "How this works" panel on `/stuff` still matches the new numbers

Do not tune against the test period (2026-07-01 onward in the current split). `tune.py` drops it before doing anything.

## Local preview note

The dev server must be started from this folder. If a page that exists returns 404 in dev, delete `.next` and restart.
