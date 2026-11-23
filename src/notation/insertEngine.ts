import { PC_NAMES, chordName, type ChordSym, type KeyRef } from "./harmony.js";
import { analyzeChords, analyzeKeys, keyConfidence, type ChordSegment } from "./harmonyAnalysis.js";
import { PROGRESSIONS, realizeProgression } from "./progressions.js";
import { voiceChord, type VoicingStyle } from "./chordVoicing.js";
import { compChords } from "./comping.js";
import { bassLine, type BassStyle } from "./bassLines.js";
import { lockedBassLine, type LockedFill } from "./bandBass.js";
import { generateRiff, type Contour } from "./riff.js";
import { renderDrumPattern } from "./drumPresets.js";
import { drumEnergy, addFills, humanize, type EnergyLevel } from "./drumTransform.js";
import type { InstrumentConfig } from "./instruments.js";

export type InsertNote = { b: number; d: number; p: number; v: number; s?: number; f?: number };
export type PlacedChordIn = ChordSym & { b: number; d: number };

export type ClipAnalysis = {
  key: KeyRef | null;
  keyName: string;
  confidence: number;
  chords: ChordSegment[];
};

export type ChordSource =
  | { kind: "preset"; id: string; barsPerChord?: number /* 1 */ }
  | { kind: "list"; chords: PlacedChordIn[] };

export type InsertRequest = {
  part: "chords" | "bass" | "riff" | "drums";
  inst: InstrumentConfig;
  key: KeyRef;
  startBeat: number;
  bars: number;
  beatsPerBar?: number /* 4 */;
  chords?: ChordSource;
  voicing?: VoicingStyle /* "open" */;
  pattern?: string /* "pop" */;
  bassStyle?: BassStyle | "kick" /* "root" */;
  kicks?: number[];
  fill?: LockedFill /* "none" */;
  position?: number /* 5 */;
  complexity?: 1 | 2 | 3 | 4 | 5 /* 3 */;
  contour?: Contour /* "arch" */;
  scale?: "pentatonic" | "key" /* "pentatonic" */;
  groove?: string /* "rock" */;
  energy?: EnergyLevel /* 3 */;
  fillEvery?: 0 | 2 | 4 | 8 /* 0 */;
  humanizeAmount?: number /* 0 */;
  seed?: number /* 1 */;
};

export type InsertResult = { notes: InsertNote[]; chords: PlacedChordIn[]; warnings: string[] };

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function keyIdentity(key: KeyRef): string {
  return `${key.root}:${key.mode}`;
}

function toPlacedChordIn(c: ChordSym & { b: number; d: number }): PlacedChordIn {
  const out: PlacedChordIn = { root: c.root, quality: c.quality, b: c.b, d: c.d };
  if (c.bass !== undefined) out.bass = c.bass;
  return out;
}

export function analyzeClip(
  notes: { b: number; d: number; p: number; v?: number }[],
  opts: { start: number; end: number; beatsPerBar?: number /* 4 */ },
): ClipAnalysis {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  if (notes.length === 0 || opts.end - opts.start <= 0) {
    return { key: null, keyName: "", confidence: 0, chords: [] };
  }
  const keySegs = analyzeKeys(notes, { start: opts.start, end: opts.end, beatsPerBar });
  if (keySegs.length === 0) {
    return { key: null, keyName: "", confidence: 0, chords: [] };
  }

  const totals = new Map<string, { key: KeyRef; d: number; firstB: number }>();
  for (const seg of keySegs) {
    const id = keyIdentity(seg.key);
    const cur = totals.get(id);
    if (cur) {
      cur.d += seg.d;
      cur.firstB = Math.min(cur.firstB, seg.b);
    } else {
      totals.set(id, { key: { ...seg.key }, d: seg.d, firstB: seg.b });
    }
  }

  let best: { key: KeyRef; d: number; firstB: number } | undefined;
  for (const entry of totals.values()) {
    if (
      !best ||
      entry.d > best.d + 1e-9 ||
      (Math.abs(entry.d - best.d) <= 1e-9 && entry.firstB < best.firstB - 1e-9)
    ) {
      best = entry;
    }
  }

  const key = best!.key;
  const keyName = `${PC_NAMES[key.root]} ${key.mode}`;
  // share of the range in this key x how clearly its notes beat the other keys
  const share = clamp01(best!.d / (opts.end - opts.start));
  const confidence = Math.round(share * keyConfidence(notes, key, opts) * 100) / 100;
  const chords = analyzeChords(notes, { start: opts.start, end: opts.end, beatsPerBar, key });
  return { key, keyName, confidence, chords };
}

