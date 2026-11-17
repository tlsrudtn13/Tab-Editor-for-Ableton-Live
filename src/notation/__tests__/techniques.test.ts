import { describe, expect, it } from "vitest";
import type { Note } from "../types.js";
import { detectLetRing, hasTech, toggleTech } from "../techniques.js";

const n = (p: number, b: number, d = 0.5, s = 1, f = 0): Note => ({ b, d, p, v: 100, f, s, src: "ses", clip: "x" });

describe("techniques", () => {
  it("toggleTech add/remove/order, [] after removing the last", () => {
    let note = n(40, 0);
    expect(note.tech).toBeUndefined();
    note = toggleTech(note, "vb");
    expect(note.tech).toEqual(["vb"]);
    expect(hasTech(note, "vb")).toBe(true);
    note = toggleTech(note, "hp");
    expect(note.tech).toEqual(["hp", "vb"]);
    note = toggleTech(note, "lr");
    expect(note.tech).toEqual(["lr", "hp", "vb"]);
    note = toggleTech(note, "hp");
    expect(note.tech).toEqual(["lr", "vb"]);
    note = toggleTech(note, "lr");
    note = toggleTech(note, "vb");
    expect(note.tech).toEqual([]);
    expect(hasTech(note, "vb")).toBe(false);
  });

  it("detectLetRing: open-chord arpeggio qualifies all but possibly the last (>=3)", () => {
    // A2 E3 A3 C4 E4 each 0.5 beat apart, each 2 beats long
    const notes = [45, 52, 57, 60, 64].map((p, i) => n(p, i * 0.5, 2));
    const out = detectLetRing(notes);
    expect(out.size).toBeGreaterThanOrEqual(3);
    expect(out.has(0)).toBe(true);
    expect(out.has(1)).toBe(true);
    expect(out.has(2)).toBe(true);
    // last may or may not qualify depending on interpretation; must have >=3
  });

  it("detectLetRing: straight 8th riff with d = 0.5 → none", () => {
    const notes = [40, 42, 44, 45, 47, 45, 44, 42].map((p, i) => n(p, i * 0.5, 0.5));
    expect([...detectLetRing(notes)]).toEqual([]);
  });

  it("detectLetRing: one long pedal note under 8 short melody notes → empty set", () => {
    const pedal = n(40, 0, 8);
    const melody = [60, 62, 64, 65, 67, 65, 64, 62].map((p, i) => n(p, i * 0.5, 0.5));
    // interleave by onset in array as given? array order given as list; detectLetRing takes array
    const notes = [pedal, ...melody];
    expect([...detectLetRing(notes)]).toEqual([]);
  });

  it("detectLetRing: a note with tech: [] is never returned", () => {
    const notes = [45, 52, 57, 60, 64].map((p, i) => n(p, i * 0.5, 2));
    notes[0]!.tech = [];
    notes[1]!.tech = [];
    const out = detectLetRing(notes);
    expect(out.has(0)).toBe(false);
    expect(out.has(1)).toBe(false);
  });
});
