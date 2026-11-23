import { describe, expect, it } from "vitest";
import { FEELS, feelOf } from "../insertFeels.js";
import { buildInsert } from "../insertEngine.js";
import { COMP_PATTERNS } from "../comping.js";
import { DRUM_PATTERNS } from "../drumPresets.js";
import { BASS_4, GUITAR_6 } from "../instruments.js";

const C = { root: 0, mode: "major" as const };

describe("insert feels", () => {
  it("every feel names patterns and grooves that exist", () => {
    for (const f of FEELS.chords) expect(COMP_PATTERNS.some((p) => p.id === f.opts.pattern)).toBe(true);
    for (const f of FEELS.drums) expect(DRUM_PATTERNS.some((p) => p.id === f.opts.groove && p.kind === "groove")).toBe(true);
  });

  it("ids are unique per part and feelOf finds them", () => {
    for (const part of Object.keys(FEELS) as (keyof typeof FEELS)[]) {
      const ids = FEELS[part].map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(feelOf(part, id)?.id).toBe(id);
    }
  });

  it("every feel builds playable notes (4 bars of I-V-vi-IV in C)", () => {
    for (const part of Object.keys(FEELS) as (keyof typeof FEELS)[]) {
      const inst = part === "bass" ? BASS_4 : GUITAR_6;
      for (const f of FEELS[part]) {
        const r = buildInsert({
          part, inst, key: C, startBeat: 0, bars: 4, chords: { kind: "preset", id: "pop" },
          kicks: [0, 2, 2.5, 4, 6, 6.5, 8, 10, 10.5, 12, 14, 14.5], ...f.opts,
        });
        expect(r.notes.length, `${part}/${f.id}`).toBeGreaterThan(0);
        if (part !== "drums") {
          for (const n of r.notes) expect(n.p, `${part}/${f.id}`).toBe(inst.open[n.s!]! + n.f!);
        }
      }
    }
  });
});
