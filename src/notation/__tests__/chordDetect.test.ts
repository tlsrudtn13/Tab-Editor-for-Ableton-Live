import { describe, it, expect } from "vitest";
import { chordCandidates, autoChord, type ChordNote } from "../chordDetect.js";

describe("chordDetect", () => {
  it("C E G -> top is C", () => {
    // C4,E4,G4
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 60 },
      { b: 0, d: 1, p: 64 },
      { b: 0, d: 1, p: 67 },
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0]!.name).toBe("C");
  });

  it("A C E G (bass A) -> top Am7 and C6/A among top 4", () => {
    // A3,C4,E4,G4 => bass A (57)
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 57 }, // A
      { b: 0, d: 1, p: 60 }, // C
      { b: 0, d: 1, p: 64 }, // E
      { b: 0, d: 1, p: 67 }, // G
    ];
    const cands = chordCandidates(notes, 0, 1);
    const names = cands.map((c: { name: string }) => c.name);
    expect(names[0]).toBe("Am7");
    expect(names).toContain("C6/A");
  });

  it("C E G A (bass C) -> top C6 and Am7/C in top 4", () => {
    // C4,E4,G4,A4
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 60 }, // C
      { b: 0, d: 1, p: 64 }, // E
      { b: 0, d: 1, p: 67 }, // G
      { b: 0, d: 1, p: 69 }, // A
    ];
    const cands = chordCandidates(notes, 0, 1);
    const names = cands.map((c: { name: string }) => c.name);
    expect(names[0]).toBe("C6");
    expect(names).toContain("Am7/C");
  });

  it("G B F (no 5th, bass G) -> top G7", () => {
    // G3,B3,F4
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 55 }, // G
      { b: 0, d: 1, p: 59 }, // B
      { b: 0, d: 1, p: 65 }, // F
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands[0]!.name).toBe("G7");
  });

  it("D G A -> top Dsus4", () => {
    // D4,G4,A4
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 62 }, // D
      { b: 0, d: 1, p: 67 }, // G
      { b: 0, d: 1, p: 69 }, // A
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands[0]!.name).toBe("Dsus4");
  });

  it("F# A C E (bass F#) -> top F#m7b5", () => {
    // F#3,A3,C4,E4
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 54 }, // F#
      { b: 0, d: 1, p: 57 }, // A
      { b: 0, d: 1, p: 60 }, // C
      { b: 0, d: 1, p: 64 }, // E
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands[0]!.name).toBe("F#m7b5");
  });

  it("A E with bass A -> top A5", () => {
    // A3,E4 => bass A
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 57 }, // A
      { b: 0, d: 1, p: 64 }, // E
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands[0]!.name).toBe("A5");
  });

  it("arpeggio over two beats: A(b0) C(b0.5) E(b1) G(b1.5), each d=0.5, range [0,2) -> top Am7", () => {
    const notes: ChordNote[] = [
      { b: 0, d: 0.5, p: 57 },   // A
      { b: 0.5, d: 0.5, p: 60 }, // C
      { b: 1, d: 0.5, p: 64 },   // E
      { b: 1.5, d: 0.5, p: 67 }, // G
    ];
    const cands = chordCandidates(notes, 0, 2);
    expect(cands[0]!.name).toBe("Am7");
  });

  it('bass pedal: C2 held 4 beats + D F A on beat 0-1, range [0,1) -> candidates include "Dm/C" or "Dm7/C" in top 4', () => {
    // C2 = 36 held 4 beats, D4=62,F4=65,A4=69 on [0,1)
    const notes: ChordNote[] = [
      { b: 0, d: 4, p: 36 }, // C2
      { b: 0, d: 1, p: 62 }, // D
      { b: 0, d: 1, p: 65 }, // F
      { b: 0, d: 1, p: 69 }, // A
    ];
    const cands = chordCandidates(notes, 0, 1);
    const names = cands.map((c: { name: string }) => c.name);
    expect(names.some((n: string) => n === "Dm/C" || n === "Dm7/C")).toBe(true);
  });

  it("autoChord: C E G -> C, ambiguous C E -> undefined (exact behavior)", () => {
    const notesCEG: ChordNote[] = [
      { b: 0, d: 1, p: 60 },
      { b: 0, d: 1, p: 64 },
      { b: 0, d: 1, p: 67 },
    ];
    expect(autoChord(notesCEG, 0, 1)).toBe("C");
    const notesCE: ChordNote[] = [
      { b: 0, d: 1, p: 60 },
      { b: 0, d: 1, p: 64 },
    ];
    expect(autoChord(notesCE, 0, 1)).toBeUndefined();
  });

  it("chordCandidates default limit <=4 and finite scores", () => {
    const notes: ChordNote[] = [
      { b: 0, d: 1, p: 60 },
      { b: 0, d: 1, p: 64 },
      { b: 0, d: 1, p: 67 },
      { b: 0, d: 1, p: 69 },
    ];
    const cands = chordCandidates(notes, 0, 1);
    expect(cands.length).toBeLessThanOrEqual(4);
    for (const c of cands) {
      expect(Number.isFinite(c.score)).toBe(true);
    }
  });

  // roles come from interval values: the 9th of add9 / 9 / 7#9 is not scored as the third
  const chord = (...ps: number[]): ChordNote[] => ps.map(p => ({ b: 0, d: 1, p }));
  it.each([
    [[48, 62, 64, 67], "Cadd9"],
    [[48, 64, 67, 70, 74], "C9"],
    [[43, 59, 62, 65, 70], "G7#9"],
    [[43, 59, 62, 65, 68], "G7b9"],
    [[48, 64, 67, 71, 74], "Cmaj9"],
    [[48, 64, 68], "Caug"],
    [[47, 62, 65, 68], "Bdim7"],
  ])("%j -> %s", (ps, name) => {
    expect(chordCandidates(chord(...(ps as number[])), 0, 1)[0]!.name).toBe(name);
  });
});
