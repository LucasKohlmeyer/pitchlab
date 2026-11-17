import { PITCH_COLORS, PITCH_LABELS } from "@/lib/pitch";
import { MIN_SWINGS, MIN_WHIFFS, type WhiffCoefficient, type WhiffModel } from "@/lib/stats/whiff-model";
import { Stat } from "./ui";

const POSITIVE = "#3987e5";
const NEGATIVE = "#e66767";

function pValueLabel(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}

/** One-sentence reading of a coefficient, in baseball terms. */
function explain(c: WhiffCoefficient): string {
  const direction = c.oddsRatio >= 1 ? "raises" : "lowers";
  const change = `${direction} the odds of a whiff by ${Math.abs((c.oddsRatio - 1) * 100).toFixed(0)}%`;
  const evidence =
    c.pValue < 0.05
      ? "The interval excludes no effect, so this is unlikely to be noise."
      : "The interval includes no effect, so this could be noise at this sample size.";
  const subject: Record<WhiffCoefficient["feature"]["key"], string> = {
    offspeed: "Throwing a breaking or offspeed pitch instead of a fastball",
    velo: `Each extra ${c.sd.toFixed(1)} mph (one standard deviation) above your average for that pitch`,
    movement: `Each extra ${c.sd.toFixed(1)} in (one standard deviation) of total break above your average for that pitch`,
    distance: `Each extra ${c.sd.toFixed(2)} ft (one standard deviation) farther from the middle of the zone`,
    twoStrikes: "Being in a two-strike count",
  };
  return `${subject[c.feature.key]} ${change}, holding the other features fixed. ${evidence}`;
}

