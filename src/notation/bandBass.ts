import { fifthInterval } from "./harmony.js";
import type { InstrumentConfig } from "./instruments.js";
import {
  anchorPitch,
  isWholeBeat,
  mod12,
  nearestPitch,
  roundB,
  type BassChord,
} from "./bassLines.js";

export type { BassChord } from "./bassLines.js";

export type LockedFill = "none" | "fifth" | "octave";

export function kickOnsets(
  hits: { b: number; p: number }[],
  opts?: { kickPitches?: number[] /* [35, 36] */ },
): number[] {
  const kickPitches = opts?.kickPitches ?? [35, 36];
  const kickSet = new Set(kickPitches);
  const beats = hits
    .filter((h) => kickSet.has(h.p))
    .map((h) => h.b)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const b of beats) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(b - last) >= 1e-6) out.push(b);
  }
  return out;
}

function chordEnd(chords: BassChord[], i: number): number {
  const end = chords[i]!.b + chords[i]!.d;
  const next = chords[i + 1];
  return next ? Math.min(end, next.b) : end;
}

function nextBarLine(b: number, beatsPerBar: number): number {
  // smallest bar line strictly after b (within epsilon treated as on/after)
  const eps = 1e-9;
  return (Math.floor((b + eps) / beatsPerBar) + 1) * beatsPerBar;
}

function isBarDownbeat(b: number, beatsPerBar: number): boolean {
  const k = Math.round(b / beatsPerBar);
  return Math.abs(b - k * beatsPerBar) < 1e-6;
}

export function lockedBassLine(
  chords: BassChord[],
  kicks: number[],
  opts: {
    inst: InstrumentConfig;
    beatsPerBar?: number /* 4 */;
    velocity?: number /* 100 */;
    fill?: LockedFill /* "none" */;
    minNote?: number /* 0.25 */;
    snap?: number /* 0.125: a kick this close to a chord change plays on the change */;
    barOrigin?: number /* 0: a bar line falls on barOrigin + k * beatsPerBar (the insert range start) */;
  },
): { b: number; d: number; p: number; v: number }[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const velocity = opts.velocity ?? 100;
  const fill = opts.fill ?? "none";
  const minNote = opts.minNote ?? 0.25;
  const low = opts.inst.open[opts.inst.stringCount]!;
  const high = low + 24;

  const snap = opts.snap ?? 0.125;
  const origin = opts.barOrigin ?? 0;
  const barLineAfter = (b: number) => origin + nextBarLine(b - origin, beatsPerBar);
  const sorted = [...chords].sort((a, b) => a.b - b.b);
  if (sorted.length === 0) return [];
  // A played (unquantized) kick a little before or after a chord change belongs to that change.
  kicks = kicks.map((k) => {
    for (const ch of sorted) if (Math.abs(k - ch.b) <= snap + 1e-9) return ch.b;
    return k;
  });

  type Onset = { b: number; chordIndex: number; firstOfChord: boolean };
  const onsets: Onset[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i]!;
    const end = chordEnd(sorted, i);
    if (end - ch.b <= 1e-9) continue;

    // kicks inside [chord.b, chord end)
    const chordKicks = kicks
      .filter((k) => k >= ch.b - 1e-9 && k < end - 1e-9)
      .sort((a, b) => a - b);

    const hasChordStart = chordKicks.some((k) => Math.abs(k - ch.b) < 1e-6);
    const chordOnsets: number[] = [];
    if (!hasChordStart) chordOnsets.push(ch.b);
    for (const k of chordKicks) {
      // normalize kicks very close to chord.b to chord.b
      const bk = Math.abs(k - ch.b) < 1e-6 ? ch.b : k;
      if (!chordOnsets.some((x) => Math.abs(x - bk) < 1e-6)) chordOnsets.push(bk);
    }
    chordOnsets.sort((a, b) => a - b);
    // a chord held over several bars: a bar with no kick still gets its root on the downbeat
    for (let bl = barLineAfter(ch.b); bl < end - 1e-9; bl += beatsPerBar) {
      if (!chordOnsets.some((x) => x >= bl - 1e-9 && x < bl + beatsPerBar - 1e-9)) chordOnsets.push(bl);
    }
    chordOnsets.sort((a, b) => a - b);

    for (let j = 0; j < chordOnsets.length; j++) {
      onsets.push({ b: chordOnsets[j]!, chordIndex: i, firstOfChord: j === 0 });
    }
  }

  onsets.sort((a, b) => a.b - b.b || a.chordIndex - b.chordIndex);
  // Onsets closer than minNote (a flam, a doubled kick) become one note; a chord change wins over a kick.
  const merged: Onset[] = [];
  for (const o of onsets) {
    const last = merged[merged.length - 1];
    if (last && o.b - last.b < minNote - 1e-9) {
      if (o.firstOfChord && !last.firstOfChord) merged[merged.length - 1] = o;
      continue;
    }
    merged.push(o);
  }
  onsets.length = 0;
  onsets.push(...merged);

  const notes: { b: number; d: number; p: number; v: number }[] = [];
  let prevPitch: number | null = null;
  // Fill tones go on off-beat kicks only, alternating with the bass note (root, fifth, root, …),
  // so the line keeps its root on the beats.
  let fillTurn = 0;

  for (let i = 0; i < onsets.length; i++) {
    const o = onsets[i]!;
    if (o.firstOfChord) fillTurn = 0;
    const ch = sorted[o.chordIndex]!;
    const end = chordEnd(sorted, o.chordIndex);
    if (o.b >= end - 1e-9) continue;

    const bassPc = mod12(ch.bass ?? ch.root);
    let bassNotePitch: number;
    if (prevPitch === null) {
      bassNotePitch = anchorPitch(bassPc, low);
    } else {
      bassNotePitch = nearestPitch(bassPc, prevPitch, low, high);
    }

    let p = bassNotePitch;
    const downbeat = isBarDownbeat(o.b - origin, beatsPerBar);
    const offBeat = Math.abs(o.b - Math.round(o.b)) > 1e-6;
    const useFill = !o.firstOfChord && !downbeat && offBeat && fill !== "none" && fillTurn++ % 2 === 0;
    if (useFill) {
      if (fill === "fifth") {
        const fpc = mod12(ch.root + fifthInterval(ch.quality));
        let delta = mod12(fpc - mod12(bassNotePitch));
        if (delta === 0) delta = 12;
        let fp = bassNotePitch + delta;
        if (fp > high) fp -= 12;
        p = fp;
      } else if (fill === "octave") {
        let op = bassNotePitch + 12;
        if (op > high) op -= 12;
        p = op;
      }
    }

    // clamp safety (should already be in range by construction)
    if (p < low) p += 12;
    if (p > high) p -= 12;

    const nextOnsetB = onsets[i + 1]?.b;
    const barLine = barLineAfter(o.b);
    let dEnd = end;
    if (nextOnsetB !== undefined) dEnd = Math.min(dEnd, nextOnsetB);
    dEnd = Math.min(dEnd, barLine);
    let d = dEnd - o.b;
    if (d < minNote) d = minNote;
    if (o.b + d > end + 1e-9) d = Math.max(0, end - o.b);
    if (d <= 1e-9) continue;

    const onBeat = isWholeBeat(o.b);
    const v = onBeat ? velocity : Math.max(1, velocity - 10);

    notes.push({ b: roundB(o.b), d: roundB(d), p, v });
    prevPitch = bassNotePitch; // next chord anchors to previous bass note pitch
  }

  notes.sort((a, b) => a.b - b.b);
  return notes;
}
