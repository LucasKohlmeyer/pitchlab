import type { Metadata } from "next";
import Link from "next/link";
import { FatigueBadge } from "@/components/fatigue-panel";
import { NewOutingForm } from "@/components/outing-forms";
import { Empty, PageHeader, Section, fmt } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getOutings, getPitches } from "@/lib/data";
import { PITCH_LABELS, formatDate } from "@/lib/pitch";
import { mean, pct } from "@/lib/stats/descriptive";
import { fatigueForOuting } from "@/lib/stats/fatigue";
import type { Pitch } from "@/lib/types";

export const metadata: Metadata = { title: "Outings" };

export default async function OutingsPage() {
  const user = await requireUser();
  const [outings, pitches] = await Promise.all([getOutings(), getPitches()]);

  const byOuting = new Map<string, Pitch[]>();
  for (const p of pitches) {
    const list = byOuting.get(p.outing_id) ?? [];
    list.push(p);
    byOuting.set(p.outing_id, list);
  }

  const rows = [...outings].reverse().map((outing) => {
    const list = byOuting.get(outing.id) ?? [];
    const { pitchType, result } = fatigueForOuting(list);
    const fastballs = list.filter((p) => p.pitch_type === pitchType && p.velocity !== null).map((p) => p.velocity as number);
    const withResult = list.filter((p) => p.result !== null);
    return {
      outing,
      count: list.length,
      fastball: pitchType,
      fastballVelo: fastballs.length ? mean(fastballs) : null,
      strikePct: pct(withResult.filter((p) => p.result !== "ball").length, withResult.length),
      fatigue: result.status,
    };
  });

  return (
    <>
      <PageHeader title="Outings" subtitle="Every bullpen and game you have logged or imported." />
      <Section title="Start a new outing" description="Create the outing, then log pitches one at a time." className="mb-6">
        <NewOutingForm readOnly={user.isDemo} />
      </Section>

      {rows.length === 0 ? (
        <Empty title="No outings yet">
          Create one above, or <Link href="/import" className="underline underline-offset-4">import a Rapsodo or TrackMan CSV</Link>.
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="num w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Opponent</th>
                <th className="px-3 py-3 text-right font-medium">Pitches</th>
                <th className="px-3 py-3 text-right font-medium">Fastball avg</th>
                <th className="px-3 py-3 text-right font-medium">Strike%</th>
                <th className="px-5 py-3 font-medium">Fatigue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ outing, count, fastball, fastballVelo, strikePct, fatigue }) => (
                <tr key={outing.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
                  <td className="px-5 py-3">
                    <Link href={`/outings/${outing.id}`} className="font-medium underline-offset-4 hover:underline">
                      {formatDate(outing.outing_date)}, {outing.outing_date.slice(0, 4)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 capitalize text-ink-2">{outing.outing_type}</td>
                  <td className="px-3 py-3 text-ink-2">{outing.opponent ?? "–"}</td>
                  <td className="px-3 py-3 text-right">{count}</td>
                  <td className="px-3 py-3 text-right" title={fastball ? PITCH_LABELS[fastball] : undefined}>
                    {fmt(fastballVelo, 1, " mph")}
                  </td>
                  <td className="px-3 py-3 text-right">{fmt(strikePct, 0, "%")}</td>
                  <td className="px-5 py-3">{count > 0 ? <FatigueBadge status={fatigue} /> : <span className="text-xs text-ink-3">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
