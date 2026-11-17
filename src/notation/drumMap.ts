// ============================================================
// src/notation/drumMap.ts — Live note pitch -> drum instrument / articulation.
//
// Pure (no SDK, no DOM). Spec: docs/DRUMS.md.
//   * Default: General MIDI percussion key map (Live's Drum Rack default pads
//     start at C1 = 36 = Bass Drum 1, so a stock kit follows GM).
//   * Notation: Guitar Pro 7 articulations as built into alphaTab
//     (PercussionMapper): articulation id == GM key for 35..87, staff line,
//     notehead and playback key come from alphaTab. Positions follow the
//     PAS / Weinberg drum key (kick F4, snare C5, hi-hat G5 above the staff ...).
//   * Per-track override map (pitch -> articulation id) for user kits.
//   * Drum Rack info (pad sample names) only labels pads; it never remaps.
// ============================================================

export type Limb = "hand" | "foot";

/** One alphaTab / GP7 drum articulation we offer. staffLine: 0 = top line (F5), +1 = one step down. */
export type DrumArticulation = {
    id: number;          // alphaTab articulation id (GP7), used in AlphaTex
    name: string;        // human name shown in the legend / override menu
    staffLine: number;   // GP7 staff position (for sorting and the spec table)
    head: string;        // notehead (documentation / legend)
    limb: Limb;          // voice: hands = voice 1 (stems up), feet = voice 2 (stems down)
    group: "kick" | "snare" | "tom" | "hihat" | "cymbal" | "perc";
};

const A = (id: number, name: string, staffLine: number, head: string, limb: Limb, group: DrumArticulation["group"]): DrumArticulation =>
    ({ id, name, staffLine, head, limb, group });

/** Articulations available for drum kits (GP7 values from alphaTab 1.8.3 PercussionMapper). */
export const DRUM_ARTICULATIONS: readonly DrumArticulation[] = [
    A(35, "Kick 2 (Acoustic Bass Drum)", 8, "normal", "foot", "kick"),
    A(36, "Kick", 7, "normal", "foot", "kick"),
    A(38, "Snare", 3, "normal", "hand", "snare"),
    A(40, "Snare 2 (Electric)", 3, "normal", "hand", "snare"),
    A(37, "Side Stick", 3, "x", "hand", "snare"),
    A(91, "Snare Rim Shot", 3, "diamond", "hand", "snare"),
    A(39, "Hand Clap", 3, "normal", "hand", "perc"),
    A(31, "Sticks", 3, "slash", "hand", "perc"),
    A(42, "Hi-Hat Closed", -1, "x", "hand", "hihat"),
    A(92, "Hi-Hat Half Open", -1, "circle-slash", "hand", "hihat"),
    A(46, "Hi-Hat Open", -1, "circle-x", "hand", "hihat"),
    A(44, "Hi-Hat Pedal", 9, "x", "foot", "hihat"),
    A(50, "Tom 1 (High)", 1, "normal", "hand", "tom"),
    A(48, "Tom 2 (Hi-Mid)", 2, "normal", "hand", "tom"),
    A(47, "Tom 3 (Low-Mid)", 4, "normal", "hand", "tom"),
    A(45, "Tom 4 (Low)", 5, "normal", "hand", "tom"),
    A(43, "Floor Tom (High)", 6, "normal", "hand", "tom"),
    A(41, "Floor Tom (Low)", 5, "normal", "hand", "tom"),
    A(51, "Ride", 0, "x", "hand", "cymbal"),
    A(93, "Ride Edge", 0, "x", "hand", "cymbal"),
    A(53, "Ride Bell", 0, "diamond", "hand", "cymbal"),
    A(59, "Ride 2", 2, "x", "hand", "cymbal"),
    A(49, "Crash", -2, "heavy-x", "hand", "cymbal"),
    A(57, "Crash 2", -1, "heavy-x", "hand", "cymbal"),
    A(55, "Splash", -2, "x", "hand", "cymbal"),
    A(52, "China", -3, "heavy-x-hat", "hand", "cymbal"),
    A(54, "Tambourine", 3, "triangle", "hand", "perc"),
    A(56, "Cowbell", 0, "triangle", "hand", "perc"),
    A(58, "Vibraslap", 28, "normal", "hand", "perc"),
    A(60, "Bongo High", -4, "normal", "hand", "perc"),
    A(61, "Bongo Low", -7, "normal", "hand", "perc"),
    A(62, "Conga High Mute", 19, "normal", "hand", "perc"),
    A(63, "Conga High", 14, "normal", "hand", "perc"),
    A(64, "Conga Low", 17, "normal", "hand", "perc"),
    A(65, "Timbale High", 9, "normal", "hand", "perc"),
    A(66, "Timbale Low", 10, "normal", "hand", "perc"),
    A(67, "Agogo High", 11, "normal", "hand", "perc"),
    A(68, "Agogo Low", 12, "normal", "hand", "perc"),
    A(69, "Cabasa", 23, "normal", "hand", "perc"),
    A(70, "Maracas", -12, "normal", "hand", "perc"),
    A(71, "Whistle Short", -17, "normal", "hand", "perc"),
    A(72, "Whistle Long", -11, "normal", "hand", "perc"),
    A(73, "Guiro Short", 38, "normal", "hand", "perc"),
    A(74, "Guiro Long", 37, "normal", "hand", "perc"),
    A(75, "Claves", 20, "normal", "hand", "perc"),
    A(76, "Wood Block High", -10, "triangle", "hand", "perc"),
    A(77, "Wood Block Low", -9, "triangle", "hand", "perc"),
    A(78, "Cuica Mute", 29, "x", "hand", "perc"),
    A(79, "Cuica Open", 30, "normal", "hand", "perc"),
    A(80, "Triangle Mute", 26, "x", "hand", "perc"),
    A(81, "Triangle Open", 27, "normal", "hand", "perc"),
    A(82, "Shaker", -23, "normal", "hand", "perc"),
    A(83, "Jingle Bell", -20, "normal", "hand", "perc"),
    A(84, "Bell Tree", -18, "normal", "hand", "perc"),
    A(85, "Castanets", 21, "normal", "hand", "perc"),
    A(86, "Surdo Mute", 36, "normal", "hand", "perc"),
    A(87, "Surdo Open", 35, "x", "hand", "perc"),
    A(33, "Metronome Click", 3, "x", "hand", "perc"),
    A(34, "Metronome Bell", 3, "normal", "hand", "perc"),
];

