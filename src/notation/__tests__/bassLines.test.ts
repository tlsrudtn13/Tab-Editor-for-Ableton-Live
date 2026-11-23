import { describe, expect, it } from "vitest";
import { BASS_4 } from "../instruments.js";
import { bassLine, type BassChord } from "../bassLines.js";

const BASS = BASS_4;
const low = BASS.open[BASS.stringCount]!; // 28
const high = low + 24; // 52

function C(b = 0, d = 4): BassChord {
  return { root: 0, quality: "", b, d };
}
function G(b = 0, d = 2): BassChord {
  return { root: 7, quality: "", b, d };
}
function E(b = 0, d = 1): BassChord {
  return { root: 4, quality: "", b, d };
}
function F(b = 0, d = 4): BassChord {
  return { root: 5, quality: "", b, d };
}

describe("bassLine", () => {
  it("root: C (b 0, d 4) → one note p 36 (C2), d 4", () => {
    expect(bassLine([C(0, 4)], "root", { inst: BASS })).toEqual([
      { b: 0, d: 4, p: 36, v: 100 },
    ]);
  });

  it("rootEighths: G (b 0, d 2) → 4 notes p 31, b 0,0.5,1,1.5; off-beats v 85", () => {
    expect(bassLine([G(0, 2)], "rootEighths", { inst: BASS })).toEqual([
      { b: 0, d: 0.5, p: 31, v: 100 },
      { b: 0.5, d: 0.5, p: 31, v: 85 },
      { b: 1, d: 0.5, p: 31, v: 100 },
      { b: 1.5, d: 0.5, p: 31, v: 85 },
    ]);
  });

  it("rootFifth: C d 4 → [36 @0 d2, 43 @2 d2]", () => {
    expect(bassLine([C(0, 4)], "rootFifth", { inst: BASS })).toEqual([
      { b: 0, d: 2, p: 36, v: 100 },
      { b: 2, d: 2, p: 43, v: 100 },
    ]);
  });

  it("rootFifth: anchor + 7 is the fifth (anchor is at most low+11, so the anchor - 5 branch is unreachable)", () => {
    const Ab: BassChord = { root: 8, quality: "", b: 0, d: 4 }; // Ab1 anchor 32 on BASS_4
    const notes = bassLine([Ab], "rootFifth", { inst: BASS });
    expect(notes[0]!.p).toBe(32); // Ab1 anchor
    expect(notes[1]!.p).toBe(39); // +7
  });

  it("octave: E d 1 → 28, 40", () => {
    expect(bassLine([E(0, 1)], "octave", { inst: BASS })).toEqual([
      { b: 0, d: 0.5, p: 28, v: 100 },
      { b: 0.5, d: 0.5, p: 40, v: 100 },
    ]);
  });

  it("walking C (b 0, d 4) → F (b 4, d 4): 36,40,43,42,41 at b 4", () => {
    const notes = bassLine([C(0, 4), F(4, 4)], "walking", { inst: BASS });
    // First 5 notes as specified by work order
    expect(notes.slice(0, 5).map((n) => n.p)).toEqual([36, 40, 43, 42, 41]);
    expect(notes[0]).toMatchObject({ b: 0, p: 36, d: 1, v: 100 });
    expect(notes[3]).toMatchObject({ b: 3, p: 42, d: 1 }); // approach
    expect(notes[4]).toMatchObject({ b: 4, p: 41, d: 1, v: 100 });
    // F chord continues: quarter notes, all within range
    expect(notes).toHaveLength(8);
    for (const n of notes) {
      expect(n.d).toBe(1);
      expect(n.p).toBeGreaterThanOrEqual(low);
      expect(n.p).toBeLessThanOrEqual(high);
    }
  });

  it("slash chord C/E root style → p 28 (E1)", () => {
    const cOverE: BassChord = { root: 0, quality: "", bass: 4, b: 0, d: 4 };
    expect(bassLine([cOverE], "root", { inst: BASS })).toEqual([
      { b: 0, d: 4, p: 28, v: 100 },
    ]);
  });

  it("gap between chords stays silent", () => {
    const notes = bassLine([C(0, 2), G(4, 2)], "root", { inst: BASS });
    expect(notes).toEqual([
      { b: 0, d: 2, p: 36, v: 100 },
      { b: 4, d: 2, p: 31, v: 100 },
    ]);
  });

  it("overlapping chords cut the earlier at the later b", () => {
    const notes = bassLine([C(0, 4), G(2, 2)], "root", { inst: BASS });
    expect(notes).toEqual([
      { b: 0, d: 2, p: 36, v: 100 },
      { b: 2, d: 2, p: 31, v: 100 },
    ]);
  });

  it("all notes within [low, high] for every style over a 12-bar blues in all 12 keys", () => {
    const styles = ["root", "rootEighths", "rootFifth", "octave", "walking"] as const;
    // 12-bar blues: I I I I | IV IV I I | V IV I V (in bars, 4 beats each)
    const degrees = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7]; // semitone offsets from key root as major-ish blues
    for (let key = 0; key < 12; key++) {
      const chords: BassChord[] = degrees.map((deg, bar) => ({
        root: (key + deg) % 12,
        quality: bar % 12 === 9 || bar % 12 === 11 ? "7" : "",
        b: bar * 4,
        d: 4,
      }));
      for (const style of styles) {
        const notes = bassLine(chords, style, { inst: BASS });
        for (const n of notes) {
          expect(n.p).toBeGreaterThanOrEqual(low);
          expect(n.p).toBeLessThanOrEqual(high);
          expect(n.d).toBeGreaterThan(0);
          expect(n.v).toBeGreaterThanOrEqual(1);
          expect(n.v).toBeLessThanOrEqual(127);
        }
        // sorted by b
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i]!.b).toBeGreaterThanOrEqual(notes[i - 1]!.b);
        }
      }
    }
  });
});

describe("rootFifth uses the chord's own fifth", () => {
  const ps = (c: BassChord) => bassLine([c], "rootFifth", { inst: BASS }).map((n) => n.p);
  it("b5 for a diminished chord", () => {
    expect(ps({ root: 11, quality: "dim", b: 0, d: 4 })).toEqual([35, 41]);
  });
  it("slash chord C/E: E in the bass, then the chord's fifth G above it", () => {
    expect(ps({ root: 0, quality: "", bass: 4, b: 0, d: 4 })).toEqual([28, 31]);
  });
  it("C/G: the bass already is the fifth, so the root C follows", () => {
    expect(ps({ root: 0, quality: "", bass: 7, b: 0, d: 4 })).toEqual([31, 36]);
  });
});
