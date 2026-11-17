import type { Metadata } from "next";
import Link from "next/link";
import { FatigueBadge, FatigueMethod, FatiguePanel } from "@/components/fatigue-panel";
import { Empty, PageHeader, Section, fmt } from "@/components/ui";
import { WhiffModelPanel } from "@/components/whiff-model-panel";
import { getOutings, getPitches } from "@/lib/data";
import { PITCH_LABELS, formatDate } from "@/lib/pitch";
import { DEFAULT_FATIGUE_OPTIONS, fatigueForOuting } from "@/lib/stats/fatigue";
import { fitWhiffModel } from "@/lib/stats/whiff-model";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ outing?: string }> }) {
  const { outing: selectedId } = await searchParams;
  const [outings, pitches] = await Promise.all([getOutings(), getPitches()]);

  if (pitches.length === 0) {
    return (
      <>
        <PageHeader title="Insights" />
        <Empty title="No pitches yet">
          <Link href="/outings" className="underline underline-offset-4">
            Log an outing
          </Link>{" "}
          to unlock fatigue detection and the whiff model.
        </Empty>
      </>
    );
  }

  const reports = outings
    .map((outing) => ({ outing, ...fatigueForOuting(pitches.filter((p) => p.outing_id === outing.id)) }))
    .filter((r) => r.result.points.length > 0)
    .reverse();
  const flagged = reports.filter((r) => r.result.status === "fatigued");
  const assessed = reports.filter((r) => r.result.status !== "insufficient");
  // Default to the most recent flagged outing, else the most recent one that could be assessed.
  const selected = reports.find((r) => r.outing.id === selectedId) ?? flagged[0] ?? assessed[0] ?? reports[0];

  const model = fitWhiffModel(pitches);

  return (
    <>
      <PageHeader title="Insights" subtitle="Two statistical reads on your data: when your velocity fades, and what makes hitters miss." />

      <div className="space-y-6">
        <Section
          title="Fatigue detection"
          description={
            assessed.length
              ? `${flagged.length} of ${assessed.length} assessed outing${assessed.length === 1 ? "" : "s"} showed a sustained velocity drop.`
              : "No outing has enough fastballs to assess yet."
          }
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
              <table className="num w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="px-3 py-2 font-medium">Outing</th>
                    <th className="px-3 py-2 text-right font-medium">Onset</th>
                    <th className="px-3 py-2 text-right font-medium">Max drop</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const active = r.outing.id === selected?.outing.id;
                    return (
                      <tr key={r.outing.id} className={`border-b border-line/60 last:border-0 ${active ? "bg-raised" : ""}`}>
                        <td className="px-3 py-2">
                          <Link
                            href={`/insights?outing=${r.outing.id}`}
                            scroll={false}
                            aria-current={active ? "true" : undefined}
                            className="block underline-offset-4 hover:underline"
                          >
                            {formatDate(r.outing.outing_date)}
                            <span className="ml-1.5 text-xs text-ink-3 capitalize">{r.outing.outing_type}</span>
                          </Link>
                          <span className="mt-1 block">
                            <FatigueBadge status={r.result.status} />
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {r.result.onsetPitchNumber !== null ? `Pitch ${r.result.onsetPitchNumber}` : "–"}
                        </td>
                        <td className="px-3 py-2 text-right align-top">{fmt(r.result.maxDrop, 1, " mph")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selected && (
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-medium">
                  {formatDate(selected.outing.outing_date)} ·{" "}
                  {selected.outing.outing_type === "game"
                    ? `Game${selected.outing.opponent ? ` vs. ${selected.outing.opponent}` : ""}`
                    : "Bullpen"}
                  {selected.pitchType ? ` · ${PITCH_LABELS[selected.pitchType]}` : ""}
                </h3>
                <FatiguePanel pitchType={selected.pitchType} result={selected.result} />
              </div>
            )}
          </div>
          <div className="mt-5">
            <FatigueMethod options={DEFAULT_FATIGUE_OPTIONS} />
          </div>
        </Section>

        <Section
          title="Whiff probability model"
          description="A logistic regression estimating the chance a swing misses, from the pitch's features."
        >
          <WhiffModelPanel model={model} />
        </Section>
      </div>
    </>
  );
}
