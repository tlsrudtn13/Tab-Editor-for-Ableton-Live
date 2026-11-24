import { describe, expect, it, vi } from "vitest";

vi.mock("./state.js", () => ({ state: {} }));
vi.mock("./drums.js", () => ({ isDrumTrack: () => false }));
vi.mock("./effectiveKey.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./effectiveKey.js")>();
  return { ...actual, effectiveKey: () => ({ key: { root: 0, mode: "major" }, source: "default" }) };
});
vi.mock("./insertPanel.js", () => ({ tabAnalysis: () => null }));
vi.mock("./overlay.js", () => ({ findBeatBoundsAt: () => null, overlaySelectedNotes: () => {} }));
vi.mock("./cursor.js", () => ({ setCursor: () => {} }));
vi.mock("./log.js", () => ({ status: () => {}, log: () => {} }));

import { barBeatLabel, cadenceShort, chordRole, fnWords, pdfRows } from "./analysisView.js";
import type { ProgressionAnalysis } from "./analysisView.js";

describe("analysisView helpers", () => {
  it("barBeatLabel formats bar.beat", () => {
    expect(barBeatLabel(0, 4)).toBe("1.1");
    expect(barBeatLabel(2, 4)).toBe("1.3");
    expect(barBeatLabel(4, 4)).toBe("2.1");
    expect(barBeatLabel(7, 4)).toBe("2.4");
  });

  it("fnWords maps function codes", () => {
    expect(fnWords("T")).toBe("Tonic: home");
    expect(fnWords("S")).toBe("Subdominant: moves away");
    expect(fnWords("D")).toBe("Dominant: wants to go home");
    expect(fnWords("other")).toBe("Colour chord");
  });

  it("cadenceShort maps cadence kinds", () => {
    expect(cadenceShort("authentic")).toBe("PAC");
    expect(cadenceShort("plagal")).toBe("PC");
    expect(cadenceShort("half")).toBe("HC");
    expect(cadenceShort("deceptive")).toBe("DC");
    expect(cadenceShort("ii-V-I")).toBe("ii–V–I");
  });

  it("pdfRows builds table rows with cadence and first-row scale", () => {
    const result: ProgressionAnalysis = {
      key: { root: 4, mode: "minor" },
      chords: [
        { root: 4, quality: "m", name: "Em", b: 0, d: 4, roman: "i", fn: "T", tier: "safe", diatonic: true },
        { root: 11, quality: "", name: "B", b: 4, d: 4, roman: "V", fn: "D", tier: "tension", diatonic: true },
        { root: 4, quality: "m", name: "Em", b: 8, d: 4, roman: "i", fn: "T", tier: "safe", diatonic: true, cadence: "authentic" },
      ],
      cadences: [{ kind: "authentic", b: 8, from: 1, to: 2, label: "V–i" }],
      scale: { id: "minorPent", root: 4, name: "E minor pentatonic", coverage: 0.9, outside: [] },
    };
    expect(pdfRows(result, 4)).toEqual([
      { bar: "1.1", chord: "Em", numeral: "i", fn: "Home (tonic)", scale: "E minor pentatonic" },
      { bar: "2.1", chord: "B", numeral: "V", fn: "Pulls home (dominant)", scale: "" },
      { bar: "3.1", chord: "Em", numeral: "i", fn: "Home (tonic); PAC", scale: "" },
    ]);
  });

  it("pdfRows shows minor-key flats in numerals", () => {
    const result: ProgressionAnalysis = {
      key: { root: 4, mode: "minor" },
      chords: [
        { root: 7, quality: "", name: "G", b: 0, d: 4, roman: "III", fn: "T", tier: "safe", diatonic: true },
        { root: 0, quality: "", name: "C", b: 4, d: 4, roman: "VI", fn: "T", tier: "safe", diatonic: true },
        { root: 2, quality: "", name: "D", b: 8, d: 4, roman: "VII", fn: "D", tier: "tension", diatonic: true },
      ],
      cadences: [],
      scale: { id: "minorPent", root: 4, name: "E minor pentatonic", coverage: 0.9, outside: [] },
    };
    expect(pdfRows(result, 4).map(r => r.numeral)).toEqual(["bIII", "bVI", "bVII"]);
  });

  it("chordRole speaks plainly (design D024)", () => {
    const em = { root: 4, mode: "minor" as const };
    expect(chordRole({ root: 4, roman: "i", fn: "T" }, em)).toBe("Home (tonic)");
    expect(chordRole({ root: 7, roman: "III", fn: "T" }, em)).toBe("Stable (tonic family)");
    expect(chordRole({ root: 2, roman: "VII", fn: "D" }, em)).toBe("Subtonic: gentle pull home");
    expect(chordRole({ root: 4, roman: "V/iv", fn: "D" }, em)).toBe("Pulls to Am (iv)");
    expect(chordRole({ root: 9, roman: "IV", fn: "other", borrowed: { label: "x" } }, em)).toBe("Borrowed colour");
    expect(chordRole({ root: 11, roman: "V", fn: "D" }, em)).toBe("Pulls home (dominant)");
    expect(chordRole({ root: 9, roman: "iv", fn: "S" }, em)).toBe("Moves away (subdominant)");
  });
});
