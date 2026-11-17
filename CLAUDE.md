# PitchLab

Pitching analytics web app built as a portfolio project by a college left-handed pitcher studying CS and applied math/stats. See README.md for the user-facing description and the full stats write-ups.

- Production: https://pitchlab-gold.vercel.app (Vercel project `pitchlab`, team `kohl-tra-exterior`)
- Repo: https://github.com/LucasKohlmeyer/pitchlab
- Database: one Supabase project named `pitchlab`, shared by production and previews

## Current state (2026-11-16)

| Branch | Contents | Deployed |
| --- | --- | --- |
| `master` | Core app: auth, outing and pitch logging, CSV import, dashboard, fatigue detection, whiff model | Production |
| `stuff-model` | Everything on `master` plus Stuff+ and MLB comps | One-off Vercel preview, not merged |

`stuff-model` is waiting on the owner's review. Do not merge it into `master` without being asked.

## What exists

**Core app (on `master`)**

- Email/password auth through Supabase, with a public read-only demo account ("Explore the live demo" signs in server-side).
- Outings (bullpen or game) and pitch-by-pitch logging with a click-to-place strike zone.
- CSV import for Rapsodo and TrackMan: header detection, column mapping the user can correct, unit conversion, row-level validation, two built-in sample files.
- Dashboard: velocity by outing and by pitch count, pitch mix by count, strike/whiff/chase rates, location heatmaps, movement plot, arsenal table.
- Insights: fatigue detection per outing and a logistic regression for whiff probability, both explained in the UI.
- Deterministic seed generator for a lefty sitting 88 to 91 with a four-seam, two-seam, and slurve (15 outings, 1,075 pitches).

**Added on `stuff-model`**

- Migration 0003: nullable `release_height`, `release_side`, `extension` on `pitches`, and a `pitcher_profiles` table (throwing hand). Already applied to the live database. Rollback in `supabase/rollbacks/`.
- `ml/` Python pipeline that trains the Stuff+ models and builds the comps file from MLB Statcast data.
- `/stuff` page: Stuff+ per pitch type and per outing, trend chart, five nearest left-handed MLB comps per pitch type with a movement overlay, and a "How this works" panel.
- Release fields in the pitch logger and CSV import.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind 4, Recharts
- Supabase (Postgres, row level security, `@supabase/ssr` cookie sessions)
- Python 3.12, pybaseball, LightGBM, scikit-learn in `ml/`, for offline training only. The app never calls Python.
- Vitest and pytest

Next.js 16 differs from older versions: middleware is `src/proxy.ts`, and Cache Components are turned off in `next.config.ts` because every page is per-user. Read `node_modules/next/dist/docs/` before using an unfamiliar Next API.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm test` | Vitest: 99 tests (stats, import, Stuff+ evaluator parity, conversions, comps) |
| `npm run typecheck`, `npm run lint`, `npm run build` | Static checks and production build |
| `npm run seed` | Reseed the demo account. Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` |
| `npx tsx scripts/make-samples.ts` | Regenerate the sample CSV exports in `public/samples/` |
| `ml/.venv/Scripts/python -m pytest ml/tests` | pytest: 14 tests on conversions and features |

## Layout

```
src/
  app/(auth)/            login, signup
  app/(app)/             dashboard, outings, insights, stuff, import; actions.ts holds every write
  app/auth/confirm/      email confirmation callback
  components/            charts, stuff-charts, strike zone, forms, import wizard
  lib/stats/             fatigue, logistic regression, whiff model, summaries (pure, no dependencies)
  lib/stuff/             Stuff+ and comps (see below)
  lib/import/            CSV parsing, mapping, validation
  lib/seed/              season simulator
  lib/validate.ts        numeric ranges; mirror the database CHECK constraints
  proxy.ts               session refresh and route protection
ml/                      Python pipeline (see below)
scripts/                 seed.ts, make-samples.ts
supabase/migrations/     forward migrations 0001 to 0003
supabase/rollbacks/      one .down.sql per migration from 0003 on
supabase/scripts/        one-off data scripts (demo release backfill)
```

`src/lib/stuff/`:

