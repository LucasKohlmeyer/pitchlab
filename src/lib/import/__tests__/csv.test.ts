import { describe, expect, it } from "vitest";
import { defaultOptions, detectDate, detectSource, mapRows, parseCsv, suggestMapping } from "../csv";

const RAPSODO = `"Player ID:","12345"
"Player Name:","Sample Pitcher"
"Date:","03/11/2026"

"No","Date","Pitch ID","Pitch Type","Is Strike","Strike Zone Side","Strike Zone Height","Velocity","Total Spin","True Spin","Spin Efficiency","Spin Direction","VB (spin)","HB (spin)","VB (trajectory)","HB (trajectory)"
"1","03/11/2026","a1","Fastball","YES","3.6","30.0","89.4","2,180","1950","89.4","10:45","17.1","-9.9","16.2","-9.4"
"2","03/11/2026","a2","TwoSeamFastball","NO","-14.4","18.0","88.1","2055","1800","87.6","10:15","10.3","-15.6","9.5","-15.0"
"3","03/11/2026","a3","Slurve","NO","6.0","20.4","-","2440","1500","61.5","4:30","-5.1","10.2","-5.6","9.7"
"4","03/11/2026","a4","Eephus","NO","0","24","60","1500","1000","66","12:00","1","1","1","1"
"5","03/11/2026","a5","Fastball","YES","1.2","28.8","189.4","2200","1950","88.6","10:45","17.0","-9.0","16.0","-9.1"
"","","","-","","","","-","","","","","","","",""
`;

const TRACKMAN = `PitchNo,Date,Time,Pitcher,PitcherThrows,TaggedPitchType,AutoPitchType,PitchCall,Balls,Strikes,RelSpeed,SpinRate,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide
1,2026-03-14,14:02:11,"Pitcher, Sample",Left,Fastball,Four-Seam,StrikeCalled,0,0,89.61,2175.2,16.42,-9.13,2.61,0.12
2,2026-03-14,14:02:35,"Pitcher, Sample",Left,Sinker,Sinker,BallCalled,0,1,88.42,2061.9,9.71,-15.22,1.21,-1.38
3,2026-03-14,14:03:02,"Pitcher, Sample",Left,Slurve,Curveball,StrikeSwinging,1,1,76.83,2433.0,-5.48,9.66,1.44,0.71
4,2026-03-14,14:03:30,"Pitcher, Sample",Left,Fastball,Four-Seam,FoulBallNotFieldable,1,2,90.02,2190.4,16.01,-9.52,3.12,-0.22
5,2026-03-14,14:03:58,"Pitcher, Sample",Left,Slurve,Curveball,InPlay,1,2,77.2,2401.7,-6.02,10.14,1.92,0.3
6,2026-03-14,14:04:40,"Pitcher, Sample",Left,Fastball,Four-Seam,Undefined,5,0,89.1,2168.8,15.8,-9.0,2.4,0.0
7,2026-03-14,14:05:01,"Pitcher, Sample",Left,Changeup,Changeup,MysteryCall,0,0,81.3,1701.3,8.8,-13.4,1.9,-0.4
`;

