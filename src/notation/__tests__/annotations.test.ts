import { describe, expect, it } from "vitest";
import { annForClip, sanitizeAnn } from "../tabLayer.js";
import { harmonyXml, toMusicXml } from "../toMusicXml.js";
import type { Note } from "../types.js";

const n = (b: number, p: number, d = 1): Note => ({ b, d, p, v: 100, s: 1, f: 0, src: "ses", clip: "t" } as Note);

describe("score annotations (chords, key, title)", () => {
  it("sanitizes: drops bad chords, one chord per beat (last wins), trims names, clamps key", () => {
    const a = sanitizeAnn({
      chords: [{ cb: 0, name: " Am7 " }, { cb: 0, name: "C6" }, { cb: 2, name: "" }, { cb: NaN, name: "G" }, { cb: 4, name: "x".repeat(40), auto: true }],
      key: { fifths: 9, minor: true }, title: "  Song  ",
    })!;
    expect(a.chords).toEqual([{ cb: 0, name: "C6" }, { cb: 4, name: "x".repeat(24), auto: true }]);
    expect(a.key).toBeUndefined();
    expect(a.title).toBe("Song");
    expect(sanitizeAnn({ chords: [], key: { fifths: -2, minor: false } })).toEqual({ key: { fifths: -2, minor: false } });
    expect(sanitizeAnn({})).toBeUndefined();
    expect(sanitizeAnn(null)).toBeUndefined();
  });

  it("splits a track view's chords by clip and shares key / title", () => {
    const a = sanitizeAnn({ chords: [{ cb: 0, name: "C", c: 0 }, { cb: 1, name: "G", c: 1 }, { cb: 2, name: "F", c: 0 }], key: { fifths: 1, minor: false }, title: "T" });
    expect(annForClip(a, 0)).toEqual({ chords: [{ cb: 0, name: "C" }, { cb: 2, name: "F" }], key: { fifths: 1, minor: false }, title: "T" });
    expect(annForClip(a, 1)!.chords).toEqual([{ cb: 1, name: "G" }]);
    expect(annForClip({ chords: [{ cb: 0, name: "C", c: 0 }] }, 5)).toBeUndefined();
  });

  it("writes a harmony element with the name shown verbatim", () => {
    const x = harmonyXml("F#m7b5/C").join("\n");
    expect(x).toContain("<root-step>F</root-step>");
    expect(x).toContain("<root-alter>1</root-alter>");
    expect(x).toContain('<kind text="m7b5/C">major</kind>');   // alphaTab prints root + kind text
    expect(harmonyXml("Bb").join("\n")).toContain("<root-alter>-1</root-alter>");
    expect(harmonyXml("G").join("\n")).toContain("<kind>major</kind>");
    expect(harmonyXml("N.C.").join("\n")).toContain('<kind text="N.C.">none</kind>');
    expect(harmonyXml("N.C.").join("\n")).not.toContain("<root>");
  });

  it("puts each chord before the first note sounding at its beat, plus a title", () => {
    const xml = toMusicXml([n(0, 57), n(1, 60), n(2, 64), n(3, 67)], 120, { skipVoicing: true, quantize: 4 as any, chords: [{ b: 0, name: "Am" }, { b: 2, name: "C/E" }, { b: 2.25, name: "dropped" }], title: "My <Song>" });
    expect(xml).toContain("<movement-title>My &lt;Song&gt;</movement-title>");
    const harmonies = [...xml.matchAll(/<root-step>([A-G])<\/root-step>[\s\S]*?<kind(?: text="([^"]*)")?>/g)].map(m => m[1] + (m[2] ?? ""));
    expect(harmonies).toEqual(["Am", "C/E"]);   // one per note: the second chord inside the same quarter is dropped
    // the C/E harmony comes right before the note on beat 2 (E4 = 64)
    const at = xml.indexOf('text="/E"'), next = xml.indexOf("<note>", at);
    expect(xml.slice(next, next + 120)).toContain("<step>E</step>");
  });

  it("adds nothing when there are no annotations", () => {
    const xml = toMusicXml([n(0, 60)], 120, { skipVoicing: true });
    expect(xml).not.toContain("<harmony");
    expect(xml).not.toContain("movement-title");
  });

  it("keeps one lyric syllable per onset and splits lyrics by clip", () => {
    const a = sanitizeAnn({ lyrics: [{ cb: 0, text: " Hel- " }, { cb: 0, text: "Hi" }, { cb: 1, text: "  " }, { cb: 2, text: "lo   you", c: 1 }] })!;
    expect(a.lyrics).toEqual([{ cb: 0, text: "Hi" }, { cb: 2, text: "lo you", c: 1 }]);
    expect(annForClip(a, 1)).toEqual({ lyrics: [{ cb: 2, text: "lo you" }] });
  });

  it("writes a lyric on the first note of the token that starts at its beat, not on tied continuations", () => {
    const notes = [n(0, 60, 1), n(1, 62, 1), { ...n(1, 64, 1) }, n(2, 65, 3)];   // beat 1 is a chord; beat 2 rings into bar 2 (tie)
    const xml = toMusicXml(notes, 120, { skipVoicing: true, quantize: 4 as any, lyrics: [{ b: 0, text: "Hel-" }, { b: 1, text: "lo" }, { b: 4, text: "never" }, { b: 2, text: "A&B" }] });
    const lyrics = [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map(m => m[1]);
    expect(lyrics).toEqual(["Hel-", "lo", "A&amp;B"]);   // beat 4 is the tied part of the beat-2 note: no syllable
    expect((xml.match(/<lyric /g) || []).length).toBe(3);   // the chord on beat 1 carries it once
  });
});
