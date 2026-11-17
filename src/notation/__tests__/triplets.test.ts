import { describe, it, expect } from "vitest";
import type { Note } from "../types.js";
import { detectQuantizeGrid, keyFromLiveScale, detectKey } from "../music.js";
import { toMusicXml } from "../toMusicXml.js";
import { GUITAR_6 } from "../instruments.js";
import { applyGuitarVoicing } from "../voicing.js";

function n(b: number, p: number, d = 0.5, v = 100): Note {
    return { b, d, p, v, f: 0, s: 1, src: "ses", clip: "t" };
}

describe("triplet detection", () => {
    it("8th triplets -> 12", () => {
        const trip = [0, 1/3, 2/3, 1, 4/3, 5/3].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(trip)).toBe(12);
    });
    it("16th triplets -> 24", () => {
        const trip = [0, 1/6, 1/3, 1/2, 2/3, 5/6].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(trip)).toBe(24);
    });
    it("straight 8ths -> 8", () => {
        expect(detectQuantizeGrid([n(0, 60), n(0.5, 62)])).toBe(8);
    });
    it("dotted 8ths -> 16", () => {
        const dotted = [0, 0.75, 1.5, 2.25, 3].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(dotted)).toBe(16);
    });
    it("swing-ish humanised triplets +-0.03 -> 12", () => {
        const trip = [0, 0.36, 0.65, 1.02, 1.31, 1.68].map((b, i) => n(b, 60 + i));
        expect(detectQuantizeGrid(trip)).toBe(12);
    });
});

describe("triplet MusicXML", () => {
    it("one bar of 8th triplets", () => {
        const notes = Array.from({ length: 12 }, (_, i) => n(i / 3, 60 + (i % 7), 1 / 3));
        const voiced = applyGuitarVoicing(notes, GUITAR_6);
        const xml = toMusicXml(voiced, 120, { instrument: GUITAR_6, skipVoicing: true });
        expect(xml).toContain("<divisions>12</divisions>");
        expect((xml.match(/<time-modification>/g) ?? []).length).toBe(12);
        expect((xml.match(/<tuplet type="start" bracket="yes"\/>/g) ?? []).length).toBe(4);
        expect((xml.match(/<tuplet type="stop"\/>/g) ?? []).length).toBe(4);
    });
    it("quarter + triplet 8ths adds to 48 units", () => {
        // quarter note then three triplet 8ths = 12 + 3*4 = 24? need 48 total -> two groups
        const notes = [
            n(0, 60, 1),
            n(1, 62, 1/3), n(1 + 1/3, 64, 1/3), n(1 + 2/3, 65, 1/3),
            n(2, 67, 1),
            n(3, 69, 1/3), n(3 + 1/3, 71, 1/3), n(3 + 2/3, 72, 1/3),
        ];
        const voiced = applyGuitarVoicing(notes, GUITAR_6);
        const xml = toMusicXml(voiced, 120, { instrument: GUITAR_6, skipVoicing: true });
        // measure 1 duration sum check: parse first measure durations
        const m1 = xml.split("<measure ")[1]?.split("</measure>")[0] ?? "";
        const durs = [...m1.matchAll(/<duration>(\d+)<\/duration>/g)].map(m => Number(m[1]));
        const sum = durs.reduce((a, b) => a + b, 0);
        expect(sum).toBe(48);
    });
});

describe("keyFromLiveScale", () => {
    it("A minor", () => {
        expect(keyFromLiveScale(9, "Minor")).toEqual({ fifths: 0, mode: "minor" });
    });
    it("G major", () => {
        expect(keyFromLiveScale(7, "Major")).toEqual({ fifths: 1, mode: "major" });
    });
    it("D dorian -> parent C major fifths 0", () => {
        expect(keyFromLiveScale(2, "Dorian")).toEqual({ fifths: 0, mode: "major" });
    });
});

describe("detectKey confidence", () => {
    it("6-note riff -> C major", () => {
        const riff = [40, 43, 45, 47].map((p, i) => n(i, p)); // 4 notes
        // pad? keep <8
        expect(detectKey(riff).fifths).toBe(0);
    });
    it("G major scale 16 notes -> fifths 1", () => {
        const scale = [67,69,71,72,74,76,78,79, 79,78,76,74,72,71,69,67].map((p,i)=>n(i,p));
        expect(detectKey(scale).fifths).toBe(1);
    });
});