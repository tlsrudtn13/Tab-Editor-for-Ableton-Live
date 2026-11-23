import { describe, it, expect } from "vitest";
import { cleanupNotes, type RawNote } from "../midiCleanup.js";

function rn(b: number, d: number, p: number, v = 100): RawNote {
    return { b, d, p, v };
}

describe("cleanupNotes", () => {
    it("drops too-short and too-quiet notes", () => {
        const input = [rn(0, 0.03, 60, 100), rn(0.5, 0.5, 62, 5), rn(1, 0.5, 64, 80)];
        const out = cleanupNotes(input);
        expect(out.notes).toEqual([rn(1, 0.5, 64, 80)]);
        expect(out.removed).toBe(2);
    });

    it("merges same-pitch fragments within gap", () => {
        const input = [rn(0, 0.98, 64), rn(1.0, 1.0, 64)];
        const out = cleanupNotes(input);
        expect(out.merged).toBe(1);
        expect(out.notes).toHaveLength(1);
        expect(out.notes[0]).toMatchObject({ b: 0, d: 2, p: 64 });
    });

    it("keeps fragments apart when gap is larger than mergeGap", () => {
        const input = [rn(0, 0.98, 64), rn(1.0, 1.0, 64)];
        const out = cleanupNotes(input, { mergeGap: 0.01 });
        expect(out.merged).toBe(0);
        expect(out.notes).toHaveLength(2);
    });

    it("keeps the longer duplicate at same start", () => {
        const input = [rn(1, 0.25, 60, 90), rn(1, 0.5, 60, 80)];
        const out = cleanupNotes(input);
        expect(out.removed).toBe(1);
        expect(out.notes).toEqual([rn(1, 0.5, 60, 80)]);
    });

    it("moves notes into range by whole octaves", () => {
        const input = [rn(0, 0.5, 88), rn(0.5, 0.5, 30)];
        const out = cleanupNotes(input, { low: 40, high: 76 });
        expect(out.notes.map(n => ({ b: n.b, p: n.p }))).toEqual([
            { b: 0, p: 76 },
            { b: 0.5, p: 42 },
        ]);
        expect(out.moved).toBe(2);
    });

    it("fixes isolated octave jump", () => {
        const input = [rn(0, 0.5, 60), rn(0.5, 0.5, 62), rn(1, 0.5, 76), rn(1.5, 0.5, 64)];
        const out = cleanupNotes(input);
        expect(out.notes.map(n => n.p)).toEqual([60, 62, 64, 64]);
        expect(out.moved).toBe(1);
    });

    it("never octave-moves a chord note", () => {
        const input = [
            rn(0, 0.5, 60), rn(0.5, 0.5, 62),
            rn(1, 0.5, 76), rn(1, 0.5, 64), // overlapping chord at 1.0
            rn(1.5, 0.5, 64),
        ];
        const out = cleanupNotes(input);
        expect(out.notes.find(n => n.b === 1 && n.p === 76)).toBeTruthy();
    });

    it("quantizes start/end and enforces minimum grid length", () => {
        const input = [rn(1.02, 0.47, 60), rn(2.01, 0.01, 62, 100)];
        const out = cleanupNotes(input, { quantize: 16, minDur: 0 });
        const a = out.notes.find(n => n.p === 60)!;
        const b = out.notes.find(n => n.p === 62)!;
        expect(a.b).toBe(1);
        expect(a.d).toBe(0.5);
        expect(b.b).toBe(2);
        expect(b.d).toBe(0.25);
    });

    it("does not mutate input array or objects", () => {
        const input = [rn(0, 0.98, 64), rn(1.0, 1.0, 64)];
        const copy = input.map(n => ({ ...n }));
        cleanupNotes(input, { quantize: 16 });
        expect(input).toEqual(copy);
    });
});
