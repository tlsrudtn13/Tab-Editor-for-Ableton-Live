// Fit GM drum hits from the Insert panel to the user's kit (TAB Editor 2.0).
// The editor reads each pad as a notation piece (GM by default, or the user's override in the drum map).
// A generated hit for GM key g goes to the kit pitch whose piece is g; when the kit has no such piece the
// GM key stays. Kicks of a drum track are the pitches whose piece is a kick (35 or 36).
import { resolveDrumPiece, type DrumOverride, type PadHints } from "./drumMap.js";

const KICKS = [35, 36];

/** GM key → kit pitch, for every GM key some kit pitch plays (a pitch that is its own piece wins). */
export function kitPitchMap(kitPitches: Iterable<number>, override?: DrumOverride, hints?: PadHints): Map<number, number> {
  const map = new Map<number, number>();
  const pitches = [...new Set(kitPitches)].sort((a, b) => a - b);
  for (const p of pitches) {
    const art = resolveDrumPiece(p, override, hints).articulation;
    if (art === p || !map.has(art)) map.set(art, p);
  }
  return map;
}

/** Hits moved to the kit's pads; GM keys the kit has no piece for stay as they are. */
export function fitToKit<T extends { p: number }>(hits: T[], map: Map<number, number>): T[] {
  return hits.map(h => {
    const k = map.get(h.p);
    return k === undefined || k === h.p ? h : { ...h, p: k };
  });
}

/** Pitches of a drum track that are kicks (by the editor's drum map). Falls back to 35/36. */
export function kickPitches(kitPitches: Iterable<number>, override?: DrumOverride, hints?: PadHints): number[] {
  const out = [...new Set(kitPitches)].filter(p => KICKS.includes(resolveDrumPiece(p, override, hints).articulation));
  return out.length ? out.sort((a, b) => a - b) : KICKS.slice();
}
