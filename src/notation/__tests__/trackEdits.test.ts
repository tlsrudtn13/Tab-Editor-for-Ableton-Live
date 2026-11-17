import { describe, it, expect } from "vitest";
import { collectNotes } from "../collectNotes.js";
import { splitTrackEdits } from "../trackEdits.js";
import { mergeClipEdits } from "../clipEdits.js";

const clip = (notes: any[], extra: any = {}) => ({ notes, name: "c", ...extra });

describe("track view clips", () => {
    it("places notes by start marker, keeps one loop pass, and tags the clip", () => {
        const track = {
            arrangementClips: [
                // trimmed: content shown from local beat 2
                clip([{ startTime: 0, duration: 1, pitch: 60 }, { startTime: 2, duration: 1, pitch: 62 }],
                     { startTime: 8, endTime: 10, startMarker: 2 }),
                // 4-beat loop placed for 16 beats: first pass only
                clip([{ startTime: 0, duration: 1, pitch: 64 }, { startTime: 5, duration: 1, pitch: 65 }],
                     { startTime: 16, endTime: 32, startMarker: 0, looping: true, loopEnd: 4 }),
            ],
        };
        const { arr, arrClips } = collectNotes(track);
        expect(arr.map(n => [n.b, n.p, n.cref, n.oid])).toEqual([[8, 62, 0, 1], [16, 64, 1, 0]]);
        expect(arrClips).toEqual([
            { index: 0, start: 8, end: 10, offset: 6 },
            { index: 1, start: 16, end: 20, offset: 16 },
        ]);
    });

    it("splits edits per clip and maps them back to clip time", () => {
        const spans = [{ index: 0, start: 0, end: 8, offset: 0 }, { index: 1, start: 16, end: 24, offset: 14 }];
        const refs = [{ cref: 0, oid: 0 }, { cref: 1, oid: 0 }, { cref: 1, oid: 1 }];
        const { perClip, dropped } = splitTrackEdits({
            changed: [{ oid: 1, pitch: 67, velocity: 100, start: 17 }],
            deleted: [2],
            added: [{ pitch: 60, start: 4, duration: 1, velocity: 90 }, { pitch: 61, start: 12, duration: 1, velocity: 90 }],
        }, refs, spans);
        expect(dropped).toBe(1); // the note at beat 12 is in no clip
        expect(perClip.map(c => c.cref)).toEqual([0, 1]);
        const raw1 = [{ pitch: 64, startTime: 2, duration: 1, velocity: 100 }, { pitch: 65, startTime: 4, duration: 1, velocity: 100 }];
        const merged1 = mergeClipEdits(raw1, perClip[1]!.edits, perClip[1]!.regionStart);
        expect(merged1.notes).toEqual([{ pitch: 67, startTime: 3, duration: 1, velocity: 100 }]); // 17 - 14
        const merged0 = mergeClipEdits([], perClip[0]!.edits, perClip[0]!.regionStart);
        expect(merged0.notes).toEqual([{ pitch: 60, startTime: 4, duration: 1, velocity: 90 }]);
    });
});
