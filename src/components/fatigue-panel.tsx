import { PITCH_COLORS, PITCH_LABELS } from "@/lib/pitch";
import type { FatigueResult } from "@/lib/stats/fatigue";
import type { PitchType } from "@/lib/types";
import { FatigueChart } from "./charts";

export function FatigueBadge({ status }: { status: FatigueResult["status"] }) {
  if (status === "fatigued") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-bad/40 px-2 py-0.5 text-xs text-ink">
        <span aria-hidden="true" className="text-bad">
          ▼
        </span>
        Velocity drop
      </span>
    );
  }
  if (status === "steady") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">
        <span aria-hidden="true" className="text-good">
          ●
        </span>
        Steady
      </span>
    );
  }
  return <span className="text-xs text-ink-3">Too few fastballs</span>;
}

/** One outing's fatigue read-out: verdict sentence plus the chart behind it. */
export function FatiguePanel({ pitchType, result }: { pitchType: PitchType | null; result: FatigueResult }) {
  const { baselineSize, window } = result.options;
  if (!pitchType || result.status === "insufficient") {
    return (
      <p className="text-sm text-ink-3">
        Fatigue detection needs at least {baselineSize + window} fastballs of one type with a velocity reading
        {pitchType ? ` (this outing has ${result.points.length} ${PITCH_LABELS[pitchType].toLowerCase()}s)` : ""}.
      </p>
    );
  }
  const name = PITCH_LABELS[pitchType].toLowerCase();
  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        {result.status === "fatigued" ? (
          <>
            <span className="font-medium text-ink">Sustained velocity drop from pitch {result.onsetPitchNumber}.</span> The
            rolling {name} average fell as much as {result.maxDrop?.toFixed(1)} mph below the {result.baselineMean?.toFixed(1)} mph
            baseline set by the first {baselineSize} {name}s.
          </>
        ) : (
          <>
            <span className="font-medium text-ink">No significant drop.</span> The rolling {name} average stayed within{" "}
            {((result.baselineMean ?? 0) - (result.threshold ?? 0)).toFixed(1)} mph of the {result.baselineMean?.toFixed(1)} mph
            baseline (largest dip {result.maxDrop?.toFixed(1)} mph).
          </>
        )}
      </p>
      <FatigueChart
        points={result.points}
        baseline={result.baselineMean}
        threshold={result.threshold}
        onset={result.onsetPitchNumber}
        color={PITCH_COLORS[pitchType]}
      />
    </div>
  );
}

/** Plain-language explanation of the method, shown wherever fatigue is reported. */
export function FatigueMethod({ options }: { options: FatigueResult["options"] }) {
  const { baselineSize, window, minDropMph, zThreshold, sustain } = options;
  return (
    <details className="group rounded-lg border border-line bg-page px-4 py-3 text-sm text-ink-2">
      <summary className="cursor-pointer font-medium text-ink">How fatigue detection works</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          <span className="text-ink">Baseline.</span> Within one outing, take your most-thrown fastball. The mean and
          standard deviation of its first {baselineSize} pitches are that day&apos;s baseline, so a cold day or a
          bullpen-intensity day is judged against itself, not your season average.
        </li>
        <li>
          <span className="text-ink">Rolling average.</span> For each later fastball, average the most recent {window}. A
          rolling mean smooths out single misfires.
        </li>
        <li>
          <span className="text-ink">Significance test.</span> Compare the rolling mean to the baseline mean with{" "}
          <code className="rounded bg-raised px-1.5 py-0.5 text-xs">
            z = (rolling − baseline) / (s · √(1/{window} + 1/{baselineSize}))
          </code>
          , where s is the baseline standard deviation. The square-root term accounts for noise in both averages.
        </li>
        <li>
          <span className="text-ink">Flag.</span> A window is flagged when z ≤ −{zThreshold} (about a{" "}
          {zThreshold >= 2.5 ? "0.6" : "2.3"}% chance from noise alone) and the drop is at least {minDropMph.toFixed(1)} mph.
          Requiring both avoids flagging drops that are statistically real but too small to matter.
        </li>
        <li>
          <span className="text-ink">Onset.</span> Fatigue is reported only after {sustain} flagged windows in a row,
          and the onset is the first pitch of that run. One slow pitch never triggers it.
        </li>
      </ol>
      <p className="mt-3">
        <span className="text-ink">How reliable is it?</span> On simulated starts, these settings caught about 88% of
        outings with a real late fade of 2 mph or more, and raised a false alarm in about 3% of outings without one.
      </p>
      <p className="mt-3 text-ink-3">
        Limits: velocity is a proxy for fatigue, not a measurement of it. Windows overlap, so consecutive flags are not
        independent tests, and a deliberate change of effort looks the same as a tired arm.
      </p>
    </details>
  );
}
