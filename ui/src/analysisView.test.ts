import { describe, expect, it, vi } from "vitest";

vi.mock("./state.js", () => ({ state: {} }));
vi.mock("./drums.js", () => ({ isDrumTrack: () => false }));
vi.mock("./effectiveKey.js", () => ({ effectiveKey: () => ({ key: { root: 0, mode: "major" }, source: "default" }) }));
vi.mock("./insertPanel.js", () => ({ tabAnalysis: () => null }));
vi.mock("./overlay.js", () => ({ findBeatBoundsAt: () => null, overlaySelectedNotes: () => {} }));
vi.mock("./cursor.js", () => ({ setCursor: () => {} }));
vi.mock("./log.js", () => ({ status: () => {}, log: () => {} }));

import { barBeatLabel, cadenceShort, fnWords, pdfRows } from "./analysisView.js";
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
      { bar: "1.1", chord: "Em", numeral: "i", fn: "Tonic: home", scale: "E minor pentatonic" },
      { bar: "2.1", chord: "B", numeral: "V", fn: "Dominant: wants to go home", scale: "" },
      { bar: "3.1", chord: "Em", numeral: "i", fn: "Tonic: home; PAC", scale: "" },
    ]);
  });
});
