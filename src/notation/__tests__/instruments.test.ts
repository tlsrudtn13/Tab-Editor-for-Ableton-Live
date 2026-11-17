import { describe, expect, it } from "vitest";
import { GUITAR_6_DROPD, BASS_4 } from "../instruments.js";
import { applyGuitarVoicing } from "../voicing.js";
import { chooseAutoInstrument } from "../payload.js";
import type { Note } from "../types.js";

const note = (p: number, b = 0): Note => ({ b, d: 1, p, v: 100, f: 0, s: 1, src: "arr", clip: "" });

describe("instrument presets and detection", () => {
  it("voices a Drop D power chord on the three open lower strings", () => {
    expect(GUITAR_6_DROPD.open[6]).toBe(38);
    const voiced = applyGuitarVoicing([note(38), note(45), note(50)], GUITAR_6_DROPD);
    expect(Object.fromEntries(voiced.map(n => [n.p, [n.s, n.f]]))).toEqual({ 38: [6, 0], 45: [5, 0], 50: [4, 0] });
  });
  it("detects bass and guitar material", () => {
    expect(chooseAutoInstrument([note(28), note(33), note(38), note(43)])).toBe(BASS_4);
    expect(chooseAutoInstrument([note(52), note(57), note(60), note(64)])).toMatchObject({ name: "6-String Guitar" });
  });
});
