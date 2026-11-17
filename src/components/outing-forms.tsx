"use client";

import { useActionState, useState, useTransition } from "react";
import { addPitch, createOuting, deleteOuting, deletePitch, type ActionResult } from "@/app/(app)/actions";
import { PITCH_COLORS, PITCH_LABELS, RESULT_LABELS } from "@/lib/pitch";
import { PITCH_TYPES, RESULTS, type OutingType, type PitchResult, type PitchType } from "@/lib/types";
import { ZonePicker } from "./zone";

export function NewOutingForm({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createOuting, null);
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="date">
          Date
        </label>
        <input id="date" name="date" type="date" defaultValue={today} required disabled={readOnly} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="type">
          Type
        </label>
        <select id="type" name="type" defaultValue="bullpen" disabled={readOnly} className="field">
          <option value="bullpen">Bullpen</option>
          <option value="game">Game</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="opponent">
          Opponent or label (optional)
        </label>
        <input id="opponent" name="opponent" maxLength={80} placeholder="e.g. Ridgeline" disabled={readOnly} className="field" />
      </div>
      <button type="submit" disabled={readOnly || pending} className="btn btn-primary">
        {pending ? "Creating…" : "New outing"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-bad sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function DeleteOutingButton({ outingId }: { outingId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-bad">{error}</span>}
      <button
        type="button"
        disabled={pending}
        className="btn btn-danger"
        onClick={() => {
          if (!window.confirm("Delete this outing and all of its pitches? This cannot be undone.")) return;
          start(async () => {
            const result = await deleteOuting(outingId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete outing"}
      </button>
    </div>
  );
}

export function DeletePitchButton({ outingId, pitchId, pitchNumber }: { outingId: string; pitchId: string; pitchNumber: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Delete pitch ${pitchNumber}`}
      className="rounded px-2 py-0.5 text-xs text-ink-3 hover:text-bad disabled:opacity-50"
      onClick={() => start(async () => void (await deletePitch(outingId, pitchId)))}
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}

const NEXT_COUNT = (balls: number, strikes: number, result: PitchResult | ""): { balls: number; strikes: number } => {
  if (result === "ball") return balls === 3 ? { balls: 0, strikes: 0 } : { balls: balls + 1, strikes };
  if (result === "called_strike" || result === "whiff") return strikes === 2 ? { balls: 0, strikes: 0 } : { balls, strikes: strikes + 1 };
  if (result === "foul") return { balls, strikes: Math.min(2, strikes + 1) };
  if (result === "in_play") return { balls: 0, strikes: 0 };
  return { balls, strikes };
};

/** Pitch-by-pitch logger. Keeps the pitch type sticky and advances the count from the result. */
export function PitchLogger({ outingId, outingType, readOnly }: { outingId: string; outingType: OutingType; readOnly: boolean }) {
  const isGame = outingType === "game";
  const [pitchType, setPitchType] = useState<PitchType>("FF");
  const [velocity, setVelocity] = useState("");
  const [spin, setSpin] = useState("");
  const [hb, setHb] = useState("");
  const [ivb, setIvb] = useState("");
  const [releaseHeight, setReleaseHeight] = useState("");
  const [releaseSide, setReleaseSide] = useState("");
  const [extension, setExtension] = useState("");
  const [location, setLocation] = useState<{ x: number; z: number } | null>(null);
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [result, setResult] = useState<PitchResult | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    if (!velocity.trim()) {
      setError("Enter the velocity.");
      return;
    }
    start(async () => {
      const response = await addPitch(outingId, {
        pitch_type: pitchType,
        velocity,
        spin_rate: spin,
        hb,
        ivb,
        plate_x: location?.x ?? null,
        plate_z: location?.z ?? null,
        balls: isGame ? balls : null,
        strikes: isGame ? strikes : null,
        result: result || null,
        release_height: releaseHeight,
        release_side: releaseSide,
        extension,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      // Ready for the next pitch: keep type, clear readings, advance the count.
      setVelocity("");
      setSpin("");
      setHb("");
      setIvb("");
      setLocation(null);
      if (isGame) {
        const next = NEXT_COUNT(balls, strikes, result);
        setBalls(next.balls);
        setStrikes(next.strikes);
      }
      setResult("");
    });
  };

  return (
    <form
      className="grid gap-5 md:grid-cols-[1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={readOnly || pending} className="space-y-4">
        <div>
          <span className="label">Pitch type</span>
          <div className="flex flex-wrap gap-1.5">
            {PITCH_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={pitchType === type}
                onClick={() => setPitchType(type)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                  pitchType === type ? "border-ink bg-raised text-ink" : "border-line text-ink-2 hover:border-ink-3"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: PITCH_COLORS[type] }} />
                {PITCH_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField id="velocity" label="Velocity (mph)" value={velocity} onChange={setVelocity} step="0.1" required />
          <NumberField id="spin" label="Spin (rpm)" value={spin} onChange={setSpin} step="1" />
          <NumberField id="hb" label="Horiz. break (in)" value={hb} onChange={setHb} step="0.1" />
          <NumberField id="ivb" label="Ind. vert. break (in)" value={ivb} onChange={setIvb} step="0.1" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField id="release-height" label="Release height (ft)" value={releaseHeight} onChange={setReleaseHeight} step="0.01" />
          <NumberField id="release-side" label="Release side (ft)" value={releaseSide} onChange={setReleaseSide} step="0.01" />
          <NumberField id="extension" label="Extension (ft)" value={extension} onChange={setExtension} step="0.01" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {isGame && (
            <>
              <div>
                <label className="label" htmlFor="balls">
                  Balls
                </label>
                <select id="balls" value={balls} onChange={(e) => setBalls(Number(e.target.value))} className="field">
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="strikes">
                  Strikes
                </label>
                <select id="strikes" value={strikes} onChange={(e) => setStrikes(Number(e.target.value))} className="field">
                  {[0, 1, 2].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className="label" htmlFor="result">
              Result{isGame ? "" : " (optional)"}
            </label>
            <select id="result" value={result} onChange={(e) => setResult(e.target.value as PitchResult | "")} className="field">
              <option value="">No result</option>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          {pending ? "Saving…" : "Add pitch"}
        </button>
      </fieldset>

      <div>
        <span className="label">Location (catcher&apos;s view)</span>
        <ZonePicker value={location} onChange={setLocation} disabled={readOnly || pending} />
        <p className="num mt-1 text-xs text-ink-3">
          {location ? `${location.x.toFixed(2)} ft side, ${location.z.toFixed(2)} ft high` : "Click the zone to place the pitch"}
        </p>
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="field num"
      />
    </div>
  );
}