describe("Rapsodo import", () => {
  const parsed = parseCsv(RAPSODO);
  const mapping = suggestMapping(parsed.headers);
  const source = detectSource(parsed.headers);

  it("skips the metadata preamble and finds the real header row", () => {
    expect(parsed.headers).toContain("Pitch Type");
    expect(parsed.headers).toContain("HB (trajectory)");
    expect(parsed.rows).toHaveLength(6);
  });

  it("detects the source and suggests a mapping", () => {
    expect(source).toBe("rapsodo");
    expect(mapping.pitch_type).toBe("Pitch Type");
    expect(mapping.velocity).toBe("Velocity");
    expect(mapping.spin_rate).toBe("Total Spin");
    expect(mapping.hb).toBe("HB (trajectory)");
    expect(mapping.ivb).toBe("VB (trajectory)");
    expect(mapping.plate_x).toBe("Strike Zone Side");
    expect(mapping.plate_z).toBe("Strike Zone Height");
    expect(mapping.balls).toBeNull();
    expect(mapping.result).toBeNull();
    expect(defaultOptions(source).locationUnit).toBe("in");
  });

  it("reads the session date", () => {
    expect(detectDate(parsed)).toBe("2026-03-11");
  });

  it("converts inches to feet, strips thousands separators, and validates each row", () => {
    const result = mapRows(parsed.rows, mapping, defaultOptions(source));
    expect(result.total).toBe(6);
    expect(result.pitches).toHaveLength(3);
    expect(result.skipped).toBe(3);

    const [ff, ft, sv] = result.pitches;
    expect(ff).toMatchObject({ pitch_type: "FF", velocity: 89.4, spin_rate: 2180, hb: -9.4, ivb: 16.2, plate_x: 0.3, plate_z: 2.5 });
    expect(ft).toMatchObject({ pitch_type: "FT", plate_x: -1.2, plate_z: 1.5, balls: null, result: null });
    // A "-" reading becomes null and raises a warning, but the pitch is kept.
    expect(sv).toMatchObject({ pitch_type: "SV", velocity: null, plate_x: 0.5, plate_z: 1.7 });

    const messages = result.issues.map((issue) => `${issue.row}:${issue.level}:${issue.message}`);
    expect(messages).toContain("3:warning:No velocity reading");
    expect(messages).toContain('4:error:Unrecognized pitch type "Eephus"');
    expect(messages).toContain("5:error:Velocity 189.4 is outside 40 to 110 mph");
    expect(messages).toContain("6:error:No pitch type");
  });

  it("can flip the horizontal sign convention", () => {
    const flipped = mapRows(parsed.rows, mapping, { locationUnit: "in", flipHorizontal: true });
    expect(flipped.pitches[0]).toMatchObject({ hb: 9.4, plate_x: -0.3, ivb: 16.2 });
  });
});

describe("TrackMan import", () => {
  const parsed = parseCsv(TRACKMAN);
  const mapping = suggestMapping(parsed.headers);
  const source = detectSource(parsed.headers);

  it("detects the source, mapping, units, and date", () => {
    expect(source).toBe("trackman");
    expect(mapping).toMatchObject({
      pitch_type: "TaggedPitchType",
      velocity: "RelSpeed",
      spin_rate: "SpinRate",
      hb: "HorzBreak",
      ivb: "InducedVertBreak",
      plate_x: "PlateLocSide",
      plate_z: "PlateLocHeight",
      balls: "Balls",
      strikes: "Strikes",
      result: "PitchCall",
    });
    expect(defaultOptions(source).locationUnit).toBe("ft");
    expect(detectDate(parsed)).toBe("2026-03-14");
  });

  it("handles quoted commas in names", () => {
    expect(parsed.rows[0].Pitcher).toBe("Pitcher, Sample");
  });

  it("maps PitchCall vocabulary to results and rounds readings", () => {
    const result = mapRows(parsed.rows, mapping, defaultOptions(source));
    expect(result.pitches.map((p) => p.result)).toEqual(["called_strike", "ball", "whiff", "foul", "in_play", null]);
    expect(result.pitches[0]).toMatchObject({ pitch_type: "FF", velocity: 89.6, spin_rate: 2175, ivb: 16.4, hb: -9.1, plate_x: 0.12, plate_z: 2.61, balls: 0, strikes: 0 });
    expect(result.pitches[1].pitch_type).toBe("FT");
    expect(result.pitches[5].pitch_type).toBe("CH");
  });

  it("rejects impossible counts and warns on unknown results", () => {
    const result = mapRows(parsed.rows, mapping, defaultOptions(source));
    expect(result.skipped).toBe(1);
    const messages = result.issues.map((issue) => `${issue.row}:${issue.level}:${issue.message}`);
    expect(messages).toContain("6:error:Balls 5 is outside 0 to 3");
    expect(messages).toContain('7:warning:Result "MysteryCall" not recognized; left blank');
    // "Undefined" is TrackMan's blank, not an unknown value.
    expect(messages.some((m) => m.includes("Undefined"))).toBe(false);
  });
});

describe("edge cases", () => {
  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(detectSource([])).toBeNull();
  });

  it("leaves unknown files unmapped so the user must choose columns", () => {
    const parsed = parseCsv("a,b,c\n1,2,3\n");
    expect(detectSource(parsed.headers)).toBeNull();
    const mapping = suggestMapping(parsed.headers);
    expect(Object.values(mapping).every((v) => v === null)).toBe(true);
    const result = mapRows(parsed.rows, mapping, defaultOptions(null));
    expect(result.pitches).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("strips a byte order mark", () => {
    const parsed = parseCsv("﻿PitchNo,TaggedPitchType,RelSpeed\n1,Fastball,90\n");
    expect(parsed.headers[0]).toBe("PitchNo");
  });
});
