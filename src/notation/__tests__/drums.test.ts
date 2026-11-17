import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import {
    DRUM_ARTICULATIONS, drumLegend, drumLayerFrom, gmArticulation, liveNoteName, padLabelFromPath,
    parseDrumLayer, resolveDrumPiece, UNMAPPED_ARTICULATION,
} from "../drumMap.js";
import { toDrumAlphaTex } from "../toDrumAlphaTex.js";
import { buildDrumPayload, isDrumPayload, looksLikeDrums } from "../drumPayload.js";
import { buildPayload } from "../payload.js";
import type { Note } from "../types.js";

const n = (p: number, b: number, v = 100, d = 0.25): Note => ({ b, d, p, v, f: 0, s: 0, src: "ses", clip: "x" });

/** Parse AlphaTex with alphaTab itself: errors throw, the model is what Live's editor renders. */
function parse(tex: string) {
    const imp = new (alphaTab as any).importer.AlphaTexImporter();
    imp.initFromString(tex, new (alphaTab as any).Settings());
    const score = imp.readScore();
    const errors = ["lexerDiagnostics", "parserDiagnostics", "semanticDiagnostics"]
        .flatMap(k => (imp[k]?.items ?? []).filter((d: any) => d.severity > 1).map((d: any) => d.message));
    expect(errors).toEqual([]);
    const track = score.tracks[0];
    return { score, track, staff: track.staves[0] };
}
/** alphaTab articulation ids of a beat's notes (via the track's articulation table). */
const ids = (track: any, beat: any) => beat.notes.map((x: any) => track.percussionArticulations[x.percussionArticulation].id).sort((a: number, b: number) => a - b);
const midiOut = (track: any, beat: any) => beat.notes.map((x: any) => track.percussionArticulations[x.percussionArticulation].outputMidiNumber).sort((a: number, b: number) => a - b);

// Basic rock beat: hats in 8ths, snare on 2 and 4, kick on 1 and the "and" of 3.
const rock: Note[] = [];
for (let i = 0; i < 8; i++) rock.push(n(42, i * 0.5));
rock.push(n(38, 1), n(38, 3), n(36, 0), n(36, 2.5));

describe("drum map (GM default)", () => {
    it("maps the Drum Rack default pads (C1 = 36) to GM drums", () => {
        expect(liveNoteName(36)).toBe("C1");
        expect(resolveDrumPiece(36)).toMatchObject({ articulation: 36, name: "Kick", limb: "foot", mapped: true, custom: false });
        expect(resolveDrumPiece(38)).toMatchObject({ articulation: 38, limb: "hand" });
        expect(resolveDrumPiece(42).name).toBe("Hi-Hat Closed");
        expect(resolveDrumPiece(44).limb).toBe("foot");
        expect(resolveDrumPiece(49).name).toBe("Crash");
    });
    it("every GM1 key 35..81 and GM2 key 27..87 has an articulation", () => {
        for (let p = 27; p <= 87; p++) expect(gmArticulation(p), `pitch ${p}`).toBeDefined();
        expect(gmArticulation(26)).toBeUndefined();
        expect(gmArticulation(88)).toBeUndefined();
    });
    it("every articulation we offer exists in alphaTab with the same staff line", () => {
        // PercussionMapper is internal: parse one note per articulation and read the model
        for (const a of DRUM_ARTICULATIONS) {
            const { track } = parse(`\\track "D" \\instrument percussion\n\\articulation (k${a.id} ${a.id})\nk${a.id}.4 |`);
            const art = track.percussionArticulations[0];
            expect(art.id, a.name).toBe(a.id);
            expect(art.staffLine, a.name).toBe(a.staffLine);
        }
    });
    it("pitches outside GM fall back to a flagged slash notehead", () => {
        expect(resolveDrumPiece(100)).toMatchObject({ articulation: UNMAPPED_ARTICULATION, mapped: false });
    });
    it("the user's kit map overrides GM, invalid entries are ignored", () => {
        expect(resolveDrumPiece(37, { 37: 42 })).toMatchObject({ articulation: 42, custom: true, mapped: true });
        expect(resolveDrumPiece(37, { 37: 9999 })).toMatchObject({ articulation: 37, custom: false });
        expect(resolveDrumPiece(100, { 100: 36 })).toMatchObject({ articulation: 36, limb: "foot", mapped: true });
    });
    it("pad hints only label pads, they never remap", () => {
        const p = resolveDrumPiece(36, undefined, { 36: "Snare Fat" });
        expect(p).toMatchObject({ articulation: 36, pad: "Snare Fat" });
        expect(padLabelFromPath("C:\\Samples\\Kick 808.wav")).toBe("Kick 808");
        expect(padLabelFromPath("/a/b/HH Closed.aif")).toBe("HH Closed");
        expect(padLabelFromPath(undefined)).toBeUndefined();
    });
    it("legend lists each pad once, top of staff first", () => {
        expect(drumLegend([36, 42, 38, 42, 49]).map(p => p.pitch)).toEqual([49, 42, 38, 36]);
    });
    it("saved kit maps validate and drop junk", () => {
        expect(drumLayerFrom({ 37: 42, 200: 36, 40: 1 } as any)).toEqual({ v: 1, kind: "drum", map: { 37: 42 } });
        expect(parseDrumLayer({ v: 1, kind: "drum", map: { 36: 35 } })).toEqual({ v: 1, kind: "drum", map: { 36: 35 } });
        expect(parseDrumLayer({ v: 1, instrument: "guitar6", notes: [] })).toBeUndefined();
        expect(parseDrumLayer(null)).toBeUndefined();
    });
});

