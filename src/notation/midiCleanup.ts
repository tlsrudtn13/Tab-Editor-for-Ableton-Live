import { quantizeBeat } from "./music.js";
import type { QuantizeGrid } from "./types.js";

export type RawNote = { b: number; d: number; p: number; v: number };

export type CleanupOpts = {
    minDur?: number;      // default 0.0625 beats
    minVel?: number;      // default 12
    mergeGap?: number;    // default 0.03125 beats
    low?: number; high?: number;  // instrument range, optional
    octaveFix?: boolean;  // default true
    quantize?: QuantizeGrid | 0;  // default 0 = off
};

export type CleanupResult = { notes: RawNote[]; removed: number; merged: number; moved: number };

const EPS = 1e-6;

function cloneNote(n: RawNote): RawNote {
    return { b: n.b, d: n.d, p: n.p, v: n.v };
}

function round6(x: number): number {
    return Math.round(x * 1e6) / 1e6;
}

function sortNotes(notes: RawNote[]): RawNote[] {
    return notes.sort((a, b) => (a.b - b.b) || (a.p - b.p));
}

function overlaps(a: RawNote, b: RawNote): boolean {
    return a.b < b.b + b.d - EPS && b.b < a.b + a.d - EPS;
}

function isIsolated(note: RawNote, notes: RawNote[]): boolean {
    for (const other of notes) {
        if (other === note) continue;
        if (overlaps(note, other)) return false;
    }
    return true;
}

function dedupeExact(notes: RawNote[], removedRef: { n: number }): RawNote[] {
    // same p, |Δb| < 1e-6: keep the longer, count the other in removed
    const out: RawNote[] = [];
    const byPitch = new Map<number, RawNote[]>();
    for (const n of notes) {
        const arr = byPitch.get(n.p);
        if (arr) arr.push(n); else byPitch.set(n.p, [n]);
    }
    for (const group of byPitch.values()) {
        group.sort((a, b) => a.b - b.b);
        const kept: RawNote[] = [];
        for (const n of group) {
            const dup = kept.find(k => Math.abs(k.b - n.b) < EPS);
            if (!dup) {
                kept.push(n);
            } else if (n.d > dup.d + EPS) {
                // replace dup with n
                const idx = kept.indexOf(dup);
                kept[idx] = n;
                removedRef.n++;
            } else {
                removedRef.n++;
            }
        }
        out.push(...kept);
    }
    return out;
}

export function cleanupNotes(notes: RawNote[], opts: CleanupOpts = {}): CleanupResult {
    const minDur = opts.minDur ?? 0.0625;
    const minVel = opts.minVel ?? 12;
    const mergeGap = opts.mergeGap ?? 0.03125;
    const octaveFix = opts.octaveFix ?? true;
    const quantize = opts.quantize ?? 0;
    const hasRange = typeof opts.low === "number" && typeof opts.high === "number";
    const low = opts.low as number;
    const high = opts.high as number;

    let removed = 0;
    let merged = 0;
    let moved = 0;

    // Step 1: do not mutate input; drop notes with d < minDur or v < minVel
    let cur: RawNote[] = [];
    for (const n of notes) {
        if (n.d < minDur || n.v < minVel) {
            removed++;
        } else {
            cur.push(cloneNote(n));
        }
    }

    // Step 2: exact duplicates (same p, |Δb| < 1e-6): keep the longer
    const remRef = { n: 0 };
    cur = dedupeExact(cur, remRef);
    removed += remRef.n;

    // Step 3: merge same-pitch fragments
    {
        const byPitch = new Map<number, RawNote[]>();
        for (const n of cur) {
            const arr = byPitch.get(n.p);
            if (arr) arr.push(n); else byPitch.set(n.p, [n]);
        }
        const mergedOut: RawNote[] = [];
        for (const group of byPitch.values()) {
            group.sort((a, b) => a.b - b.b);
            let i = 0;
            while (i < group.length) {
                const prev = cloneNote(group[i]!);
                i++;
                while (i < group.length) {
                    const next = group[i]!;
                    const gap = next.b - (prev.b + prev.d);
                    if (gap <= mergeGap && gap >= -EPS) {
                        const prevEnd = prev.b + prev.d;
                        const nextEnd = next.b + next.d;
                        prev.d = Math.max(prevEnd, nextEnd) - prev.b;
                        prev.v = Math.max(prev.v, next.v);
                        merged++;
                        i++;
                    } else {
                        break;
                    }
                }
                mergedOut.push(prev);
            }
        }
        cur = mergedOut;
    }

    // Step 4: range fix
    if (hasRange) {
        for (const n of cur) {
            if (n.p >= low && n.p <= high) continue;
            const rangeWidth = high - low;
            let target = n.p;
            if (target < low) {
                while (target < low) target += 12;
                if (target > high) {
                    // cannot fit if range narrower than an octave and it cannot fit
                    if (rangeWidth < 12) continue;
                    // try to find any octave that fits
                    let found: number | null = null;
                    for (let t = n.p; t <= high; t += 12) {
                        if (t >= low && t <= high) { found = t; break; }
                    }
                    if (found == null) continue;
                    target = found;
                }
            } else if (target > high) {
                while (target > high) target -= 12;
                if (target < low) {
                    if (rangeWidth < 12) continue;
                    let found: number | null = null;
                    for (let t = n.p; t >= low; t -= 12) {
                        if (t >= low && t <= high) { found = t; break; }
                    }
                    if (found == null) continue;
                    target = found;
                }
            }
            if (target !== n.p) {
                n.p = target;
                moved++;
            }
        }
    }

    // Step 5: octave-jump fix
    if (octaveFix) {
        const ordered = sortNotes(cur.slice());
        // determine isolation based on current set
        const isolatedFlags = ordered.map(n => isIsolated(n, ordered));
        const toMove: Array<{ note: RawNote; newP: number }> = [];
        for (let i = 0; i < ordered.length; i++) {
            if (!isolatedFlags[i]) continue;
            const prevIdx = i - 1;
            const nextIdx = i + 1;
            if (prevIdx < 0 || nextIdx >= ordered.length) continue;
            if (!isolatedFlags[prevIdx] || !isolatedFlags[nextIdx]) continue;
            const note = ordered[i]!;
            const prev = ordered[prevIdx]!;
            const next = ordered[nextIdx]!;
            if (Math.abs(note.p - prev.p) < 12 || Math.abs(note.p - next.p) < 12) continue;
            for (const delta of [12, -12]) {
                const np = note.p + delta;
                if (hasRange && (np < low || np > high)) continue;
                if (Math.abs(np - prev.p) <= 7 && Math.abs(np - next.p) <= 7) {
                    toMove.push({ note, newP: np });
                    break;
                }
            }
        }
        for (const m of toMove) {
            if (m.note.p !== m.newP) {
                m.note.p = m.newP;
                moved++;
            }
        }
    }

    // Step 6: quantize
    if (quantize > 0) {
        const grid = quantize as QuantizeGrid;
        const step = 4 / grid;
        for (const n of cur) {
            const start = quantizeBeat(n.b, grid);
            let end = quantizeBeat(n.b + n.d, grid);
            if (end <= start) end = start + step;
            n.b = start;
            n.d = end - start;
        }
        const remRef2 = { n: 0 };
        cur = dedupeExact(cur, remRef2);
        removed += remRef2.n;
    }

    // Step 7: output sorted by b, then p; round b,d to 1e-6
    sortNotes(cur);
    const outNotes = cur.map(n => ({ b: round6(n.b), d: round6(n.d), p: n.p, v: n.v }));
    return { notes: outNotes, removed, merged, moved };
}
