import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArsenalTable } from "@/components/arsenal-table";
import { OutingVelocityChart } from "@/components/charts";
import { FatigueMethod, FatiguePanel } from "@/components/fatigue-panel";
import { DeleteOutingButton, DeletePitchButton, PitchLogger } from "@/components/outing-forms";
import { Empty, PageHeader, Section, Stat, fmt } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getOuting, getPitches } from "@/lib/data";
import { PITCH_COLORS, PITCH_LABELS, RESULT_LABELS, formatDate } from "@/lib/pitch";
import { pct } from "@/lib/stats/descriptive";
import { fatigueForOuting } from "@/lib/stats/fatigue";
import { summarizeByPitchType } from "@/lib/stats/summary";

export const metadata: Metadata = { title: "Outing" };

const SOURCE_LABELS = { manual: "Logged by hand", rapsodo: "Rapsodo import", trackman: "TrackMan import", seed: "Sample data" };

export default async function OutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const outing = await getOuting(id);
  if (!outing) notFound();
  const pitches = await getPitches(id);

  const summary = summarizeByPitchType(pitches);
  const fatigue = fatigueForOuting(pitches);
  const velos = pitches.map((p) => p.velocity).filter((v): v is number => v !== null);
  const withResult = pitches.filter((p) => p.result !== null);
  const swings = withResult.filter((p) => p.result === "whiff" || p.result === "foul" || p.result === "in_play");
  const points = pitches
    .filter((p) => p.velocity !== null)
    .map((p) => ({ n: p.pitch_number, velocity: p.velocity as number, pitchType: p.pitch_type }));

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/outings" className="text-ink-3 hover:text-ink">
          ← All outings
        </Link>
      </p>
      <PageHeader
        title={`${outing.outing_type === "game" ? "Game" : "Bullpen"}${outing.opponent ? ` vs. ${outing.opponent}` : ""}`}
        subtitle={`${formatDate(outing.outing_date)}, ${outing.outing_date.slice(0, 4)} · ${SOURCE_LABELS[outing.source]}`}
      >
        {!user.isDemo && <DeleteOutingButton outingId={outing.id} />}
      </PageHeader>
      {outing.notes && <p className="-mt-3 mb-6 max-w-2xl text-sm text-ink-2">{outing.notes}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pitches" value={pitches.length} />
        <Stat label="Top velocity" value={fmt(velos.length ? Math.max(...velos) : null, 1)} hint="mph" />
        <Stat
          label="Strike rate"
          value={fmt(pct(withResult.filter((p) => p.result !== "ball").length, withResult.length), 0, "%")}
          hint={withResult.length ? `${withResult.length} pitches with a result` : "No results recorded"}
        />
        <Stat
          label="Whiff rate"
          value={fmt(pct(swings.filter((p) => p.result === "whiff").length, swings.length), 0, "%")}
          hint={swings.length ? `${swings.length} swings` : "No swings recorded"}
        />
      </div>

      <div className="space-y-6">
        <Section
          title="Log a pitch"
          description={
            user.isDemo
              ? "Logging is turned off in the demo account."
              : "Pitch type stays selected between pitches, and the count advances from the result."
          }
        >
          <PitchLogger outingId={outing.id} outingType={outing.outing_type} readOnly={user.isDemo} />
        </Section>

        {pitches.length === 0 ? (
          <Empty title="No pitches yet">Log the first pitch above and the charts will appear here.</Empty>
        ) : (
          <>
            <Section title="Velocity by pitch count" description="Every pitch in the order it was thrown.">
              <OutingVelocityChart points={points} />
            </Section>

            <Section title="Fatigue check" description="Rolling fastball velocity against this outing's own baseline.">
              <FatiguePanel pitchType={fatigue.pitchType} result={fatigue.result} />
              <div className="mt-4">
                <FatigueMethod options={fatigue.result.options} />
              </div>
            </Section>

            <Section title="Arsenal in this outing">
              <ArsenalTable rows={summary} />
            </Section>

            <Section title="Pitch log">
              <div className="max-h-[480px] overflow-auto">
                <table className="num w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Pitch</th>
                      <th className="px-3 py-2 text-right font-medium">Velo</th>
                      <th className="px-3 py-2 text-right font-medium">Spin</th>
                      <th className="px-3 py-2 text-right font-medium">HB</th>
                      <th className="px-3 py-2 text-right font-medium">IVB</th>
                      <th className="px-3 py-2 text-right font-medium">Side</th>
                      <th className="px-3 py-2 text-right font-medium">Height</th>
                      <th className="px-3 py-2 font-medium">Count</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      {!user.isDemo && <th className="py-2 pl-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {pitches.map((p) => (
                      <tr key={p.id} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pr-3 text-ink-3">{p.pitch_number}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: PITCH_COLORS[p.pitch_type] }} />
                            {PITCH_LABELS[p.pitch_type]}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.velocity)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.spin_rate, 0)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.hb)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.ivb)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.plate_x, 2)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(p.plate_z, 2)}</td>
                        <td className="px-3 py-1.5 text-ink-2">
                          {p.balls !== null && p.strikes !== null ? `${p.balls}-${p.strikes}` : "–"}
                        </td>
                        <td className="px-3 py-1.5 text-ink-2">{p.result ? RESULT_LABELS[p.result] : "–"}</td>
                        {!user.isDemo && (
                          <td className="py-1.5 pl-3 text-right">
                            <DeletePitchButton outingId={outing.id} pitchId={p.id} pitchNumber={p.pitch_number} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </div>
    </>
  );
}
