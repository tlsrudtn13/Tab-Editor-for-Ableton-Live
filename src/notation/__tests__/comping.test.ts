import { describe, expect, it } from "vitest";
import { GUITAR_6 } from "../instruments.js";
import { voiceChord } from "../chordVoicing.js";
import { COMP_PATTERNS, compChords, varyPattern } from "../comping.js";

const C = voiceChord({ root: 0, quality: "" }, "open", GUITAR_6);
const G = voiceChord({ root: 7, quality: "" }, "open", GUITAR_6);

function pat(id: string) {
  const p = COMP_PATTERNS.find((x) => x.id === id);
  if (!p) throw new Error(`missing pattern ${id}`);
  return p;
}

describe("compChords", () => {
  it("whole on C (b 0, d 4) → 5 notes, first at 0, last at 0.08, all d ≈ 4 − offset", () => {
    const out = compChords([{ b: 0, d: 4, notes: C }], pat("whole"));
    expect(out).toHaveLength(5);
    expect(out[0]!.b).toBe(0);
    expect(out[out.length - 1]!.b).toBeCloseTo(0.08, 6);
    for (const n of out) {
      expect(n.d).toBeCloseTo(4 - n.b, 6);
    }
  });

  it("eighths on C → 8 strums; the up strums at 0.5, 1.5 … have 4 notes starting with string 1, v 95−8−15 = 72", () => {
    const out = compChords([{ b: 0, d: 4, notes: C }], pat("eighths"));
    const strumStarts = [...new Set(out.map((n) => Math.round(n.b * 2) / 2))].sort((a, b) => a - b);
    expect(strumStarts).toHaveLength(8);
    for (const t of [0.5, 1.5, 2.5, 3.5]) {
      const strum = out
        .filter((n) => n.b >= t - 1e-6 && n.b < t + 0.2)
        .sort((a, b) => a.b - b.b || a.p - b.p);
      expect(strum).toHaveLength(4);
      expect(strum[0]!.s).toBe(1);
      for (const n of strum) expect(n.v).toBe(72);
    }
  });

  it("reggae → 2 events at b 1 and 3, all notes together, d 0.25", () => {
    const out = compChords([{ b: 0, d: 4, notes: C }], pat("reggae"));
    const starts = [...new Set(out.map((n) => n.b))].sort((a, b) => a - b);
    expect(starts).toEqual([1, 3]);
    for (const t of [1, 3]) {
      const ev = out.filter((n) => Math.abs(n.b - t) < 1e-6);
      expect(ev).toHaveLength(5);
      for (const n of ev) expect(n.d).toBeCloseTo(0.25, 6);
    }
  });

  it("arpUp on C → 8 notes at 0, 0.5, …, pitches cycling 48,52,55,60,64,48,52,55; updown → 48,52,55,60,64,60,55,52", () => {
    const up = compChords([{ b: 0, d: 4, notes: C }], pat("arpUp"), { arp: "up" });
    expect(up.map((n) => n.b)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(up.map((n) => n.p)).toEqual([48, 52, 55, 60, 64, 48, 52, 55]);

    const updown = compChords([{ b: 0, d: 4, notes: C }], pat("arpUp"), { arp: "updown" });
    expect(updown.map((n) => n.p)).toEqual([48, 52, 55, 60, 64, 60, 55, 52]);
  });

  it("chord change: C (0–2) then G (2–4) with quarters → C strums at 0,1 and G strums at 2,3", () => {
    const out = compChords(
      [
        { b: 0, d: 2, notes: C },
        { b: 2, d: 2, notes: G },
      ],
      pat("quarters"),
    );
    const starts = [...new Set(out.map((n) => Math.round(n.b)))].sort((a, b) => a - b);
    expect(starts).toEqual([0, 1, 2, 3]);
    const at0 = out.filter((n) => n.b >= -1e-6 && n.b < 0.2).map((n) => n.p).sort((a, b) => a - b);
    const at2 = out.filter((n) => n.b >= 2 - 1e-6 && n.b < 2.2).map((n) => n.p).sort((a, b) => a - b);
    expect(at0).toEqual([...C].sort((a, b) => a.p - b.p).map((n) => n.p));
    expect(at2).toEqual([...G].sort((a, b) => a.p - b.p).map((n) => n.p));
  });

  it("every output note keeps the s/f of its voicing note; X/rest/hold mix in a custom pattern works; a bad char throws", () => {
    // D at 0, holds 1-7 extend to X at 8 (beat 2), rest at 9 cuts X
    const out = compChords([{ b: 0, d: 4, notes: C }], "D-------X.......", { velocity: 95 });
    for (const n of out) {
      const src = C.find((v) => v.p === n.p && v.s === n.s && v.f === n.f);
      expect(src).toBeTruthy();
    }
    const starts = [...new Set(out.map((n) => Math.round(n.b * 4) / 4))].sort((a, b) => a - b);
    expect(starts).toEqual([0, 2]);
    const dEvent = out.filter((n) => n.b >= -1e-6 && n.b < 0.2);
    for (const n of dEvent) expect(n.d).toBeCloseTo(2 - n.b, 6); // hold extends to X at beat 2
    const xEvent = out.filter((n) => Math.abs(n.b - 2) < 1e-6);
    expect(xEvent).toHaveLength(5);
    for (const n of xEvent) expect(n.d).toBeCloseTo(0.25, 6); // rest at step 9

    expect(() => compChords([{ b: 0, d: 4, notes: C }], "D---Z-----------")).toThrow();
  });
});

describe("pattern by id", () => {
  it("a preset id string resolves to that preset's steps", () => {
    const C = voiceChord({ root: 0, quality: "" }, "open", GUITAR_6);
    const byId = compChords([{ b: 0, d: 4, notes: C }], "pop");
    const byObj = compChords([{ b: 0, d: 4, notes: C }], COMP_PATTERNS.find((p) => p.id === "pop")!);
    expect(byId).toEqual(byObj);
  });
});

describe("varyPattern (Vary for chords)", () => {
  const pop = COMP_PATTERNS.find((p) => p.id === "pop")!.steps;
  it("seed 1 is the pattern as written", () => {
    expect(varyPattern(pop, 1)).toBe(pop);
  });
  it("other seeds change only the 'and' of a beat, keep every beat downstroke, and differ from the pattern", () => {
    for (let seed = 2; seed < 30; seed++) {
      const v = varyPattern(pop, seed);
      expect(v).toHaveLength(16);
      expect(v).not.toBe(pop);
      for (let i = 0; i < 16; i++) if (i % 4 !== 2) expect(v[i]).toBe(pop[i]);
    }
  });
  it("is deterministic and gives several different variations", () => {
    expect(varyPattern(pop, 7)).toBe(varyPattern(pop, 7));
    const set = new Set(Array.from({ length: 20 }, (_, i) => varyPattern(pop, i + 2)));
    expect(set.size).toBeGreaterThan(3);
  });
  it("leaves a pattern without strums alone", () => {
    const arp = COMP_PATTERNS.find((p) => p.id === "arpUp")!.steps;
    expect(varyPattern(arp, 5)).toBe(arp);
  });
});
