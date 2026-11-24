import { describe, expect, it } from "vitest";
import { displayRoman, effectiveKey, sureWord, swapChoices } from "./effectiveKey";
import type { KeyRef } from "../../src/notation/harmony.js";

const C: KeyRef = { root: 0, mode: "major" };
const Am: KeyRef = { root: 9, mode: "minor" };

describe("sureWord", () => {
  it("maps confidence to sure/likely/est.", () => {
    expect(sureWord(0.7)).toBe("sure");
    expect(sureWord(0.95)).toBe("sure");
    expect(sureWord(0.4)).toBe("likely");
    expect(sureWord(0.69)).toBe("likely");
    expect(sureWord(0.39)).toBe("est.");
    expect(sureWord(0)).toBe("est.");
  });
});

describe("effectiveKey", () => {
  it("fixed key wins", () => {
    const trk = { ann: { key: { fifths: 1, minor: false } }, live: { scale: { enabled: true, root: 0, name: "Major" } } };
    const res = effectiveKey(trk, { key: C, confidence: 0.9 });
    expect(res).toEqual({ key: { root: 7, mode: "major" }, source: "fixed" });
  });

  it("uses Live scale when enabled and no fixed key", () => {
    const trk = { ann: {}, live: { scale: { enabled: true, root: 9, name: "Minor" } } };
    const res = effectiveKey(trk, { key: C, confidence: 0.9 });
    expect(res.source).toBe("live");
    expect(res.key).toEqual({ root: 9, mode: "minor" });
  });

  it("ignores Live scale when not enabled", () => {
    const trk = { ann: {}, live: { scale: { enabled: false, root: 9, name: "Minor" } } };
    const res = effectiveKey(trk, { key: C, confidence: 0.5 });
    expect(res.source).toBe("analysis");
  });

  it("falls back to analysis with sure word", () => {
    const trk = { ann: {}, live: { scale: { enabled: false } } };
    expect(effectiveKey(trk, { key: Am, confidence: 0.8 })).toEqual({ key: Am, source: "analysis", sure: "sure" });
    expect(effectiveKey(trk, { key: Am, confidence: 0.5 })).toEqual({ key: Am, source: "analysis", sure: "likely" });
    expect(effectiveKey(trk, { key: Am, confidence: 0.2 })).toEqual({ key: Am, source: "analysis", sure: "est." });
  });

  it("defaults to C major", () => {
    expect(effectiveKey({}, null)).toEqual({ key: C, source: "default" });
    expect(effectiveKey({ ann: {}, live: { scale: { enabled: false } } }, null)).toEqual({ key: C, source: "default" });
  });
});

describe("displayRoman", () => {
  const Em: KeyRef = { root: 4, mode: "minor" };
  it("adds flats to natural III/VI/VII in minor keys", () => {
    expect(displayRoman("III", Em)).toBe("bIII");
    expect(displayRoman("VI", Em)).toBe("bVI");
    expect(displayRoman("VII", Em)).toBe("bVII");
    expect(displayRoman("VII7", Em)).toBe("bVII7");
    expect(displayRoman("vii°", Em)).toBe("vii°");
    expect(displayRoman("V7/III", Em)).toBe("V7/bIII");
    expect(displayRoman("iv", Em)).toBe("iv");
    expect(displayRoman("bII", Em)).toBe("bII");
  });
  it("leaves major keys unchanged", () => {
    expect(displayRoman("vi", C)).toBe("vi");
  });
});

describe("swapChoices", () => {
  it("C major: 7 diatonic + Bb Fm D7 Ab borrowed", () => {
    const choices = swapChoices(C);
    const names = choices.map(c => c.name);
    expect(names).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim", "Bb", "Fm", "D7", "Ab"]);
    expect(choices.slice(0, 7).every(c => c.group === "key")).toBe(true);
    expect(choices.slice(7).every(c => c.group === "borrowed")).toBe(true);
    expect(choices.map(c => c.roman)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°", "bVII", "iv", "V7/V", "bVI"]);
  });

  it("A minor: diatonic triads plus borrowed not already in key", () => {
    const choices = swapChoices(Am);
    const names = choices.map(c => c.name);
    expect(names).toEqual(["Am", "Bdim", "C", "Dm", "E", "F", "G", "D", "A", "Bb", "B7"]);
    expect(choices.slice(0, 7).every(c => c.group === "key")).toBe(true);
    expect(choices.slice(7).every(c => c.group === "borrowed")).toBe(true);
    expect(choices.map(c => c.roman)).toEqual(["i", "ii°", "bIII", "iv", "V", "bVI", "bVII", "IV", "I", "bII", "V7/V"]);
  });
});
