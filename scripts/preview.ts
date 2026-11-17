// Builds dist-ui/preview.html: the built webview with sample tracks injected
// the same way src/extension.ts does it, so the UI can be checked in a
// normal browser without Ableton Live.
//   npm run build:ui && npx tsx scripts/preview.ts
import fs from "node:fs";
import type { Note, TrackPayload } from "../src/notation/index.js";
import { detectQuantizeGrid, quantizeBeat } from "../src/notation/music.js";
import { applyGuitarVoicing } from "../src/notation/voicing.js";
import { toMusicXml } from "../src/notation/toMusicXml.js";
import { toAlphaTex } from "../src/notation/toAlphaTex.js";
import { DEFAULT_INSTRUMENT } from "../src/notation/instruments.js";
import { buildDrumPayload } from "../src/notation/drumPayload.js";
import { DRUM_FIXTURES } from "../src/dev/fixtures.js";

function n(b: number, p: number, d = 0.5, v = 100): Note {
    return { b, d, p, v, f: 0, s: 1, src: "ses", clip: "demo" };
}

// Same pipeline as buildPayload() in src/extension.ts
function payload(id: string, name: string, notes: Note[], bpm: number): TrackPayload {
    const grid = detectQuantizeGrid(notes);
    const q = notes.map(x => ({ ...x, b: quantizeBeat(x.b, grid) }));
    const tab = applyGuitarVoicing(q, DEFAULT_INSTRUMENT)
        .filter(x => x.s >= 1 && x.s <= DEFAULT_INSTRUMENT.stringCount && x.f >= 0);
    return {
        id, name, noteCount: tab.length, notes: tab, instruments: DEFAULT_INSTRUMENT, bpm,
        musicXml: toMusicXml(tab, bpm, { instrument: DEFAULT_INSTRUMENT, skipVoicing: true }),
        alphaTex: toAlphaTex(tab, { bpm }),
    };
}

const riff: Note[] = [];
for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4;
    [40, 40, 43, 45, 40, 40, 47, 45].forEach((p, i) => riff.push(n(o + i * 0.5, p, 0.5, i % 2 ? 80 : 110)));
}
const chords: Note[] = [];
const prog = [[40, 47, 52, 56, 59, 64], [45, 52, 57, 61, 64], [50, 57, 62, 66], [43, 47, 50, 55, 59, 67]];
prog.forEach((c, i) => c.forEach(p => chords.push(n(i * 4, p, 4, 90))));
const melody = [64, 67, 69, 71, 72, 71, 69, 67, 76, 74, 72, 71].map((p, i) => n(i * 0.75, p, 0.75));

const tracks = [
    payload("t1", "Riff", riff, 120),
    payload("t2", "Chords", chords, 120),
    payload("t3", "Melody", melody, 96),
    ...DRUM_FIXTURES.map((fx, i) => buildDrumPayload("d" + i, fx.name, fx.notes.map(x => n(x.startTime, x.pitch, x.duration, x.velocity)), 110,
        undefined, { hints: { 36: "Kick 808", 38: "Snare Tight" } })!),
];

const html = fs.readFileSync("dist-ui/index.html", "utf-8");
const json = JSON.stringify(tracks).replace(/<\/script/gi, "<\\/script");
fs.writeFileSync("dist-ui/preview.html", html.replace("<head>", `<head><script>window.tracks=${json};</script>`));
console.log("wrote dist-ui/preview.html", tracks.map(t => `${t.name}:${t.noteCount}`).join(" "));
