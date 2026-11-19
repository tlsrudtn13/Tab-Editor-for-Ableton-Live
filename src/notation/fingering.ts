import type { Note } from "./types.js";
import type { InstrumentConfig } from "./instruments.js";
import { applyGreedyVoicing } from "./voicing.js";

type Pos = { s: number; f: number };
type Candidate = { positions: Pos[]; costs: number[] };
type Group = { indices: number[]; beat: number; candidates: Candidate[] };
type PartialCandidate = { positions: Pos[]; used: Set<number>; score: number };

const CHORD_TOL = 0.0625;
const MAX_CANDIDATES = 64;
const POSITION_COUNT = 20;
const INF = Number.POSITIVE_INFINITY;

function positions(pitch: number, instrument: InstrumentConfig): Pos[] {
    const out: Pos[] = [];
    for (let s = 1; s <= instrument.stringCount; s++) {
        const open = instrument.open[s];
        if (open === undefined) continue;
        const f = pitch - open;
        if (f >= 0 && f <= 24) out.push({ s, f });
    }
    return out;
}

/** Prefer low positions: 0.02 per fret, plus 0.1 per fret above the 5th position. */
const POSITION_WEIGHT = 0.1;
const FREE_POSITIONS = 5;

function candidateCost(ps: Pos[], hand: number): number {
    let cost = 0.02 * hand + POSITION_WEIGHT * Math.max(0, hand - FREE_POSITIONS);
    for (const p of ps) {
        if (p.f === 0) {
            if (hand <= 5) cost -= 0.1;
        } else if (p.f >= hand && p.f <= hand + 3) {
            // Frets in the four-fret hand span have zero cost.
        } else if (p.f === hand + 4 || p.f === hand - 1) {
            cost += 2;
        } else return INF;
    }
    return cost;
}

function makeCandidates(indices: number[], sorted: Note[], instrument: InstrumentConfig): Candidate[] {
    const order = [...indices].sort((a, b) => sorted[a]!.p - sorted[b]!.p);
    let beam: PartialCandidate[] = [{ positions: [], used: new Set(), score: 0 }];
    for (const idx of order) {
        const note = sorted[idx]!;
        const choices = positions(note.p, instrument).filter(p => !note.lock || (p.s === note.s && p.f === note.f));
        if (!choices.length) return [];
        const next: PartialCandidate[] = [];
        for (const item of beam) for (const p of choices) {
            if (item.used.has(p.s)) continue;
            const used = new Set(item.used); used.add(p.s);
            next.push({ positions: [...item.positions, p], used, score: item.score + p.f + p.s * 0.001 });
        }
        next.sort((a, b) => a.score - b.score);
        beam = next.slice(0, MAX_CANDIDATES);
        if (!beam.length) return [];
    }
    const hasLocked = indices.some(i => sorted[i]!.lock);
    // Drop shapes no hand position can play (e.g. a high note over two open-position bass notes):
    // they would break the Viterbi chain. If none is left, the caller falls back to greedy voicing.
    // If the group has locked notes, keep candidates with a large finite cost instead of dropping them.
    return beam.map(item => {
        let costs = Array.from({ length: POSITION_COUNT }, (_, p) => candidateCost(item.positions, p + 1));
        if (hasLocked && !costs.some(v => Number.isFinite(v))) costs = costs.map(() => 1e6);
        return { positions: item.positions, costs };
    }).filter(c => c.costs.some(v => Number.isFinite(v)));
}

/** Fixed cost of any hand shift, on top of `scale` per fret moved. */
const SHIFT_BASE = 1.5;

