// ============================================================
// src/notation/toDrumAlphaTex.ts — drum notes -> AlphaTex percussion staff.
//
// Pure. Spec: docs/DRUMS.md. Rendered by alphaTab (\instrument percussion):
// noteheads, staff positions and playback keys come from alphaTab's GP7
// articulations; we only choose the articulation and the rhythm.
//   voice 1 = hands (stems up), voice 2 = feet (stems down)
//   drum rhythm: a hit lasts until the next hit in its voice, cut at the end
//   of its beat (no ties, no sustain); gaps become rests split per beat.
// ============================================================
import type { Note, TimeSig, QuantizeGrid } from "./types.js";
import { detectQuantizeGrid } from "./music.js";
import { resolveDrumPiece, type DrumOverride, type DrumPiece, type PadHints } from "./drumMap.js";

export type DrumTexOptions = {
    bpm: number;
    timeSig?: TimeSig;
    quantize?: QuantizeGrid;
    override?: DrumOverride;
    hints?: PadHints;
    cues?: { beat: number; name: string }[];
    title?: string;
};

type Val = { dur: number; dots: 0 | 1; units: number; triplet: boolean };

function valueTable(divisions: number): Val[] {
    const out: Val[] = [];
    for (const [dur, q] of [[1, 4], [2, 2], [4, 1], [8, 0.5], [16, 0.25], [32, 0.125]] as const) {
        for (const dots of [1, 0] as const) {
            const units = q * (dots ? 1.5 : 1) * divisions;
            if (Number.isInteger(units) && units >= 1) out.push({ dur, dots, units, triplet: false });
        }
    }
    if (divisions % 3 === 0) {
        for (const [dur, q] of [[4, 1], [8, 0.5], [16, 0.25]] as const) {
            const units = q * divisions * 2 / 3;
            if (Number.isInteger(units) && units >= 1) out.push({ dur, dots: 0, units, triplet: true });
        }
    }
    return out.sort((a, b) => b.units - a.units || Number(a.triplet) - Number(b.triplet));
}

function decompose(units: number, table: Val[]): Val[] {
    const out: Val[] = [];
    let rem = units;
    for (const v of table) {
        while (rem >= v.units) { out.push(v); rem -= v.units; }
        if (rem === 0) break;
    }
    return out;
}

const texDur = (v: Val) => `.${v.dur}` + (v.dots || v.triplet ? `{${[v.dots ? "d" : "", v.triplet ? "tu 3" : ""].filter(Boolean).join(" ")}}` : "");
const texStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "'")}"`;

type Hit = { art: number; v: number; snare: boolean };

/** Median velocity, used so programmed (flat) velocities give no accents/ghosts. */
function median(xs: number[]): number {
    if (!xs.length) return 100;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
}

export type DrumScore = { tex: string; pieces: DrumPiece[]; measures: number };