| File | Role |
| --- | --- |
| `conventions.ts` | Units, sign conventions, handedness mirroring, model feature order |
| `model.ts` | Tree evaluator (`predict`, `toStuffPlus`) |
| `grade.ts` | Grades pitches, rolls up by pitch type and outing, loads the model JSON |
| `comps.ts` | Standardized distance, similarity score, nearest comps |
| `models/{fastball,breaking,offspeed}.json` | Exported trees |
| `models/meta.json` | Stuff+ scaling, split dates, and test metrics. The UI reads its numbers from here |
| `mlb-lhp-comps.json` | Comps pool: 1,117 pitch-type seasons from 227 MLB left-handers |

## Rules for this repo

- **Branches.** `master` is production. Feature work goes on a branch and is not merged without the owner's say-so.
- **Database.** One Supabase project serves production and previews, so a migration is live the moment it is applied. Migrations must be additive: new tables or nullable columns only, never modify or drop existing ones. Every migration gets a matching rollback file.
- **Secrets.** `.env*` is ignored except `.env.example`. Never commit keys or the demo password. The service role key is only for `scripts/seed.ts` and must never get a `NEXT_PUBLIC_` name.
- **Demo account.** Read-only in the database (RLS checks `app_metadata.demo`), and a trigger freezes its password and email. Server actions also refuse writes from it. Changing its data requires SQL run as an admin or the service role key.
- **Shared conventions.** `ml/conventions.py` and `src/lib/stuff/conventions.ts` must stay in step. Both test against `ml/tests/convention_cases.json`; add a case there when changing either. The `FEATURES` order must be identical in both.
- **PitchLab units.** TrackMan convention: break in inches from the pitcher's view (+ = pitcher's right); plate location in feet from the catcher's view; release side in feet from the pitcher's view. Statcast converts with `hb = -12 * pfx_x`, `ivb = 12 * pfx_z`, `release_side = -release_pos_x`.
- **Honest metrics.** Report test results as they are, next to a baseline. Do not tune against the test period.
- **Tests.** New math gets tests. Keep both suites passing before committing.
- **Commits.** One commit per working milestone with a clear message.

## ML pipeline

Everything is in `ml/`. Data, the virtual environment, and LightGBM text models are ignored by git (`ml/data/`, `ml/.venv/`, `ml/artifacts/`).

| File | Role |
| --- | --- |
| `download.py` | Pulls Statcast pitch data with pybaseball, one parquet file per month, regular season only. Skips months already on disk |
| `conventions.py` | Statcast to PitchLab conversions, pitch groups, feature order |
| `features.py` | Loads data, finds each pitcher-season's primary fastball, builds arm-side-positive features and fastball differentials |
| `tune.py` | Compares LightGBM settings on validation data only (drops the test period first) |
| `train.py` | Trains, evaluates, and exports the three models, `meta.json`, and the parity fixtures |
| `comps.py` | Builds the left-handed comps file and grades each comp with the trained models |
| `tests/` | pytest suite and the shared convention cases |

**Model facts**

