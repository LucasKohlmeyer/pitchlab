import type { Metadata } from "next";
import Link from "next/link";
import { ArsenalTable } from "@/components/arsenal-table";
import {
  MovementChart,
  OutingVelocityExplorer,
  PitchMixChart,
  RatesChart,
  VelocityTrendChart,
  type RateRow,
} from "@/components/charts";
import { Empty, PageHeader, Section, Stat, fmt } from "@/components/ui";
import { LocationHeatmap } from "@/components/zone";
import { getOutings, getPitches } from "@/lib/data";
import { PITCH_LABELS, formatDate } from "@/lib/pitch";
import { pct } from "@/lib/stats/descriptive";
import { primaryFastball } from "@/lib/stats/fatigue";
import { locationGrid, pitchMixByCount, summarizeByPitchType, typesPresent, velocityByOuting } from "@/lib/stats/summary";

export const metadata: Metadata = { title: "Dashboard" };

const FILTERS = [
  { value: "all", label: "All outings" },
  { value: "game", label: "Games" },
  { value: "bullpen", label: "Bullpens" },
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const filter = type === "game" || type === "bullpen" ? type : "all";
  const [allOutings, allPitches] = await Promise.all([getOutings(), getPitches()]);

  const outings = filter === "all" ? allOutings : allOutings.filter((o) => o.outing_type === filter);
  const outingIds = new Set(outings.map((o) => o.id));
  const pitches = allPitches.filter((p) => outingIds.has(p.outing_id));

  const filterTabs = (
    <div className="flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Filter outings">
      {FILTERS.map((f) => (
        <Link
          key={f.value}
          href={f.value === "all" ? "/dashboard" : `/dashboard?type=${f.value}`}
          aria-current={filter === f.value ? "true" : undefined}
          className={`rounded-md px-3 py-1 text-sm ${filter === f.value ? "bg-raised text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );

  if (pitches.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard">{allPitches.length > 0 && filterTabs}</PageHeader>
        <Empty title={allPitches.length ? "No pitches match this filter" : "No pitches yet"}>
          <Link href="/outings" className="underline underline-offset-4">
            Log an outing
          </Link>{" "}
          or{" "}
          <Link href="/import" className="underline underline-offset-4">
            import a Rapsodo or TrackMan CSV
          </Link>{" "}
          to see your dashboard.
        </Empty>
      </>
    );
  }

  const types = typesPresent(pitches);
  const summary = summarizeByPitchType(pitches);
  const fastball = primaryFastball(pitches);
  const fastballSummary = summary.find((s) => s.pitchType === fastball);

  const withResult = pitches.filter((p) => p.result !== null);
  const swings = withResult.filter((p) => p.result === "whiff" || p.result === "foul" || p.result === "in_play");
  const strikePct = pct(withResult.filter((p) => p.result !== "ball").length, withResult.length);
  const whiffPct = pct(swings.filter((p) => p.result === "whiff").length, swings.length);

  const velocityRows = velocityByOuting(outings, pitches);
  const mixRows = pitchMixByCount(pitches);
  const rateRows: RateRow[] = [
    { metric: "Strike%", ...Object.fromEntries(summary.map((s) => [s.pitchType, s.strikePct])) },
    { metric: "Whiff%", ...Object.fromEntries(summary.map((s) => [s.pitchType, s.whiffPct])) },
    { metric: "Chase%", ...Object.fromEntries(summary.map((s) => [s.pitchType, s.chasePct])) },
  ];
  const hasRates = withResult.length > 0;

  const explorer = outings
    .map((o) => ({
      id: o.id,
      label: `${formatDate(o.outing_date)} · ${o.outing_type === "game" ? `Game${o.opponent ? ` vs. ${o.opponent}` : ""}` : "Bullpen"}`,
      points: pitches
        .filter((p) => p.outing_id === o.id && p.velocity !== null)
        .map((p) => ({ n: p.pitch_number, velocity: p.velocity as number, pitchType: p.pitch_type })),
    }))
    .filter((o) => o.points.length > 0);

  const movement = pitches
    .filter((p) => p.hb !== null && p.ivb !== null)
    .map((p) => ({ hb: p.hb as number, ivb: p.ivb as number, pitchType: p.pitch_type, velocity: p.velocity }));
  const located = pitches.filter((p) => p.plate_x !== null && p.plate_z !== null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${pitches.length.toLocaleString()} pitches across ${outings.length} outing${outings.length === 1 ? "" : "s"}`}
      >
        {filterTabs}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={fastball ? `${PITCH_LABELS[fastball]} velocity` : "Fastball velocity"}
          value={fmt(fastballSummary?.avgVelo ?? null)}
          hint={fastballSummary?.maxVelo != null ? `mph average · top ${fastballSummary.maxVelo.toFixed(1)}` : "mph average"}
        />
        <Stat label="Strike rate" value={fmt(strikePct, 1, "%")} hint={hasRates ? `${withResult.length} pitches with a result` : "No results recorded"} />
        <Stat label="Whiff rate" value={fmt(whiffPct, 1, "%")} hint={swings.length ? `${swings.length} swings` : "No swings recorded"} />
        <Stat label="Outings" value={outings.length} hint={`${outings.filter((o) => o.outing_type === "game").length} games · ${outings.filter((o) => o.outing_type === "bullpen").length} bullpens`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Velocity by outing" description="Average velocity for each pitch type, outing by outing." className="lg:col-span-2">
          <VelocityTrendChart rows={velocityRows} types={types} />
        </Section>

        <Section title="Velocity within an outing" description="Every pitch by pitch count. Pick an outing to see how velocity held up." className="lg:col-span-2">
          <OutingVelocityExplorer outings={explorer} />
        </Section>

        <Section title="Pitch mix by count" description="Share of each pitch type thrown in every ball-strike count (games only).">
          {mixRows.length ? <PitchMixChart rows={mixRows} types={types} /> : <p className="text-sm text-ink-3">No pitches with a recorded count.</p>}
        </Section>

        <Section
          title="Strike, whiff, and chase rates"
          description="Strike% is strikes per pitch. Whiff% is misses per swing. Chase% is swings at pitches outside the zone."
        >
          {hasRates ? <RatesChart rows={rateRows} types={types} /> : <p className="text-sm text-ink-3">No pitches with a recorded result.</p>}
        </Section>

        <Section title="Arsenal" description="The numbers behind the charts." className="lg:col-span-2">
          <ArsenalTable rows={summary} />
        </Section>

        <Section
          title="Location heatmaps"
          description="Where each pitch crosses the plate, from the catcher's view. Brighter cells hold more pitches; the white box is the strike zone."
          className={movement.length ? "" : "lg:col-span-2"}
        >
          {located.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {types.map((t) => (
                <LocationHeatmap key={t} pitchType={t} grid={locationGrid(pitches.filter((p) => p.pitch_type === t))} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-3">No pitches with a plate location.</p>
          )}
        </Section>

        {movement.length > 0 && (
          <Section
            title="Movement profile"
            description="Horizontal vs. induced vertical break, from the pitcher's view. Negative horizontal break moves toward the pitcher's left."
          >
            <MovementChart points={movement} />
          </Section>
        )}
      </div>
    </>
  );
}
