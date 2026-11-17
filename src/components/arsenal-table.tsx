import { PITCH_COLORS, PITCH_LABELS } from "@/lib/pitch";
import type { PitchTypeSummary } from "@/lib/stats/summary";
import { fmt } from "./ui";

/** Table view of the arsenal: the numbers behind the charts. */
export function ArsenalTable({ rows }: { rows: PitchTypeSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="py-2 pr-3 font-medium">Pitch</th>
            <th className="px-3 py-2 text-right font-medium">Count</th>
            <th className="px-3 py-2 text-right font-medium">Usage</th>
            <th className="px-3 py-2 text-right font-medium">Avg velo</th>
            <th className="px-3 py-2 text-right font-medium">Max</th>
            <th className="px-3 py-2 text-right font-medium">Spin</th>
            <th className="px-3 py-2 text-right font-medium">HB</th>
            <th className="px-3 py-2 text-right font-medium">IVB</th>
            <th className="px-3 py-2 text-right font-medium">Strike%</th>
            <th className="px-3 py-2 text-right font-medium">Whiff%</th>
            <th className="py-2 pl-3 text-right font-medium">Chase%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pitchType} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PITCH_COLORS[row.pitchType] }} />
                  {PITCH_LABELS[row.pitchType]}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{row.count}</td>
              <td className="px-3 py-2 text-right">{fmt(row.usagePct, 0, "%")}</td>
              <td className="px-3 py-2 text-right">{fmt(row.avgVelo)}</td>
              <td className="px-3 py-2 text-right">{fmt(row.maxVelo)}</td>
              <td className="px-3 py-2 text-right">{fmt(row.avgSpin, 0)}</td>
              <td className="px-3 py-2 text-right">{fmt(row.avgHb)}</td>
              <td className="px-3 py-2 text-right">{fmt(row.avgIvb)}</td>
              <td className="px-3 py-2 text-right">{fmt(row.strikePct, 1, "%")}</td>
              <td className="px-3 py-2 text-right">{fmt(row.whiffPct, 1, "%")}</td>
              <td className="py-2 pl-3 text-right">{fmt(row.chasePct, 1, "%")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
