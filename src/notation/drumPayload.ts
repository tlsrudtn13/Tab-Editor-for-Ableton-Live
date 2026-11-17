// ============================================================
// src/notation/drumPayload.ts — Note[] -> drum TrackPayload (view only).
// Skips guitar instrument choice, fingering and the TAB layer.
// Pure; shared by extension.ts, the dev harness and scripts/preview.ts.
// ============================================================
import type { Note, TrackPayload, TimeSig } from "./types.js";
import { detectQuantizeGrid, quantizeBeat } from "./music.js";
import { toDrumAlphaTex } from "./toDrumAlphaTex.js";
import { drumLegend, type DrumOverride, type DrumPiece, type PadHints } from "./drumMap.js";

export type DrumInfo = {
    /** AlphaTex percussion score (alphaTab renders it with api.tex) */
    tex: string;
    /** pads used, top of the staff first */
    pieces: DrumPiece[];
    override: DrumOverride;
    hints: PadHints;
    /** how the track was recognised as drums */
    source: "drum-rack" | "heuristic";
};
export type DrumPayload = TrackPayload & { drum: DrumInfo };

export function isDrumPayload(p: unknown): p is DrumPayload {
    return !!p && typeof (p as any).drum === "object" && typeof (p as any).drum?.tex === "string";
}

export type DrumPayloadOptions = {
    timeSig?: TimeSig;
    override?: DrumOverride;
    hints?: PadHints;
    source?: DrumInfo["source"];
};

export function buildDrumPayload(
    id: string, name: string, allNotes: Note[], tempo: number,
    live?: TrackPayload["live"], options: DrumPayloadOptions = {}
): DrumPayload | null {
    if (allNotes.length === 0) return null;
    const grid = detectQuantizeGrid(allNotes);
    const notes = allNotes
        .map(n => ({ ...n, b: quantizeBeat(n.b, grid), s: 0, f: 0 }))
        .sort((a, b) => a.b - b.b || a.p - b.p) as Note[];
    const timeSig = options.timeSig ?? live?.timeSig;
    const override = options.override ?? {};
    const hints = options.hints ?? {};
    const score = toDrumAlphaTex(notes, { bpm: tempo, timeSig, quantize: grid, override, hints, cues: live?.cues, title: name });
    return {
        id, name,
        noteCount: notes.length,
        notes,
        timeSig,
        bpm: tempo,
        alphaTex: score.tex,
        live,
        drum: { tex: score.tex, pieces: drumLegend(notes.map(n => n.p), override, hints), override, hints, source: options.source ?? "drum-rack" },
    };
}

/**
 * Fallback when no Drum Rack is found (e.g. a third-party drum plug-in):
 * only when most notes sit on core GM kit keys AND the track name says drums.
 * Deliberately narrow so guitar/bass tracks never switch by accident.
 */
export function looksLikeDrums(trackName: string, notes: Note[]): boolean {
    if (!/\b(drums?|kit|beat|perc(ussion)?|808|909)\b|드럼/i.test(trackName)) return false;
    if (notes.length < 4) return false;
    const core = new Set([35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55, 57, 59]);
    const onCore = notes.filter(n => core.has(n.p)).length;
    return onCore / notes.length >= 0.8;
}
