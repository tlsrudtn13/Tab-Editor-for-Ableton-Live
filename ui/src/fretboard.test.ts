import { describe, expect, it } from "vitest";
import { fretHoverText } from "./fretboard";

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
