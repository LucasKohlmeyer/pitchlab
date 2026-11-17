"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { importOuting } from "@/app/(app)/actions";
import {
  IMPORT_FIELDS,
  defaultOptions,
  detectDate,
  detectSource,
  mapRows,
  parseCsv,
  suggestMapping,
  type ImportOptions,
  type ImportSource,
  type Mapping,
  type ParsedCsv,
} from "@/lib/import/csv";
import { PITCH_COLORS, PITCH_LABELS, RESULT_LABELS } from "@/lib/pitch";
import type { OutingType } from "@/lib/types";
import { fmt } from "./ui";

const SAMPLES = [
  { href: "/samples/rapsodo-bullpen.csv", label: "Rapsodo bullpen sample" },
  { href: "/samples/trackman-game.csv", label: "TrackMan game sample" },
];
const MAX_BYTES = 5 * 1024 * 1024;

type Loaded = { fileName: string; parsed: ParsedCsv };

export function ImportWizard({ readOnly }: { readOnly: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource>("rapsodo");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [options, setOptions] = useState<ImportOptions>(defaultOptions(null));
  const [date, setDate] = useState("");
  const [type, setType] = useState<OutingType>("bullpen");
  const [opponent, setOpponent] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (fileName: string, text: string) => {
    setImportedId(null);
    setSubmitError(null);
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) {
      setLoaded(null);
      setLoadError("That file has no data rows. Export a pitch-level CSV and try again.");
      return;
    }
    const detected = detectSource(parsed.headers);
    const suggested = suggestMapping(parsed.headers);
    setLoadError(null);
    setLoaded({ fileName, parsed });
    setSource(detected ?? "rapsodo");
    setMapping(suggested);
    setOptions(defaultOptions(detected));
    setDate(detectDate(parsed) ?? new Date().toLocaleDateString("en-CA"));
    // A file with pitch results is almost certainly a game.
    setType(suggested.result ? "game" : "bullpen");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLoadError("That file is larger than 5 MB. Export one session at a time.");
      return;
    }
    load(file.name, await file.text());
  };

  const loadSample = async (href: string) => {
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error();
      load(href.split("/").pop() as string, await response.text());
    } catch {
      setLoadError("Could not load the sample file.");
    }
  };

  const result = useMemo(
    () => (loaded && mapping ? mapRows(loaded.parsed.rows, mapping, options) : null),
    [loaded, mapping, options],
  );
  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];

  const submit = () => {
    if (!result || result.pitches.length === 0) return;
    setSubmitError(null);
    start(async () => {
      const response = await importOuting({ date, type, opponent, source, pitches: result.pitches });
      if (response.ok) setImportedId(response.id ?? null);
      else setSubmitError(response.error);
    });
  };

  return (
    <div className="space-y-6">
      {/* Step 1 */}
      <section className="card">
        <StepTitle n={1} title="Choose a CSV export" />
        <p className="mt-1 text-sm text-ink-3">
          Pitch-level exports from Rapsodo or TrackMan. The file is read in your browser; only the mapped pitches are uploaded.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="btn btn-primary cursor-pointer">
            Choose file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {SAMPLES.map((s) => (
            <button key={s.href} type="button" className="btn btn-secondary" onClick={() => void loadSample(s.href)}>
              Try the {s.label}
            </button>
          ))}
        </div>
        {loadError && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {loadError}
          </p>
        )}
        {loaded && (
          <p className="num mt-3 text-sm text-ink-2">
            <span className="font-medium text-ink">{loaded.fileName}</span> · {loaded.parsed.rows.length} rows ·{" "}
            {loaded.parsed.headers.length} columns
          </p>
        )}
      </section>

      {loaded && mapping && result && (
        <>
          {/* Step 2 */}
          <section className="card">
            <StepTitle n={2} title="Map the columns" />
            <p className="mt-1 text-sm text-ink-3">
              Columns were matched automatically from the header names. Check each one against the sample value and fix any that are wrong.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="source">
                  Source
                </label>
                <select
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value as ImportSource)}
                  className="field"
                >
                  <option value="rapsodo">Rapsodo</option>
                  <option value="trackman">TrackMan</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="unit">
                  Plate location units
                </label>
                <select
                  id="unit"
                  value={options.locationUnit}
                  onChange={(e) => setOptions({ ...options, locationUnit: e.target.value as "in" | "ft" })}
                  className="field"
                >
                  <option value="in">Inches (Rapsodo)</option>
                  <option value="ft">Feet (TrackMan)</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={options.flipHorizontal}
                  onChange={(e) => setOptions({ ...options, flipHorizontal: e.target.checked })}
                  className="h-4 w-4 accent-[#3987e5]"
                />
                Flip horizontal direction
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="py-2 pr-3 font-medium">PitchLab field</th>
                    <th className="px-3 py-2 font-medium">CSV column</th>
                    <th className="py-2 pl-3 font-medium">First value in file</th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_FIELDS.map((field) => {
                    const column = mapping[field.key];
                    const sample = column ? loaded.parsed.rows[0]?.[column] : undefined;
                    return (
                      <tr key={field.key} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-3">
                          <label htmlFor={`map-${field.key}`}>
                            {field.label}
                            {field.required && <span className="ml-1 text-xs text-ink-3">(required)</span>}
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            id={`map-${field.key}`}
                            value={column ?? ""}
                            onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value || null })}
                            className={`field py-1.5 ${field.required && !column ? "border-bad" : ""}`}
                          >
                            <option value="">Not in this file</option>
                            {loaded.parsed.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num py-2 pl-3 text-ink-2">{sample || "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Step 3 */}
          <section className="card">
            <StepTitle n={3} title="Review and import" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Tally label="Ready to import" value={result.pitches.length} tone="good" />
              <Tally label="Rows skipped" value={result.skipped} tone={result.skipped ? "bad" : "muted"} />
              <Tally label="Warnings" value={warnings.length} tone={warnings.length ? "warn" : "muted"} />
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <details className="mt-4 rounded-lg border border-line bg-page px-4 py-3 text-sm" open={errors.length > 0}>
                <summary className="cursor-pointer font-medium">
                  {errors.length} error{errors.length === 1 ? "" : "s"}, {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="num mt-3 max-h-48 space-y-1 overflow-auto text-ink-2">
                  {[...errors, ...warnings].slice(0, 100).map((issue, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={`w-16 shrink-0 text-xs ${issue.level === "error" ? "text-bad" : "text-warn"}`}>
                        {issue.level === "error" ? "✕ Skipped" : "! Warning"}
                      </span>
                      <span>
                        Row {issue.row}: {issue.message}
                      </span>
                    </li>
                  ))}
                  {errors.length + warnings.length > 100 && <li className="text-ink-3">…and {errors.length + warnings.length - 100} more</li>}
                </ul>
              </details>
            )}

            {result.pitches.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs text-ink-3">Preview of the first {Math.min(6, result.pitches.length)} pitches as they will be saved</p>
                <table className="num w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="py-2 pr-3 font-medium">Pitch</th>
                      <th className="px-3 py-2 text-right font-medium">Velo</th>
                      <th className="px-3 py-2 text-right font-medium">Spin</th>
                      <th className="px-3 py-2 text-right font-medium">HB</th>
                      <th className="px-3 py-2 text-right font-medium">IVB</th>
                      <th className="px-3 py-2 text-right font-medium">Side (ft)</th>
                      <th className="px-3 py-2 text-right font-medium">Height (ft)</th>
                      <th className="px-3 py-2 font-medium">Count</th>
                      <th className="py-2 pl-3 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pitches.slice(0, 6).map((p, i) => (
                      <tr key={i} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pr-3">
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
                        <td className="px-3 py-1.5 text-ink-2">{p.balls !== null && p.strikes !== null ? `${p.balls}-${p.strikes}` : "–"}</td>
                        <td className="py-1.5 pl-3 text-ink-2">{p.result ? RESULT_LABELS[p.result] : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="import-date">
                  Outing date
                </label>
                <input id="import-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="import-type">
                  Type
                </label>
                <select id="import-type" value={type} onChange={(e) => setType(e.target.value as OutingType)} className="field">
                  <option value="bullpen">Bullpen</option>
                  <option value="game">Game</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="import-opponent">
                  Opponent or label (optional)
                </label>
                <input id="import-opponent" value={opponent} maxLength={80} onChange={(e) => setOpponent(e.target.value)} className="field" />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={readOnly || pending || result.pitches.length === 0 || !date || importedId !== null}
                onClick={submit}
              >
                {pending ? "Importing…" : `Import ${result.pitches.length} pitches`}
              </button>
            </div>

            {readOnly && (
              <p className="mt-3 text-sm text-ink-3">
                Importing is turned off in the demo account. Everything up to this point runs in your browser, so you can still try the mapping and validation.
              </p>
            )}
            {submitError && (
              <p role="alert" className="mt-3 text-sm text-bad">
                {submitError}
              </p>
            )}
            {importedId && (
              <p role="status" className="mt-3 text-sm text-ink">
                Imported {result.pitches.length} pitches.{" "}
                <Link href={`/outings/${importedId}`} className="underline underline-offset-4">
                  View the outing
                </Link>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 font-medium">
      <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-raised text-xs text-ink-2">{n}</span>
      {title}
    </h2>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" | "muted" }) {
  const mark = { good: "✓", bad: "✕", warn: "!", muted: "" }[tone];
  const color = { good: "text-good", bad: "text-bad", warn: "text-warn", muted: "text-ink-3" }[tone];
  return (
    <div className="rounded-lg border border-line bg-page px-4 py-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="num mt-1 text-xl font-semibold">
        {mark && (
          <span aria-hidden="true" className={`mr-1.5 text-base ${color}`}>
            {mark}
          </span>
        )}
        {value}
      </p>
    </div>
  );
}
