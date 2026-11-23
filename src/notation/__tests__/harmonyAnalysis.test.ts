import { describe, expect, it } from "vitest";
import {
  analyzeChords,
  analyzeKeys,
  romanOf,
  type ChordFn,
  type ChordTier,
} from "../harmonyAnalysis.js";
import type { ChordNote } from "../chordDetect.js";
import type { ChordSym, KeyRef } from "../harmony.js";

const Cmaj: KeyRef = { root: 0, mode: "major" };
const Amin: KeyRef = { root: 9, mode: "minor" };

function blockChord(pitches: number[], b: number, d: number): ChordNote[] {
  return pitches.map((p) => ({ b, d, p }));
}

describe("romanOf", () => {
  it("labels C major chords", () => {
    const cases: Array<[ChordSym, string, ChordTier, ChordFn, boolean]> = [
      [{ root: 0, quality: "" }, "I", "safe", "T", true],
      [{ root: 2, quality: "m7" }, "ii7", "safe", "S", true],
      [{ root: 7, quality: "7" }, "V7", "tension", "D", true],
      [{ root: 11, quality: "dim" }, "vii°", "tension", "D", true],
      [{ root: 10, quality: "" }, "bVII", "color", "other", false],
      [{ root: 5, quality: "m" }, "iv", "color", "other", false],
      [{ root: 4, quality: "7" }, "V7/vi", "color", "D", false],
      [{ root: 2, quality: "7" }, "V7/V", "color", "D", false],
      [{ root: 6, quality: "dim" }, "#iv°", "color", "other", false],
    ];
    for (const [chord, roman, tier, fn, diatonic] of cases) {
      expect(romanOf(chord, Cmaj), JSON.stringify(chord)).toEqual({
        roman,
        fn,
        tier,
        diatonic,
      });
    }
  });

  it("labels A minor chords", () => {
    const cases: Array<[ChordSym, string, ChordTier, ChordFn, boolean]> = [
      [{ root: 9, quality: "m" }, "i", "safe", "T", true],
      [{ root: 4, quality: "7" }, "V7", "tension", "D", true],
      [{ root: 7, quality: "" }, "VII", "tension", "D", true],
      [{ root: 5, quality: "" }, "VI", "safe", "T", true],
      [{ root: 11, quality: "m7b5" }, "iiø7", "safe", "S", true],
      [{ root: 2, quality: "" }, "IV", "color", "other", false],
      [{ root: 8, quality: "dim" }, "vii°", "tension", "D", true],
    ];
    for (const [chord, roman, tier, fn, diatonic] of cases) {
      expect(romanOf(chord, Amin), JSON.stringify(chord)).toEqual({
        roman,
        fn,
        tier,
        diatonic,
      });
    }
  });
});

describe("analyzeChords", () => {
  it("segments block chords C (2 bars) | G (1 bar) | Am (1 bar)", () => {
    const notes: ChordNote[] = [
      ...blockChord([48, 52, 55], 0, 8), // C2 E2 G2
      ...blockChord([55, 59, 62], 8, 4), // G2 B2 D3
      ...blockChord([57, 60, 64], 12, 4), // A2 C3 E3
    ];
    const segs = analyzeChords(notes, { start: 0, end: 16, key: Cmaj });
    expect(segs.map((s) => ({ b: s.b, name: s.name }))).toEqual([
      { b: 0, name: "C" },
      { b: 8, name: "G" },
      { b: 12, name: "Am" },
    ]);
  });

  it("passing note does not split held chord with default penalty", () => {
    const notes: ChordNote[] = [
      ...blockChord([48, 52, 55], 0, 4), // C bar
      { b: 1, d: 0.5, p: 61 }, // C# passing 8th
    ];
    const segs = analyzeChords(notes, { start: 0, end: 4, key: Cmaj });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.name).toBe("C");
  });

  it("passing note may split with changePenalty 0", () => {
    const notes: ChordNote[] = [
      ...blockChord([48, 52, 55], 0, 4),
      { b: 1, d: 0.5, p: 61 },
    ];
    const segs = analyzeChords(notes, { start: 0, end: 4, key: Cmaj, changePenalty: 0 });
    expect(segs.length).toBeGreaterThanOrEqual(1);
  });

  it("empty window between chords produces a gap", () => {
    const notes: ChordNote[] = [
      ...blockChord([48, 52, 55], 0, 2), // C
      ...blockChord([55, 59, 62], 6, 2), // G, gap 2-6
    ];
    const segs = analyzeChords(notes, { start: 0, end: 8, key: Cmaj, step: 2 });
    expect(segs.map((s) => s.name)).toEqual(["C", "G"]);
    expect(segs[0]!.b + segs[0]!.d).toBeLessThanOrEqual(2.0001);
    expect(segs[1]!.b).toBeGreaterThanOrEqual(5.9999);
  });
});

