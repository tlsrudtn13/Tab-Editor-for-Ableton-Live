// Baseline tests for the notation engine (P0).
// They pin down current behaviour so P1 (fingering engine, tuplets) can be
// compared against it. Tests marked "current behaviour" document a known
// limitation rather than the desired result.
import { describe, it, expect } from "vitest";
import type { Note } from "../types.js";
import {
    quantizeBeat, detectQuantizeGrid, detectKey, beatToNoteVal,
    pitchToFs, fsToMidiPitch,
} from "../music.js";
import { applyGuitarVoicing } from "../voicing.js";
import { GUITAR_6, BASS_4, GUITAR_7 } from "../instruments.js";
import { notesFromClip, collectNotes } from "../collectNotes.js";
import { toMusicXml } from "../toMusicXml.js";
import { toAlphaTex } from "../toAlphaTex.js";

/** Build a note with placeholder string/fret (voicing assigns the real ones). */
function n(b: number, p: number, d = 0.5, v = 100): Note {
    return { b, d, p, v, f: 0, s: 1, src: "ses", clip: "t" };
}

/** Pitch that a voiced note actually sounds at on the given instrument. */
function sounded(note: Note, open: number[]): number {
    return open[note.s]! + note.f;
}

describe("quantize", () => {
    it("snaps to the 1/16 grid by default", () => {
        expect(quantizeBeat(0.26)).toBe(0.25);
        expect(quantizeBeat(0.37)).toBe(0.25);
        expect(quantizeBeat(0.38)).toBe(0.5);
    });
    it("snaps to coarser and finer grids", () => {
        expect(quantizeBeat(0.6, 8)).toBe(0.5);
        expect(quantizeBeat(0.07, 32)).toBe(0.125);
        expect(quantizeBeat(1.4, 4)).toBe(1);
    });
    it("detects the grid from the smallest onset gap", () => {
        expect(detectQuantizeGrid([n(0, 60), n(1, 62), n(2, 64)])).toBe(4);
        expect(detectQuantizeGrid([n(0, 60), n(0.5, 62)])).toBe(8);
        expect(detectQuantizeGrid([n(0, 60), n(0.25, 62)])).toBe(16);
        expect(detectQuantizeGrid([n(0, 60), n(0.125, 62)])).toBe(32);
    });
    it("ignores chord tones when detecting the grid", () => {
        expect(detectQuantizeGrid([n(0, 60), n(0, 64), n(0, 67), n(1, 62)])).toBe(4);
    });
    // 0.75 = three 16ths: the quarter grid would snap 0.75/1.5/2.25 to 1/2/2
    // and merge separate melody notes into a chord.
    it("dotted-8th rhythm keeps a 1/16 grid", () => {
        const dotted = [0, 0.75, 1.5, 2.25, 3].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(dotted)).toBe(16);
    });
    it("quarter notes offset by an 8th need the 1/8 grid", () => {
        expect(detectQuantizeGrid([n(0.5, 60), n(1.5, 62), n(2.5, 64)])).toBe(8);
    });
    it("slightly humanized 8ths still read as 1/8", () => {
        const human = [0, 0.52, 0.98, 1.53, 2.01, 2.47].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(human)).toBe(8);
    });
    it("one stray onset in ten does not force a finer grid", () => {
        const ns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9.25].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(ns)).toBe(4);
    });
    it("1/8 triplets detect as the 1/8-triplet grid", () => {
        const trip = [n(0, 60), n(1 / 3, 62), n(2 / 3, 64)];
        expect(detectQuantizeGrid(trip)).toBe(12);
    });
});

describe("key and durations", () => {
    it("detects C major and A minor style material", () => {
        const cMaj = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64, 60].map((p, i) => n(i, p));
        expect(detectKey(cMaj)).toEqual({ fifths: 0, mode: "major" });
    });
    it("detects a sharp key", () => {
        // G major scale with emphasis on G and D
        const gMaj = [67, 69, 71, 72, 74, 76, 78, 79, 74, 67, 67, 74].map((p, i) => n(i, p));
        expect(detectKey(gMaj).fifths).toBe(1);
    });
    it("maps beat lengths to note values", () => {
        expect(beatToNoteVal(4)).toBe(1);
        expect(beatToNoteVal(1)).toBe(4);
        expect(beatToNoteVal(0.5)).toBe(8);
        expect(beatToNoteVal(0.25)).toBe(16);
    });
});

describe("pitch <-> fret/string", () => {
    it("round-trips on standard tuning", () => {
        for (let p = 40; p <= 88; p++) {
            const { f, s } = pitchToFs(p);
            expect(fsToMidiPitch(f, s)).toBe(p);
        }
    });
    it("places low E on the 6th string open", () => {
        expect(pitchToFs(40)).toEqual({ f: 0, s: 6 });
    });
});