- Target: Statcast `delta_run_exp` (runs per pitch from the batter's side; lower is better for the pitcher).
- Features (10): velocity, spin, horizontal break (arm side +), induced vertical break, release height, release side (arm side +), extension, and velocity / horizontal / vertical differentials vs. the pitcher-season's most-thrown fastball.
- One LightGBM regressor per group: fastballs (FF, SI, FC), breaking (SL, ST, SV, CU, KC), offspeed (CH, FS, FO).
- Settings: learning rate 0.02, 7 leaves, at least 2,000 pitches per leaf, L2 20, early stopping after 100 rounds. Small trees won on validation in every group.
- Data: 1,418,974 pitches, 2025 and 2026. Train through 2026-05-14, validation 2026-05-15 to 2026-06-30, test 2026-07-01 to 2026-09-27.
- Input masking: release data hidden on 15% of training rows, spin on 8%, differentials on 4%, so pitches missing those inputs can still be graded.
- Scale: Stuff+ = 100 − 10 × (prediction − mean) / SD, with mean and SD taken from pitch-level predictions on the train and validation rows, per group.

**Test results (held-out)**

| Group | R², model | R², ridge | Pitcher-level r, model | Pitcher-level r, ridge |
| --- | --- | --- | --- | --- |
| Fastballs | 0.069% | 0.017% | 0.20 | 0.10 |
| Breaking | 0.044% | 0.033% | 0.27 | 0.24 |
| Offspeed | 0.010% | −0.013% | 0.10 | 0.15 |

The signal is small. Fastball and breaking models beat both baselines; the offspeed model does not beat ridge at the pitcher level. The demo pitcher grades about 90 overall.

**Inference.** `train.py` flattens each tree into parallel arrays (`f` feature, `t` threshold, `n` missing-goes-left flag, `l`/`r` children, `v` leaf values). `model.ts` walks them. The parity test in `src/lib/stuff/__tests__/model.test.ts` checks TypeScript against LightGBM on 120 held-out rows to 10 decimal places.

## How to retrain

Python 3.12 is required. On Windows the interpreter is `ml/.venv/Scripts/python`; on macOS or Linux it is `ml/.venv/bin/python`.

1. Set up once:
   - `python -m venv ml/.venv`
   - `ml/.venv/Scripts/python -m pip install -r ml/requirements.txt`
2. Download data: `ml/.venv/Scripts/python ml/download.py` (defaults to 2025 and 2026; pass seasons to change, for example `2026 2027`). About 1.4 million pitches took a few minutes.
3. If the seasons changed, update `VALID_START` and `TEST_START` in `ml/train.py` and the validation cutoff in `ml/tune.py`.
4. Optional: `ml/.venv/Scripts/python ml/tune.py` to compare settings. Pick by validation results only.
5. Train: `ml/.venv/Scripts/python ml/train.py`. This rewrites `src/lib/stuff/models/` and `src/lib/stuff/__tests__/fixtures/parity.json`.
6. Rebuild comps: `ml/.venv/Scripts/python ml/comps.py` (uses the models from step 5).
7. Run both test suites: `ml/.venv/Scripts/python -m pytest ml/tests` and `npm test`. The parity test must pass.
8. Update the split dates and metrics tables in README.md and in this file. Re-read the "How this works" panel on `/stuff`: its numbers come from `meta.json`, but sentences such as "the offspeed model is the weakest" are hand-written and may no longer be true.
9. Commit the regenerated JSON files together with the doc updates.

## Local development notes

- The folder needs `.env.local` (copy `.env.example`; values are in the Supabase and Vercel dashboards) and `npm install`.
- If a page that exists returns 404 in dev, delete `.next` and restart the dev server from this folder.
- Vercel previews of a branch: `npx vercel deploy` from the branch. The project has environment variables for Production only, so pass the four app variables with `-b`/`-e` flags or add them to the Preview environment first. Preview URLs require a Vercel login.

## TODO, in priority order

**1. Finish what is already shipped**

1. Review the `stuff-model` preview and decide whether to merge it into `master`.
2. Set the Supabase Site URL to the production URL and add `/auth/confirm` to the redirect URLs. Until then, sign-up confirmation emails link to localhost. The sign-up flow has never been tested end to end.
3. Sign in to production and click through each page once: migration 0003 was applied to the live database and only the public pages were re-checked afterwards.
4. Add the four README screenshots to `docs/screenshots/` (dashboard, insights, outing, import), plus one of the Stuff+ page.
5. The six original milestone commits exist only in the first session's folder, which is deleted after about a week. Bring that history into the repo if it should be visible on GitHub.

**2. Deployment and account hygiene**

6. Connect the GitHub repo to the Vercel project so pushes build automatically, and add the app variables to Vercel's Preview environment.
7. Turn on two-factor authentication for the Vercel account.
8. Turn on leaked-password protection in Supabase Auth, if the plan allows it.
9. Put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` so `npm run seed` can reseed the demo account.

**3. Model quality**

10. Offspeed model: it does not beat ridge at the pitcher level. Try pooling offspeed with breaking balls, or shipping the ridge model for that group.
11. Validate with pitcher-grouped folds as well as the date split, and report the reliability of pitcher-level Stuff+ (split-half correlation).
12. Check Stuff+ against real Rapsodo or TrackMan exports. The Rapsodo column choices (`HB (trajectory)`, `VB (trajectory)`) and its horizontal sign were set from documentation, not from a real file.
13. Whiff model: add out-of-sample validation (k-fold AUC, calibration plot). Its fit statistics are in-sample.

**4. Features**

14. Comps for right-handers: either mirror them into the left-handed pool or build a right-handed pool.
15. Show the outing's Stuff+ on the outing detail page, and the release fields in the pitch log table.
16. Batter handedness and pitch sequencing as whiff-model inputs.
17. Tunneling views from release point and extension.
18. Season-over-season comparison and exportable reports for coaches.
