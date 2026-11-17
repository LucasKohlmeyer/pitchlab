/**
 * Writes two sample exports to public/samples so anyone can try the importer:
 *   rapsodo-bullpen.csv   Rapsodo-style: metadata preamble, inches, no count or result
 *   trackman-game.csv     TrackMan-style: feet, PitchCall vocabulary, counts
 *
 *   npx tsx scripts/make-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateSeason } from "../src/lib/seed/generate";
import type { PitchInput, PitchResult } from "../src/lib/types";

const season = generateSeason(424242);
const bullpen = season.find((o) => o.outing_type === "bullpen")!;
const game = season.find((o) => o.outing_type === "game")!;

const RAPSODO_TYPES: Record<string, string> = { FF: "Fastball", FT: "TwoSeamFastball", SV: "Slurve" };
const TRACKMAN_TYPES: Record<string, string> = { FF: "Fastball", FT: "Sinker", SV: "Slurve" };
const PITCH_CALLS: Record<PitchResult, string> = {
  ball: "BallCalled",
  called_strike: "StrikeCalled",
  whiff: "StrikeSwinging",
  foul: "FoulBallNotFieldable",
  in_play: "InPlay",
};

const quote = (cells: (string | number)[]) => cells.map((c) => `"${c}"`).join(",");

function rapsodo(pitches: PitchInput[]): string {
  const lines = [
    quote(["Player ID:", "100234"]),
    quote(["Player Name:", "Sample Pitcher"]),
    quote(["Session:", "Bullpen"]),
    "",
    quote(["No", "Date", "Pitch ID", "Pitch Type", "Is Strike", "Strike Zone Side", "Strike Zone Height", "Velocity", "Total Spin", "Spin Efficiency", "VB (trajectory)", "HB (trajectory)"]),
  ];
  pitches.forEach((p, i) => {
    const x = (p.plate_x as number) * 12;
    const z = (p.plate_z as number) * 12;
    const strike = Math.abs(x) <= 10 && z >= 18 && z <= 42 ? "YES" : "NO";
    // One dropped reading, as happens when the unit misses a pitch.
    const velocity = i === 11 ? "-" : (p.velocity as number).toFixed(1);
    lines.push(
      quote([i + 1, "03/18/2026", `rp-${1000 + i}`, RAPSODO_TYPES[p.pitch_type], strike, x.toFixed(1), z.toFixed(1), velocity, p.spin_rate as number, (82 + (i % 9)).toFixed(1), (p.ivb as number).toFixed(1), (p.hb as number).toFixed(1)]),
    );
  });
  return lines.join("\n") + "\n";
}

function trackman(pitches: PitchInput[]): string {
  const lines = ["PitchNo,Date,Pitcher,PitcherThrows,TaggedPitchType,PitchCall,Balls,Strikes,RelSpeed,SpinRate,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide"];
  for (const p of pitches) {
    lines.push(
      [
        p.pitch_number,
        "2026-03-21",
        '"Pitcher, Sample"',
        "Left",
        TRACKMAN_TYPES[p.pitch_type],
        PITCH_CALLS[p.result as PitchResult],
        p.balls,
        p.strikes,
        (p.velocity as number).toFixed(2),
        (p.spin_rate as number).toFixed(1),
        (p.ivb as number).toFixed(2),
        (p.hb as number).toFixed(2),
        (p.plate_z as number).toFixed(2),
        (p.plate_x as number).toFixed(2),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

mkdirSync("public/samples", { recursive: true });
writeFileSync("public/samples/rapsodo-bullpen.csv", rapsodo(bullpen.pitches));
writeFileSync("public/samples/trackman-game.csv", trackman(game.pitches));
console.log(`wrote ${bullpen.pitches.length} Rapsodo rows and ${game.pitches.length} TrackMan rows`);
