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

export function layerKey(trackName: string, clipName: string): string {
    return `${trackName}\u0000${clipName}`;
}

export function noteHash(n: Note): string {
    return `${n.p}@${Math.round(n.b * 96)}`;
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
