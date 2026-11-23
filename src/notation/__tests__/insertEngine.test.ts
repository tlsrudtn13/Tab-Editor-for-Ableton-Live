import { describe, expect, it } from "vitest";
import { BASS_4, GUITAR_6 } from "../instruments.js";
import {
  analyzeClip,
  buildInsert,
  fretLine,
  mergeInsert,
  resolveChords,
  type InsertNote,
  type PlacedChordIn,
} from "../insertEngine.js";

function blockChord(pitches: number[], b: number, d: number) {
  return pitches.map((p) => ({ b, d, p, v: 100 }));
}

describe("analyzeClip", () => {
  it("detects G major over G-D-Em-C open guitar chords (1 bar each, 2 repeats)", () => {
    const notes = [
      ...blockChord([43, 47, 50, 55, 59, 67], 0, 4),  // G
      ...blockChord([38, 45, 50, 54, 57, 62], 4, 4),  // D
      ...blockChord([40, 47, 52, 55, 59, 64], 8, 4),  // Em
      ...blockChord([36, 43, 48, 52, 55, 60], 12, 4), // C
      ...blockChord([43, 47, 50, 55, 59, 67], 16, 4), // G
      ...blockChord([38, 45, 50, 54, 57, 62], 20, 4), // D
      ...blockChord([40, 47, 52, 55, 59, 64], 24, 4), // Em
      ...blockChord([36, 43, 48, 52, 55, 60], 28, 4), // C
    ];
    const a = analyzeClip(notes, { start: 0, end: 32, beatsPerBar: 4 });
    expect(a.key).toEqual({ root: 7, mode: "major" });
    expect(a.keyName).toBe("G major");
    expect(a.confidence).toBeGreaterThanOrEqual(0.5);
    expect(a.chords.map((c) => c.name).slice(0, 4)).toEqual(["G", "D", "Em", "C"]);
  });

  it("empty notes -> key null, keyName '', confidence 0, chords []", () => {
    expect(analyzeClip([], { start: 0, end: 16 })).toEqual({
      key: null,
      keyName: "",
      confidence: 0,
      chords: [],
    });
  });
});

describe("resolveChords", () => {
  it('preset "pop" in C major, 6 bars from beat 8 -> C G Am F C G at 8,12,...,28', () => {
    const chords = resolveChords(
      { kind: "preset", id: "pop" },
      { root: 0, mode: "major" },
      8,
      6,
      4,
    );
    expect(chords.map((c) => ({ root: c.root, quality: c.quality, b: c.b }))).toEqual([
      { root: 0, quality: "", b: 8 },
      { root: 7, quality: "", b: 12 },
      { root: 9, quality: "m", b: 16 },
      { root: 5, quality: "", b: 20 },
      { root: 0, quality: "", b: 24 },
      { root: 7, quality: "", b: 28 },
    ]);
    expect(chords.every((c) => c.d === 4)).toBe(true);
  });

  it("preset pop with barsPerChord 2, 3 bars from 8 -> C (8-16) then G (16-20) cut to d 4", () => {
    const chords = resolveChords(
      { kind: "preset", id: "pop", barsPerChord: 2 },
      { root: 0, mode: "major" },
      8,
      3,
      4,
    );
    expect(chords).toHaveLength(2);
    expect(chords[0]).toMatchObject({ root: 0, quality: "", b: 8, d: 8 });
    expect(chords[1]).toMatchObject({ root: 7, quality: "", b: 16, d: 4 });
  });

  it("list clipping works at both ends", () => {
    const list: PlacedChordIn[] = [
      { root: 0, quality: "", b: 0, d: 8 },
      { root: 7, quality: "", b: 8, d: 8 },
      { root: 9, quality: "m", b: 16, d: 8 },
    ];
    const chords = resolveChords({ kind: "list", chords: list }, { root: 0, mode: "major" }, 4, 4, 4);
    expect(chords).toEqual([
      { root: 0, quality: "", b: 4, d: 4 },
      { root: 7, quality: "", b: 8, d: 8 },
      { root: 9, quality: "m", b: 16, d: 4 },
    ]);
  });

  it("unknown id throws", () => {
    expect(() =>
      resolveChords({ kind: "preset", id: "nope" }, { root: 0, mode: "major" }, 0, 4, 4),
    ).toThrow();
  });
});

describe("fretLine", () => {
  it("assigns frets on BASS_4 for [36,43,31,38]", () => {
    const notes = [
      { b: 0, d: 1, p: 36, v: 100 },
      { b: 1, d: 1, p: 43, v: 100 },
      { b: 2, d: 1, p: 31, v: 100 },
      { b: 3, d: 1, p: 38, v: 100 },
    ];
    const out = fretLine(notes, BASS_4);
    expect(out).toHaveLength(4);
    for (const n of out) {
      expect(n.s).toBeDefined();
      expect(n.f).toBeDefined();
      expect(n.p).toBe(BASS_4.open[n.s!]! + n.f!);
      expect(n.f!).toBeGreaterThanOrEqual(0);
      expect(n.f!).toBeLessThanOrEqual(12);
    }
  });

  it("pitch below the lowest string has no s/f", () => {
    const out = fretLine([{ b: 0, d: 1, p: 20, v: 100 }], BASS_4);
    expect(out).toHaveLength(1);
    expect(out[0]!.s).toBeUndefined();
    expect(out[0]!.f).toBeUndefined();
    expect(out[0]!.p).toBe(20);
  });
});

