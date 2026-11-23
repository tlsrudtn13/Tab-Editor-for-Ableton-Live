import { describe, expect, it } from "vitest";
import { chordName, parseRoman, type ChordSym, type KeyRef } from "../harmony.js";
import { romanOf } from "../harmonyAnalysis.js";
import { suggestAlternatives, suggestNext } from "../chordSuggest.js";

const Cmaj: KeyRef = { root: 0, mode: "major" };
const Amin: KeyRef = { root: 9, mode: "minor" };

describe("suggestNext", () => {
  it("C major, prev G → top suggestion C (I, reason home); second Am (vi, surprise)", () => {
    const prev = parseRoman("V", Cmaj); // G
    const suggestions = suggestNext(prev, Cmaj);
    expect(suggestions[0]).toMatchObject({
      chord: { root: 0, quality: "" },
      name: "C",
      roman: "I",
      tier: "safe",
      reason: "home",
    });
    expect(suggestions[1]).toMatchObject({
      chord: { root: 9, quality: "m" },
      name: "Am",
      roman: "vi",
      tier: "safe",
      reason: "surprise",
    });
  });

  it("C major, prev undefined → C first; every suggestion has a non-empty name and roman", () => {
    const suggestions = suggestNext(undefined, Cmaj);
    expect(suggestions[0]).toMatchObject({ name: "C", roman: "I" });
    for (const s of suggestions) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.roman.length).toBeGreaterThan(0);
    }
  });

  it("A minor, prev E7 → Am first", () => {
    const prev = parseRoman("V7", Amin); // E7
    const suggestions = suggestNext(prev, Amin);
    expect(suggestions[0]).toMatchObject({ name: "Am", roman: "i" });
  });

  it("colour options present in C major: Bb (bVII), Fm (iv), Ab (bVI), E7 (V7/vi) – all tier color", () => {
    const suggestions = suggestNext(parseRoman("I", Cmaj), Cmaj, { limit: 20 });
    const byName = new Map(suggestions.map((s) => [s.name, s]));
    for (const [name, roman] of [
      ["Bb", "bVII"],
      ["Fm", "iv"],
      ["Ab", "bVI"],
      ["E7", "V7/vi"],
    ] as const) {
      const s = byName.get(name);
      expect(s, name).toBeDefined();
      expect(s!.tier).toBe("color");
      expect(s!.roman).toBe(roman);
      expect(s!.reason).toBe("colour");
    }
  });

  it("every result chord parses into a valid name in all 12 major and minor keys (loop test)", () => {
    for (let root = 0; root < 12; root++) {
      for (const mode of ["major", "minor"] as const) {
        const key: KeyRef = { root, mode };
        const start = suggestNext(undefined, key, { limit: 20 });
        for (const s of start) {
          expect(s.name).toBe(chordName(s.chord));
          const lbl = romanOf(s.chord, key);
          expect(s.roman).toBe(lbl.roman);
          expect(s.tier).toBe(lbl.tier);
        }
        const prev = suggestNext(undefined, key, { limit: 1 })[0]!.chord;
        for (const s of suggestNext(prev, key, { limit: 20 })) {
          expect(s.name).toBe(chordName(s.chord));
          const lbl = romanOf(s.chord, key);
          expect(s.roman).toBe(lbl.roman);
          expect(s.tier).toBe(lbl.tier);
        }
      }
    }
  });
});

describe("suggestAlternatives", () => {
  it("F in C major, next G contains Dm (same), Fmaj7 (richer), Fm (colour); not F itself; with next G, Dm scores higher than with no next", () => {
    const F: ChordSym = { root: 5, quality: "" };
    const G: ChordSym = { root: 7, quality: "" };
    const withNext = suggestAlternatives(F, Cmaj, { next: G, limit: 20 });
    const noNext = suggestAlternatives(F, Cmaj, { limit: 20 });
    const namesWith = withNext.map((s) => s.name);
    expect(namesWith).toContain("Dm");
    expect(namesWith).toContain("Fmaj7");
    expect(namesWith).toContain("Fm");
    expect(namesWith).not.toContain("F");
    const dmWith = withNext.find((s) => s.name === "Dm")!;
    const dmNo = noNext.find((s) => s.name === "Dm")!;
    expect(dmWith.score).toBeGreaterThan(dmNo.score);
  });

  it("A minor, E major (V): D-function substitutes are G (VII) and E7, never Em", () => {
    const E: ChordSym = { root: 4, quality: "" };
    const names = suggestAlternatives(E, Amin, { limit: 20 }).map((s) => s.name);
    expect(names).toContain("G");
    expect(names).toContain("E7");
    expect(names).not.toContain("Em");
  });

  it("G in C major, next Am: contains E7 (secondary dominant of Am)", () => {
    const G: ChordSym = { root: 7, quality: "" };
    const Am: ChordSym = { root: 9, quality: "m" };
    const suggestions = suggestAlternatives(G, Cmaj, { next: Am, limit: 20 });
    const e7 = suggestions.find((s) => s.name === "E7");
    expect(e7).toBeDefined();
    expect(e7!.roman).toBe("V7/vi");
  });
});
