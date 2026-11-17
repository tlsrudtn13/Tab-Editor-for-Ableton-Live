import { describe, expect, it } from "vitest";
import { clampDurToSpan, deleteBeatShift, durFromValue, durName, insertBeatShift, tieDecision, valueFromDur } from "./rhythm";

describe("rhythm value/duration helpers", () => {
  it("computes duration from value+dot+triplet", () => {
    expect(durFromValue(4, false, false)).toBeCloseTo(1);
    expect(durFromValue(8, false, false)).toBeCloseTo(0.5);
    expect(durFromValue(8, true, false)).toBeCloseTo(0.75);
    expect(durFromValue(8, false, true)).toBeCloseTo(1 / 3, 5);
    expect(durFromValue(16, true, false)).toBeCloseTo(0.375);
  });
  it("derives value from duration", () => {
    expect(valueFromDur(1)).toEqual({ den: 4, dot: false, triplet: false });
    expect(valueFromDur(0.75)).toEqual({ den: 8, dot: true, triplet: false });
    expect(valueFromDur(1 / 3)).toEqual({ den: 8, dot: false, triplet: true });
    expect(valueFromDur(0.123)).toBeNull();
  });
  it("formats duration names", () => {
    expect(durName(1)).toBe("1/4");
    expect(durName(0.75)).toBe("1/8.");
  });
  it("clamps to span end", () => {
    expect(clampDurToSpan(2, 3, 4)).toBeCloseTo(1);
    expect(clampDurToSpan(0.1, 3.95, 4)).toBeCloseTo(0.1);
  });
});

describe("insert/delete beat shift", () => {
  const span = { start: 0, end: 8 };
  it("insert shifts notes at/after cursor right", () => {
    const notes = [
      { b: 0, d: 1, p: 40, s: 6, f: 0, oid: 1 },
      { b: 1, d: 1, p: 42, s: 6, f: 2, oid: 2 },
      { b: 3, d: 1, p: 43, s: 6, f: 3, oid: 3 },
    ];
    const r = insertBeatShift(notes, 1, 1, span);
    expect(r.deleted).toEqual([]);
    expect(r.notes.map(n => n.b)).toEqual([0, 2, 4]);
    expect(r.notes[1].dirty).toBe(true);
    expect(notes[1].b).toBe(1);
  });
  it("insert removes notes pushed past the span end and trims crossing ones", () => {
    const notes = [{ b: 6, d: 1.5, p: 41, s: 6, f: 1, oid: 4 }, { b: 7, d: 1, p: 40, s: 6, f: 0, oid: 5 }];
    const r = insertBeatShift(notes, 6, 1, span);
    expect(r.deleted).toEqual([5]);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ b: 7, d: 1, de: true });
    expect(r.trimmed).toBe(1);
  });
  it("delete removes slot notes and shifts later left", () => {
    const notes = [
      { b: 0, d: 1, p: 40, s: 6, f: 0, oid: 1 },
      { b: 1, d: 1, p: 42, s: 6, f: 2, oid: 2 },
      { b: 2, d: 1, p: 43, s: 6, f: 3, oid: 3 },
    ];
    const r = deleteBeatShift(notes, 1, 1, span);
    expect(r.error).toBeUndefined();
    expect(r.deleted).toEqual([2]);
    expect(r.notes.map(n => n.b)).toEqual([0, 1]);
  });
});

describe("tie decision", () => {
  it("merges with same pitch/string next note", () => {
    const notes = [
      { b: 0, d: 1, p: 40, s: 6, f: 0 },
      { b: 1, d: 1, p: 40, s: 6, f: 0 },
    ];
    expect(tieDecision(notes, 0, { b: 1, d: 1, isRest: false }, 4)).toEqual({ kind: "merge-note", targetIndex: 1, newDur: 2 });
  });
  it("extends over rest", () => {
    const notes = [{ b: 0, d: 1, p: 40, s: 6, f: 0 }];
    expect(tieDecision(notes, 0, { b: 1, d: 0.5, isRest: true }, 4)).toEqual({ kind: "extend-rest", newDur: 1.5 });
  });
  it("refuses different next note", () => {
    const notes = [
      { b: 0, d: 1, p: 40, s: 6, f: 0 },
      { b: 1, d: 1, p: 42, s: 6, f: 2 },
    ];
    expect(tieDecision(notes, 0, { b: 1, d: 1, isRest: false }, 4).kind).toBe("none");
  });
});
