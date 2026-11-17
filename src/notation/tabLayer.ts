import { BEND_AMOUNTS, type BendAmount, type Note, type Tech, type TimeSig } from "./types.js";
import type { InstrumentConfig } from "./instruments.js";
import { TECHS } from "./techniques.js";

type LayerNote = { h: string; s: number; f: number; t?: Tech[]; bd?: BendAmount; k?: 0 };

export type TabLayer = {
    v: 1;
    instrument: string;
    capo: number;
    timeSig?: TimeSig;
    notes: LayerNote[];
};

/** `c` (arrangement clip index) is only used to carry track-view entries to their clip; it is not stored. */
export type LayerNoteV2 = { h: string; s: number; f: number; t?: Tech[]; bd?: BendAmount; k?: 0 | 2; c?: number };
export type TabLayerV2 = {
    v: 2;
    instrument: string;
    capo: number;
    timeSig?: TimeSig;
    hint: { track: string; clip: string };
    notes: LayerNoteV2[];
};

export function layerKey(trackName: string, clipName: string): string {
    return `${trackName}\u0000${clipName}`;
}

export function noteHash(n: Note): string {
    return `${n.p}@${Math.round(n.b * 96)}`;
}

export function clipNoteHash(n: { p: number; cb: number }): string {
    return `${n.p}@${Math.round(n.cb * 96)}`;
}

const TECH_SET = new Set<string>(TECHS);

function validTechs(t: unknown): Tech[] | undefined {
    if (!Array.isArray(t)) return undefined;
    const filtered = t.filter((x): x is Tech => typeof x === "string" && TECH_SET.has(x));
    if (filtered.length === 0 && t.length > 0) return undefined;
    return filtered as Tech[];
}

export function applyLayer(notes: Note[], layer: TabLayer, instrument: InstrumentConfig): Note[] {
    const byHash = new Map(layer.notes.map(item => [item.h, item]));
    return notes.map(note => {
        const saved = byHash.get(noteHash(note));
        if (!saved) return note;
        let out: Note = note;
        const t = validTechs(saved.t);
        if (t !== undefined || (Array.isArray(saved.t) && saved.t.length === 0)) {
            out = { ...out, tech: t ?? [] };
        }
        if (BEND_AMOUNTS.includes(saved.bd as BendAmount)) out = { ...out, bend: saved.bd };
        const lockAllowed = saved.k !== 0;
        if (!lockAllowed) return out;
        if (!Number.isInteger(saved.s) || saved.s < 1 || saved.s > instrument.stringCount ||
            !Number.isInteger(saved.f) || saved.f < 0 || saved.f > 24 ||
            instrument.open[saved.s] === undefined || instrument.open[saved.s]! + saved.f !== note.p) return out;
        return { ...out, s: saved.s, f: saved.f, lock: true };
    });
}

export function layerFromNotes(
    notes: Note[], instrument: string, capo = 0, timeSig?: TimeSig
): TabLayer {
    const layerNotes: LayerNote[] = notes
        .filter(n => n.lock === true || n.tech !== undefined || n.bend !== undefined)
        .map(n => {
            const entry: LayerNote = { h: noteHash(n), s: n.s, f: n.f };
            if (n.tech !== undefined) entry.t = [...n.tech];
            if (n.bend !== undefined) entry.bd = n.bend;
            if (n.lock !== true) entry.k = 0;
            return entry;
        });
    const layer: TabLayer = { v: 1, instrument, capo, notes: layerNotes };
    if (timeSig) layer.timeSig = { ...timeSig };
    return layer;
}

export function layerV2FromNotes(
    notes: (Note & { cb?: number; c?: number })[], opts: { instrument: string; capo?: number; timeSig?: TimeSig; hint: { track: string; clip: string }; snapshot?: boolean }
): TabLayerV2 {
    const layerNotes: LayerNoteV2[] = [];
    for (const n of notes) {
        if (n.cb == null) continue;
        const include = opts.snapshot || n.lock === true || n.tech !== undefined || n.bend !== undefined;
        if (!include) continue;
        const entry: LayerNoteV2 = { h: clipNoteHash({ p: n.p, cb: n.cb }), s: n.s, f: n.f };
        if (n.tech !== undefined) entry.t = [...n.tech];
        if (n.bend !== undefined) entry.bd = n.bend;
        if (typeof n.c === "number") entry.c = n.c;
        if (n.lock === true) {
            // user lock: k absent
        } else if (opts.snapshot) {
            entry.k = 2;
        } else {
            entry.k = 0;
        }
        layerNotes.push(entry);
    }
    const layer: TabLayerV2 = { v: 2, instrument: opts.instrument, capo: opts.capo ?? 0, hint: { ...opts.hint }, notes: layerNotes };
    if (opts.timeSig) layer.timeSig = { ...opts.timeSig };
    return layer;
}

export function applyLayerV2(notes: Note[], layer: TabLayerV2, instrument: InstrumentConfig): Note[] {
    const byHash = new Map(layer.notes.map(item => [item.h, item]));
    return notes.map(note => {
        if (note.cb == null) return note;
        const saved = byHash.get(clipNoteHash({ p: note.p, cb: note.cb }));
        if (!saved) return note;
        let out: Note = note;
        const t = validTechs(saved.t);
        if (t !== undefined || (Array.isArray(saved.t) && saved.t.length === 0)) {
            out = { ...out, tech: t ?? [] };
        }
        if (BEND_AMOUNTS.includes(saved.bd as BendAmount)) out = { ...out, bend: saved.bd };
        if (saved.k === 0) return out;
        if (!Number.isInteger(saved.s) || saved.s < 1 || saved.s > instrument.stringCount ||
            !Number.isInteger(saved.f) || saved.f < 0 || saved.f > 24 ||
            instrument.open[saved.s] === undefined || instrument.open[saved.s]! + saved.f !== note.p) return out;
        return { ...out, s: saved.s, f: saved.f, lock: true };
    });
}

export function matchClipLayer(
    candidates: { id: string; layer: TabLayerV2 }[],
    clipHashes: Set<string>,
    hint: { track: string; clip: string }
): string | undefined {
    let bestId: string | undefined;
    let bestScore = -1;
    let bestHint = false;
    let bestEntries = -1;
    for (const c of candidates) {
        const entries = c.layer.notes.length;
        if (entries === 0) {
            const same = c.layer.hint.track === hint.track && c.layer.hint.clip === hint.clip;
            if (!same) continue;
            if (bestId === undefined || (!bestHint || entries > bestEntries)) {
                bestId = c.id; bestScore = 1; bestHint = true; bestEntries = entries;
            }
            continue;
        }
        let matched = 0;
        for (const n of c.layer.notes) if (clipHashes.has(n.h)) matched++;
        if (matched < 1) continue;
        const score = matched / entries;
        if (score < 0.6) continue;
        const sameHint = c.layer.hint.track === hint.track && c.layer.hint.clip === hint.clip;
        if (
            bestId === undefined ||
            score > bestScore + 1e-12 ||
            (Math.abs(score - bestScore) < 1e-12 && sameHint && !bestHint) ||
            (Math.abs(score - bestScore) < 1e-12 && sameHint === bestHint && entries > bestEntries)
        ) {
            bestId = c.id; bestScore = score; bestHint = sameHint; bestEntries = entries;
        }
    }
    return bestId;
}