function fallbackWithLocks(groupNotes: Note[], instrument: InstrumentConfig): Note[] {
    const result = groupNotes.map(n => ({ ...n }));
    const used = new Set<number>();
    const lockedIdx = result.map((n, i) => n.lock ? i : -1).filter(i => i >= 0);
    const unlockedIdx = result.map((n, i) => !n.lock ? i : -1).filter(i => i >= 0);
    for (const i of lockedIdx) {
        const n = result[i]!;
        if (typeof n.s === "number") used.add(n.s);
        if (n.oor === undefined) n.oor = undefined;
    }
    const unlocked = unlockedIdx.map(i => result[i]!);
    const voiced = applyGreedyVoicing(unlocked, instrument, used);
    unlockedIdx.forEach((i, j) => {
        const v = voiced[j]!;
        result[i] = { ...v, lock: result[i]!.lock };
    });
    // ensure locked notes keep exact s/f even if something odd happened
    for (const i of lockedIdx) {
        const orig = groupNotes[i]!;
        result[i] = { ...result[i]!, s: orig.s, f: orig.f, lock: true };
        if (orig.oor !== undefined) result[i]!.oor = orig.oor;
        else if (result[i]!.oor === undefined) delete result[i]!.oor;
    }
    return result;
}

function l1(values: number[], scale: number): { costs: number[]; sources: number[] } {
    const costs = values.slice();
    const sources = values.map((_, i) => i);
    for (let i = 1; i < costs.length; i++) {
        if (costs[i - 1]! + scale < costs[i]!) {
            costs[i] = costs[i - 1]! + scale;
            sources[i] = sources[i - 1]!;
        }
    }
    for (let i = costs.length - 2; i >= 0; i--) {
        if (costs[i + 1]! + scale < costs[i]!) {
            costs[i] = costs[i + 1]! + scale;
            sources[i] = sources[i + 1]!;
        }
    }
    // Staying put is free; moving anywhere else also pays SHIFT_BASE.
    for (let i = 0; i < costs.length; i++) {
        if (sources[i] !== i) {
            const moved = costs[i]! + SHIFT_BASE * scale;
            if (values[i]! <= moved) { costs[i] = values[i]!; sources[i] = i; }
            else costs[i] = moved;
        }
    }
    return { costs, sources };
}

/** A lock only holds while its string exists and string + fret still give the note's pitch
 *  (after a change of instrument, tuning or transpose it would show a wrong fret). */
function lockFits(n: Note, instrument: InstrumentConfig): boolean {
    const s = n.s, f = n.f;
    return typeof s === "number" && typeof f === "number" && s >= 1 && s <= instrument.stringCount
        && instrument.open[s]! + f === n.p;
}

