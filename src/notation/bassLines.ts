import { chordPcs, fifthInterval, type ChordSym } from "./harmony.js";
import type { InstrumentConfig } from "./instruments.js";

export type BassStyle = "root" | "rootEighths" | "rootFifth" | "octave" | "walking";
export type BassChord = ChordSym & { b: number; d: number };
export type BassNote = { b: number; d: number; p: number; v: number };

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function roundB(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function anchorPitch(pc: number, low: number): number {
  const base = low + mod12(pc - mod12(low));
  return base < low ? base + 12 : base;
}

export function clampToRange(p: number, low: number, high: number): number {
  while (p < low) p += 12;
  while (p > high) p -= 12;
  return p;
}

export function nearestPitch(pc: number, prev: number, low: number, high: number): number {
  // octave of pc nearest to prev (ties -> lower), kept within [low, high]
  let best = clampToRange(anchorPitch(pc, low), low, high);
  let bestDist = Math.abs(best - prev);
  // check candidates in range
  for (let p = low; p <= high; p++) {
    if (mod12(p) !== mod12(pc)) continue;
    const dist = Math.abs(p - prev);
    if (dist < bestDist || (dist === bestDist && p < best)) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function chordEnd(chords: BassChord[], i: number): number {
  const end = chords[i]!.b + chords[i]!.d;
  const next = chords[i + 1];
  return next ? Math.min(end, next.b) : end;
}

export function isWholeBeat(b: number): boolean {
  return Math.abs(b - Math.round(b)) < 1e-9;
}

export function bassLine(
  chords: BassChord[],
  style: BassStyle,
  opts: { inst: InstrumentConfig; beatsPerBar?: number; velocity?: number },
): BassNote[] {
  const low = opts.inst.open[opts.inst.stringCount]!;
  const high = low + 24;
  const velocity = opts.velocity ?? 100;
  const beatsPerBar = opts.beatsPerBar ?? 4;

  const sorted = [...chords].sort((a, b) => a.b - b.b);
  const notes: BassNote[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i]!;
    const bassPc = ch.bass ?? ch.root;
    const anchor = anchorPitch(mod12(bassPc), low);
    const end = chordEnd(sorted, i);
    const len = end - ch.b;
    if (len <= 0) continue;

    if (style === "root") {
      notes.push({ b: roundB(ch.b), d: roundB(len), p: anchor, v: velocity });
    } else if (style === "rootEighths") {
      for (let t = ch.b; t < end - 1e-9; t += 0.5) {
        const d = Math.min(0.5, end - t);
        if (d <= 1e-9) break;
        const onBeat = isWholeBeat(t);
        const v = onBeat ? velocity : Math.max(1, velocity - 15);
        notes.push({ b: roundB(t), d: roundB(d), p: anchor, v });
      }
    } else if (style === "rootFifth") {
      if (len < 2 - 1e-9) {
        notes.push({ b: roundB(ch.b), d: roundB(len), p: anchor, v: velocity });
      } else {
        // The chord's own fifth (b5 for dim, #5 for aug), the nearest one above the bass note;
        // for a slash chord whose bass already is that fifth (C/G), the root instead.
        let fpc = mod12(ch.root + fifthInterval(ch.quality));
        if (fpc === mod12(anchor)) fpc = mod12(ch.root);
        let fifth = anchor + (mod12(fpc - anchor) || 12);
        if (fifth > high) fifth -= 12;
        for (let t = ch.b; t < end - 1e-9; t += 2) {
          const half = Math.floor(((t - ch.b) / 2) + 1e-9) % 2; // 0 for first half, 1 for second
          const p = half === 0 ? anchor : fifth;
          const d = Math.min(2, end - t);
          if (d <= 1e-9) break;
          notes.push({ b: roundB(t), d: roundB(d), p, v: velocity });
        }
      }
    } else if (style === "octave") {
      let toggle = 0;
      let upper = anchor + 12;
      if (upper > high) upper = anchor - 12 >= low ? anchor - 12 : anchor;
      for (let t = ch.b; t < end - 1e-9; t += 0.5) {
        const d = Math.min(0.5, end - t);
        if (d <= 1e-9) break;
        const p = toggle % 2 === 0 ? anchor : upper;
        notes.push({ b: roundB(t), d: roundB(d), p, v: velocity });
        toggle++;
      }
    } else if (style === "walking") {
      // handled below in a separate pass
    }
  }

  if (style === "walking") {
    return walkingLine(sorted, opts.inst, velocity, beatsPerBar);
  }

  notes.sort((a, b) => a.b - b.b);
  return notes;
}

function walkingLine(
  chords: BassChord[],
  inst: InstrumentConfig,
  velocity: number,
  _beatsPerBar: number,
): BassNote[] {
  const low = inst.open[inst.stringCount]!;
  const high = low + 24;
  const notes: BassNote[] = [];
  let prevPitch: number | null = null;

  for (let i = 0; i < chords.length; i++) {
    const ch = chords[i]!;
    const end = chordEnd(chords, i);
    const len = end - ch.b;
    if (len <= 1e-9) continue;
    const n = Math.max(0, Math.floor(len + 1e-9)); // whole beats
    if (n === 0) continue;

    const pcs = chordPcs(ch); // [root, 3rd, 5th, ...] as pcs
    const bassPc = mod12(ch.bass ?? ch.root);
    const thirdPc = pcs.length > 1 ? mod12(pcs[1]!) : bassPc;
    const fifthPc = pcs.length > 2 ? mod12(pcs[2]!) : bassPc;

    for (let pos = 0; pos < n; pos++) {
      const t = ch.b + pos;
      if (t >= end - 1e-9) break;
      const d = Math.min(1, end - t);
      if (d <= 1e-9) break;

      let p: number;
      if (prevPitch === null) {
        p = anchorPitch(bassPc, low);
      } else if (pos === n - 1 && n >= 2) {
        // approach note
        const nextChord = chords[i + 1];
        let targetPc: number;
        if (nextChord) {
          targetPc = mod12(nextChord.bass ?? nextChord.root);
        } else {
          targetPc = fifthPc; // last chord -> chord's 5th
        }
        const targetPitch = nearestPitch(targetPc, prevPitch, low, high);
        if (targetPitch > prevPitch) {
          p = targetPitch - 1;
        } else {
          p = targetPitch + 1;
        }
        p = clampToRange(p, low, high);
        // ensure it's in range; if clamping moved it badly, try to keep close
        if (p < low) p += 12;
        if (p > high) p -= 12;
      } else if (pos === 0) {
        p = nearestPitch(bassPc, prevPitch, low, high);
      } else {
        // in between: cycle 3rd, 5th, 3rd, 5th...
        // pos 1 -> 3rd, pos 2 -> 5th, pos 3 -> 3rd ...
        const inBetweenIndex = pos - 1; // 0-based among in-betweens
        const tonePc = inBetweenIndex % 2 === 0 ? thirdPc : fifthPc;
        p = nearestPitch(tonePc, prevPitch, low, high);
      }

      p = clampToRange(p, low, high);
      const onBeat = isWholeBeat(t);
      const v = onBeat ? velocity : Math.max(1, velocity - 15);
      notes.push({ b: roundB(t), d: roundB(d), p, v });
      prevPitch = p;
    }
  }

  notes.sort((a, b) => a.b - b.b);
  return notes;
}