describe("analyzeKeys", () => {
  it("detects one C major segment over 8 bars", () => {
    const notes: ChordNote[] = [];
    for (let bar = 0; bar < 8; bar++) {
      const b = bar * 4;
      notes.push(...blockChord([48, 52, 55, 60], b, 4)); // C chord
    }
    const segs = analyzeKeys(notes, { start: 0, end: 32 });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.key).toEqual(Cmaj);
  });

  it("detects C major then E major with change near b 32", () => {
    const notes: ChordNote[] = [];
    for (let bar = 0; bar < 8; bar++) {
      const b = bar * 4;
      notes.push(...blockChord([48, 52, 55, 60], b, 4)); // C
    }
    for (let bar = 8; bar < 16; bar++) {
      const b = bar * 4;
      notes.push(...blockChord([52, 56, 59, 64], b, 4)); // E major: E G# B E
    }
    const segs = analyzeKeys(notes, { start: 0, end: 64 });
    expect(segs.length).toBe(2);
    expect(segs[0]!.key).toEqual(Cmaj);
    expect(segs[1]!.key).toEqual({ root: 4, mode: "major" });
    expect(Math.abs(segs[1]!.b - 32)).toBeLessThanOrEqual(4);
  });
});

describe("secondary dominant triads", () => {
  it("labels major triads a fifth above a diatonic degree as V/x", () => {
    const C = { root: 0, mode: "major" as const };
    expect(romanOf({ root: 2, quality: "" }, C)).toMatchObject({ roman: "V/V", fn: "D", tier: "color" });
    expect(romanOf({ root: 4, quality: "" }, C).roman).toBe("V/vi");
    expect(romanOf({ root: 9, quality: "" }, C).roman).toBe("V/ii");
  });
  it("keeps the dorian IV in minor and never tonicises a diminished degree", () => {
    const Am = { root: 9, mode: "minor" as const };
    expect(romanOf({ root: 2, quality: "" }, Am).roman).toBe("IV");
    const C = { root: 0, mode: "major" as const };
    expect(romanOf({ root: 6, quality: "7" }, C).roman).not.toMatch(/\/vii/);
  });
});

describe("relative major / minor tie-break", () => {
  it("G-D-Em-C block chords over a G bass read as G major", () => {
    const blk = (b: number, ps: number[]) => ps.map((p) => ({ b, d: 4, p, v: 100 }));
    const notes = [0, 16].flatMap((o) => [
      ...blk(o, [43, 50, 55, 59]), ...blk(o + 4, [38, 45, 50, 54]),
      ...blk(o + 8, [40, 47, 52, 55]), ...blk(o + 12, [36, 43, 48, 52]),
    ]);
    const keys = analyzeKeys(notes, { start: 0, end: 32 });
    expect(keys[0]!.key).toEqual({ root: 7, mode: "major" });
    expect(analyzeChords(notes, { start: 0, end: 32 }).map((s) => s.roman).slice(0, 4)).toEqual(["I", "V", "vi", "IV"]);
  });
});

describe("relative key from the chords", () => {
  it("strummed open G-D-Em-C reads as I-V-vi-IV in G", async () => {
    const { realizeProgression } = await import("../progressions.js");
    const { voiceChord } = await import("../chordVoicing.js");
    const { compChords } = await import("../comping.js");
    const { GUITAR_6 } = await import("../instruments.js");
    const prog = realizeProgression("pop", { root: 7, mode: "major" }, { startBeat: 0, repeat: 2 });
    const comp = compChords(prog.map((c) => ({ b: c.b, d: c.d, notes: voiceChord(c, "open", GUITAR_6) })), "pop");
    expect(analyzeChords(comp, { start: 0, end: 32 }).map((s) => s.roman).slice(0, 4)).toEqual(["I", "V", "vi", "IV"]);
  });
  it("Am-F-C-G (starting and ending on Am) stays in A minor", () => {
    const blk = (b: number, ps: number[]) => ps.map((p) => ({ b, d: 4, p, v: 100 }));
    const notes = [...blk(0, [45, 52, 57, 60]), ...blk(4, [41, 48, 53, 57]), ...blk(8, [48, 52, 55, 60]),
      ...blk(12, [43, 50, 55, 59]), ...blk(16, [45, 52, 57, 60])];
    expect(analyzeChords(notes, { start: 0, end: 20 })[0]!.roman).toBe("i");
  });
});
