import { describe, expect, it } from "vitest";
import {
  CHORD_INTERVALS,
  PC_NAMES,
  chordName,
  chordPcs,
  keyRefFromKeyInfo,
  parseRoman,
} from "../harmony.js";

describe("harmony", () => {
  it("keyRefFromKeyInfo", () => {
    expect(keyRefFromKeyInfo({ fifths: 0, mode: "major" })).toEqual({ root: 0, mode: "major" }); // C major
    expect(keyRefFromKeyInfo({ fifths: -3, mode: "major" })).toEqual({ root: 3, mode: "major" }); // Eb
    expect(keyRefFromKeyInfo({ fifths: 0, mode: "minor" })).toEqual({ root: 9, mode: "minor" }); // A minor
    expect(keyRefFromKeyInfo({ fifths: 1, mode: "minor" })).toEqual({ root: 4, mode: "minor" }); // E minor
  });

  it("parseRoman in C major", () => {
    const C: { root: number; mode: "major" | "minor" } = { root: 0, mode: "major" };
    expect(parseRoman("I", C)).toEqual({ root: 0, quality: "" });
    expect(parseRoman("ii7", C)).toEqual({ root: 2, quality: "m7" });
    expect(parseRoman("V7", C)).toEqual({ root: 7, quality: "7" });
    expect(parseRoman("vii°", C)).toEqual({ root: 11, quality: "dim" });
    expect(parseRoman("bVII", C)).toEqual({ root: 10, quality: "" });
    expect(parseRoman("iv", C)).toEqual({ root: 5, quality: "m" });
    expect(parseRoman("V/3", C)).toEqual({ root: 7, quality: "", bass: 11 });
  });

  it("parseRoman in A minor", () => {
    const Am: { root: number; mode: "major" | "minor" } = { root: 9, mode: "minor" };
    expect(parseRoman("i", Am)).toEqual({ root: 9, quality: "m" });
    expect(parseRoman("VII", Am)).toEqual({ root: 7, quality: "" });
    expect(parseRoman("VI", Am)).toEqual({ root: 5, quality: "" });
    expect(parseRoman("III", Am)).toEqual({ root: 0, quality: "" });
    expect(parseRoman("V", Am)).toEqual({ root: 4, quality: "" });
    expect(parseRoman("iiø7", Am)).toEqual({ root: 11, quality: "m7b5" });
  });

  it("parseRoman throws on invalid numerals", () => {
    const C: { root: number; mode: "major" | "minor" } = { root: 0, mode: "major" };
    expect(() => parseRoman("VIII", C)).toThrow();
    expect(() => parseRoman("Ix", C)).toThrow();
  });

  it("chordName and chordPcs", () => {
    expect(chordName({ root: 6, quality: "m7b5" })).toBe("F#m7b5");
    expect(chordPcs({ root: 0, quality: "maj7" })).toEqual([0, 4, 7, 11]);
  });

  it("exports PC_NAMES and CHORD_INTERVALS", () => {
    expect(PC_NAMES).toEqual(["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]);
    expect(CHORD_INTERVALS["maj7"]).toEqual([0, 4, 7, 11]);
  });
});
