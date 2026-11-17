import type { Note, Tech } from "./types.js";

export const TECHS: Tech[] = ["lr", "pm", "hp", "sl", "x", "vb"];

export function hasTech(n: Note, t: Tech): boolean {
    return n.tech?.includes(t) ?? false;
}

export function toggleTech(n: Note, t: Tech): Note {
    const order = new Map(TECHS.map((tech, i) => [tech, i]));
    const set = new Set(n.tech ?? []);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    const tech = [...set].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
    return { ...n, tech };
}

/**
 * Detect indices of notes that should display let ring automatically.
 *
 * A note qualifies when it is still sounding (b + d) at least 0.25 beat after the onset of a
 * later note on a different pitch whose onset is >= 0.1 beat after its own (an arpeggio overlap).
 *
 * Only runs matter: return a qualifying note only if it is part of a chain of >= 3 consecutive
 * notes (by onset) that all qualify or are ringing into each other; a single sustained pedal note
 * under a melody does not count unless 3 overlapping onsets form the chain. Notes whose tech is
 * defined (user decided, including []) are never returned. O(n log n).
 */
export function detectLetRing(notes: Note[]): Set<number> {
    const n = notes.length;
    if (n < 3) return new Set();

    const order = [...notes.keys()].sort((a, b) => notes[a]!.b - notes[b]!.b || notes[a]!.p - notes[b]!.p);

    const qualifies = new Array<boolean>(n).fill(false);
    for (let oi = 0; oi < order.length; oi++) {
        const i = order[oi]!;
        const ni = notes[i]!;
        if (ni.tech !== undefined) continue;
        const end = ni.b + ni.d;
        for (let oj = oi + 1; oj < order.length; oj++) {
            const j = order[oj]!;
            const nj = notes[j]!;
            if (nj.b >= end) break;
            if (nj.b < ni.b + 0.1) continue;
            if (nj.p === ni.p) continue;
            if (end >= nj.b + 0.25) {
                qualifies[i] = true;
                break;
            }
        }
    }

    // adjacent onset notes "ringing into each other": previous sustains over next onset
    const ringsInto = (prevIdx: number, curIdx: number): boolean => {
        const a = notes[prevIdx]!;
        const b = notes[curIdx]!;
        return b.b >= a.b + 0.1 && b.p !== a.p && a.b + a.d >= b.b + 0.25;
    };

    const inChain = new Array<boolean>(n).fill(false);
    let k = 0;
    while (k < order.length) {
        let l = k + 1;
        while (l < order.length) {
            const prev = order[l - 1]!;
            const cur = order[l]!;
            if (!ringsInto(prev, cur)) break;
            l++;
        }
        if (l - k >= 3) {
            for (let m = k; m < l; m++) inChain[order[m]!] = true;
        }
        k = l;
    }

    const out = new Set<number>();
    for (let i = 0; i < n; i++) {
        if (inChain[i] && qualifies[i] && notes[i]!.tech === undefined) out.add(i);
    }
    return out;
}
