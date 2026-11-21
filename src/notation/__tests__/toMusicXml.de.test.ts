import { describe, it, expect } from "vitest";
import { toMusicXml } from "../toMusicXml.js";
import type { Note } from "../types.js";

const n = (b: number, d: number, p: number, extra: Partial<Note> = {}): Note => ({ b, d, p, v: 100, f: 0, s: 1, src: "ses", clip: "t", ...extra });

describe("toMusicXml user duration (de)", () => {
  it("keeps a user-shortened duration and inserts rest (quarter grid)", () => {
    // note A at b=0 d=1 de, shortened to d=0.5 -> rest of 0.5 follows before B at b=1
    const notes = [
      n(0, 0.5, 64, { de: true, s: 1, f: 0 }),
      n(1, 0.5, 67, { s: 1, f: 3 }),
    ];
    const xml = toMusicXml(notes, 120, { quantize: 4, skipVoicing: true, instrument: { name: "6-String Guitar", stringCount: 6, open: [0,64,59,55,50,45,40] } as any });
    // first note should be eighth (duration 2 at divisions 4) not auto-legato extended to quarter
    expect(xml).toContain("<duration>2</duration>");
    // a rest should appear between the two notes
    expect(xml).toContain("<rest/>");
  });
});

describe("toMusicXml auto-legato on the 8th grid", () => {
  it("keeps a real 8th rest (a deleted 8th note) instead of stretching the note before it", () => {
    // 8ths at 0 and 0.5, the 8th at 1 deleted, next note at 1.5 -> an 8th rest at 1
    const notes = [n(0, 0.5, 40, { s: 6 }), n(0.5, 0.5, 40, { s: 6 }), n(1.5, 0.5, 45, { s: 5 }), n(2, 0.5, 40, { s: 6 })];
    const xml = toMusicXml(notes, 120, { quantize: 8, skipVoicing: true, instrument: { name: "6-String Guitar", stringCount: 6, open: [0,64,59,55,50,45,40] } as any });
    expect(xml).toContain("<rest/>");
  });
});