/** Forest plot: coefficient with its 95% interval, on the log-odds scale. */
function CoefficientPlot({ coefficients }: { coefficients: WhiffCoefficient[] }) {
  const extent = Math.max(
    0.5,
    ...coefficients.map((c) => Math.max(Math.abs(c.coefficient - 1.96 * c.standardError), Math.abs(c.coefficient + 1.96 * c.standardError))),
  );
  const limit = Math.ceil(extent * 2) / 2;
  const pos = (v: number) => 50 + (v / limit) * 50; // percent across the track

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: POSITIVE }} />
          More whiffs
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEGATIVE }} />
          Fewer whiffs
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-ink" />
          95% interval
        </li>
      </ul>
      <div className="space-y-3">
        {coefficients.map((c) => {
          const positive = c.coefficient >= 0;
          const lo = pos(c.coefficient - 1.96 * c.standardError);
          const hi = pos(c.coefficient + 1.96 * c.standardError);
          return (
            <div key={c.feature.key} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr_9rem]">
              <p className="text-sm">{c.feature.label}</p>
              <div
                className="relative h-7 rounded bg-page"
                role="img"
                aria-label={`${c.feature.label}: coefficient ${c.coefficient.toFixed(2)}, 95% interval ${(c.coefficient - 1.96 * c.standardError).toFixed(2)} to ${(c.coefficient + 1.96 * c.standardError).toFixed(2)}`}
              >
                <div
                  className="absolute top-1.5 bottom-1.5"
                  style={{
                    left: `${positive ? 50 : pos(c.coefficient)}%`,
                    width: `${Math.abs(pos(c.coefficient) - 50)}%`,
                    background: positive ? POSITIVE : NEGATIVE,
                    borderRadius: positive ? "0 4px 4px 0" : "4px 0 0 4px",
                  }}
                />
                <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                <div className="absolute top-2 bottom-2 w-0.5 bg-ink" style={{ left: `${lo}%` }} />
                <div className="absolute top-2 bottom-2 w-0.5 -translate-x-full bg-ink" style={{ left: `${hi}%` }} />
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink-3" />
              </div>
              <p className="num text-xs text-ink-2">
                <span className="font-medium text-ink">
                  {positive ? "+" : "−"}
                  {Math.abs(c.coefficient).toFixed(2)}
                </span>{" "}
                · {pValueLabel(c.pValue)}
              </p>
            </div>
          );
        })}
        <div className="grid gap-x-4 sm:grid-cols-[14rem_1fr_9rem]">
          <span />
          <div className="num flex justify-between text-xs text-ink-3">
            <span>−{limit.toFixed(1)}</span>
            <span>0 (no effect)</span>
            <span>+{limit.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WhiffModelPanel({ model }: { model: WhiffModel }) {
  if (model.status === "insufficient") {
    return (
      <p className="text-sm text-ink-3">
        The model needs at least {MIN_SWINGS} swings with full tracking data (velocity, break, location, count), including at
        least {MIN_WHIFFS} whiffs and {MIN_WHIFFS} swings with contact. You have {model.swings} swings and {model.whiffs} whiffs so far.
        Log or import more game outings to unlock it.
      </p>
    );
  }
  const { fit, coefficients, byPitchType } = model;
  const baseRate = model.whiffs / model.swings;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Swings in the model" value={model.swings} hint={`${model.whiffs} whiffs (${(baseRate * 100).toFixed(1)}%)`} />
        <Stat label="AUC" value={fit.auc.toFixed(2)} hint="0.50 is a coin flip, 1.00 is perfect" />
        <Stat label="Pseudo R²" value={fit.pseudoR2.toFixed(3)} hint="McFadden; share of log-loss explained" />
        <Stat label="Log-loss" value={fit.logLoss.toFixed(3)} hint={`vs. ${fit.nullLogLoss.toFixed(3)} guessing the base rate`} />
      </div>

      <div>
        <h3 className="text-sm font-medium">Coefficients</h3>
        <p className="mt-1 mb-4 text-sm text-ink-3">
          Change in the log-odds of a whiff. Continuous features are per one standard deviation, so their sizes are comparable;
          yes/no features compare yes to no.
        </p>
        <CoefficientPlot coefficients={coefficients} />
      </div>

      <div className="overflow-x-auto">
        <table className="num w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-2 pr-3 font-medium">Feature</th>
              <th className="px-3 py-2 text-right font-medium">Coefficient</th>
              <th className="px-3 py-2 text-right font-medium">Std. error</th>
              <th className="px-3 py-2 text-right font-medium">z</th>
              <th className="px-3 py-2 text-right font-medium">Odds ratio (95% CI)</th>
              <th className="py-2 pl-3 font-medium">What it means</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/60 align-top">
              <td className="py-2 pr-3">Intercept</td>
              <td className="px-3 py-2 text-right">{fit.intercept.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">{fit.standardErrors[0].toFixed(2)}</td>
              <td className="px-3 py-2 text-right">{fit.zScores[0].toFixed(2)}</td>
              <td className="px-3 py-2 text-right">–</td>
              <td className="py-2 pl-3 text-xs leading-relaxed text-ink-2">
                Baseline: an average fastball in a count with fewer than two strikes has about a{" "}
                {((1 / (1 + Math.exp(-fit.intercept))) * 100).toFixed(0)}% chance of a whiff when the batter swings.
              </td>
            </tr>
            {coefficients.map((c) => (
              <tr key={c.feature.key} className="border-b border-line/60 align-top last:border-0">
                <td className="py-2 pr-3">
                  {c.feature.label}
                  <span className="block text-xs text-ink-3">{c.feature.description}</span>
                </td>
                <td className="px-3 py-2 text-right">{c.coefficient.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{c.standardError.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{c.z.toFixed(2)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {c.oddsRatio.toFixed(2)} ({c.oddsRatioLow.toFixed(2)} to {c.oddsRatioHigh.toFixed(2)})
                </td>
                <td className="py-2 pl-3 text-xs leading-relaxed text-ink-2">{explain(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-medium">Predicted vs. observed whiff rate per swing</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {byPitchType.map((row) => (
            <div key={row.pitchType} className="rounded-lg border border-line bg-page px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PITCH_COLORS[row.pitchType] }} />
                {PITCH_LABELS[row.pitchType]}
                <span className="num ml-auto text-xs text-ink-3">{row.swings} swings</span>
              </p>
              <p className="num mt-2 text-sm text-ink-2">
                Model <span className="font-medium text-ink">{(row.predicted * 100).toFixed(1)}%</span> · Actual{" "}
                <span className="font-medium text-ink">{(row.observed * 100).toFixed(1)}%</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-lg border border-line bg-page px-4 py-3 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">How the whiff model works</summary>
        <div className="mt-3 space-y-3">
          <p>
            <span className="text-ink">What it predicts.</span> For every swing, the probability that the batter misses:{" "}
            <code className="rounded bg-raised px-1.5 py-0.5 text-xs">P(whiff | swing) = 1 / (1 + e^−(b₀ + b₁x₁ + … + b₅x₅))</code>.
            Takes are left out, because a called strike or ball says nothing about whether the pitch can miss a bat.
          </p>
          <p>
            <span className="text-ink">Features.</span> Velocity and movement are measured against your own average for that
            pitch type. Raw velocity mostly tells the model which pitch was thrown (a slurve is far slower than a fastball), so
            centering within pitch type isolates the question that matters: does more velocity or break on the same pitch miss
            more bats?
          </p>
          <p>
            <span className="text-ink">Fitting.</span> Coefficients are estimated by maximum likelihood with Newton-Raphson
            (iteratively reweighted least squares), implemented from scratch in TypeScript. This fit converged in {fit.iterations}{" "}
            iterations. A very small ridge penalty keeps the solution stable. Standard errors come from the inverse Hessian, and
            the z and p values are Wald tests.
          </p>
          <p>
            <span className="text-ink">Reading a coefficient.</span> A coefficient of b multiplies the odds of a whiff by e^b.
            For example +0.69 doubles the odds and −0.69 halves them. Odds are not probabilities: doubling the odds of a 20% event
            gives 33%, not 40%.
          </p>
          <p className="text-ink-3">
            Limits: the fit statistics are measured on the same swings the model was trained on, so they are optimistic. The model
            has no batter quality, handedness, or pitch sequencing, and with a few hundred swings the intervals are wide. Treat it
            as a description of what has worked, not a forecast.
          </p>
        </div>
      </details>
    </div>
  );
}
