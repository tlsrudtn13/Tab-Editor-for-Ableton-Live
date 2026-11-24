import { analyzeChords, type ChordSegment } from "./harmonyAnalysis.js";
import { PC_NAMES, type KeyRef } from "./harmony.js";
import type { ChordNote } from "./chordDetect.js";

export type CadenceKind = "authentic" | "plagal" | "half" | "deceptive" | "ii-V-I";
export type Cadence = { kind: CadenceKind; b: number /* beat of the arrival chord */; from: number /* index of first chord */; to: number /* index of arrival chord */; label: string };
export type Borrowed = { from: "major" | "minor"; label: string /* e.g. "borrowed from C minor" */ };
export type AnalysedChord = ChordSegment & { borrowed?: Borrowed; cadence?: CadenceKind };
export type ScaleFit = { id: ScaleId; root: number; name: string /* "E minor pentatonic" */; coverage: number /* 0..1 */; outside: number[] /* pcs outside, by weight desc */ };
export type ScaleId = "major" | "minor" | "majorPent" | "minorPent" | "blues" | "dorian" | "mixolydian" | "harmonicMinor";

export const SCALES: Readonly<Record<ScaleId, { name: string; steps: readonly number[] }>> = {
  major: { name: "major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  majorPent: { name: "major pentatonic", steps: [0, 2, 4, 7, 9] },
  minorPent: { name: "minor pentatonic", steps: [0, 3, 5, 7, 10] },
  blues: { name: "blues", steps: [0, 3, 5, 6, 7, 10] },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { name: "harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
};

const SCALE_ORDER: ScaleId[] = ["major", "minor", "majorPent", "minorPent", "blues", "dorian", "mixolydian", "harmonicMinor"];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function deg(chord: ChordSegment, key: KeyRef): number {
  return mod12(chord.root - key.root);
}

function isV(chord: ChordSegment, key: KeyRef): boolean {
  return deg(chord, key) === 7 && ["", "7", "9", "13"].includes(chord.quality);
}

function isI(chord: ChordSegment, key: KeyRef): boolean {
  return deg(chord, key) === 0 && chord.quality !== "dim" && chord.quality !== "dim7" && chord.quality !== "m7b5";
}

function isVi(chord: ChordSegment, key: KeyRef): boolean {
  if (key.mode === "major") return deg(chord, key) === 9;
  return deg(chord, key) === 8; // bVI in minor
}

function isII(chord: ChordSegment, key: KeyRef): boolean {
  if (deg(chord, key) !== 2) return false;
  const q = chord.quality;
  if (q.startsWith("m")) return true; // m, m7, m9, mMaj7, m7b5
  if (q === "dim" || q === "dim7") return true;
  return false;
}

function iiLabel(chord: ChordSegment): string {
  if (chord.quality === "m7b5" || chord.quality === "dim" || chord.quality === "dim7") return "iiø";
  return "ii";
}

function approxZero(x: number): boolean {
  return Math.abs(x) < 1e-6;
}

export function findCadences(chords: ChordSegment[], key: KeyRef, beatsPerBar: number = 4): Cadence[] {
  const out: Cadence[] = [];
  const authenticTargets = new Set<number>(); // V index that is part of ii-V-I

  // ii-V-I first
  for (let i = 0; i + 2 < chords.length; i++) {
    const a = chords[i]!, b = chords[i + 1]!, c = chords[i + 2]!;
    if (isII(a, key) && isV(b, key) && isI(c, key)) {
      const label = key.mode === "major" ? `${iiLabel(a)}–V–I` : `${iiLabel(a)}–V–i`;
      out.push({ kind: "ii-V-I", b: c.b, from: i, to: i + 2, label });
      authenticTargets.add(i + 1);
    }
  }

  for (let i = 0; i < chords.length; i++) {
    const cur = chords[i]!;
    const next = chords[i + 1];
    if (isV(cur, key)) {
      if (next && isI(next, key) && !authenticTargets.has(i)) {
        out.push({ kind: "authentic", b: next.b, from: i, to: i + 1, label: key.mode === "major" ? "V–I" : "V–i" });
        continue;
      }
      if (next && isVi(next, key) && !authenticTargets.has(i)) {
        out.push({ kind: "deceptive", b: next.b, from: i, to: i + 1, label: key.mode === "major" ? "V–vi" : "V–VI" });
        continue;
      }
      const endBeat = cur.b + cur.d;
      const onTwoBar = approxZero(((endBeat % (2 * beatsPerBar)) + 2 * beatsPerBar) % (2 * beatsPerBar));
      const last = i === chords.length - 1;
      const goesToIOrVi = next ? (isI(next, key) || isVi(next, key)) : false;
      if ((onTwoBar || last) && !goesToIOrVi) {
        out.push({ kind: "half", b: cur.b, from: i, to: i, label: "half cadence" });
      }
    }
    if (next && isI(next, key)) {
      const d = deg(cur, key);
      const q = cur.quality;
      const isPlagalIV = d === 5 && (q === "" || (q.startsWith("m") && !q.startsWith("m7b5"))) && q !== "dim" && q !== "dim7";
      if (isPlagalIV) {
        const ivLabel = q.startsWith("m") ? "iv" : "IV";
        const iLabel = key.mode === "major" ? "I" : "i";
        out.push({ kind: "plagal", b: next.b, from: i, to: i + 1, label: `${ivLabel}–${iLabel}` });
      }
    }
  }

  out.sort((a, b) => a.b - b.b || a.from - b.from);
  // dedupe same arrival/kind if any overlap (shouldn't happen, but safe)
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.kind}:${c.from}:${c.to}:${c.b}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function borrowedOf(chord: ChordSegment, key: KeyRef): Borrowed | undefined {
  if (chord.diatonic) return undefined;
  if (chord.roman.startsWith("V/") || chord.roman.startsWith("V7/")) return undefined;
  const degree = deg(chord, key);
  const q = chord.quality;

  if (key.mode === "major") {
    // a chord of the natural minor on the same tonic (i, ii°, bIII, iv, v, bVI, bVII)
    if (inNaturalMinorByIv(degree, q)) return { from: "minor", label: `borrowed from ${PC_NAMES[key.root]} minor` };
    return undefined;
  }

  // minor key: borrowed from parallel major when degree 5 is major ("" / "7" / "maj7") → IV, degree 0 major → I (picardy), nothing else.
  if (degree === 5 && ["", "7", "maj7"].includes(q)) {
    return { from: "major", label: `borrowed from ${PC_NAMES[key.root]} major` };
  }
  if (degree === 0 && q === "") {
    return { from: "major", label: `borrowed from ${PC_NAMES[key.root]} major` };
  }
  return undefined;
}

function inNaturalMinorByIv(iv: number, quality: string): boolean {
  // natural minor scale degrees by iv: 0->i,2->ii°,3->III,5->iv,7->v,8->VI,10->VII
  const table: Record<number, string[]> = {
    0: ["m", "m7", "m9", "m6", "mMaj7", "sus2", "sus4", "5"],
    2: ["dim", "m7b5", "dim7"],
    3: ["", "maj7", "6", "add9", "sus2", "5"],
    5: ["m", "m7", "m9", "sus2", "sus4", "5"],
    7: ["m", "m7", "sus4", "5"],
    8: ["", "maj7", "6", "add9", "sus2", "5"],
    10: ["", "7", "sus4", "5"],
  };
  return (table[iv] ?? []).includes(quality);
}

type ScaleCandidate = { id: ScaleId; root: number };

function scaleCandidates(key: KeyRef): ScaleCandidate[] {
  const cands: ScaleCandidate[] = [];
  for (const id of SCALE_ORDER) {
    if (key.mode === "major") {
      if (["major", "majorPent", "mixolydian"].includes(id)) cands.push({ id, root: key.root });
      if (id === "minorPent") cands.push({ id, root: mod12(key.root + 9) }); // relative
    } else {
      if (["minor", "minorPent", "blues", "dorian", "harmonicMinor"].includes(id)) cands.push({ id, root: key.root });
      if (id === "majorPent") cands.push({ id, root: mod12(key.root + 3) }); // relative
    }
  }
  // also include key-mode default if not there? spec says "try..." - but keep simple
  // de-dup
  const seen = new Set<string>();
  return cands.filter((c) => {
    const k = `${c.id}:${c.root}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function fitScale(notes: ChordNote[], key: KeyRef, opts?: { start?: number; end?: number }): ScaleFit {
  const start = opts?.start ?? -Infinity;
  const end = opts?.end ?? Infinity;
  const weights = new Array(12).fill(0) as number[];
  let total = 0;
  for (const n of notes) {
    const ov = Math.min(n.b + n.d, end) - Math.max(n.b, start);
    if (ov > 1e-9) {
      const pc = mod12(n.p);
      weights[pc] += ov;
      total += ov;
    }
  }
  if (total <= 1e-9) {
    const id: ScaleId = key.mode;
    const name = `${PC_NAMES[key.root]} ${SCALES[id].name}`;
    return { id, root: key.root, name, coverage: 1, outside: [] };
  }

  const cands = scaleCandidates(key);
  let best: ScaleFit | undefined;
  for (const c of cands) {
    const pcs = new Set(SCALES[c.id].steps.map((s) => mod12(c.root + s)));
    let inside = 0;
    const outsideWeights: { pc: number; w: number }[] = [];
    for (let pc = 0; pc < 12; pc++) {
      const w = weights[pc]!;
      if (w <= 0) continue;
      if (pcs.has(pc)) inside += w;
      else outsideWeights.push({ pc, w });
    }
    outsideWeights.sort((a, b) => b.w - a.w || a.pc - b.pc);
    const fit: ScaleFit = {
      id: c.id,
      root: c.root,
      name: `${PC_NAMES[c.root]} ${SCALES[c.id].name}`,
      coverage: inside / total,
      outside: outsideWeights.map((o) => o.pc),
    };
    if (!best) { best = fit; continue; }
    if (fit.coverage > best.coverage + 1e-12) { best = fit; continue; }
    if (Math.abs(fit.coverage - best.coverage) <= 1e-12) {
      const fitSteps = SCALES[fit.id].steps.length;
      const bestSteps = SCALES[best.id].steps.length;
      if (fitSteps < bestSteps) { best = fit; continue; }
      if (fitSteps === bestSteps) {
        const fitKeyRoot = fit.root === key.root ? 1 : 0;
        const bestKeyRoot = best.root === key.root ? 1 : 0;
        if (fitKeyRoot !== bestKeyRoot) { if (fitKeyRoot > bestKeyRoot) best = fit; continue; }
        if (SCALE_ORDER.indexOf(fit.id) < SCALE_ORDER.indexOf(best.id)) best = fit;
      }
    }
  }
  return best!;
}

export function analyzeProgression(notes: ChordNote[], opts: { start: number; end: number; beatsPerBar?: number; key: KeyRef }): {
  key: KeyRef; chords: AnalysedChord[]; cadences: Cadence[]; scale: ScaleFit;
} {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const base = analyzeChords(notes, { start: opts.start, end: opts.end, beatsPerBar, key: opts.key });
  const cadences = findCadences(base, opts.key, beatsPerBar);
  const cadenceByTo = new Map<number, CadenceKind>();
  for (const c of cadences) cadenceByTo.set(c.to, c.kind);
  const chords: AnalysedChord[] = base.map((ch, i) => {
    const borrowed = borrowedOf(ch, opts.key);
    const cadence = cadenceByTo.get(i);
    return { ...ch, ...(borrowed ? { borrowed } : {}), ...(cadence ? { cadence } : {}) };
  });
  const scale = fitScale(notes, opts.key, { start: opts.start, end: opts.end });
  return { key: opts.key, chords, cadences, scale };
}
