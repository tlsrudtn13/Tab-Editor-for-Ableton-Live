import { describe, expect, it } from "vitest";
import { PROGRESSIONS, realizeProgression } from "../progressions.js";
import { parseRoman } from "../harmony.js";

describe("progressions", () => {
  it("realizeProgression pop in G major, startBeat 4", () => {
    const G = { root: 7, mode: "major" as const };
    const chords = realizeProgression("pop", G, { startBeat: 4 });
    expect(chords.map((c) => c.name)).toEqual(["G", "D", "Em", "C"]);
    expect(chords.map((c) => c.b)).toEqual([4, 8, 12, 16]);
    expect(chords.map((c) => c.d)).toEqual([4, 4, 4, 4]);
  });

  it("blues12 length 12", () => {
    const C = { root: 0, mode: "major" as const };
    const chords = realizeProgression("blues12", C, { startBeat: 0 });
    expect(chords).toHaveLength(12);
  });

  it("andalusian in A minor", () => {
    const Am = { root: 9, mode: "minor" as const };
    const chords = realizeProgression("andalusian", Am, { startBeat: 0 });
    expect(chords.map((c) => c.name)).toEqual(["Am", "G", "F", "E"]);
  });

  it("repeat 2 doubles", () => {
    const C = { root: 0, mode: "major" as const };
    const chords = realizeProgression("pop", C, { startBeat: 0, repeat: 2 });
    expect(chords).toHaveLength(8);
  });

  it("barsPerChord 2 + beatsPerBar 3 -> d 6", () => {
    const C = { root: 0, mode: "major" as const };
    const chords = realizeProgression("pop", C, { startBeat: 0, barsPerChord: 2, beatsPerBar: 3 });
    expect(chords[0]!.d).toBe(6);
    expect(chords[1]!.b).toBe(6);
  });

  it("every preset in every key 0-11 (both modes) parses without throwing", () => {
    for (const preset of PROGRESSIONS) {
      for (const mode of ["major", "minor"] as const) {
        for (let root = 0; root < 12; root++) {
          const key = { root, mode };
          expect(() => realizeProgression(preset, key, { startBeat: 0 })).not.toThrow();
          for (const rn of preset.numerals) {
            expect(() => parseRoman(rn, key)).not.toThrow();
          }
        }
      }
    }
  });
});
