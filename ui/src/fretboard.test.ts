import { describe, expect, it } from "vitest";
import { barRange, fretHoverText } from "./fretboard";

describe("barRange", () => {
  it("finds the bar around a beat", () => {
    expect(barRange(5.5, 4)).toEqual({ start: 4, end: 8 });
    expect(barRange(4, 4)).toEqual({ start: 4, end: 8 });     // first beat of bar 2
    expect(barRange(3.75, 3)).toEqual({ start: 3, end: 6 });  // 3/4
    expect(barRange(2, 0)).toEqual({ start: 0, end: 4 });     // bad time signature falls back to 4
  });
});

describe("fretHoverText", () => {
  it("names the note with Live's octave numbers", () => {
    expect(fretHoverText(6, 5, 40, 0)).toBe("String 6 · Fret 5 · A1");   // low E + 5 = A (MIDI 45)
    expect(fretHoverText(1, 0, 64, 0)).toBe("String 1 · Fret 0 · E3");
  });
  it("shows the fret above the capo, as the TAB does", () => {
    expect(fretHoverText(6, 5, 40, 2)).toBe("String 6 · Fret 3 · A1");
    expect(fretHoverText(6, 1, 40, 2)).toBe("String 6 · Fret 1 (below capo) · F1");
  });
});