describe("buildInsert chords", () => {
  it('pop in C, 4 bars, open, quarters on GUITAR_6 -> 16 strums, all fretted, in range', () => {
    const res = buildInsert({
      part: "chords",
      inst: GUITAR_6,
      key: { root: 0, mode: "major" },
      startBeat: 0,
      bars: 4,
      chords: { kind: "preset", id: "pop" },
      voicing: "open",
      pattern: "quarters",
    });
    const onsets = new Set(res.notes.map((n) => Math.round(n.b * 4) / 4));
    expect(onsets.size).toBe(16);
    for (const n of res.notes) {
      expect(n.s).toBeDefined();
      expect(n.f).toBeDefined();
      expect(n.p).toBe(GUITAR_6.open[n.s!]! + n.f!);
      expect(n.b).toBeGreaterThanOrEqual(0);
      expect(n.b).toBeLessThan(16);
    }
  });
});

describe("buildInsert bass", () => {
  it("kick with kicks and chords C|G -> notes at those beats, all with s/f", () => {
    const chords: PlacedChordIn[] = [
      { root: 0, quality: "", b: 0, d: 4 },
      { root: 7, quality: "", b: 4, d: 4 },
    ];
    const kicks = [0, 2, 2.5, 4, 6, 6.5];
    const res = buildInsert({
      part: "bass",
      inst: BASS_4,
      key: { root: 0, mode: "major" },
      startBeat: 0,
      bars: 2,
      chords: { kind: "list", chords },
      bassStyle: "kick",
      kicks,
    });
    expect(res.notes.map((n) => n.b)).toEqual(kicks);
    for (const n of res.notes) {
      expect(n.s).toBeDefined();
      expect(n.f).toBeDefined();
      expect(n.p).toBe(BASS_4.open[n.s!]! + n.f!);
    }
  });

  it("kick without kicks -> 2 notes and warning", () => {
    const chords: PlacedChordIn[] = [
      { root: 0, quality: "", b: 0, d: 4 },
      { root: 7, quality: "", b: 4, d: 4 },
    ];
    const res = buildInsert({
      part: "bass",
      inst: BASS_4,
      key: { root: 0, mode: "major" },
      startBeat: 0,
      bars: 2,
      chords: { kind: "list", chords },
      bassStyle: "kick",
    });
    expect(res.notes).toHaveLength(2);
    expect(res.warnings).toContain("No kick found: one note per chord");
  });
});

describe("buildInsert riff", () => {
  it("GUITAR_6 A minor, Am|Dm|Em|Am -> in range, 5<=f<=9, same seed identical", () => {
    const chords: PlacedChordIn[] = [
      { root: 9, quality: "m", b: 0, d: 4 },
      { root: 2, quality: "m", b: 4, d: 4 },
      { root: 4, quality: "m", b: 8, d: 4 },
      { root: 9, quality: "m", b: 12, d: 4 },
    ];
    const req = {
      part: "riff" as const,
      inst: GUITAR_6,
      key: { root: 9, mode: "minor" as const },
      startBeat: 0,
      bars: 4,
      chords: { kind: "list" as const, chords },
    };
    const a = buildInsert(req);
    const b = buildInsert(req);
    expect(a.notes.length).toBeGreaterThan(0);
    for (const n of a.notes) {
      expect(n.b).toBeGreaterThanOrEqual(0);
      expect(n.b + n.d).toBeLessThanOrEqual(16 + 1e-9);
      expect(n.f).toBeDefined();
      expect(n.f!).toBeGreaterThanOrEqual(5);
      expect(n.f!).toBeLessThanOrEqual(9);
    }
    expect(a).toEqual(b);
  });
});

describe("buildInsert drums", () => {
  it("rock 4 bars from beat 4, energy 3, fillEvery 4 -> range ok, last bar has tom, no s/f", () => {
    const res = buildInsert({
      part: "drums",
      inst: GUITAR_6,
      key: { root: 0, mode: "major" },
      startBeat: 4,
      bars: 4,
      groove: "rock",
      energy: 3,
      fillEvery: 4,
    });
    expect(res.notes.length).toBeGreaterThan(0);
    for (const n of res.notes) {
      expect(n.b).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(n.b).toBeLessThan(20 - 1e-9);
      expect(n.s).toBeUndefined();
      expect(n.f).toBeUndefined();
    }
    const lastBar = res.notes.filter((n) => n.b >= 16 - 1e-9 && n.b < 20 - 1e-9);
    const tomPitches = new Set([41, 45, 47, 50]);
    expect(lastBar.some((n) => tomPitches.has(n.p))).toBe(true);
  });
});

describe("mergeInsert", () => {
  it("replace removes only notes inside range; add drops exact duplicates; inputs unchanged", () => {
    const existing = [
      { b: 0, d: 1, p: 60, v: 100 },
      { b: 4, d: 1, p: 62, v: 100 },
      { b: 8, d: 1, p: 64, v: 100 },
    ];
    const inserted: InsertNote[] = [
      { b: 4, d: 1, p: 62, v: 90 },
      { b: 5, d: 1, p: 65, v: 90 },
    ];
    const existingCopy = JSON.parse(JSON.stringify(existing));
    const insertedCopy = JSON.parse(JSON.stringify(inserted));

    const rep = mergeInsert(existing, inserted, { start: 4, end: 8, mode: "replace" });
    expect(rep.keep).toEqual([
      { b: 0, d: 1, p: 60, v: 100 },
      { b: 8, d: 1, p: 64, v: 100 },
    ]);
    expect(rep.removed).toEqual([{ b: 4, d: 1, p: 62, v: 100 }]);
    expect(rep.add).toEqual(inserted);

    const add = mergeInsert(existing, inserted, { start: 4, end: 8, mode: "add" });
    expect(add.keep).toEqual(existing);
    expect(add.removed).toEqual([]);
    expect(add.add).toEqual([{ b: 5, d: 1, p: 65, v: 90 }]);

    expect(existing).toEqual(existingCopy);
    expect(inserted).toEqual(insertedCopy);
  });
});
