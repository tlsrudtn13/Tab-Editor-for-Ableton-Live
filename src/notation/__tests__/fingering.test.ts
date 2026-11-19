import { describe, it, expect } from "vitest";
import type { Note } from "../types.js";
import { assignFingering } from "../fingering.js";
import { applyGreedyVoicing } from "../voicing.js";
import { GUITAR_6, GUITAR_6_DROPD, BASS_4 } from "../instruments.js";

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

describe("fingering robustness", () => {
    const playable = (out: Note[], inst = GUITAR_6) =>
        out.every(x => x.s >= 1 && x.s <= inst.stringCount && x.f >= 0 && (x.oor !== undefined || inst.open[x.s]! + x.f === x.p));

    it("does not throw on a chord no single hand position can reach", () => {
        // 72 is high on the neck, 47/40 need the nut: every shape is unplayable as one position.
        const input = [n(0, 60), n(1, 72), n(1, 47), n(1, 40), n(2, 62)];
        const out = assignFingering(input, GUITAR_6);
        expect(out).toHaveLength(5);
        expect(playable(out)).toBe(true);
    });

    it("keeps string/fret aligned when a chord mixes out-of-range and playable notes", () => {
        const out = assignFingering([n(0, 30), n(0, 52), n(0, 59)], GUITAR_6);
        const byPitch = new Map(out.map(x => [x.p, x]));
        expect(GUITAR_6.open[byPitch.get(52)!.s]! + byPitch.get(52)!.f).toBe(52);
        expect(GUITAR_6.open[byPitch.get(59)!.s]! + byPitch.get(59)!.f).toBe(59);
        expect(byPitch.get(30)!.oor).toBeDefined();
    });

    it("never throws on random lines and chords (fuzz)", () => {
        let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let round = 0; round < 30; round++) {
            const input: Note[] = [];
            for (let i = 0; i < 120; i++) {
                const size = rnd() < 0.3 ? 1 + Math.floor(rnd() * 6) : 1;
                const used = new Set<number>();
                for (let k = 0; k < size; k++) {
                    const p = 28 + Math.floor(rnd() * 70);
                    if (!used.has(p)) { used.add(p); input.push(n(i * 0.25, p)); }
                }
            }
            for (const inst of [GUITAR_6, BASS_4]) {
                const out = assignFingering(input.map(x => ({ ...x })), inst);
                expect(out).toHaveLength(input.length);
                expect(playable(out, inst)).toBe(true);
            }
        }
    });
});

describe("locked fingering always wins (T008)", () => {
    it("keeps an infeasible locked chord exactly", () => {
        // 65->s3f10, 52->s6f12, 64->s4f14, 78->s2f19
        const input = [
            n(0, 65, { s: 3, f: 10, lock: true }),
            n(0, 52, { s: 6, f: 12, lock: true }),
            n(0, 64, { s: 4, f: 14, lock: true }),
            n(0, 78, { s: 2, f: 19, lock: true }),
        ];
        const out = assignFingering(input, GUITAR_6);
        const byP = new Map(out.map(x => [x.p, x]));
        expect(byP.get(65)).toMatchObject({ s: 3, f: 10, lock: true });
        expect(byP.get(52)).toMatchObject({ s: 6, f: 12, lock: true });
        expect(byP.get(64)).toMatchObject({ s: 4, f: 14, lock: true });
        expect(byP.get(78)).toMatchObject({ s: 2, f: 19, lock: true });
    });

    it("keeps locked chord inside a phrase of unlocked notes", () => {
        const chord = [
            n(1, 65, { s: 3, f: 10, lock: true }),
            n(1, 52, { s: 6, f: 12, lock: true }),
            n(1, 64, { s: 4, f: 14, lock: true }),
            n(1, 78, { s: 2, f: 19, lock: true }),
        ];
        const phrase = [
            n(0, 60), n(0.5, 62),
            ...chord,
            n(1.5, 67), n(2, 69),
        ];
        const out = assignFingering(phrase, GUITAR_6);
        const locked = out.filter(x => Math.abs(x.b - 1) < 1e-6);
        const byP = new Map(locked.map(x => [x.p, x]));
        expect(byP.get(65)).toMatchObject({ s: 3, f: 10 });
        expect(byP.get(52)).toMatchObject({ s: 6, f: 12 });
        expect(byP.get(64)).toMatchObject({ s: 4, f: 14 });
        expect(byP.get(78)).toMatchObject({ s: 2, f: 19 });
    });

    it("keeps locked note when more notes than strings", () => {
        // 7 notes on 6 strings at same beat, one locked
        const input = [
            n(0, 40), n(0, 45), n(0, 50), n(0, 55),
            n(0, 59, { s: 2, f: 0, lock: true }),
            n(0, 64), n(0, 67),
        ];
        const out = assignFingering(input, GUITAR_6);
        const locked = out.find(x => x.p === 59)!;
        expect(locked).toMatchObject({ s: 2, f: 0, lock: true });
    });
});

describe("locks that no longer fit are dropped (Fable review #1)", () => {
    const locked = () => [
        n(0, 40, { s: 6, f: 0, lock: true }),   // E2
        n(1, 45, { s: 5, f: 0, lock: true }),   // A2
        n(2, 64, { s: 1, f: 0, lock: true }),   // E4
    ];
    it("bass: no note stays on a string the bass does not have", () => {
        const out = assignFingering(locked(), BASS_4);
        for (const x of out) if (!x.oor) {
            expect(x.s).toBeLessThanOrEqual(4);
            expect(BASS_4.open[x.s!]! + x.f!).toBe(x.p);
        }
    });
    it("Drop D: low E moves to fret 2, matching locks stay", () => {
        const out = assignFingering(locked(), GUITAR_6_DROPD);
        const e2 = out.find(x => x.p === 40)!;
        expect(GUITAR_6_DROPD.open[e2.s!]! + e2.f!).toBe(40);
        expect(e2.lock).toBeFalsy();
        expect(out.find(x => x.p === 45)).toMatchObject({ s: 5, f: 0, lock: true });
    });
    it("transposed pitches are re-fingered", () => {
        const out = assignFingering(locked().map(x => ({ ...x, p: x.p + 2 })), GUITAR_6);
        for (const x of out) expect(GUITAR_6.open[x.s!]! + x.f!).toBe(x.p);
    });
});
