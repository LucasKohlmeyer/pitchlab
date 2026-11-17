# PitchLab

Pitching analytics for pitchers, built by one. Log bullpens and games pitch by pitch, import Rapsodo and TrackMan exports, and get velocity trends, movement profiles, command maps, fatigue alerts, and a whiff-probability model whose math you can read.

**Live demo:** https://pitchlab-gold.vercel.app

Click **Explore the live demo** on the landing page. It signs you in to a read-only account seeded with a season of data for a left-hander sitting 88 to 91 mph with a four-seam, two-seam, and slurve.

## Features

- **Accounts.** Email and password auth through Supabase. Every table is protected by row level security, so a pitcher can only read and write their own outings.
- **Read-only demo.** The demo account is flagged in its signed JWT. Postgres policies reject every write from it, and a trigger freezes its password and email so a visitor cannot lock others out.
- **Pitch logging.** Create a bullpen or game, then log each pitch: type, velocity, spin rate, horizontal and induced vertical break, count, result, and a click-to-place plate location. The pitch type stays selected and the count advances from the result.
- **CSV import.** Upload a Rapsodo or TrackMan export. PitchLab finds the header row (skipping Rapsodo's metadata preamble), detects the vendor, suggests a column mapping you can correct, converts units, and validates every row. Errors skip the row and are listed with the row number; warnings keep it. Two sample files are built in so you can try it.
- **Dashboard.**
  - Velocity by outing, per pitch type
  - Velocity within an outing, by pitch count
  - Pitch mix in each ball-strike count
  - Strike%, whiff%, and chase% by pitch type
  - Location heatmap per pitch type
  - Movement plot (horizontal vs. induced vertical break)
  - Arsenal table with the numbers behind every chart
- **Insights.**
  - Fatigue detection per outing, with the method explained in the app
  - A logistic regression for whiff probability, with coefficients, standard errors, odds ratios, confidence intervals, and a plain-language reading of each one

## Screenshots

Add screenshots to `docs/screenshots/` and they will appear here.

| Dashboard | Insights |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Insights](docs/screenshots/insights.png) |

| Outing detail | CSV import |
| --- | --- |
| ![Outing detail](docs/screenshots/outing.png) | ![CSV import](docs/screenshots/import.png) |

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions), TypeScript |
| Database and auth | Supabase (Postgres, row level security, `@supabase/ssr` cookie sessions) |
| Styling | Tailwind CSS 4 |
| Charts | Recharts, plus hand-written SVG for the strike zone heatmaps and coefficient plot |
| CSV parsing | Papa Parse |
| Tests | Vitest (52 tests over the stats, seed, and import code) |
| Hosting | Vercel |

The stats layer has no dependencies. Logistic regression, the linear solver, AUC, and the fatigue test are written from scratch in `src/lib/stats` so the math is inspectable.

## How the stats work

### Rates

| Stat | Definition |
| --- | --- |
| Strike% | Called strikes, whiffs, fouls, and balls in play, divided by pitches with a recorded result |
| Whiff% | Swings and misses divided by swings |
| Chase% | Swings at pitches outside the zone divided by pitches outside the zone |
| Zone | Plate side within ±0.83 ft of center (half the plate plus a ball radius), height 1.5 to 3.5 ft |

### Fatigue detection

Code: [`src/lib/stats/fatigue.ts`](src/lib/stats/fatigue.ts)

The question is whether fastball velocity has dropped *relative to that day's own baseline*, so a cold day or a bullpen-intensity day is not compared with a season average.

1. **Baseline.** Take the outing's most-thrown fastball. The mean `m0` and sample standard deviation `s0` of its first 10 pitches are the baseline.
2. **Rolling mean.** For each later fastball, average the most recent 8. Windows never overlap the baseline.
3. **Test.** `z = (rolling - m0) / (s0 * sqrt(1/8 + 1/10))`. The square-root term accounts for sampling noise in both means. `s0` has a floor of 0.5 mph so an unusually tight start cannot make tiny drops look significant.
4. **Flag.** A window is flagged when `z <= -2.5` and the drop is at least 1.0 mph. Requiring both statistical and practical significance avoids flagging drops that are real but too small to matter.
5. **Onset.** Fatigue is reported only after 3 flagged windows in a row; the onset is the first pitch of that run.

Overlapping windows are correlated, so a per-window false-alarm rate says little about the per-outing rate. I measured it by simulation instead: over 600 simulated starts, these settings detected 88% of outings with a late fade of roughly 2 mph or more and raised a false alarm in 3% of outings without one. An earlier version (window of 6, two flags in a row) had a 7.5% false-alarm rate, which is why the defaults are what they are.

Limits: velocity is a proxy for fatigue, and a deliberate change of effort looks the same as a tired arm.

### Whiff probability model

Code: [`src/lib/stats/logistic.ts`](src/lib/stats/logistic.ts), [`src/lib/stats/whiff-model.ts`](src/lib/stats/whiff-model.ts)

The model estimates `P(whiff | swing)` with logistic regression. Takes are excluded, because a called strike says nothing about whether a pitch can miss a bat.

| Feature | Why it is in the model |
| --- | --- |
| Breaking or offspeed pitch (0/1) | Pitch class |
| Velocity vs. pitch-type average (mph) | Does an extra tick on the same pitch miss more bats? |
| Movement vs. pitch-type average (in) | Total break, `sqrt(HB² + IVB²)`, relative to that pitch's norm |
| Distance from zone center (ft) | Location |
| Two-strike count (0/1) | Hitters expand and pitchers bury pitches |

