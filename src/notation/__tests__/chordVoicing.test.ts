import { describe, expect, it } from "vitest";
import { BASS_4, GUITAR_6, GUITAR_6_DROPD } from "../instruments.js";
import { CHORD_INTERVALS } from "../harmony.js";
import type { ChordSym } from "../harmony.js";
import { voiceChord } from "../chordVoicing.js";

function pcs(p: number): number { return ((p % 12) + 12) % 12; }

describe("chordVoicing", () => {
  it("open C on GUITAR_6 → pitches [48,52,55,60,64] on strings 5..1, frets 3,2,0,1,0", () => {
    const v = voiceChord({ root: 0, quality: "" }, "open", GUITAR_6);
    expect(v.map(n => n.p)).toEqual([48, 52, 55, 60, 64]);
    expect(v.map(n => n.s)).toEqual([5, 4, 3, 2, 1]);
    expect(v.map(n => n.f)).toEqual([3, 2, 0, 1, 0]);
  });

  it('open "Bb" (not in table) → barre A-shape at fret 1: pitches [46,53,58,62,65]', () => {
    const v = voiceChord({ root: 10, quality: "" }, "open", GUITAR_6);
    expect(v.map(n => n.p)).toEqual([46, 53, 58, 62, 65]);
  });

  it("barre F → E-shape fret 1: [41,48,53,57,60,65]; barre Bm → A-shape fret 2", () => {
    const F = voiceChord({ root: 5, quality: "" }, "barre", GUITAR_6);
    expect(F.map(n => n.p)).toEqual([41, 48, 53, 57, 60, 65]);
    const Bm = voiceChord({ root: 11, quality: "m" }, "barre", GUITAR_6);
    // A-shape m at fret 2 on string 5: root 47, [0,7,12,15,19]
    expect(Bm.map(n => n.p)).toEqual([47, 54, 59, 62, 66]);
    expect(Bm[0]!.f).toBe(2);
    expect(Bm[0]!.s).toBe(5);
  });

  it("power E on GUITAR_6 → [40,47,52] frets 0,2,2; power A → string 5 fret 0 beats string 6 fret 5 (lower fret): [45,52,57]", () => {
    const E = voiceChord({ root: 4, quality: "5" }, "power", GUITAR_6);
    expect(E.map(n => n.p)).toEqual([40, 47, 52]);
    expect(E.map(n => n.f)).toEqual([0, 2, 2]);
    const A = voiceChord({ root: 9, quality: "" }, "power", GUITAR_6);
    expect(A.map(n => n.p)).toEqual([45, 52, 57]);
    expect(A[0]!.s).toBe(5);
    expect(A[0]!.f).toBe(0);
  });

  it("rootFifth G on BASS_4 → root 31 (E string fret 3) and 38", () => {
    const v = voiceChord({ root: 7, quality: "" }, "rootFifth", BASS_4);
    expect(v.map(n => n.p)).toEqual([31, 38]);
    expect(v[0]).toMatchObject({ p: 31, s: 4, f: 3 });
  });

  it("triad C on GUITAR_6: three notes, all chord tones of C, adjacent strings, span ≤ 4", () => {
    const v = voiceChord({ root: 0, quality: "" }, "triad", GUITAR_6);
    expect(v).toHaveLength(3);
    const cTones = new Set([0, 4, 7]);
    for (const n of v) expect(cTones.has(pcs(n.p))).toBe(true);
    const strings = v.map(n => n.s).sort((a, b) => a - b);
    expect(strings[2]! - strings[0]!).toBe(2);
    expect(new Set(strings).size).toBe(3);
    const frets = v.map(n => n.f);
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
  });

  it("every quality in CHORD_INTERVALS × every root 0-11 × every style on GUITAR_6 and BASS_4: no throw, every note consistent", () => {
    const styles = ["open", "power", "barre", "triad", "rootFifth"] as const;
    const insts = [GUITAR_6, BASS_4];
    for (const inst of insts) {
      for (let root = 0; root < 12; root++) {
        for (const quality of Object.keys(CHORD_INTERVALS)) {
          const chord: ChordSym = { root, quality };
          for (const style of styles) {
            let v;
            expect(() => { v = voiceChord(chord, style, inst); }).not.toThrow();
            v = voiceChord(chord, style, inst);
            const seen = new Set<number>();
            for (const n of v!) {
              expect(n.p).toBe(inst.open[n.s]! + n.f);
              expect(n.f).toBeGreaterThanOrEqual(0);
              expect(n.f).toBeLessThanOrEqual(15);
              expect(n.s).toBeGreaterThanOrEqual(1);
              expect(n.s).toBeLessThanOrEqual(inst.stringCount);
              expect(seen.has(n.s)).toBe(false);
              seen.add(n.s);
            }
            // sorted low -> high pitch (s descending)
            for (let i = 1; i < v!.length; i++) {
              expect(v![i]!.p).toBeGreaterThanOrEqual(v![i - 1]!.p);
              expect(v![i]!.s).toBeLessThan(v![i - 1]!.s);
            }
          }
        }
      }
    }
  });

  it("non-standard tuning (Drop D, GUITAR_6_DROPD): open falls back (no table lookup)", () => {
    const v = voiceChord({ root: 0, quality: "" }, "open", GUITAR_6_DROPD);
    // C is in the standard-tuning table, but Drop D must skip the lookup and use the barre result
    expect(v.length).toBeGreaterThan(0);
    for (const n of v) expect(n.p).toBe(GUITAR_6_DROPD.open[n.s]! + n.f);
    const barre = voiceChord({ root: 0, quality: "" }, "barre", GUITAR_6_DROPD);
    expect(v.map(n => n.p)).toEqual(barre.map(n => n.p));
  });
});

describe("fifth follows the chord quality", () => {
  it("power and rootFifth use b5 for dim / m7b5 and #5 for aug", () => {
    const bdim = voiceChord({ root: 11, quality: "dim" }, "power", GUITAR_6);
    expect(bdim[1]!.p - bdim[0]!.p).toBe(6);
    const em7b5 = voiceChord({ root: 4, quality: "m7b5" }, "rootFifth", GUITAR_6);
    expect(em7b5.map((n) => n.p)).toEqual([40, 46]);
    const caug = voiceChord({ root: 0, quality: "aug" }, "rootFifth", GUITAR_6);
    expect(caug[1]!.p - caug[0]!.p).toBe(8);
  });
});
