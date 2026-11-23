import type { InstrumentConfig } from "./instruments.js";
import { chordPcs, scaleOf, type ChordSym, type KeyRef } from "./harmony.js";
import { mulberry32 } from "./rng.js";

export type Contour = "up" | "down" | "arch" | "wave";
export type RiffNote = { b: number; d: number; p: number; v: number; s: number; f: number };

type BoxNote = { s: number; f: number; p: number };

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function positionBox(
  inst: InstrumentConfig,
  position: number,
  span: number = 4,
): BoxNote[] {
  const out: BoxNote[] = [];
  for (let s = 1; s <= inst.stringCount; s++) {
    const open = inst.open[s]!;
    // fretted positions in box
    for (let f = position; f <= position + span; f++) {
      if (f < 0) continue;
      out.push({ s, f, p: open + f });
    }
    // open string when position <= 1
    if (position <= 1) {
      // avoid duplicate if position==0 includes f==0 already
      if (position !== 0) {
        out.push({ s, f: 0, p: open });
      }
    }
  }
  // dedupe by s,f (position 0 already included f 0)
  const seen = new Set<string>();
  const deduped: BoxNote[] = [];
  for (const n of out) {
    const k = `${n.s}:${n.f}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(n);
  }
  deduped.sort((a, b) => a.p - b.p || a.s - b.s || a.f - b.f);
  return deduped;
}

const PENT_MAJOR = [0, 2, 4, 7, 9] as const;
const PENT_MINOR = [0, 3, 5, 7, 10] as const;

function allowedPcs(key: KeyRef, scale: "pentatonic" | "key"): Set<number> {
  if (scale === "key") return new Set(scaleOf(key));
  const ivs = key.mode === "major" ? PENT_MAJOR : PENT_MINOR;
  return new Set(ivs.map((iv) => mod12(key.root + iv)));
}

const PATTERNS: Record<number, string> = {
  1: "x...x...x...x...",
  2: "x...x.x.x...x.x.",
  3: "x.x.x.x.x.x.x...",
  4: "x.xxx.x.x.xxx.x.",
  5: "xxxxx.xxxx.xxxxx",
};

function patternForComplexity(c: number): boolean[] {
  const p = PATTERNS[c]!;
  return Array.from(p, (ch) => ch === "x");
}

function barPattern(
  complexity: number,
  barIndex: number,
  beatsPerBar: number,
  rnd: () => number,
): boolean[] {
  let c = complexity;
  if (barIndex > 0) {
    const roll = rnd();
    if (roll < 0.3) {
      const dir = rnd() < 0.5 ? -1 : 1;
      c = Math.max(1, Math.min(5, complexity + dir));
    }
  }
  const base = patternForComplexity(c);
  const steps = Math.round(beatsPerBar * 4);
  const out: boolean[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(base[i % base.length]!);
  }
  return out;
}

type ChordAt = ChordSym & { b: number; d: number };

function chordSoundingAt(chords: ChordAt[], beat: number): ChordAt | undefined {
  for (const c of chords) {
    if (beat >= c.b - 1e-9 && beat < c.b + c.d - 1e-9) return c;
  }
  return undefined;
}

function targetPitch(contour: Contour, t: number, lo: number, hi: number): number {
  const tt = Math.max(0, Math.min(1, t));
  switch (contour) {
    case "up":
      return lo + (hi - lo) * tt;
    case "down":
      return hi - (hi - lo) * tt;
    case "arch":
      return lo + (hi - lo) * Math.sin(Math.PI * tt);
    case "wave":
      // two arches: 0..1..0..1..0
      return lo + (hi - lo) * (1 - Math.cos(4 * Math.PI * tt)) / 2;
  }
}

function isWholeBeat(b: number): boolean {
  return Math.abs(b - Math.round(b)) < 1e-6;
}

export function generateRiff(opts: {
  inst: InstrumentConfig;
  key: KeyRef;
  chords: (ChordSym & { b: number; d: number })[];
  startBeat: number;
  bars: number;
  beatsPerBar?: number /* 4 */;
  position: number;
  span?: number /* 4 */;
  scale?: "pentatonic" | "key" /* pentatonic */;
  complexity: 1 | 2 | 3 | 4 | 5;
  contour?: Contour /* "arch" */;
  seed: number;
}): RiffNote[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const span = opts.span ?? 4;
  const scale = opts.scale ?? "pentatonic";
  const contour = opts.contour ?? "arch";
  const rnd = mulberry32(opts.seed);

  const box = positionBox(opts.inst, opts.position, span);
  const allowed = allowedPcs(opts.key, scale);
  const candidates = box.filter((n) => allowed.has(mod12(n.p)));
  if (candidates.length === 0) return [];

  const pitches = candidates.map((c) => c.p);
  const minP = Math.min(...pitches);
  const maxP = Math.max(...pitches);
  const range = maxP - minP;
  const lo = minP + range * 0.1;
  const hi = maxP - range * 0.1;

  // Build onset times
  const onsets: number[] = [];
  for (let bar = 0; bar < opts.bars; bar++) {
    const pat = barPattern(opts.complexity, bar, beatsPerBar, rnd);
    const steps = pat.length;
    for (let i = 0; i < steps; i++) {
      if (!pat[i]) continue;
      const beat = opts.startBeat + bar * beatsPerBar + i / 4;
      // only include onsets within the riff range
      if (beat < opts.startBeat + opts.bars * beatsPerBar - 1e-9) {
        onsets.push(beat);
      }
    }
  }
  // dedupe and sort
  const onsetSet = Array.from(new Set(onsets.map((b) => +b.toFixed(6)))).sort((a, b) => a - b);

  const totalBeats = opts.bars * beatsPerBar;
  const notes: RiffNote[] = [];
  let prev: RiffNote | undefined;

  for (let i = 0; i < onsetSet.length; i++) {
    const b = onsetSet[i]!;
    const t = onsetSet.length <= 1 ? 0 : i / (onsetSet.length - 1);
    const target = targetPitch(contour, t, lo, hi);

    const strong = isWholeBeat(b);
    let pool = candidates;
    if (strong) {
      const ch = chordSoundingAt(opts.chords, b);
      if (ch) {
        const tones = new Set(chordPcs(ch));
        const chordCand = candidates.filter((c) => tones.has(mod12(c.p)));
        if (chordCand.length > 0) pool = chordCand;
      }
    }

    // evaluate cost for each candidate; consume rnd() per candidate for determinism
    let best = pool[0]!;
    let bestCost = Infinity;
    // We need to pick lowest cost among pool. rnd() consumed per candidate in stable order.
    // Use candidates in pool order (which derives from box sorted by pitch).
    const costs: { cand: BoxNote; cost: number }[] = [];
    for (const cand of pool) {
      const r = rnd();
      const prevP = prev ? prev.p : target;
      const jump = Math.abs(cand.p - prevP);
      const cost = Math.abs(cand.p - target) + 0.5 * jump + (jump > 7 ? 3 : 0) + 0.8 * r;
      costs.push({ cand, cost });
      if (cost < bestCost) {
        bestCost = cost;
        best = cand;
      }
    }

    // last onset prefers root of last chord if in box
    if (i === onsetSet.length - 1 && opts.chords.length > 0) {
      const lastChord = opts.chords[opts.chords.length - 1]!;
      const rootPc = mod12(lastChord.root);
      // find root candidates in full candidate set (any string/fret in box)
      const rootCands = candidates.filter((c) => mod12(c.p) === rootPc);
      if (rootCands.length > 0) {
        // pick the root cand with lowest cost relative to same formula; but we didn't consume rnd for them
        // in this extra check - spec says "choose it if its cost ≤ best cost + 4". 
        // We must be careful not to change rng consumption. Compute cost without extra rnd? 
        // The rnd was already consumed for pool candidates; rootCands may be outside pool.
        // To be deterministic and fair, compute their cost using a fixed 0.5 rnd equivalent? Or consume.
        // Better: compute cost with no rnd term (or rnd 0) - spec states the formula; but consuming changes stream.
        // Safest: evaluate against bestCost+4 using cost without random, i.e. use 0 for rnd.
        let bestRoot = rootCands[0]!;
        let bestRootCost = Infinity;
        for (const cand of rootCands) {
          const prevP = prev ? prev.p : target;
          const jump = Math.abs(cand.p - prevP);
          const cost = Math.abs(cand.p - target) + 0.5 * jump + (jump > 7 ? 3 : 0);
          if (cost < bestRootCost) {
            bestRootCost = cost;
            bestRoot = cand;
          }
        }
        if (bestRootCost <= bestCost + 4) {
          best = bestRoot;
          bestCost = bestRootCost;
        }
      }
    }

    // String choice: when a pitch exists on two strings in the box, take the string nearest previous note's string
    // (tie → lower string number = higher string).
    const samePitch = candidates.filter((c) => c.p === best.p);
    let chosen = best;
    if (samePitch.length > 1) {
      if (prev) {
        let bestS = samePitch[0]!;
        let bestDist = Math.abs(bestS.s - prev.s);
        for (const c of samePitch) {
          const dist = Math.abs(c.s - prev.s);
          if (dist < bestDist || (dist === bestDist && c.s < bestS.s)) {
            bestS = c;
            bestDist = dist;
          }
        }
        chosen = bestS;
      } else {
        // no prev: tie -> lower string number
        chosen = samePitch.reduce((a, c) => (c.s < a.s ? c : a), samePitch[0]!);
      }
    }

    // duration: until next onset (max 1 beat, min 0.25); last note lasts to bar end (max 2)
    let d: number;
    if (i < onsetSet.length - 1) {
      d = onsetSet[i + 1]! - b;
      d = Math.max(0.25, Math.min(1, d));
    } else {
      const end = opts.startBeat + totalBeats;
      d = end - b;
      d = Math.max(0.25, Math.min(2, d));
    }

    const v = isWholeBeat(b) ? 96 : 84;
    const note: RiffNote = {
      b: +b.toFixed(6),
      d: +d.toFixed(6),
      p: chosen.p,
      v,
      s: chosen.s,
      f: chosen.f,
    };
    notes.push(note);
    prev = note;
  }

  notes.sort((a, b) => a.b - b.b);
  return notes;
}