Velocity and movement are centered within pitch type on purpose. Raw velocity is almost a proxy for which pitch was thrown (a slurve is 12 mph slower than a fastball), so using it directly would make the coefficients collinear with pitch type and hard to interpret.

**Fitting.** Maximum likelihood by Newton-Raphson (iteratively reweighted least squares). Each step solves `(XᵀWX + λI) δ = Xᵀ(y − p) − λβ` with `W = diag(p(1 − p))`. A small ridge penalty (λ = 0.001, never applied to the intercept) keeps the Hessian invertible if the classes are nearly separable. Continuous features are z-scored so coefficients are comparable; the 0/1 features are left alone.

**Inference.** Standard errors are the square roots of the diagonal of the inverse Hessian. The app reports Wald z scores, two-sided p-values, odds ratios with 95% intervals, McFadden's pseudo R², log-loss against a base-rate model, and AUC.

**Reading it.** A coefficient `b` multiplies the odds of a whiff by `e^b`. Continuous coefficients are per one standard deviation of the feature.

Limits: fit statistics are in-sample, so they are optimistic. There is no batter quality, handedness, or sequencing in the model, and with a few hundred swings the intervals are wide. The model needs at least 60 swings including 10 whiffs before it will fit.

### Are the stats right?

`npm test` runs 52 tests. A few that matter:

- Logistic regression recovers known coefficients from 6,000 simulated observations, and the truth lies within 3 standard errors of each estimate.
- At the solution the mean predicted probability equals the observed base rate (the score equation for the intercept).
- Predictions do not change when a feature is rescaled from mph to km/h.
- The fatigue baseline, threshold, and z score match hand-computed values.
- On the seeded season, fatigue is flagged in exactly the games generated with a velocity fade, and the whiff model recovers the direction of the effects built into the data.

## Demo data

[`src/lib/seed/generate.ts`](src/lib/seed/generate.ts) is a deterministic simulator, not a table of random numbers. Games are played batter by batter: pitch selection depends on the count, swing probability depends on location, and whiffs are drawn from a known logistic model, so the app's fitted model has real signal to find. Four games include a late velocity fade. The result is 15 outings and 1,075 pitches:

| Pitch | Usage | Velocity | Spin | HB | IVB | Whiff% |
| --- | --- | --- | --- | --- | --- | --- |
| Four-seam | 53% | 89.1 mph | 2,180 rpm | −9.4 in | 16.1 in | 20% |
| Two-seam | 20% | 88.2 mph | 2,060 rpm | −15.1 in | 9.5 in | 15% |
| Slurve | 27% | 76.5 mph | 2,420 rpm | 9.7 in | −5.6 in | 40% |

Horizontal break is from the pitcher's view, positive toward the pitcher's right, so a left-hander's arm-side run is negative.

## Data model

```
outings                              pitches
  id            uuid pk                id            uuid pk
  user_id       -> auth.users          outing_id     -> outings (cascade)
  outing_date   date                   user_id       -> auth.users
  outing_type   bullpen | game         pitch_number  int, unique per outing
  opponent      text                   pitch_type    FF FT FC SL SV CU CH FS
  notes         text                   velocity      mph
  source        manual | rapsodo |     spin_rate     rpm
                trackman | seed        hb, ivb       in
                                       plate_x       ft from center, catcher's view
                                       plate_z       ft above ground
                                       balls, strikes
                                       result        ball | called_strike | whiff | foul | in_play
```

Every numeric column has a `CHECK` range, and the same ranges are enforced in `src/lib/validate.ts` for forms and imports. Migrations are in [`supabase/migrations`](supabase/migrations).

## Project structure

```
src/
  app/
    (auth)/            login, signup
    (app)/             dashboard, outings, insights, import, server actions
    auth/confirm/      email confirmation callback
  components/          charts, strike zone, forms, import wizard
  lib/
    stats/             fatigue, logistic regression, whiff model, summaries (+ tests)
    import/            CSV parsing, mapping, validation (+ tests)
    seed/              season simulator
    supabase/          server and browser clients
  proxy.ts             session refresh and route protection
scripts/
  seed.ts              seed the demo account
  make-samples.ts      regenerate the sample CSV exports
supabase/migrations/   schema, policies, demo account guard
```

## Run it locally

Requires Node 20.9 or newer and a free Supabase project.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create a Supabase project, then run the two files in `supabase/migrations` in the SQL editor, in order.

3. Copy the environment template and fill it in from Supabase (Project Settings, API).

   ```bash
   cp .env.example .env.local
   ```

4. Seed the demo account. This needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The key is only read by this script and must never be given a `NEXT_PUBLIC_` name.

   ```bash
   npm run seed
   ```

5. Start the app.

   ```bash
   npm run dev
   ```

Other commands:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

## Deploy

1. Import the repository into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DEMO_EMAIL`, and `DEMO_PASSWORD` as environment variables. Do not add the service role key.
3. In Supabase (Authentication, URL Configuration), set the Site URL to your Vercel URL and add `https://pitchlab-gold.vercel.app/auth/confirm` to the redirect URLs so sign-up confirmation emails link back to the app.

## What I would build next

- Out-of-sample validation for the whiff model (k-fold AUC and a calibration plot)
- Batter handedness and pitch sequencing as model features
- Release point and extension from TrackMan, for tunneling views
- Season-over-season comparison and exportable reports for coaches
