import { describe, expect, it } from "vitest";
import { BASS_4, GUITAR_6 } from "../instruments.js";
import { chordPcs } from "../harmony.js";
import { generateRiff, positionBox, type RiffNote } from "../riff.js";

const A_MINOR = { root: 9, mode: "minor" } as const;
const CHORDS = [
  { root: 9, quality: "m", b: 0, d: 4 },
  { root: 2, quality: "m", b: 4, d: 4 },
  { root: 4, quality: "m", b: 8, d: 4 },
  { root: 9, quality: "m", b: 12, d: 4 },
];

function chordAt(b: number) {
  for (const c of CHORDS) {
    if (b >= c.b && b < c.b + c.d) return c;
  }
  return CHORDS[CHORDS.length - 1]!;
}

function pc(p: number): number {
  return ((p % 12) + 12) % 12;
}

function baseOpts(seed: number) {
  return {
    inst: GUITAR_6,
    key: A_MINOR,
    chords: CHORDS,
    startBeat: 0,
    bars: 4,
    position: 5,
    complexity: 3 as const,
    seed,
  };
}

describe("riff", () => {
  it("every note: p === open[s] + f, 5 ≤ f ≤ 9, pc in A minor pentatonic", () => {
    const notes = generateRiff(baseOpts(1));
    const pent = new Set([0, 2, 4, 7, 9]);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.p).toBe(GUITAR_6.open[n.s]! + n.f);
      expect(n.f).toBeGreaterThanOrEqual(5);
      expect(n.f).toBeLessThanOrEqual(9);
      expect(pent.has(pc(n.p))).toBe(true);
    }
  });

  it("every whole-beat note's pc is a chord tone of its chord", () => {
    const notes = generateRiff(baseOpts(2));
    for (const n of notes) {
      if (Math.abs(n.b - Math.round(n.b)) < 1e-6) {
        const c = chordAt(n.b);
        const tones = new Set(chordPcs(c));
        expect(tones.has(pc(n.p))).toBe(true);
      }
    }
  });

  it("same seed → identical output; another seed → different output", () => {
    const a = generateRiff(baseOpts(7));
    const b = generateRiff(baseOpts(7));
    const c = generateRiff(baseOpts(8));
    expect(a).toEqual(b);
    const differs = a.length !== c.length || a.some((n, i) => JSON.stringify(n) !== JSON.stringify(c[i]));
    expect(differs).toBe(true);
  });

  it("complexity 1 gives fewer notes than complexity 5; complexity 1 has 12–20 notes for 4 bars", () => {
    const c1 = generateRiff({ ...baseOpts(3), complexity: 1 });
    const c5 = generateRiff({ ...baseOpts(3), complexity: 5 });
    expect(c1.length).toBeLessThan(c5.length);
    expect(c1.length).toBeGreaterThanOrEqual(12);
    expect(c1.length).toBeLessThanOrEqual(20);
  });

  it('contour "up": mean pitch of last bar > first bar; "down": opposite', () => {
    const up = generateRiff({ ...baseOpts(4), contour: "up" });
    const down = generateRiff({ ...baseOpts(4), contour: "down" });
    const mean = (notes: RiffNote[], barStart: number) => {
      const bar = notes.filter((n) => n.b >= barStart && n.b < barStart + 4);
      return bar.reduce((s, n) => s + n.p, 0) / bar.length;
    };
    expect(mean(up, 12)).toBeGreaterThan(mean(up, 0));
    expect(mean(down, 12)).toBeLessThan(mean(down, 0));
  });

  it("for at least 8 of seeds 1..10 the last note is A (pc 9)", () => {
    let count = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const notes = generateRiff(baseOpts(seed));
      const last = notes[notes.length - 1]!;
      if (pc(last.p) === 9) count++;
    }
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it("BASS_4 at position 0 works (open strings included) and all notes are in bass range", () => {
    const notes = generateRiff({
      inst: BASS_4,
      key: A_MINOR,
      chords: CHORDS,
      startBeat: 0,
      bars: 4,
      position: 0,
      complexity: 3,
      seed: 5,
    });
    expect(notes.length).toBeGreaterThan(0);
    const hasOpen = notes.some((n) => n.f === 0);
    expect(hasOpen).toBe(true);
    for (const n of notes) {
      expect(n.p).toBe(BASS_4.open[n.s]! + n.f);
      expect(n.f).toBeGreaterThanOrEqual(0);
      expect(n.f).toBeLessThanOrEqual(4);
      // bass range: BASS_4 open strings 28-43, frets 0-4 => 28-47
      expect(n.p).toBeGreaterThanOrEqual(28);
      expect(n.p).toBeLessThanOrEqual(47);
    }
  });
});

describe("riffs move", () => {
  it("never plays the same pitch three times in a row (seeds 1..10)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = generateRiff({ inst: GUITAR_6, key: { root: 9, mode: "minor" },
        chords: [{ root: 9, quality: "m", b: 0, d: 16 }], startBeat: 0, bars: 4, position: 5, complexity: 3, seed });
      for (let i = 2; i < r.length; i++) {
        expect(r[i]!.p === r[i - 1]!.p && r[i - 1]!.p === r[i - 2]!.p).toBe(false);
      }
    }
  });
});