describe("voicing", () => {
    it("keeps every in-range note at its original pitch", () => {
        const notes = [n(0, 40), n(0, 47), n(0, 52), n(0, 55), n(0, 59), n(0, 64), n(1, 45), n(2, 76)];
        const out = applyGuitarVoicing(notes, GUITAR_6);
        expect(out).toHaveLength(notes.length);
        for (const v of out) expect(sounded(v, GUITAR_6.open)).toBe(v.p);
    });
    it("gives each chord tone its own string", () => {
        // open E major: E2 B2 E3 G#3 B3 E4
        const chord = [40, 47, 52, 56, 59, 64].map(p => n(0, p));
        const out = applyGuitarVoicing(chord, GUITAR_6);
        expect(new Set(out.map(v => v.s)).size).toBe(6);
    });
    it("plays open E major in first position", () => {
        const chord = [40, 47, 52, 56, 59, 64].map(p => n(0, p));
        const out = applyGuitarVoicing(chord, GUITAR_6);
        expect(Math.max(...out.map(v => v.f))).toBeLessThanOrEqual(2);
    });
    it("marks notes above the range with oor=1 and keeps the pitch", () => {
        const out = applyGuitarVoicing([n(0, 64 + 27)], GUITAR_6);
        expect(out[0]!.oor).toBe(1);
        expect(sounded(out[0]!, GUITAR_6.open)).toBe(64 + 27);
    });
    it("folds notes below the range up by octaves with oor=2", () => {
        const out = applyGuitarVoicing([n(0, 33)], GUITAR_6); // A1, below low E
        expect(out[0]!.oor).toBe(2);
        expect(out[0]!.p).toBe(33); // original pitch kept as data
        expect((sounded(out[0]!, GUITAR_6.open) - 33) % 12).toBe(0);
    });
    it("works on 4-string bass and 7-string guitar", () => {
        const bass = applyGuitarVoicing([n(0, 28), n(1, 33), n(2, 38), n(3, 43)], BASS_4);
        for (const v of bass) {
            expect(v.s).toBeGreaterThanOrEqual(1);
            expect(v.s).toBeLessThanOrEqual(4);
            expect(sounded(v, BASS_4.open)).toBe(v.p);
        }
        const low = applyGuitarVoicing([n(0, 35)], GUITAR_7);
        expect(low[0]).toMatchObject({ s: 7, f: 0 });
    });
    // Live MIDI is sounding pitch: E1 = 28 is the 4-string bass's open E.
    it("real-pitch bass (E1=28) is playable without folding", () => {
        const out = applyGuitarVoicing([n(0, 28), n(1, 33), n(2, 38), n(3, 43)], BASS_4);
        for (const v of out) expect(v.oor).toBeUndefined();
        expect(out[0]).toMatchObject({ s: 4, f: 0 });
    });
    it("current behaviour: chooses frets per chord, ignoring neighbours", () => {
        // A run around the 7th position. A position-aware engine (P1) should
        // keep these together; the greedy engine drops to low frets.
        const run = [69, 71, 72, 74, 76].map((p, i) => n(i * 0.5, p));
        const out = applyGuitarVoicing(run, GUITAR_6);
        // Record the actual layout so a change in P1 is visible in review.
        expect(out.map(v => `${v.s}:${v.f}`)).toMatchSnapshot();
    });
});

describe("collectNotes", () => {
    const clip = (notes: unknown[], extra: Record<string, unknown> = {}) => ({ name: "C1", notes, ...extra });

    it("reads startTime/duration/pitch/velocity and clamps bad values", () => {
        const out = notesFromClip(clip([
            { startTime: 0, duration: 1, pitch: 60, velocity: 90 },
            { startTime: 1, duration: 0, pitch: 200, velocity: 0 },
        ]), 0, "ses", "C1");
        expect(out[0]).toMatchObject({ b: 0, d: 1, p: 60, v: 90 });
        expect(out[1]!.p).toBe(127);
        expect(out[1]!.v).toBe(1);
        expect(out[1]!.d).toBeGreaterThan(0);
    });
    it("offsets arrangement clips by their start time and keeps session clips apart", () => {
        const track = {
            arrangementClips: [clip([{ startTime: 1, duration: 1, pitch: 60 }], { startTime: 8 })],
            clipSlots: [{ clip: clip([{ startTime: 0, duration: 1, pitch: 64 }]) }, { clip: null }],
        };
        const { arr, ses } = collectNotes(track);
        expect(arr.map(x => x.b)).toEqual([9]);
        expect(ses.map(x => x.p)).toEqual([64]);
    });
    it("current behaviour: ignores clip loop region and start marker", () => {
        const out = notesFromClip(clip(
            [{ startTime: 0, duration: 1, pitch: 60 }, { startTime: 6, duration: 1, pitch: 62 }],
            { loopStart: 4, loopEnd: 8, startMarker: 4 },
        ), 0, "ses", "C1");
        expect(out).toHaveLength(2);
    });
});

describe("exporters", () => {
    const riff = applyGuitarVoicing(
        [n(0, 40, 1), n(1, 43, 1), n(2, 45, 1), n(3, 40, 0.5), n(3.5, 47, 0.5), n(4, 52, 4)],
        GUITAR_6,
    );

    it("writes a MusicXML 4.0 score with tab technical data", () => {
        const xml = toMusicXml(riff, 120, { instrument: GUITAR_6, skipVoicing: true });
        expect(xml).toContain("<score-partwise");
        expect(xml).toMatch(/<string>\d+<\/string>/);
        expect(xml).toMatch(/<fret>\d+<\/fret>/);
        expect((xml.match(/<measure /g) ?? []).length).toBeGreaterThanOrEqual(2);
        // a whole note crossing nothing should not be split; notes crossing bars are tied
        expect(xml).toMatchSnapshot();
    });
    it("writes AlphaTex with the tempo", () => {
        const tex = toAlphaTex(riff, { bpm: 97 });
        expect(tex).toContain("97");
        expect(tex.length).toBeGreaterThan(20);
    });
    it("returns valid output for an empty clip", () => {
        expect(() => toMusicXml([], 120, { instrument: GUITAR_6, skipVoicing: true })).not.toThrow();
    });
});
