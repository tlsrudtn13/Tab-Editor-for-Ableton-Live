import { describe, expect, it } from "vitest";
import { fitToKit, kickPitches, kitPitchMap } from "../drumKit.js";

describe("drumKit", () => {
  it("a GM kit keeps every hit", () => {
    const m = kitPitchMap([36, 38, 42, 46, 49]);
    const hits = [{ p: 36 }, { p: 38 }, { p: 42 }, { p: 51 }];
    expect(fitToKit(hits, m).map(h => h.p)).toEqual([36, 38, 42, 51]);
  });

  it("hits go to the pad the user mapped to that piece", () => {
    // pad 40 is the user's snare (38), pad 37 their closed hat (42)
    const m = kitPitchMap([36, 37, 40], { 40: 38, 37: 42 });
    expect(fitToKit([{ p: 38, v: 1 }, { p: 42, v: 2 }, { p: 36, v: 3 }], m)).toEqual([{ p: 40, v: 1 }, { p: 37, v: 2 }, { p: 36, v: 3 }]);
  });

  it("a pitch that is its own piece wins over a remapped one", () => {
    const m = kitPitchMap([38, 40], { 40: 38 });
    expect(m.get(38)).toBe(38);
  });

  it("does not mutate the hits", () => {
    const hits = [{ p: 38 }];
    fitToKit(hits, kitPitchMap([40], { 40: 38 }));
    expect(hits[0]!.p).toBe(38);
  });

  it("kick pitches follow the map, else 35/36", () => {
    expect(kickPitches([36, 38, 42])).toEqual([36]);
    expect(kickPitches([24, 38], { 24: 36 })).toEqual([24]);
    expect(kickPitches([38, 42])).toEqual([35, 36]);
  });
});
