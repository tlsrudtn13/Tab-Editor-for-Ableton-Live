import { describe, expect, it } from "vitest";
import {
  SCALES,
  analyzeProgression,
  borrowedOf,
  findCadences,
  fitScale,
  type AnalysedChord,
  type ScaleId,
} from "../progressionAnalysis.js";
import { analyzeChords, romanOf, type ChordSegment } from "../harmonyAnalysis.js";
import type { ChordNote } from "../chordDetect.js";
import type { KeyRef } from "../harmony.js";

const Cmaj: KeyRef = { root: 0, mode: "major" };
const Amin: KeyRef = { root: 9, mode: "minor" };

function blockChord(pitches: number[], b: number, d: number): ChordNote[] {
  return pitches.map((p) => ({ b, d, p }));
}

function seg(sym: { root: number; quality: string; bass?: number }, b: number, d: number, key: KeyRef): ChordSegment {
  const label = romanOf(sym, key);
  return { ...sym, b, d, name: "", score: 1, ...label };
}

describe("SCALES", () => {
  it("has required scale steps and names", () => {
    expect(SCALES.major.steps).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(SCALES.minor.steps).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(SCALES.majorPent.steps).toEqual([0, 2, 4, 7, 9]);
    expect(SCALES.minorPent.steps).toEqual([0, 3, 5, 7, 10]);
    expect(SCALES.blues.steps).toEqual([0, 3, 5, 6, 7, 10]);
    expect(SCALES.dorian.steps).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(SCALES.mixolydian.steps).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(SCALES.harmonicMinor.steps).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(SCALES.major.name).toBe("major");
    expect(SCALES.minor.name).toBe("minor");
    expect(SCALES.majorPent.name).toBe("major pentatonic");
    expect(SCALES.minorPent.name).toBe("minor pentatonic");
    expect(SCALES.blues.name).toBe("blues");
    expect(SCALES.dorian.name).toBe("Dorian");
    expect(SCALES.mixolydian.name).toBe("Mixolydian");
    expect(SCALES.harmonicMinor.name).toBe("harmonic minor");
  });
});

describe("findCadences", () => {
  it("C major G→C = authentic \"V–I\"; G7→C authentic", () => {
    const chords = [seg({ root: 7, quality: "" }, 0, 4, Cmaj), seg({ root: 0, quality: "" }, 4, 4, Cmaj)];
    expect(findCadences(chords, Cmaj)).toEqual([
      { kind: "authentic", b: 4, from: 0, to: 1, label: "V–I" },
    ]);
    const chords7 = [seg({ root: 7, quality: "7" }, 0, 4, Cmaj), seg({ root: 0, quality: "" }, 4, 4, Cmaj)];
    expect(findCadences(chords7, Cmaj)[0]).toMatchObject({ kind: "authentic", label: "V–I" });
  });

  it("F→C plagal", () => {
    const chords = [seg({ root: 5, quality: "" }, 0, 4, Cmaj), seg({ root: 0, quality: "" }, 4, 4, Cmaj)];
    expect(findCadences(chords, Cmaj)).toEqual([
      { kind: "plagal", b: 4, from: 0, to: 1, label: "IV–I" },
    ]);
  });

  it("G→Am deceptive", () => {
    const chords = [seg({ root: 7, quality: "" }, 0, 4, Cmaj), seg({ root: 9, quality: "m" }, 4, 4, Cmaj)];
    expect(findCadences(chords, Cmaj)).toEqual([
      { kind: "deceptive", b: 4, from: 0, to: 1, label: "V–vi" },
    ]);
  });

  it("Dm7→G7→C one \"ii-V-I\" and no separate authentic", () => {
    const chords = [
      seg({ root: 2, quality: "m7" }, 0, 4, Cmaj),
      seg({ root: 7, quality: "7" }, 4, 4, Cmaj),
      seg({ root: 0, quality: "" }, 8, 4, Cmaj),
    ];
    expect(findCadences(chords, Cmaj)).toEqual([
      { kind: "ii-V-I", b: 8, from: 0, to: 2, label: "ii–V–I" },
    ]);
  });

  it("A minor E→Am authentic \"V–i\"; Em→Am NOT authentic (minor v)", () => {
    const chords = [seg({ root: 4, quality: "" }, 0, 4, Amin), seg({ root: 9, quality: "m" }, 4, 4, Amin)];
    expect(findCadences(chords, Amin)).toEqual([
      { kind: "authentic", b: 4, from: 0, to: 1, label: "V–i" },
    ]);
    const emAm = [seg({ root: 4, quality: "m" }, 0, 4, Amin), seg({ root: 9, quality: "m" }, 4, 4, Amin)];
    expect(findCadences(emAm, Amin)).toEqual([]);
  });

  it("Bm7b5→E7→Am ii-V-I label \"iiø–V–i\"", () => {
    const chords = [
      seg({ root: 11, quality: "m7b5" }, 0, 4, Amin),
      seg({ root: 4, quality: "7" }, 4, 4, Amin),
      seg({ root: 9, quality: "m" }, 8, 4, Amin),
    ];
    expect(findCadences(chords, Amin)).toEqual([
      { kind: "ii-V-I", b: 8, from: 0, to: 2, label: "iiø–V–i" },
    ]);
  });

  it("half: C 0–4, Am 4–6, G 6–8, F 8–12 in C major → one half cadence at b = 6", () => {
    const chords = [
      seg({ root: 0, quality: "" }, 0, 4, Cmaj),
      seg({ root: 9, quality: "m" }, 4, 2, Cmaj),
      seg({ root: 7, quality: "" }, 6, 2, Cmaj),
      seg({ root: 5, quality: "" }, 8, 4, Cmaj),
    ];
    expect(findCadences(chords, Cmaj)).toEqual([
      { kind: "half", b: 6, from: 2, to: 2, label: "half cadence" },
    ]);
  });
});