export function toDrumAlphaTex(notes: Note[], opts: DrumTexOptions): DrumScore {
    const ts = opts.timeSig ?? { beats: 4, type: 4 };
    const grid = opts.quantize ?? detectQuantizeGrid(notes);
    const divisions = grid === 12 || grid === 24 ? 12 : Math.max(1, Math.round(grid / 4));
    const step = Math.max(1, Math.round(divisions * 4 / grid));          // one grid step in units
    const upm = Math.round(ts.beats * (4 / ts.type) * divisions);        // units per measure
    // beat grouping: compound x/8 -> dotted quarter, other x/8 -> eighth, else denominator
    const beatUnits = ts.type === 8 ? (ts.beats % 3 === 0 && ts.beats > 3 ? divisions * 1.5 : divisions / 2)
        : Math.round(divisions * 4 / ts.type);
    const beatLen = Number.isInteger(beatUnits) && beatUnits >= 1 ? beatUnits : upm;
    const table = valueTable(divisions);

    const pieceOf = new Map<number, DrumPiece>();
    const piece = (p: number) => {
        let x = pieceOf.get(p);
        if (!x) { x = resolveDrumPiece(p, opts.override, opts.hints); pieceOf.set(p, x); }
        return x;
    };
    const med = median(notes.map(n => n.v));

    // voice -> start unit -> hits (one per articulation, loudest wins)
    const voices: [Map<number, Map<number, Hit>>, Map<number, Map<number, Hit>>] = [new Map(), new Map()];
    let lastUnit = 0;
    for (const n of notes) {
        if (!(n.b >= 0)) continue;
        let start = Math.round(n.b * divisions / step) * step;
        const bar = Math.floor((n.b * divisions + 1e-6) / upm);
        if (Math.floor(start / upm) > bar) start = (bar + 1) * upm - step;   // rounding must not cross the barline
        const pc = piece(n.p);
        const vm = voices[pc.limb === "foot" ? 1 : 0];
        let at = vm.get(start);
        if (!at) { at = new Map(); vm.set(start, at); }
        const prev = at.get(pc.articulation);
        if (!prev || n.v > prev.v) at.set(pc.articulation, { art: pc.articulation, v: n.v, snare: [37, 38, 40, 91].includes(pc.articulation) });
        lastUnit = Math.max(lastUnit, start + 1);
    }
    const measures = Math.max(1, Math.ceil(lastUnit / upm));
    const useFeet = voices[1].size > 0;

    const cuesByBar = new Map<number, string>();
    const beatsPerBar = ts.beats * 4 / ts.type;
    for (const c of opts.cues ?? []) {
        const mi = Math.floor((Number(c?.beat) || 0) / beatsPerBar);
        if (mi >= 0 && mi < measures && !cuesByBar.has(mi)) cuesByBar.set(mi, String(c.name ?? ""));
    }

    const restRun = (from: number, to: number, out: string[]) => {
        // split at beat boundaries so rests show the beat
        let pos = from;
        while (pos < to) {
            const barStart = Math.floor(pos / upm) * upm;
            const beatEnd = barStart + (Math.floor((pos - barStart) / beatLen) + 1) * beatLen;
            const seg = Math.min(to, beatEnd) - pos;
            for (const v of decompose(seg, table)) out.push("r" + texDur(v));
            pos += seg;
        }
    };
    const fullBarRest = (out: string[]) => {
        if (ts.beats === 4 && ts.type === 4) { out.push("r.1"); return; }
        for (const v of decompose(upm, table)) out.push("r" + texDur(v));
    };
    const hitTex = (h: Hit) => {
        const fx: string[] = [];
        if (h.snare && h.v <= 45 && med > 60) fx.push("g");
        else if (h.v >= 115 && med < 100) fx.push("ac");
        return `k${h.art}` + (fx.length ? `{${fx.join(" ")}}` : "");
    };

    const voiceBars = (vm: Map<number, Map<number, Hit>>): string[] => {
        const starts = [...vm.keys()].sort((a, b) => a - b);
        const bars: string[] = [];
        let si = 0;
        for (let mi = 0; mi < measures; mi++) {
            const barStart = mi * upm, barEnd = barStart + upm;
            const out: string[] = [];
            let cursor = barStart;
            while (si < starts.length && starts[si]! < barEnd) {
                const s = starts[si]!;
                const next = si + 1 < starts.length ? Math.min(starts[si + 1]!, barEnd) : barEnd;
                restRun(cursor, s, out);
                const beatEnd = barStart + (Math.floor((s - barStart) / beatLen) + 1) * beatLen;
                const len = Math.min(next, beatEnd) - s;
                const v = decompose(len, table)[0] ?? table[table.length - 1]!;
                const hits = [...vm.get(s)!.values()].sort((a, b) => a.art - b.art).map(hitTex);
                out.push((hits.length > 1 ? `(${hits.join(" ")})` : hits[0]!) + texDur(v));
                cursor = s + v.units;
                si++;
            }
            if (cursor === barStart) fullBarRest(out); else restRun(cursor, barEnd, out);
            bars.push(out.join(" "));
        }
        return bars;
    };

    const used = [...pieceOf.values()];
    const arts = [...new Set(used.map(p => p.articulation))].sort((a, b) => a - b);
    const L: string[] = [];
    if (opts.title) L.push(`\\title ${texStr(opts.title)}`);
    L.push(`\\tempo ${Math.max(1, Math.round(opts.bpm || 120))}`);
    L.push(`\\track ${texStr(opts.title || "Drums")} \\instrument percussion`);
    for (const a of arts) L.push(`\\articulation (k${a} ${a})`);
    const head = (mi: number) => {
        const meta: string[] = [];
        if (mi === 0) meta.push(`\\clef neutral \\ts (${ts.beats} ${ts.type})`);
        const cue = cuesByBar.get(mi);
        if (cue !== undefined) meta.push(`\\section ${texStr(cue || " ")}`);
        return meta.length ? meta.join(" ") + " " : "";
    };
    const hands = voiceBars(voices[0]);
    L.push("\\voice");
    L.push(hands.map((b, mi) => head(mi) + b).join(" |\n") + " |");
    if (useFeet) {
        L.push("\\voice");
        L.push(voiceBars(voices[1]).join(" |\n") + " |");
    }
    return { tex: L.join("\n") + "\n", pieces: used, measures };
}