/**
 * Onsets of a looping clip (beats inside [0, period)) repeated over [start, end): a 1-bar drum loop
 * gives its kicks in every bar of the range, as Live plays it.
 */
export function loopOnsets(onsets: number[], period: number, start: number, end: number): number[] {
  if (!(period > 1e-9)) return onsets.filter((b) => b >= start - 1e-9 && b < end - 1e-9);
  const out = new Set<number>();
  for (const b0 of onsets) {
    const base = ((b0 % period) + period) % period;
    for (let k = Math.floor((start - base) / period); base + k * period < end - 1e-9; k++) {
      const b = base + k * period;
      if (b >= start - 1e-9) out.add(round6(b));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Chords of a looping clip (beats inside [0, period)) repeated over [start, end) and cut to it. */
export function loopChords<T extends { b: number; d: number }>(chords: T[], period: number, start: number, end: number): T[] {
  if (!(period > 1e-9)) return chords.slice();
  const out: T[] = [];
  for (const c of chords) {
    const base = ((c.b % period) + period) % period;
    const d = Math.min(c.d, period);
    for (let k = Math.floor((start - base - d) / period); base + k * period < end - 1e-9; k++) {
      const b = base + k * period;
      const b1 = Math.max(b, start), e1 = Math.min(b + d, end);
      if (e1 - b1 > 1e-9) out.push({ ...c, b: round6(b1), d: round6(e1 - b1) });
    }
  }
  return out.sort((a, b) => a.b - b.b);
}

export function resolveChords(
  src: ChordSource,
  key: KeyRef,
  startBeat: number,
  bars: number,
  beatsPerBar: number = 4,
): PlacedChordIn[] {
  const rangeStart = startBeat;
  const rangeEnd = startBeat + bars * beatsPerBar;

  if (src.kind === "preset") {
    const barsPerChord = src.barsPerChord ?? 1;
    const preset = PROGRESSIONS.find((p) => p.id === src.id);
    if (!preset) throw new Error(`Unknown progression preset: ${src.id}`);
    const repeat = Math.ceil(bars / (preset.numerals.length * barsPerChord));
    const realized = realizeProgression(src.id, key, { startBeat, beatsPerBar, barsPerChord, repeat });
    const out: PlacedChordIn[] = [];
    for (const c of realized) {
      if (c.b >= rangeEnd - 1e-9) continue;
      const end = Math.min(c.b + c.d, rangeEnd);
      const d = end - c.b;
      if (d <= 1e-9) continue;
      out.push(toPlacedChordIn({ ...c, d }));
    }
    return out;
  }

  const clipped: PlacedChordIn[] = [];
  for (const c of src.chords) {
    const cEnd = c.b + c.d;
    if (cEnd <= rangeStart + 1e-9 || c.b >= rangeEnd - 1e-9) continue;
    const b = Math.max(c.b, rangeStart);
    const end = Math.min(cEnd, rangeEnd);
    clipped.push(toPlacedChordIn({ ...c, b, d: end - b }));
  }
  clipped.sort((a, b) => a.b - b.b);
  return clipped;
}

export function fretLine(
  notes: { b: number; d: number; p: number; v: number }[],
  inst: InstrumentConfig,
  opts?: { maxFret?: number /* 12 */ },
): InsertNote[] {
  const maxFret = opts?.maxFret ?? 12;
  let prevFret: number | null = null;
  const out: InsertNote[] = [];

  for (const n of notes) {
    const candidates: { s: number; f: number }[] = [];
    for (let s = 1; s <= inst.stringCount; s++) {
      const f = n.p - inst.open[s]!;
      if (f >= 0 && f <= maxFret) candidates.push({ s, f });
    }

    if (candidates.length === 0) {
      out.push({ b: n.b, d: n.d, p: n.p, v: n.v });
      continue;
    }

    const target = prevFret ?? 3;
    let best = candidates[0]!;
    let bestDist = Math.abs(best.f - target);
    for (let i = 1; i < candidates.length; i++) {
      const cand = candidates[i]!;
      const dist = Math.abs(cand.f - target);
      // nearest to previous chosen fret; tie -> lower-pitched string (larger s)
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && cand.s > best.s)) {
        best = cand;
        bestDist = dist;
      }
    }

    prevFret = best.f;
    out.push({ b: n.b, d: n.d, p: n.p, v: n.v, s: best.s, f: best.f });
  }

  return out;
}

function rangeOf(req: InsertRequest, beatsPerBar: number): { start: number; end: number } {
  const start = req.startBeat;
  return { start, end: start + req.bars * beatsPerBar };
}

function finalizeNotes(
  notes: InsertNote[],
  rangeStart: number,
  rangeEnd: number,
  warnings: string[],
): InsertNote[] {
  const out: InsertNote[] = [];
  let unplayable = 0;
  for (const n of notes) {
    if (n.b < rangeStart - 1e-9 || n.b >= rangeEnd - 1e-9) continue;
    let d = n.d;
    const end = n.b + d;
    if (end > rangeEnd + 1e-9) d = rangeEnd - n.b;
    if (d < 0.05) d = 0.05;
    if (n.b + d > rangeEnd + 1e-9) {
      // if even min duration overshoots, still keep clipped to range end
      d = Math.max(0.05, rangeEnd - n.b);
    }
    const nn: InsertNote = { b: round6(n.b), d: round6(d), p: n.p, v: n.v };
    if (n.s !== undefined) nn.s = n.s;
    if (n.f !== undefined) nn.f = n.f;
    if (nn.s === undefined || nn.f === undefined) unplayable++;
    out.push(nn);
  }
  if (unplayable > 0) warnings.push(`${unplayable} notes are out of reach of the instrument`);
  out.sort((a, b) => a.b - b.b || a.p - b.p);
  return out;
}

function hasPitchedUnplayableWarning(warnings: string[]): boolean {
  return warnings.some((w) => w.endsWith("notes are out of reach of the instrument"));
}

export function buildInsert(req: InsertRequest): InsertResult {
  const beatsPerBar = req.beatsPerBar ?? 4;
  const { start, end } = rangeOf(req, beatsPerBar);
  const warnings: string[] = [];

  if (req.part === "drums") {
    const groove = req.groove ?? "rock";
    const energy = req.energy ?? 3;
    const fillEvery = req.fillEvery ?? 0;
    const humanizeAmount = req.humanizeAmount ?? 0;
    const seed = req.seed ?? 1;

    let hits = renderDrumPattern(groove, { startBeat: req.startBeat, bars: req.bars });
    hits = drumEnergy(hits, energy, { startBeat: req.startBeat, bars: req.bars, beatsPerBar, seed });
    if (fillEvery > 0) {
      hits = addFills(hits, {
        startBeat: req.startBeat,
        bars: req.bars,
        beatsPerBar,
        every: fillEvery as 2 | 4 | 8,
      });
    }
    if (humanizeAmount > 0) {
      hits = humanize(hits, {
        seed,
        min: req.startBeat,
        timing: 0.01 * humanizeAmount,
        velocity: Math.round(8 * humanizeAmount),
      });
    }
    const notes = finalizeNotes(
      hits.map((h) => ({ b: h.b, d: h.d, p: h.p, v: h.v })),
      start,
      end,
      warnings,
    );
    // Drum notes have no s/f - finalizeNotes would count them as unplayable; remove that warning for drums
    const drumWarnings = warnings.filter((w) => !w.endsWith("notes are out of reach of the instrument"));
    return { notes, chords: [], warnings: drumWarnings };
  }

  // chords/bass/riff need chords
  let resolved: PlacedChordIn[] = [];
  if (!req.chords) {
    warnings.push("No chords");
  } else {
    resolved = resolveChords(req.chords, req.key, req.startBeat, req.bars, beatsPerBar);
  }

  if (req.part === "chords") {
    if (!req.chords) {
      return { notes: [], chords: [], warnings };
    }
    const voicing = req.voicing ?? "open";
    const pattern = req.pattern ?? "pop";
    const voiced: { b: number; d: number; notes: { p: number; s: number; f: number }[] }[] = [];
    for (const ch of resolved) {
      const vnotes = voiceChord(ch, voicing, req.inst);
      if (vnotes.length === 0) {
        warnings.push(`No voicing for ${chordName(ch)}`);
        continue;
      }
      voiced.push({ b: ch.b, d: ch.d, notes: vnotes });
    }
    const comp = compChords(voiced, pattern, { beatsPerBar });
    const notes = finalizeNotes(
      comp.map((n) => ({ b: n.b, d: n.d, p: n.p, v: n.v, s: n.s, f: n.f })),
      start,
      end,
      warnings,
    );
    // comp notes have s/f; unplayable warning shouldn't trigger, but keep logic uniform
    return { notes, chords: resolved, warnings };
  }

  if (req.part === "bass") {
    if (!req.chords) {
      return { notes: [], chords: [], warnings };
    }
    const bassStyle = req.bassStyle ?? "root";
    let raw: { b: number; d: number; p: number; v: number }[];
    if (bassStyle === "kick") {
      const kicks = req.kicks;
      if (!kicks || kicks.length === 0) {
        warnings.push("No kick found: one note per chord");
      } else if (!kicks.some((k) => k >= start - 1e-9 && k < end - 1e-9)) {
        warnings.push("No kick in these bars: one note per chord");
      }
      raw = lockedBassLine(resolved, kicks ?? [], {
        inst: req.inst,
        beatsPerBar,
        fill: req.fill ?? "none",
      });
    } else {
      raw = bassLine(resolved, bassStyle, { inst: req.inst, beatsPerBar });
    }
    const fretted = fretLine(raw, req.inst);
    const notes = finalizeNotes(fretted, start, end, warnings);
    return { notes, chords: resolved, warnings };
  }

  // riff
  if (!req.chords) {
    return { notes: [], chords: [], warnings };
  }
  const riffNotes = generateRiff({
    inst: req.inst,
    key: req.key,
    chords: resolved,
    startBeat: req.startBeat,
    bars: req.bars,
    beatsPerBar,
    position: req.position ?? 5,
    complexity: (req.complexity ?? 3) as 1 | 2 | 3 | 4 | 5,
    contour: req.contour ?? "arch",
    scale: req.scale ?? "pentatonic",
    seed: req.seed ?? 1,
  });
  const notes = finalizeNotes(
    riffNotes.map((n) => ({ b: n.b, d: n.d, p: n.p, v: n.v, s: n.s, f: n.f })),
    start,
    end,
    warnings,
  );
  return { notes, chords: resolved, warnings };
}

export function mergeInsert<T extends { b: number; d: number; p: number }>(
  existing: T[],
  inserted: InsertNote[],
  opts: { start: number; end: number; mode: "add" | "replace" },
): { keep: T[]; removed: T[]; add: InsertNote[] } {
  const keep: T[] = [];
  const removed: T[] = [];

  if (opts.mode === "replace") {
    for (const n of existing) {
      if (n.b >= opts.start - 1e-9 && n.b < opts.end - 1e-9) removed.push(n);
      else keep.push(n);
    }
  } else {
    for (const n of existing) keep.push(n);
  }

  const add: InsertNote[] = [];
  for (const ins of inserted) {
    const dup = keep.some((k) => k.p === ins.p && Math.abs(k.b - ins.b) < 1e-6);
    if (!dup) add.push(ins);
  }

  return { keep, removed, add };
}