export function assignFingering(notes: Note[], instrument: InstrumentConfig): Note[] {
    if (!notes.length) return notes;
    notes = notes.map(n => {
        if (!n.lock || lockFits(n, instrument)) return n;
        const { lock: _drop, ...rest } = n;
        return rest as Note;
    });
    const sorted = [...notes].sort((a, b) => a.b !== b.b ? a.b - b.b : b.p - a.p);
    const result = [...sorted];
    const groups: Group[] = [];
    for (let i = 0; i < sorted.length;) {
        const beat = sorted[i]!.b, indices = [i];
        let j = i + 1;
        while (j < sorted.length && sorted[j]!.b - beat <= CHORD_TOL) indices.push(j++);
        groups.push({ indices, beat, candidates: [] }); i = j;
    }
    for (const group of groups) {
        const original = group.indices.slice();
        const valid = group.indices.filter(i => positions(sorted[i]!.p, instrument).length > 0);
        if (valid.length !== group.indices.length) {
            const placed = fallbackWithLocks(group.indices.map(i => sorted[i]!), instrument);
            group.indices.forEach((i, j) => { result[i] = placed[j]!; });
        }
        if (!valid.length) { group.indices = []; group.candidates = []; continue; }
        if (valid.length > instrument.stringCount) {
            const placed = fallbackWithLocks(valid.map(i => sorted[i]!), instrument);
            valid.forEach((i, j) => { result[i] = placed[j]!; });
            group.indices = []; group.candidates = []; continue;
        }
        group.indices = valid; // candidates cover only the playable notes
        group.candidates = makeCandidates(valid, sorted, instrument);
        if (!group.candidates.length) {
            const placed = fallbackWithLocks(valid.map(i => sorted[i]!), instrument);
            valid.forEach((i, j) => { result[i] = placed[j]!; });
        }
    }

    const active = groups.filter(g => g.candidates.length);
    if (!active.length) return result;
    const back: number[][][] = [], history: number[][][] = [];
    let states: number[][] = [], prevCandidates: Candidate[] = [];
    for (let gi = 0; gi < active.length; gi++) {
        const group = active[gi]!;
        const next = group.candidates.map(() => Array(POSITION_COUNT).fill(INF) as number[]);
        const links = group.candidates.map(() => Array(POSITION_COUNT).fill(-1) as number[]);
        if (gi === 0) {
            group.candidates.forEach((c, ci) => c.costs.forEach((v, p) => { next[ci]![p] = v; }));
        } else {
            const scale = group.beat - active[gi - 1]!.beat >= 2 ? 0.5 : 1;
            const singles = group.candidates.every(c => c.positions.length === 1) && prevCandidates.every(c => c.positions.length === 1);
            if (singles) {
                const transforms = states.map(row => l1(row, scale));
                group.candidates.forEach((c, ci) => {
                    const open = c.positions[0]!.f === 0;
                    for (let p = 0; p < POSITION_COUNT; p++) {
                        let best = INF, link = -1;
                        for (let pi = 0; pi < prevCandidates.length; pi++) {
                            const t = transforms[pi]!;
                            const q = open ? p : t.sources[p]!;
                            const jump = open ? 0 : Math.abs(c.positions[0]!.s - prevCandidates[pi]!.positions[0]!.s) * 0.5;
                            const value = (open ? states[pi]![p]! : t.costs[p]!) + jump;
                            if (value < best) { best = value; link = pi * POSITION_COUNT + q; }
                        }
                        if (link >= 0 && Number.isFinite(c.costs[p]!)) {
                            next[ci]![p] = best + c.costs[p]!;
                            links[ci]![p] = link;
                        }
                    }
                });
            } else {
                const atPosition = Array.from({ length: POSITION_COUNT }, (_, p) => {
                    let best = INF, ciBest = -1;
                    for (let ci = 0; ci < prevCandidates.length; ci++) if (states[ci]![p]! < best) {
                        best = states[ci]![p]!; ciBest = ci;
                    }
                    return { best, ciBest };
                });
                const transformed = l1(atPosition.map(x => x.best), scale);
                group.candidates.forEach((c, ci) => {
                    const open = c.positions.every(p => p.f === 0);
                    for (let p = 0; p < POSITION_COUNT; p++) {
                        const q = open ? p : transformed.sources[p]!;
                        const prior = atPosition[q]!;
                        if (prior.ciBest < 0 || !Number.isFinite(c.costs[p]!)) continue;
                        next[ci]![p] = (open ? prior.best : transformed.costs[p]!) + c.costs[p]!;
                        links[ci]![p] = prior.ciBest * POSITION_COUNT + q;
                    }
                });
            }
        }
        back.push(links); history.push(next); states = next; prevCandidates = group.candidates;
    }
    // Best (candidate, position) of one group's states; ci = -1 if every state is unreachable.
    const argmin = (rows: number[][]) => {
        let ci = -1, pi = -1, best = INF;
        for (let c = 0; c < rows.length; c++) for (let p = 0; p < POSITION_COUNT; p++) {
            const value = rows[c]![p]!;
            if (value < best) { best = value; ci = c; pi = p; }
        }
        return { ci, pi };
    };
    let { ci, pi } = argmin(states);
    for (let gi = active.length - 1; gi >= 0; gi--) {
        const group = active[gi]!;
        // Broken link (should not happen): restart from this group's own best state.
        if (ci < 0 || !group.candidates[ci]) ({ ci, pi } = argmin(history[gi]!));
        const chosen = group.candidates[ci] ?? group.candidates[0]!;
        const ordered = [...group.indices].sort((a, b) => sorted[a]!.p - sorted[b]!.p);
        ordered.forEach((idx, j) => { result[idx] = { ...sorted[idx]!, s: chosen.positions[j]!.s, f: chosen.positions[j]!.f, oor: undefined }; });
        if (gi > 0) {
            const link = pi >= 0 ? back[gi]![ci]?.[pi] ?? -1 : -1;
            if (link >= 0) { ci = Math.floor(link / POSITION_COUNT); pi = link % POSITION_COUNT; }
            else { ci = -1; pi = -1; }
        }
    }
    return result;
}
