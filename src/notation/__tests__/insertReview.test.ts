// Fixes from the Fable / designer review of the Insert round (TAB Editor 2.0, after B3).
import { describe, expect, it } from "vitest";
import { BASS_4 } from "../instruments.js";
import { lockedBassLine } from "../bandBass.js";
import { keyConfidence } from "../harmonyAnalysis.js";
import { analyzeClip, buildInsert, loopChords, loopOnsets } from "../insertEngine.js";
import { renderDrumPattern } from "../drumPresets.js";
import { drumEnergy, humanize } from "../drumTransform.js";

const chord = (root: number, b: number, d = 4) => ({ root, quality: "", b, d });

describe("looping sources", () => {
  it("a 1-bar kick loop repeats over 4 bars", () => {
    expect(loopOnsets([0, 2.5], 4, 0, 16)).toEqual([0, 2.5, 4, 6.5, 8, 10.5, 12, 14.5]);
  });
  it("a range that starts later gets the loop from there", () => {
    expect(loopOnsets([0, 2.5], 4, 6, 10)).toEqual([6.5, 8]);
  });
  it("no loop length: onsets inside the range only", () => {
    expect(loopOnsets([0, 5, 20], 0, 4, 16)).toEqual([5]);
  });
  it("a 4-bar chord loop covers bars 5-8", () => {
    const out = loopChords([chord(0, 0), chord(7, 4), chord(9, 8), chord(5, 12)], 16, 16, 32);
    expect(out.map(c => [c.root, c.b, c.d])).toEqual([[0, 16, 4], [7, 20, 4], [9, 24, 4], [5, 28, 4]]);
  });
  it("chords are cut to the range", () => {
    const out = loopChords([chord(0, 0, 8)], 8, 4, 12);
    expect(out.map(c => [c.b, c.d])).toEqual([[4, 4], [8, 4]]);
  });
});

describe("kick lock with played kicks", () => {
  it("kicks a little off the chord change play on the change, no doubled notes", () => {
    const notes = lockedBassLine([chord(0, 0), chord(7, 4)], [0, 3.98, 4.02, 6, 6.125], { inst: BASS_4 });
    const bs = notes.map(n => n.b);
    expect(bs).toEqual([0, 4, 6]);
    for (let i = 1; i < notes.length; i++) expect(notes[i - 1]!.b + notes[i - 1]!.d).toBeLessThanOrEqual(notes[i]!.b + 1e-9);
    expect(notes[1]!.p % 12).toBe(7);
  });
  it("buildInsert warns when no kick falls in the bars", () => {
    const res = buildInsert({ part: "bass", inst: BASS_4, key: { root: 0, mode: "major" }, startBeat: 16, bars: 2,
      chords: { kind: "preset", id: "pop" }, bassStyle: "kick", kicks: [0, 2] });
    expect(res.warnings).toContain("No kick in these bars: one note per chord");
  });
});

describe("key confidence", () => {
  const triad = (rs: number[], b: number) => rs.map(p => ({ b, d: 4, p }));
  it("a full I-V-vi-IV in C reads as sure", () => {
    const notes = [...triad([60, 64, 67], 0), ...triad([55, 59, 62], 4), ...triad([57, 60, 64], 8), ...triad([53, 57, 60], 12)];
    expect(keyConfidence(notes, { root: 0, mode: "major" }, { start: 0, end: 16 })).toBeGreaterThanOrEqual(0.7);
  });
  it("a line of four roots is never sure", () => {
    const notes = [33, 29, 36, 31].map((p, i) => ({ b: i * 4, d: 4, p }));
    const a = analyzeClip(notes, { start: 0, end: 16 });
    expect(a.confidence).toBeLessThan(0.7);
  });
});

describe("drums", () => {
  it("energy 2 keeps the shuffle's triplet hats", () => {
    const hits = renderDrumPattern("shuffle", { startBeat: 0, bars: 2 });
    const out = drumEnergy(hits, 2, { startBeat: 0, bars: 2, seed: 1 });
    const hats = out.filter(h => h.p === 42).map(h => h.b);
    expect(hats.length).toBeGreaterThanOrEqual(8);
    expect(hats.some(b => Math.abs(b - 2 / 3) < 1e-3)).toBe(true);
  });
  it("energy 4 ghosts on a shuffle stay on the triplet grid", () => {
    const hits = renderDrumPattern("shuffle", { startBeat: 0, bars: 2 });
    const out = drumEnergy(hits, 4, { startBeat: 0, bars: 2, seed: 3 });
    for (const h of out) {
      const m = ((h.b * 3) % 1 + 1) % 1;
      expect(Math.min(m, 1 - m)).toBeLessThan(1e-3);
    }
  });
  it("humanize never moves a hit before the range start", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const out = humanize([{ b: 8, d: 0.25, p: 42, v: 90 }], { seed, timing: 0.05, min: 8 });
      expect(out[0]!.b).toBeGreaterThanOrEqual(8);
    }
  });
});