const BY_ID = new Map(DRUM_ARTICULATIONS.map(a => [a.id, a]));
export function drumArticulation(id: number): DrumArticulation | undefined { return BY_ID.get(id); }

/** GM key names (GM Level 1: 35..81, GM2 additions 27..34 and 82..87). */
export const GM_DRUM_NAMES: Readonly<Record<number, string>> = {
    27: "High Q", 28: "Slap", 29: "Scratch Push", 30: "Scratch Pull", 31: "Sticks", 32: "Square Click",
    33: "Metronome Click", 34: "Metronome Bell",
    35: "Acoustic Bass Drum", 36: "Bass Drum 1", 37: "Side Stick", 38: "Acoustic Snare", 39: "Hand Clap",
    40: "Electric Snare", 41: "Low Floor Tom", 42: "Closed Hi-Hat", 43: "High Floor Tom", 44: "Pedal Hi-Hat",
    45: "Low Tom", 46: "Open Hi-Hat", 47: "Low-Mid Tom", 48: "Hi-Mid Tom", 49: "Crash Cymbal 1",
    50: "High Tom", 51: "Ride Cymbal 1", 52: "Chinese Cymbal", 53: "Ride Bell", 54: "Tambourine",
    55: "Splash Cymbal", 56: "Cowbell", 57: "Crash Cymbal 2", 58: "Vibraslap", 59: "Ride Cymbal 2",
    60: "Hi Bongo", 61: "Low Bongo", 62: "Mute Hi Conga", 63: "Open Hi Conga", 64: "Low Conga",
    65: "High Timbale", 66: "Low Timbale", 67: "High Agogo", 68: "Low Agogo", 69: "Cabasa", 70: "Maracas",
    71: "Short Whistle", 72: "Long Whistle", 73: "Short Guiro", 74: "Long Guiro", 75: "Claves",
    76: "Hi Wood Block", 77: "Low Wood Block", 78: "Mute Cuica", 79: "Open Cuica", 80: "Mute Triangle",
    81: "Open Triangle", 82: "Shaker", 83: "Jingle Bell", 84: "Bell Tree", 85: "Castanets",
    86: "Mute Surdo", 87: "Open Surdo",
};