describe("borrowedOf", () => {
  it("C major Fm → minor, Ab → minor, Bb → minor", () => {
    expect(borrowedOf(seg({ root: 5, quality: "m" }, 0, 4, Cmaj), Cmaj)).toEqual({ from: "minor", label: "borrowed from C minor" });
    expect(borrowedOf(seg({ root: 8, quality: "" }, 0, 4, Cmaj), Cmaj)).toEqual({ from: "minor", label: "borrowed from C minor" });
    expect(borrowedOf(seg({ root: 10, quality: "" }, 0, 4, Cmaj), Cmaj)).toEqual({ from: "minor", label: "borrowed from C minor" });
  });

  it("D7 in C (secondary dominant V7/V) → undefined", () => {
    expect(borrowedOf(seg({ root: 2, quality: "7" }, 0, 4, Cmaj), Cmaj)).toBeUndefined();
  });

  it("A minor D major → borrowed from A major", () => {
    expect(borrowedOf(seg({ root: 2, quality: "" }, 0, 4, Amin), Amin)).toEqual({ from: "major", label: "borrowed from A major" });
  });
});

describe("fitScale", () => {
  it("A minor pentatonic notes (A C D E G) in A minor → minorPent coverage 1", () => {
    const notes = blockChord([57, 60, 62, 64, 67], 0, 4); // A3 C4 D4 E4 G4
    const fit = fitScale(notes, Amin);
    expect(fit.id).toBe("minorPent");
    expect(fit.coverage).toBe(1);
    expect(fit.name).toBe("A minor pentatonic");
  });

  it("C major scale run in C major → major", () => {
    const notes = [60, 62, 64, 65, 67, 69, 71].map((p, i) => ({ b: i, d: 1, p }));
    const fit = fitScale(notes, Cmaj);
    expect(fit.id).toBe("major");
    expect(fit.coverage).toBe(1);
  });

  it("A blues with Eb → blues", () => {
    const notes = blockChord([57, 60, 62, 63, 64, 67], 0, 4); // A C D Eb E G
    const fit = fitScale(notes, Amin);
    expect(fit.id).toBe("blues");
    expect(fit.coverage).toBe(1);
  });

  it("empty → key scale", () => {
    expect(fitScale([], Cmaj)).toEqual({ id: "major", root: 0, name: "C major", coverage: 1, outside: [] });
    expect(fitScale([], Amin)).toEqual({ id: "minor", root: 9, name: "A minor", coverage: 1, outside: [] });
  });
});

describe("analyzeProgression", () => {
  it("C–G–Am–F quarter-bar notes (block chords, 4 beats each, octave 4) in C major: 4 chords, roman I V vi IV, one deceptive cadence at beat 8, no borrowed", () => {
    const notes: ChordNote[] = [
      ...blockChord([60, 64, 67], 0, 4), // C
      ...blockChord([55, 59, 62], 4, 4), // G
      ...blockChord([57, 60, 64], 8, 4), // Am
      ...blockChord([53, 57, 60], 12, 4), // F
    ];
    const res = analyzeProgression(notes, { start: 0, end: 16, beatsPerBar: 4, key: Cmaj });
    expect(res.chords).toHaveLength(4);
    expect(res.chords.map((c) => c.roman)).toEqual(["I", "V", "vi", "IV"]);
    expect(res.cadences).toEqual([
      { kind: "deceptive", b: 8, from: 1, to: 2, label: "V–vi" },
    ]);
    expect(res.chords.every((c) => c.borrowed === undefined)).toBe(true);
    expect(res.scale.root).toBe(0);
  });
});
