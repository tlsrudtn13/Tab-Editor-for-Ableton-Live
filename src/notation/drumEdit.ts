// ============================================================
// src/notation/drumEdit.ts — drum editing model (pure). Spec: docs/DRUMS.md §5.
//
// The editor's cursor moves over "lanes": one lane per drum piece
// (articulation), ordered top of the staff -> bottom like the legend.
// Lanes = the pieces the clip uses + a core kit, so a new piece can be added.
// A hit's lane comes from its pitch (kit map, else GM); a new hit on a lane
// gets the pitch the clip already uses for that piece, else a Drum Rack pad
// mapped to it, else the GM key.
// ============================================================
import { DRUM_ARTICULATIONS, drumArticulation, resolveDrumPiece, liveNoteName, type DrumOverride, type Limb, type PadHints } from "./drumMap.js";

export type DrumLane = {
    /** articulation id (alphaTab GP7) */
    art: number;
    name: string;
    staffLine: number;
    limb: Limb;
    /** pitch written for a new hit on this lane */
    pitch: number;
    /** true when no hit of the clip is on this lane (core-kit lane) */
    empty: boolean;
    /** "Snare · D1 38" (+ pad label) for the status line */
    label: string;
};

/** Core kit lanes offered even when the clip does not use them (GM keys). */
export const CORE_KIT: readonly number[] = [49, 42, 46, 51, 50, 48, 38, 47, 45, 43, 36, 44];

/** Velocities for the dynamics keys (Live MIDI velocity). */
export const DRUM_VELOCITY = { ghost: 35, normal: 100, accent: 127 } as const;

const ORDER = new Map(DRUM_ARTICULATIONS.map((a, i) => [a.id, i]));

/**
 * Pitch for a new hit on articulation `art`: the most used pitch of the clip that maps to it,
 * else a Drum Rack pad mapped to it, else its GM key; undefined when nothing plays it.
 */
export function lanePitch(art: number, pitches: number[], override?: DrumOverride, pads?: number[]): number | undefined {
    const count = new Map<number, number>();
    for (const p of pitches) if (resolveDrumPiece(p, override).articulation === art) count.set(p, (count.get(p) ?? 0) + 1);
    if (count.size) return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    for (const p of pads ?? []) { const r = resolveDrumPiece(p, override); if (r.mapped && r.articulation === art) return p; }
    // GM key (articulation id == GM key), unless the user's kit map moved that key to another piece
    if (art >= 27 && art <= 87 && resolveDrumPiece(art, override).articulation === art) return art;
    for (const [k, v] of Object.entries(override ?? {})) if (v === art) return Number(k);
    return undefined;
}

/** Lanes for the editor: used pieces + core kit, top of the staff first. */
export function drumLanes(pitches: number[], override?: DrumOverride, hints?: PadHints, pads?: number[]): DrumLane[] {
    const used = new Set(pitches.map(p => resolveDrumPiece(p, override).articulation));
    const arts = new Set<number>([...used, ...CORE_KIT]);
    const out: DrumLane[] = [];
    for (const art of arts) {
        const a = drumArticulation(art);
        const pitch = lanePitch(art, pitches, override, pads);
        if (!a || pitch === undefined) continue;
        const pad = hints?.[pitch];
        out.push({
            art, name: a.name, staffLine: a.staffLine, limb: a.limb, pitch, empty: !used.has(art),
            label: `${a.name} · ${liveNoteName(pitch)} ${pitch}` + (pad ? ` · ${pad}` : ""),
        });
    }
    return out.sort((x, y) => x.staffLine - y.staffLine || (ORDER.get(x.art)! - ORDER.get(y.art)!));
}

/** 1-based lane row of a pitch (the cursor's `s`), or 0 when no lane holds it. */
export function laneRow(lanes: DrumLane[], pitch: number, override?: DrumOverride): number {
    const art = resolveDrumPiece(pitch, override).articulation;
    return lanes.findIndex(l => l.art === art) + 1;
}

/** Dynamics shown for a hit: relative to the clip's median, so flat programmed velocities stay clean. */
export function drumDynamic(v: number, median: number): "ghost" | "accent" | undefined {
    if (v <= 45 && median - v >= 20) return "ghost";
    if (v >= 115 && v - median >= 15) return "accent";
    return undefined;
}