/** GM2 keys that have no GP7 articulation of their own: nearest look-alike. */
const GM2_APPROX: Readonly<Record<number, number>> = { 27: 33, 28: 39, 29: 31, 30: 31, 32: 33 };

/** Articulation for pitches outside the map: slashed notehead on the snare line, flagged as unmapped. */
export const UNMAPPED_ARTICULATION = 31;

/** GM default articulation for a pitch, or undefined when GM has no drum on it. */
export function gmArticulation(pitch: number): number | undefined {
    if (GM2_APPROX[pitch] !== undefined) return GM2_APPROX[pitch];
    return GM_DRUM_NAMES[pitch] !== undefined && BY_ID.has(pitch) ? pitch : undefined;
}

/** Per-track user kit: pitch -> articulation id. */
export type DrumOverride = Record<number, number>;
/** Pad labels from the Drum Rack (pitch -> sample / pad name). Labels only. */
export type PadHints = Record<number, string>;

export type DrumPiece = {
    pitch: number;
    articulation: number;
    name: string;        // articulation name
    limb: Limb;
    /** true = from GM or the user's map; false = fallback (UNMAPPED_ARTICULATION) */
    mapped: boolean;
    /** true = the user's override decided it */
    custom: boolean;
    /** Drum Rack pad label (sample name), when known */
    pad?: string;
};

/** Live's note name: C3 = 60, so the Drum Rack's first pad 36 is C1. */
export function liveNoteName(pitch: number): string {
    const N = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return N[((pitch % 12) + 12) % 12]! + (Math.floor(pitch / 12) - 2);
}

export function resolveDrumPiece(pitch: number, override?: DrumOverride, hints?: PadHints): DrumPiece {
    const ov = override?.[pitch];
    const custom = ov !== undefined && BY_ID.has(ov);
    const gm = gmArticulation(pitch);
    const id = custom ? ov! : gm ?? UNMAPPED_ARTICULATION;
    const art = BY_ID.get(id)!;
    const piece: DrumPiece = { pitch, articulation: id, name: art.name, limb: art.limb, mapped: custom || gm !== undefined, custom };
    const pad = hints?.[pitch];
    if (pad) piece.pad = pad;
    return piece;
}

/** Pieces used by these pitches, ordered top of staff -> bottom (cymbals first, kick last). */
export function drumLegend(pitches: Iterable<number>, override?: DrumOverride, hints?: PadHints): DrumPiece[] {
    const seen = [...new Set(pitches)];
    return seen.map(p => resolveDrumPiece(p, override, hints))
        .sort((a, b) => BY_ID.get(a.articulation)!.staffLine - BY_ID.get(b.articulation)!.staffLine || a.pitch - b.pitch);
}

/** Clean a sample file path into a pad label: "C:/x/Kick 808.wav" -> "Kick 808". */
export function padLabelFromPath(filePath: unknown): string | undefined {
    if (typeof filePath !== "string" || !filePath) return undefined;
    const base = filePath.split(/[\\/]/).pop() ?? "";
    const label = base.replace(/\.(wav|aif|aiff|flac|mp3|ogg|m4a)$/i, "").trim();
    return label ? label.slice(0, 40) : undefined;
}

// ── Saved per-track kit map (stored like the TAB layer) ──────────────────────
export type DrumLayer = { v: 1; kind: "drum"; map: DrumOverride };

export function drumLayerFrom(map: DrumOverride): DrumLayer {
    const clean: DrumOverride = {};
    for (const [k, v] of Object.entries(map)) {
        const p = Number(k);
        if (Number.isInteger(p) && p >= 0 && p <= 127 && BY_ID.has(v)) clean[p] = v;
    }
    return { v: 1, kind: "drum", map: clean };
}

/** Validates a parsed JSON value; returns a clean layer or undefined. */
export function parseDrumLayer(x: unknown): DrumLayer | undefined {
    const o = x as any;
    if (!o || o.v !== 1 || o.kind !== "drum" || typeof o.map !== "object" || o.map === null || Array.isArray(o.map)) return undefined;
    return drumLayerFrom(o.map);
}
