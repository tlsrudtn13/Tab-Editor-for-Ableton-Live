import { describe, expect, it } from "vitest";
import { sameVoicing, voicingAt } from "./chordDiagrams";

describe("chordDiagrams", () => {
  it("C major open chord on guitar 6 (x32010)", () => {
    // high e (s=1)=0, B(s=2)=1, G(s=3)=0, D(s=4)=2, A(s=5)=3, low E(s=6)=x
    const notes = [
      { b: 0, d: 1, p: 64, s: 1, f: 0 },
      { b: 0, d: 1, p: 60, s: 2, f: 1 },
      { b: 0, d: 1, p: 55, s: 3, f: 0 },
      { b: 0, d: 1, p: 50, s: 4, f: 2 },
      { b: 0, d: 1, p: 45, s: 5, f: 3 },
    ];
    expect(voicingAt(notes, 0, 6)).toEqual({ strings: [0, 1, 0, 2, 3, -1], firstFret: 1 });
  });

  it("a barre at fret 5 (A shape) → firstFret 5", () => {
    // A-shape barre: D major shape at fret 5 => high-to-low 5,7,7,7,5,x
    const notes = [
      { b: 4, d: 1, p: 69, s: 1, f: 5 },
      { b: 4, d: 1, p: 66, s: 2, f: 7 },
      { b: 4, d: 1, p: 62, s: 3, f: 7 },
      { b: 4, d: 1, p: 57, s: 4, f: 7 },
      { b: 4, d: 1, p: 50, s: 5, f: 5 },
    ];
    const v = voicingAt(notes, 4, 6);
    expect(v).not.toBeNull();
    expect(v!.firstFret).toBe(5);
    expect(v!.strings).toEqual([5, 7, 7, 7, 5, -1]);
  });

  it("single note → null", () => {
    const notes = [{ b: 0, d: 1, p: 64, s: 1, f: 0 }];
    expect(voicingAt(notes, 0, 6)).toBeNull();
  });

  it("sameVoicing true/false", () => {
    const a = { strings: [0, 1, 0, 2, 3, -1], firstFret: 1 };
    const b = { strings: [0, 1, 0, 2, 3, -1], firstFret: 1 };
    const c = { strings: [0, 1, 0, 2, 3, 0], firstFret: 1 };
    const d = { strings: [5, 7, 7, 7, 5, -1], firstFret: 5 };
    expect(sameVoicing(a, b)).toBe(true);
    expect(sameVoicing(a, c)).toBe(false);
    expect(sameVoicing(a, d)).toBe(false);
    expect(sameVoicing(null, null)).toBe(true);
    expect(sameVoicing(a, null)).toBe(false);
  });
});
