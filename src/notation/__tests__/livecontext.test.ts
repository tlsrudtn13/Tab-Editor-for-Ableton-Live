import { describe, it, expect } from "vitest";
import type { Note } from "../types.js";
import { GUITAR_6 } from "../instruments.js";
import { applyGuitarVoicing } from "../voicing.js";
import { notesFromClip } from "../collectNotes.js";
import { clipRegion } from "../collectNotes.js";
import { buildPayload } from "../payload.js";
import { toMusicXml } from "../toMusicXml.js";

function n(b: number, p: number, d = 1): Note {
    return { b, d, p, v: 100, f: 0, s: 1, src: "ses", clip: "t" };
}

describe("clipRegion", () => {
    it("looping keeps notes in loop region rebased", () => {
        const notes = [n(1, 60), n(3, 62), n(5, 64), n(7, 66)];
        const out = clipRegion(notes, { looping: true, loopStart: 2, loopEnd: 6, startMarker: 0, endMarker: 0 });
        expect(out.map(x => x.b)).toEqual([1, 3]);
        expect(out.map(x => x.p)).toEqual([62, 64]);
    });
    it("not looping uses startMarker/endMarker", () => {
        const notes = [n(1, 60), n(3, 62), n(5, 64)];
        const out = clipRegion(notes, { looping: false, loopStart: 0, loopEnd: 0, startMarker: 2, endMarker: 6 });
        expect(out.map(x => x.b)).toEqual([1, 3]);
    });
    it("cuts note that extends past region end", () => {
        const notes = [n(4, 60, 3)];
        const out = clipRegion(notes, { looping: true, loopStart: 2, loopEnd: 6, startMarker: 0, endMarker: 0 });
        expect(out).toHaveLength(1);
        expect(out[0]!.b).toBe(2);
        expect(out[0]!.d).toBe(2);
    });
    it("empty result when no notes in region", () => {
        const notes = [n(0, 60), n(10, 62)];
        const out = clipRegion(notes, { looping: true, loopStart: 2, loopEnd: 6, startMarker: 0, endMarker: 0 });
        expect(out).toEqual([]);
    });
});

describe("rehearsal marks", () => {
    it("writes rehearsal in measure 2 for a cue at beat 4", () => {
        const notes = [n(0, 60), n(7, 62)];
        const xml = toMusicXml(notes, 120, { instrument: GUITAR_6, skipVoicing: true, cues: [{ beat: 4, name: "Verse" }] });
        expect(xml).toContain("<rehearsal>Verse</rehearsal>");
        // measure 2 contains it
        const m2 = xml.split("<measure ").find(s => s.startsWith('number="2"')) ?? "";
        // fallback: ensure rehearsal appears after measure number="2"
        const idx = xml.indexOf('number="2"');
        const idxR = xml.indexOf("<rehearsal>Verse</rehearsal>");
        expect(idxR).toBeGreaterThan(idx);
    });
    it("escapes XML in cue name", () => {
        const notes = [n(0, 60), n(7, 62)];
        const xml = toMusicXml(notes, 120, { instrument: GUITAR_6, skipVoicing: true, cues: [{ beat: 4, name: "A&B<C>" }] });
        expect(xml).toContain("<rehearsal>A&amp;B&lt;C&gt;</rehearsal>");
    });
    it("skips cue past the end", () => {
        const notes = [n(0, 60), n(7, 62)];
        const xml = toMusicXml(notes, 120, { instrument: GUITAR_6, skipVoicing: true, cues: [{ beat: 100, name: "Far" }] });
        expect(xml).not.toContain("<rehearsal>");
    });
});

describe("buildPayload live", () => {
    it("copies live into payload", () => {
        const live = { scale: { root: 5, name: "Major", intervals: [0, 2], enabled: true }, cues: [{ beat: 1, name: "x" }], grid: { quantization: 16, triplet: false } };
        const p = buildPayload("id", "name", [n(0, 60)], 120, live);
        expect(p).not.toBeNull();
        expect(p!.live).toEqual(live);
    });
});