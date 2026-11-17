import { describe, it, expect } from "vitest";
import type { Note } from "../types.js";
import { assignFingering } from "../fingering.js";
import { applyGreedyVoicing } from "../voicing.js";
import { GUITAR_6, BASS_4 } from "../instruments.js";

const n = (b: number, p: number, extra: Partial<Note> = {}): Note => ({ b, d: 0.5, p, v: 100, f: 0, s: 1, src: "ses", clip: "t", ...extra });

describe("position-aware fingering", () => {
    it("keeps the open E chord in its familiar open voicing", () => {
        const out = assignFingering([40, 47, 52, 56, 59, 64].map(p => n(0, p)), GUITAR_6);
        const asc = [...out].sort((a, b) => a.p - b.p);
        expect(asc.map(x => x.f)).toEqual([0, 2, 2, 1, 0, 0]);
        expect(asc.map(x => x.s)).toEqual([6, 5, 4, 3, 2, 1]);
    });
    it("keeps an ascending run within a compact hand position", () => {
        const run = [69, 71, 72, 74, 76].map((p, i) => n(i * 0.5, p));
        const out = assignFingering(run, GUITAR_6).filter(x => x.f > 0);
        expect(Math.max(...out.map(x => x.f)) - Math.min(...out.map(x => x.f))).toBeLessThanOrEqual(4);
        const greedy = applyGreedyVoicing(run, GUITAR_6).map(x => x.f);
        expect(Math.max(...greedy) - Math.min(...greedy)).toBe(7);
    });
    it("plays the C major scale in one low position", () => {
        // Open position (2:1 2:3 1:0 …) or 5th position (3:5 3:7 …) are both standard.
        const out = assignFingering([60, 62, 64, 65, 67, 69, 71, 72].map((p, i) => n(i * 0.5, p)), GUITAR_6);
        const fretted = out.filter(x => x.f > 0).map(x => x.f);
        expect(out.every(x => x.s <= 3 && x.f <= 8)).toBe(true);
        expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
    });
    it("keeps E4-C5 melody on strings 1-2 and below fret 9", () => {
        const ps = [64, 65, 67, 69, 71, 72, 71, 69, 67, 64];
        const out = assignFingering(ps.map((p, i) => n(i * 0.5, p)), GUITAR_6);
        expect(out.every(x => x.s <= 2 && x.f <= 8)).toBe(true);
    });
    it("keeps Ode to Joy at or below fret 5", () => {
        const ps = [66, 66, 67, 69, 69, 67, 66, 64, 62, 62, 64, 66, 66, 64, 64];
        expect(assignFingering(ps.map((p, i) => n(i * 0.5, p)), GUITAR_6).every(x => x.f <= 5)).toBe(true);
    });
    it("keeps the high solo in one high box on strings 1-2", () => {
        // 1:12 … or the 17th-position box (B string 17) are both idiomatic.
        const ps = [76, 79, 81, 84, 81, 79, 76];
        const out = assignFingering(ps.map((p, i) => n(i * 0.5, p)), GUITAR_6);
        expect(out.every(x => x.s <= 2 && x.f >= 12 && x.f <= 20)).toBe(true);
    });
    it("keeps a low riff on strings 5-6 and frets at most 7", () => {
        const out = assignFingering([40, 40, 43, 45, 40, 40, 47, 45].map((p, i) => n(i * 0.5, p)), GUITAR_6);
        expect(out.every(x => x.s >= 5 && x.s <= 6 && x.f <= 7)).toBe(true);
    });
    it("uses distinct strings for playable chord tones", () => {
        const out = assignFingering([40, 47, 52, 56, 59, 64].map(p => n(0, p)), GUITAR_6);
        expect(new Set(out.map(x => x.s)).size).toBe(6);
    });
    it("preserves locked notes and adapts chord neighbors", () => {
        const out = assignFingering([n(0, 64, { s: 1, f: 0, lock: true }), n(0, 65)], GUITAR_6);
        expect(out.find(x => x.p === 64)).toMatchObject({ s: 1, f: 0 });
        expect(out.find(x => x.p === 65)!.s).not.toBe(1);
    });
    it("preserves out-of-range markings", () => {
        expect(assignFingering([n(0, 91)], GUITAR_6)[0]!.oor).toBe(1);
        const low = assignFingering([n(0, 33)], GUITAR_6)[0]!;
        expect(low.oor).toBe(2);
        expect((GUITAR_6.open[low.s]! + low.f - low.p) % 12).toBe(0);
    });
    it("keeps the bass line playable at low frets", () => {
        const out = assignFingering([28, 31, 33, 35, 33, 31, 28].map((p, i) => n(i * 0.5, p)), BASS_4);
        expect(out.every(x => x.oor === undefined && x.f <= 5)).toBe(true);
    });
    it("handles 2,000 seeded notes in under 500 ms", () => {
        let seed = 123456789;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
        const input = Array.from({ length: 2000 }, (_, i) => n(i * 0.125, 40 + Math.floor(rnd() * 49)));
        const start = performance.now();
        expect(assignFingering(input, GUITAR_6)).toHaveLength(2000);
        expect(performance.now() - start).toBeLessThan(500);
    });
});
