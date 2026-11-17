import { describe, expect, it } from "vitest";
import { mergeClipEdits } from "../clipEdits.js";

describe("mergeClipEdits", () => {
    it("preserves untouched fields and raw timing, strips ids, and offsets edited starts", () => {
        const raw = [
            { id: 10, pitch: 60, startTime: 1.12345, duration: 0.3333, velocity: 90, probability: 0.7, muted: true },
            { id: 11, pitch: 62, startTime: 2.23456, duration: 0.5, velocity: 80 },
        ];
        const r = mergeClipEdits(raw, { changed: [{ oid: 0, pitch: 64, start: 0.25, duration: 0.75, velocity: 95 }], added: [], deleted: [] }, 4);
        expect(r.notes).toEqual([
            { pitch: 64, startTime: 4.25, duration: 0.75, velocity: 95, probability: 0.7, muted: true },
            { pitch: 62, startTime: 2.23456, duration: 0.5, velocity: 80 },
        ]);
        expect(r.stats).toEqual({ changed: 1, added: 0, deleted: 0, dropped: 0 });
    });
    it("keeps the original unquantized timing when only the pitch changed", () => {
        const raw = [{ id: 1, pitch: 60, startTime: 1.02, duration: 0.47, velocity: 90 }];
        const r = mergeClipEdits(raw, { changed: [{ oid: 0, pitch: 62, velocity: 90 }], added: [], deleted: [] }, 0);
        expect(r.notes).toEqual([{ pitch: 62, startTime: 1.02, duration: 0.47, velocity: 90 }]);
    });
    it("deletes, adds, and drops invalid pitches", () => {
        const r = mergeClipEdits([{ id: 1, pitch: 60, startTime: 0, duration: 1, velocity: 90 }], {
            changed: [], added: [
                { pitch: 64, start: 1, duration: 0.5, velocity: 100 },
                { pitch: 130, start: 2, duration: 1, velocity: 100 },
            ], deleted: [0],
        }, 2);
        expect(r.notes).toEqual([{ pitch: 64, startTime: 3, duration: 0.5, velocity: 100 }]);
        expect(r.stats).toEqual({ changed: 0, added: 1, deleted: 1, dropped: 1 });
    });
});
