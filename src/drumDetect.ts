// ============================================================
// src/drumDetect.ts — is this Live track a drum track? (SDK side)
//
// A track is a drum track when its device chain holds a Drum Rack, searched
// recursively through racks (Instrument/Effect Racks nest chains). The rack's
// chains give the used pads (DrumChain.receivingNote) and, through a Simpler's
// sample file, a pad label. Labels are hints only: the mapping stays GM unless
// the user changes it (see src/notation/drumMap.ts, docs/DRUMS.md).
// ============================================================
import { DrumRack, RackDevice, Simpler } from "@ableton-extensions/sdk";
import { padLabelFromPath, type PadHints } from "./notation/drumMap.js";

export type DrumRackInfo = { pads: number[]; hints: PadHints; depth: number };

const MAX_DEPTH = 6;
const GENERIC_DEVICE = /^(simpler|sampler|impulse|drum sampler|operator|analog|wavetable|drift|meld|collision|tension|electric|drum rack|instrument rack|drum buss)$/i;

const isClass = (obj: any, cls: any, name: string) => {
    try { return obj instanceof cls || obj?.constructor?.className === name; } catch { return false; }
};
const safe = <T>(f: () => T, d: T): T => { try { return f() ?? d; } catch { return d; } };

/** First Drum Rack in a device list, depth-first through nested racks. */
export function findDrumRack(devices: any[], depth = 0): { rack: any; depth: number } | null {
    if (depth > MAX_DEPTH || !Array.isArray(devices)) return null;
    for (const d of devices) {
        if (isClass(d, DrumRack, "DrumRackDevice")) return { rack: d, depth };
    }
    for (const d of devices) {
        if (!isClass(d, RackDevice, "RackDevice") && !Array.isArray(safe(() => d?.chains, null))) continue;
        for (const ch of safe<any[]>(() => d.chains, [])) {
            const found = findDrumRack(safe<any[]>(() => ch?.devices, []), depth + 1);
            if (found) return found;
        }
    }
    return null;
}

/** Sample name of the first Simpler in a chain (recursing into racks), else a non-generic device name. */
function padLabel(devices: any[], depth = 0): string | undefined {
    if (depth > MAX_DEPTH) return undefined;
    for (const d of devices ?? []) {
        if (isClass(d, Simpler, "Simpler")) {
            const label = padLabelFromPath(safe(() => d.sample?.filePath, undefined));
            if (label) return label;
        }
        for (const ch of safe<any[]>(() => d?.chains, [])) {
            const inner = padLabel(safe<any[]>(() => ch?.devices, []), depth + 1);
            if (inner) return inner;
        }
    }
    const name = safe(() => String(devices?.[0]?.name ?? ""), "").trim();
    return name && !GENERIC_DEVICE.test(name) ? name.slice(0, 40) : undefined;
}

/** Drum Rack info for a track, or null when it holds none. Never throws. */
export function drumRackInfo(track: any): DrumRackInfo | null {
    const found = findDrumRack(safe<any[]>(() => track?.devices, []));
    if (!found) return null;
    const pads: number[] = [];
    const hints: PadHints = {};
    for (const ch of safe<any[]>(() => found.rack.chains, [])) {
        const note = safe(() => Number(ch.receivingNote), NaN);
        if (!Number.isInteger(note) || note < 0 || note > 127) continue;
        pads.push(note);
        const label = padLabel(safe<any[]>(() => ch.devices, []));
        if (label && !hints[note]) hints[note] = label;
    }
    return { pads: [...new Set(pads)].sort((a, b) => a - b), hints, depth: found.depth };
}
