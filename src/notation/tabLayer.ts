import type { Note, TimeSig } from "./types.js";
import type { InstrumentConfig } from "./instruments.js";

export type TabLayer = {
    v: 1;
    instrument: string;
    capo: number;
    timeSig?: TimeSig;
    notes: { h: string; s: number; f: number }[];
};

export function layerKey(trackName: string, clipName: string): string {
    return `${trackName}\u0000${clipName}`;
}

export function noteHash(n: Note): string {
    return `${n.p}@${Math.round(n.b * 96)}`;
}

export function applyLayer(notes: Note[], layer: TabLayer, instrument: InstrumentConfig): Note[] {
    const byHash = new Map(layer.notes.map(item => [item.h, item]));
    return notes.map(note => {
        const saved = byHash.get(noteHash(note));
        if (!saved || !Number.isInteger(saved.s) || saved.s < 1 || saved.s > instrument.stringCount ||
            !Number.isInteger(saved.f) || saved.f < 0 || saved.f > 24 ||
            instrument.open[saved.s] === undefined || instrument.open[saved.s]! + saved.f !== note.p) return note;
        return { ...note, s: saved.s, f: saved.f, lock: true };
    });
}

export function layerFromNotes(
    notes: Note[], instrument: string, capo = 0, timeSig?: TimeSig
): TabLayer {
    const layer: TabLayer = { v: 1, instrument, capo, notes: notes.filter(n => n.lock === true).map(n => ({ h: noteHash(n), s: n.s, f: n.f })) };
    if (timeSig) layer.timeSig = { ...timeSig };
    return layer;
}