describe("drum AlphaTex", () => {
    it("renders a rock beat as hands up / feet down on a percussion staff", () => {
        const { tex } = toDrumAlphaTex(rock, { bpm: 100 });
        const { score, track, staff } = parse(tex);
        expect(staff.isPercussion).toBe(true);
        expect(staff.bars[0].clef).toBe((alphaTab as any).model.Clef.Neutral);   // percussion clef
        expect(track.playbackInfo.primaryChannel).toBe(9);     // GM percussion channel
        expect(score.tempo).toBe(100);
        const [hands, feet] = staff.bars[0].voices;
        expect(hands.beats.map((b: any) => b.duration)).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
        expect(ids(track, hands.beats[2])).toEqual([38, 42]);
        // kick: quarter on 1, quarter rest, eighth rest, eighth on the "and" of 3, quarter rest
        expect(feet.beats.map((b: any) => (b.isRest ? "r" : "") + b.duration)).toEqual(["4", "r4", "r8", "8", "r4"]);
        expect(ids(track, feet.beats[0])).toEqual([36]);
        expect(midiOut(track, feet.beats[0])).toEqual([36]);
    });
    it("leaves out the feet voice when there are no kick / pedal notes", () => {
        const { staff } = parse(toDrumAlphaTex([n(42, 0), n(38, 1)], { bpm: 120 }).tex);
        expect(staff.bars[0].voices.length).toBe(1);
    });
    it("fills bars without hits with a whole-bar rest in both voices", () => {
        const { staff } = parse(toDrumAlphaTex([n(36, 0), n(42, 8)], { bpm: 120 }).tex);
        expect(staff.bars.length).toBe(3);
        expect(staff.bars[1].voices.map((v: any) => v.beats.map((b: any) => b.isRest + ":" + b.duration))).toEqual([["true:1"], ["true:1"]]);
    });
    it("writes 16ths, dotted values and triplets", () => {
        const s16 = parse(toDrumAlphaTex([n(42, 0), n(42, 0.25), n(42, 0.5), n(42, 0.75), n(38, 1), n(38, 1.75)], { bpm: 120 }).tex);
        expect(s16.staff.bars[0].voices[0].beats.slice(0, 6).map((b: any) => b.duration + (b.dots ? "." : ""))).toEqual(["16", "16", "16", "16", "8.", "16"]);
        const trip = parse(toDrumAlphaTex([0, 1, 2, 3, 4, 5].map(i => n(38, i / 3)), { bpm: 120 }).tex);
        const tb = trip.staff.bars[0].voices[0].beats;
        expect(tb.slice(0, 6).every((b: any) => b.duration === 8 && b.tupletNumerator === 3)).toBe(true);
    });
    it("two pads on the same drum at once become one notehead", () => {
        const { staff } = parse(toDrumAlphaTex([n(38, 0), n(40, 0, 90, 0.25), n(38, 0)], { bpm: 120, override: { 40: 38 } }).tex);
        expect(staff.bars[0].voices[0].beats[0].notes.length).toBe(1);
    });
    it("ghost and accent come from velocity only when velocities vary", () => {
        const varied = [n(38, 0, 30), n(38, 1, 127), n(38, 2, 90), n(38, 3, 90), n(42, 0, 80)];
        const { staff } = parse(toDrumAlphaTex(varied, { bpm: 120 }).tex);
        const beats = staff.bars[0].voices[0].beats.filter((b: any) => !b.isRest);
        expect(beats[0].notes.find((x: any) => x.isGhost)).toBeTruthy();
        expect(beats[1].notes[0].accentuated).toBeGreaterThan(0);
        const flat = parse(toDrumAlphaTex([n(38, 0, 127), n(38, 1, 127)], { bpm: 120 }).tex);
        expect(flat.staff.bars[0].voices[0].beats[0].notes[0].accentuated).toBe(0);
    });
    it("keeps time signature and cue points", () => {
        const { score } = parse(toDrumAlphaTex([n(36, 0), n(36, 3)], { bpm: 90, timeSig: { beats: 3, type: 4 }, cues: [{ beat: 3, name: "Chorus" }] }).tex);
        expect(score.masterBars[0].timeSignatureNumerator).toBe(3);
        expect(score.masterBars[1].section?.text).toBe("Chorus");
    });
    it("6/8 groups in dotted quarters", () => {
        const { staff } = parse(toDrumAlphaTex([n(36, 0), n(38, 1.5)], { bpm: 90, timeSig: { beats: 6, type: 8 } }).tex);
        expect(staff.bars[0].voices[0].beats.map((b: any) => (b.isRest ? "r" : "") + b.duration + (b.dots ? "." : ""))).toEqual(["r4.", "4."]);
    });
    it("survives names with quotes", () => {
        parse(toDrumAlphaTex(rock, { bpm: 120, title: 'My "Kit" \\ 1' }).tex);
    });
});

describe("drum payload", () => {
    it("skips fingering and keeps every hit", () => {
        const p = buildDrumPayload("t", "Drums", rock, 120)!;
        expect(isDrumPayload(p)).toBe(true);
        expect(p.noteCount).toBe(rock.length);
        expect(p.instrument).toBeUndefined();
        expect(p.drum.pieces.map(x => x.pitch)).toEqual([42, 38, 36]);
        parse(p.drum.tex);
    });
    it("guitar payloads are unchanged (no drum field)", () => {
        const g = buildPayload("g", "Gtr", [n(40, 0, 100, 1), n(45, 1, 100, 1)], 120)!;
        expect(isDrumPayload(g)).toBe(false);
    });
    it("name heuristic is narrow", () => {
        expect(looksLikeDrums("Drums", rock)).toBe(true);
        expect(looksLikeDrums("Lead Guitar", rock)).toBe(false);
        expect(looksLikeDrums("Drums", [40, 45, 50, 55, 59, 64].map((p, i) => n(p + 12, i)))).toBe(false);
    });
});
