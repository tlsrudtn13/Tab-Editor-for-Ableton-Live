import { describe, expect, it } from "vitest";
import { BASS_4 } from "../instruments.js";
import { kickOnsets, lockedBassLine, type BassChord } from "../bandBass.js";

const BASS = BASS_4;
const low = BASS.open[BASS.stringCount]!; // 28
const high = low + 24; // 52

function C(b = 0, d = 4): BassChord {
  return { root: 0, quality: "", b, d };
}
function G(b = 4, d = 4): BassChord {
  return { root: 7, quality: "", b, d };
}

describe("kickOnsets", () => {
  it("rock kicks 2 bars: [0,2,2.5,4,6,6.5]; 35 counts; snare does not", () => {
    const hits = [
      // bar 1
      { b: 0, p: 36 },
      { b: 1, p: 38 }, // snare
      { b: 2, p: 35 }, // kick (35 counts)
      { b: 2.5, p: 36 },
      { b: 3, p: 38 }, // snare
      // bar 2
      { b: 4, p: 36 },
      { b: 5, p: 38 },
      { b: 6, p: 36 },
      { b: 6.5, p: 36 },
      { b: 7, p: 38 },
    ];
    expect(kickOnsets(hits)).toEqual([0, 2, 2.5, 4, 6, 6.5]);
  });
});

describe("lockedBassLine", () => {
  const rockKicks = [0, 2, 2.5, 4, 6, 6.5];

  it("C (0-4) | G (4-8) with rock kicks: pitches and durations", () => {
    const notes = lockedBassLine([C(0, 4), G(4, 4)], rockKicks, { inst: BASS });
    expect(notes.map((n) => n.b)).toEqual([0, 2, 2.5, 4, 6, 6.5]);
    expect(notes.map((n) => n.p)).toEqual([36, 36, 36, 31, 31, 31]);
    expect(notes.map((n) => n.d)).toEqual([2, 0.5, 1.5, 2, 0.5, 1.5]);
  });

  it("a chord starting at 3 with no kick at 3 still gets a note at 3", () => {
    const chords: BassChord[] = [C(0, 3), G(3, 1)];
    const notes = lockedBassLine(chords, [0, 2], { inst: BASS });
    expect(notes.map((n) => n.b)).toEqual([0, 2, 3]);
    expect(notes[2]).toMatchObject({ b: 3, p: 31 });
  });

  it('fill "fifth": 2 and 2.5 in C get G (43); 0 keeps C 36; G first onset at 4 keeps G 31', () => {
    const notes = lockedBassLine([C(0, 4), G(4, 4)], rockKicks, {
      inst: BASS,
      fill: "fifth",
    });
    expect(notes.find((n) => n.b === 0)!.p).toBe(36);
    expect(notes.find((n) => n.b === 2)!.p).toBe(43);
    expect(notes.find((n) => n.b === 2.5)!.p).toBe(43);
    expect(notes.find((n) => n.b === 4)!.p).toBe(31);
  });

  it('fill "octave": 2 and 2.5 in C -> 48', () => {
    const notes = lockedBassLine([C(0, 4), G(4, 4)], rockKicks, {
      inst: BASS,
      fill: "octave",
    });
    expect(notes.find((n) => n.b === 2)!.p).toBe(48);
    expect(notes.find((n) => n.b === 2.5)!.p).toBe(48);
  });

  it("all notes within [low, high] over a 12-bar blues in all 12 keys with a funk kick pattern", () => {
    const funkKicksPerBar = [0, 1.5, 2, 3.5];
    const kicks: number[] = [];
    for (let bar = 0; bar < 12; bar++) {
      for (const k of funkKicksPerBar) kicks.push(bar * 4 + k);
    }
    const degrees = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
    for (let key = 0; key < 12; key++) {
      const chords: BassChord[] = degrees.map((deg, bar) => ({
        root: (key + deg) % 12,
        quality: bar % 12 === 9 || bar % 12 === 11 ? "7" : "",
        b: bar * 4,
        d: 4,
      }));
      for (const fill of ["none", "fifth", "octave"] as const) {
        const notes = lockedBassLine(chords, kicks, { inst: BASS, fill });
        for (const n of notes) {
          expect(n.p).toBeGreaterThanOrEqual(low);
          expect(n.p).toBeLessThanOrEqual(high);
          expect(n.d).toBeGreaterThan(0);
          expect(n.b).toBeGreaterThanOrEqual(0);
        }
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i]!.b).toBeGreaterThanOrEqual(notes[i - 1]!.b);
        }
      }
    }
  });
});
