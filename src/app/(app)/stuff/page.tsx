import type { Metadata } from "next";
import Link from "next/link";
import { CompMovementChart, StuffTrendChart, ThrowsForm } from "@/components/stuff-charts";
import { Empty, PageHeader, Section, Stat, fmt } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getOutings, getPitches, getThrows } from "@/lib/data";
import { PITCH_COLORS, PITCH_LABELS, formatDate } from "@/lib/pitch";
import { COMP_FEATURE_LABELS, findComps, parseCompsFile, pitchProfile } from "@/lib/stuff/comps";
import { FEATURES, FEATURE_LABELS, GROUP_LABELS, PITCH_GROUP, inferThrows, type PitchGroup } from "@/lib/stuff/conventions";
import { MODEL_META, buildStuffReport } from "@/lib/stuff/grade";
import compsFile from "@/lib/stuff/mlb-lhp-comps.json";

export const metadata: Metadata = { title: "Stuff+" };

const GROUPS: PitchGroup[] = ["fastball", "breaking", "offspeed"];
const MLB_TYPE_LABELS: Record<string, string> = {
  FF: "Four-seam",
  SI: "Sinker",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Slurve",
  CU: "Curveball",
  KC: "Knuckle curve",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Forkball",
};

const pct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;

export default async function StuffPage() {
  const user = await requireUser();
  const [outings, pitches, savedThrows] = await Promise.all([getOutings(), getPitches(), getThrows()]);

  if (pitches.length === 0) {
    return (
      <>
        <PageHeader title="Stuff+" />
        <Empty title="No pitches yet">
          <Link href="/outings" className="underline underline-offset-4">
            Log an outing
          </Link>{" "}
          with velocity and break data to get Stuff+ grades and MLB comps.
        </Empty>
      </>
    );
  }

  const inferred = savedThrows === null ? inferThrows(pitches) : null;
  const throws = savedThrows ?? inferred;
  const header = (
    <PageHeader title="Stuff+" subtitle="How your pitches grade on physical characteristics alone, on a scale where 100 is the MLB average.">
      <ThrowsForm current={savedThrows} readOnly={user.isDemo} />
    </PageHeader>
  );

  if (throws === null) {
    return (
      <>
        {header}
        <Empty title="Which hand do you throw with?">
          Stuff+ mirrors horizontal movement for left-handers, so it needs your throwing hand. Choose it above.
        </Empty>
      </>
    );
  }

  const report = buildStuffReport(outings, pitches, throws);
  if (report.graded === 0) {
    return (
      <>
        {header}
        <Empty title="No pitches can be graded yet">
          A pitch needs velocity, horizontal break, and induced vertical break. Import a Rapsodo or TrackMan export, or add break values when you log pitches.
        </Empty>
      </>
    );
  }

  const types = report.byType.map((s) => s.pitchType);
  const allComps = parseCompsFile(compsFile);
  const comps =
    throws === "L"
      ? types.map((type) => findComps(type, pitchProfile(pitches.filter((p) => p.pitch_type === type)), allComps))
      : [];

  return (
    <>
      {header}
      {inferred && (
        <p className="-mt-3 mb-6 text-sm text-ink-3">
          Assuming you throw {inferred === "L" ? "left" : "right"}-handed, based on which way your fastball runs. Set it above to confirm.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Overall Stuff+" value={fmt(report.overall, 0)} hint={`${report.graded.toLocaleString()} pitches graded · MLB average is 100`} />
        {report.byType.map((s) => {
          const mlb = MODEL_META.groups[PITCH_GROUP[s.pitchType]].stuffByPitcher;
          return (
            <Stat
              key={s.pitchType}
              label={
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: PITCH_COLORS[s.pitchType] }} />
                  {PITCH_LABELS[s.pitchType]}
                </span>
              }
              value={s.stuffPlus.toFixed(0)}
              hint={
                <>
                  MLB {GROUP_LABELS[PITCH_GROUP[s.pitchType]].toLowerCase()}: middle 80% of pitchers grade {mlb.p10.toFixed(0)} to {mlb.p90.toFixed(0)}
                  {s.partialShare > 0 && (
                    <span className="mt-1 block text-warn">! {Math.round(s.partialShare * 100)}% graded on partial inputs</span>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      <div className="space-y-6">
        <Section title="Stuff+ by outing" description="Average grade for each pitch type in every outing. The dashed line is the MLB average.">
          <StuffTrendChart rows={report.byOuting.map((o) => ({ date: o.date, label: formatDate(o.date), ...o.byType }))} types={types} />
          <div className="mt-5 max-h-72 overflow-auto rounded-lg border border-line">
            <table className="num w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">Outing</th>
                  <th className="px-3 py-2 text-right font-medium">Graded</th>
                  <th className="px-3 py-2 text-right font-medium">Stuff+</th>
                  {types.map((t) => (
                    <th key={t} className="px-3 py-2 text-right font-medium">
                      {PITCH_LABELS[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...report.byOuting].reverse().map((o) => (
                  <tr key={o.outingId} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/outings/${o.outingId}`} className="underline-offset-4 hover:underline">
                        {formatDate(o.date)}, {o.date.slice(0, 4)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{o.graded}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(o.stuffPlus, 0)}</td>
                    {types.map((t) => (
                      <td key={t} className="px-3 py-2 text-right">
                        {fmt(o.byType[t] ?? null, 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="MLB comps"
          description={`The five left-handed MLB pitchers whose version of each pitch is closest to yours, out of ${allComps.length.toLocaleString()} pitch-type seasons from ${compsFile.seasons.join(" and ")} (at least ${compsFile.minPitches} pitches).`}
        >
          {throws === "R" ? (
            <p className="text-sm text-ink-3">
              Comps are built from left-handed MLB pitchers only, so they are not shown for right-handers yet.
            </p>
          ) : (
            <div className="space-y-8">
              {comps.map((result) => {
                const { profile } = result;
                return (
                  <div key={result.pitchType}>
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PITCH_COLORS[result.pitchType] }} />
                      {PITCH_LABELS[result.pitchType]}
                      <span className="num text-xs font-normal text-ink-3">
                        compared with {result.poolSize} MLB pitches on {result.featuresUsed.map((f) => COMP_FEATURE_LABELS[f].toLowerCase()).join(", ")}
                      </span>
                    </h3>
                    {result.comps.length === 0 || profile.hb === null || profile.ivb === null ? (
                      <p className="mt-2 text-sm text-ink-3">Not enough data for comps. This pitch needs at least three of the comparison features.</p>
                    ) : (
                      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_22rem]">
                        <div className="overflow-x-auto">
                          <table className="num w-full min-w-[620px] text-sm">
                            <thead>
                              <tr className="border-b border-line text-left text-xs text-ink-3">
                                <th className="py-2 pr-2 font-medium">#</th>
                                <th className="px-2 py-2 font-medium">Pitcher</th>
                                <th className="px-2 py-2 text-right font-medium">Similarity</th>
                                <th className="px-2 py-2 text-right font-medium">Velo</th>
                                <th className="px-2 py-2 text-right font-medium">Spin</th>
                                <th className="px-2 py-2 text-right font-medium">HB</th>
                                <th className="px-2 py-2 text-right font-medium">IVB</th>
                                <th className="px-2 py-2 text-right font-medium">Rel. ht</th>
                                <th className="px-2 py-2 text-right font-medium">Ext.</th>
                                <th className="py-2 pl-2 text-right font-medium">Stuff+</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-line bg-raised/60">
                                <td className="py-2 pr-2">
                                  <span className="block h-2.5 w-2.5 rounded-full" style={{ background: PITCH_COLORS[result.pitchType] }} />
                                </td>
                                <td className="px-2 py-2 font-medium">You</td>
                                <td className="px-2 py-2 text-right text-ink-3">–</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.velo)}</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.spin, 0)}</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.hb)}</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.ivb)}</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.relHeight, 2)}</td>
                                <td className="px-2 py-2 text-right">{fmt(profile.extension, 2)}</td>
                                <td className="py-2 pl-2 text-right font-medium">
                                  {fmt(report.byType.find((s) => s.pitchType === result.pitchType)?.stuffPlus ?? null, 0)}
                                </td>
                              </tr>
                              {result.comps.map((c, i) => (
                                <tr key={`${c.pitch.name}-${c.pitch.season}`} className="border-b border-line/60 last:border-0">
                                  <td className="py-2 pr-2 text-ink-3">{i + 1}</td>
                                  <td className="px-2 py-2">
                                    {c.pitch.name}
                                    <span className="ml-1.5 text-xs text-ink-3">
                                      {c.pitch.season} · {MLB_TYPE_LABELS[c.pitch.pitchType] ?? c.pitch.pitchType}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-right font-medium">{c.similarity.toFixed(0)}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.velo.toFixed(1)}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.spin}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.hb.toFixed(1)}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.ivb.toFixed(1)}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.relHeight.toFixed(2)}</td>
                                  <td className="px-2 py-2 text-right">{c.pitch.extension.toFixed(2)}</td>
                                  <td className="py-2 pl-2 text-right">{c.pitch.stuffPlus}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <CompMovementChart
                          pitchType={result.pitchType}
                          user={{ hb: profile.hb, ivb: profile.ivb, velo: profile.velo }}
                          comps={result.comps.map((c, i) => ({
                            rank: i + 1,
                            name: `${c.pitch.name} (${c.pitch.season})`,
                            hb: c.pitch.hb,
                            ivb: c.pitch.ivb,
                            velo: c.pitch.velo,
                          }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-sm text-ink-3">
                Similarity is 100 for an identical pitch and falls with distance: each feature is converted to standard deviations
                across the MLB pool, the gaps are combined as a root mean square, and the score is 100 · e^(−d²/2). About 61 means one
                standard deviation apart on average. Horizontal break is from the pitcher&apos;s view, so a left-hander&apos;s arm-side
                run is negative.
              </p>
            </div>
          )}
        </Section>

        <Section title="How this works" description="What the model is, how well it works, and where it should not be trusted.">
          <div className="space-y-4 text-sm text-ink-2">
            <p>
              <span className="text-ink">What it predicts.</span> For every pitch, the model predicts its run value: the change in
              expected runs caused by that pitch, the same quantity Statcast publishes as <code className="rounded bg-raised px-1.5 py-0.5 text-xs">delta_run_exp</code>.
              It sees only how the pitch moved and where it was released. It does not see location, count, the batter, or the
              result. Predictions are rescaled so 100 is the MLB average for that pitch group and every 10 points is one standard
              deviation of pitch-level predictions. Higher is better for the pitcher.
            </p>
            <p>
              <span className="text-ink">Training data.</span> {Object.values(MODEL_META.groups).reduce((s, g) => s + g.rows.train + g.rows.validation + g.rows.test, 0).toLocaleString()}{" "}
              MLB regular-season pitches from {MODEL_META.seasons.join(" and ")}. There is a separate gradient-boosted tree model
              ({MODEL_META.library}) for fastballs, breaking balls, and offspeed pitches. Pitches from {MODEL_META.split.train} train
              the models, {MODEL_META.split.validation} decides when to stop adding trees, and {MODEL_META.split.test} is held out
              and used only for the scores below.
            </p>
            <div>
              <p className="text-ink">Inputs.</p>
              <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <li key={f}>· {FEATURE_LABELS[f]}</li>
                ))}
              </ul>
              <p className="mt-2">
                Horizontal values are mirrored for left-handers so that positive always means arm side, which lets one model serve
                both hands. Statcast reports break in feet from the catcher&apos;s view; PitchLab uses the TrackMan convention (inches,
                pitcher&apos;s view), so the pipeline converts with hb = −12 × pfx_x and ivb = 12 × pfx_z. The same conversion cases
                are tested in Python and TypeScript.
              </p>
            </div>

            <div>
              <p className="text-ink">Held-out test results.</p>
              <div className="mt-2 overflow-x-auto">
                <table className="num w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="py-2 pr-3 font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Test pitches</th>
                      <th className="px-3 py-2 text-right font-medium">RMSE, model</th>
                      <th className="px-3 py-2 text-right font-medium">RMSE, guess the average</th>
                      <th className="px-3 py-2 text-right font-medium">R², model</th>
                      <th className="px-3 py-2 text-right font-medium">R², linear</th>
                      <th className="px-3 py-2 text-right font-medium">Pitcher r, model</th>
                      <th className="py-2 pl-3 text-right font-medium">Pitcher r, linear</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map((g) => {
                      const m = MODEL_META.groups[g];
                      return (
                        <tr key={g} className="border-b border-line/60 last:border-0">
                          <td className="py-2 pr-3 text-ink">{GROUP_LABELS[g]}</td>
                          <td className="px-3 py-2 text-right">{m.rows.test.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{m.rmse.model.toFixed(5)}</td>
                          <td className="px-3 py-2 text-right">{m.rmse.constant.toFixed(5)}</td>
                          <td className="px-3 py-2 text-right">{pct(m.r2.model)}</td>
                          <td className="px-3 py-2 text-right">{pct(m.r2.linear)}</td>
                          <td className="px-3 py-2 text-right">
                            {m.pitcherLevel.rModel.toFixed(2)} <span className="text-xs text-ink-3">n={m.pitcherLevel.pitchers}</span>
                          </td>
                          <td className="py-2 pl-3 text-right">{m.pitcherLevel.rLinear.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2">
                Read these honestly. On a single pitch the model explains well under 0.1% of the variation in run value, barely
                better than guessing the average, because one pitch&apos;s outcome is almost all luck, location, and the hitter.
                The grade only means something as an average over many pitches. &quot;Pitcher r&quot; is the correlation between a
                pitcher&apos;s average predicted and actual run value over the test period (pitchers with at least{" "}
                {MODEL_META.minPitcherPitches} pitches): a weak but real signal for fastballs and breaking balls. The offspeed
                model is the weakest and does not beat a simple linear model at the pitcher level, so treat changeup and splitter
                grades as rough.
              </p>
            </div>

            <div className="text-ink-3">
              <p className="text-ink-2">Limitations.</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  <span className="text-ink-2">MLB data, college pitcher.</span> The model learned what works against MLB hitters. A
                  grade of 90 says the pitch would be below average in MLB; it says nothing about how it plays against college
                  lineups, and most college pitches sit outside the velocity range the model saw most.
                </li>
                <li>
                  <span className="text-ink-2">Different measuring devices.</span> MLB data comes from Hawk-Eye. Rapsodo and TrackMan
                  measure spin and break slightly differently, and a bullpen unit can read differently from a stadium unit.
                </li>
                <li>
                  <span className="text-ink-2">Partial inputs.</span> If a pitch has no release point, extension, or spin, the trees
                  fall back to default branches learned by hiding those inputs on a share of training pitches. Those grades are
                  flagged and are less precise.
                </li>
                <li>
                  <span className="text-ink-2">No command, deception, or sequencing.</span> Stuff is one part of pitching. A pitcher
                  with average stuff and good command can outperform this number, and the reverse.
                </li>
                <li>
                  <span className="text-ink-2">Small samples.</span> An outing grade over a few dozen pitches moves with ordinary
                  pitch-to-pitch variation. Trust the trend, not one point.
                </li>
              </ul>
            </div>
            <p className="text-xs text-ink-3">
              Models trained {MODEL_META.trainedOn}. They run inside the app as plain JSON trees evaluated in TypeScript; there is no
              Python server.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
