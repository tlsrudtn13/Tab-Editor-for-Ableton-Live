import { chordCandidates, type ChordNote } from "./chordDetect.js";
import {
  MAJOR_SCALE,
  MINOR_SCALE,
  chordName,
  type ChordSym,
  type KeyRef,
} from "./harmony.js";

export type ChordFn = "T" | "S" | "D" | "other";
export type ChordTier = "safe" | "tension" | "color";
export type RomanLabel = { roman: string; fn: ChordFn; tier: ChordTier; diatonic: boolean };
export type ChordSegment = ChordSym & { b: number; d: number; name: string; score: number } & RomanLabel;
export type KeySegment = { b: number; d: number; key: KeyRef; score: number };

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
const MINOR_QUALITIES = new Set(["m", "m6", "m7", "m9", "mMaj7", "dim", "dim7", "m7b5"]);

const MAJOR_DIATONIC: Record<number, string[]> = {
  0: ["", "maj7", "6", "add9", "maj9", "sus2", "sus4", "5"],
  1: ["m", "m7", "m9", "sus2", "sus4", "5"],
  2: ["m", "m7", "5"],
  3: ["", "maj7", "6", "add9", "sus2", "5"],
  4: ["", "7", "9", "sus4", "7sus4", "5"],
  5: ["m", "m7", "m9", "sus2", "sus4", "5"],
  6: ["dim", "m7b5"],
};

const MINOR_DIATONIC: Record<number, string[]> = {
  0: ["m", "m7", "m9", "m6", "mMaj7", "sus2", "sus4", "5"],
  1: ["dim", "m7b5"],
  2: ["", "maj7", "6", "5"],
  3: ["m", "m7", "m9", "sus2", "5"],
  4: ["m", "m7", "5"],
  5: ["", "maj7", "6", "5"],
  6: ["", "7", "5"],
};

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function scaleOfMode(key: KeyRef): readonly number[] {
  return key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
}

function numeralForDegree(deg: number, minorCase: boolean): string {
  const n = NUMERALS[deg]!;
  return minorCase ? n.toLowerCase() : n;
}

function qualitySuffix(quality: string): string {
  switch (quality) {
    case "dim":
      return "°";
    case "dim7":
      return "°7";
    case "m7b5":
      return "ø7";
    case "aug":
      return "+";
    case "m":
      return "";
    case "m7":
      return "7";
    case "m6":
      return "6";
    case "m9":
      return "9";
    case "mMaj7":
      return "maj7";
    case "":
      return "";
    default:
      return quality;
  }
}

function diatonicFn(key: KeyRef, degree: number, quality: string, iv: number): ChordFn {
  if (key.mode === "major") {
    if ([0, 2, 5].includes(degree)) return "T";
    if ([1, 3].includes(degree)) return "S";
    if ([4, 6].includes(degree)) return "D";
  } else {
    if ([0, 2, 5].includes(degree)) return "T";
    if ([1, 3].includes(degree)) return "S";
    if ([4, 6].includes(degree)) return "D";
    // harmonic minor dominant: v with major/dominant qualities, or vii° (iv 11)
    if (degree === 4 && ["", "7", "7b9", "sus4", "7sus4"].includes(quality)) return "D";
    if (iv === 11 && ["dim", "dim7"].includes(quality)) return "D";
  }
  return "other";
}

function isDiatonic(key: KeyRef, iv: number, degree: number | undefined, quality: string): boolean {
  if (degree === undefined) {
    // harmonic minor allowances for non-scale iv
    if (key.mode === "minor" && iv === 11 && ["dim", "dim7"].includes(quality)) return true;
    return false;
  }
  const table = key.mode === "major" ? MAJOR_DIATONIC : MINOR_DIATONIC;
  if ((table[degree] ?? []).includes(quality)) return true;
  if (key.mode === "minor") {
    if (degree === 4 && ["", "7", "7b9", "sus4", "7sus4"].includes(quality)) return true;
    if (iv === 11 && ["dim", "dim7"].includes(quality)) return true;
  }
  return false;
}

function baseRoman(chord: ChordSym, key: KeyRef): { roman: string; degree: number | undefined; iv: number } {
  const iv = mod12(chord.root - key.root);
  const scale = scaleOfMode(key);
  const degree = scale.indexOf(iv);
  const minorCase = MINOR_QUALITIES.has(chord.quality);
  let numeral: string;
  if (degree >= 0) {
    numeral = numeralForDegree(degree, minorCase);
  } else if (key.mode === "major" && iv === 6) {
    numeral = minorCase ? "#iv" : "#IV";
  } else if (key.mode === "minor" && iv === 11) {
    // harmonic minor leading tone (G# in A minor): vii°
    numeral = numeralForDegree(6, minorCase);
  } else {
    // "b" + numeral of the scale step one semitone above
    const aboveIv = mod12(iv + 1);
    const aboveDeg = scale.indexOf(aboveIv);
    if (aboveDeg >= 0) {
      numeral = "b" + numeralForDegree(aboveDeg, minorCase);
    } else {
      // fallback: find nearest scale degree above
      let found: number | undefined;
      for (let step = 1; step < 12; step++) {
        const d = scale.indexOf(mod12(iv + step));
        if (d >= 0) { found = d; break; }
      }
      numeral = found !== undefined ? "b".repeat(1) + numeralForDegree(found, minorCase) : (minorCase ? "i" : "I");
    }
  }
  return { roman: numeral + qualitySuffix(chord.quality), degree: degree >= 0 ? degree : undefined, iv };
}

function secondaryDominant(chord: ChordSym, key: KeyRef, diatonic: boolean): RomanLabel | undefined {
  if (diatonic) return undefined;
  if (!["7", "9"].includes(chord.quality)) return undefined;
  const targetRoot = mod12(chord.root + 5);
  const scale = scaleOfMode(key);
  const targetDeg = scale.indexOf(mod12(targetRoot - key.root));
  if (targetDeg === undefined || targetDeg < 0) return undefined;
  if (targetDeg === 0) return undefined; // not I/i
  // target numeral in key - use diatonic case for that degree
  const targetMinorCase = key.mode === "major" ? [1, 2, 5, 6].includes(targetDeg) : [0, 1, 3, 4].includes(targetDeg);
  const targetNumeral = numeralForDegree(targetDeg, targetMinorCase);
  const roman = "V7/" + targetNumeral;
  return { roman, fn: "D", tier: "color", diatonic: false };
}

export function romanOf(chord: ChordSym, key: KeyRef): RomanLabel {
  const { roman, degree, iv } = baseRoman(chord, key);
  const diatonic = isDiatonic(key, iv, degree, chord.quality);
  const sec = secondaryDominant(chord, key, diatonic);
  if (sec) return sec;
  let fn: ChordFn = "other";
  if (diatonic && degree !== undefined) {
    fn = diatonicFn(key, degree, chord.quality, iv);
  } else if (diatonic && key.mode === "minor" && iv === 11) {
    fn = "D";
  }
  let tier: ChordTier;
  if (diatonic && (fn === "T" || fn === "S")) tier = "safe";
  else if (diatonic && fn === "D") tier = "tension";
  else tier = "color";
  return { roman, fn, tier, diatonic };
}

type WindowState = { name: string; sym: ChordSym | null; score: number };

function viterbi(windows: WindowState[][], changePenalty: number): number[] {
  if (windows.length === 0) return [];
  const dp: number[][] = [];
  const back: number[][] = [];
  dp[0] = windows[0]!.map((s) => s.score);
  back[0] = windows[0]!.map(() => -1);
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1]!;
    const cur = windows[i]!;
    const prevDp = dp[i - 1]!;
    const curDp: number[] = [];
    const curBack: number[] = [];
    for (let j = 0; j < cur.length; j++) {
      let bestK = 0;
      let bestVal = -Infinity;
      for (let k = 0; k < prev.length; k++) {
        const trans = prev[k]!.name === cur[j]!.name ? 0 : -changePenalty;
        const val = prevDp[k]! + trans;
        if (val > bestVal) {
          bestVal = val;
          bestK = k;
        }
      }
      curDp[j] = bestVal + cur[j]!.score;
      curBack[j] = bestK;
    }
    dp.push(curDp);
    back.push(curBack);
  }
  // backtrack
  const last = dp[dp.length - 1]!;
  let bestIdx = 0;
  for (let i = 1; i < last.length; i++) if (last[i]! > last[bestIdx]!) bestIdx = i;
  const path: number[] = new Array(windows.length);
  path[windows.length - 1] = bestIdx;
  for (let i = windows.length - 1; i > 0; i--) path[i - 1] = back[i]![path[i]!]!;
  return path;
}

export function analyzeChords(notes: ChordNote[], opts: {
  start: number; end: number; beatsPerBar?: number; step?: number;
  key?: KeyRef; changePenalty?: number;
}): ChordSegment[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const step = opts.step ?? beatsPerBar / 2;
  const changePenalty = opts.changePenalty ?? 1.0;
  const winStarts: number[] = [];
  for (let t = opts.start; t < opts.end - 1e-9; t += step) winStarts.push(t);
  if (winStarts.length === 0) return [];

  const windows: WindowState[][] = [];
  for (const t of winStarts) {
    const wEnd = Math.min(t + step, opts.end);
    const sounding = notes.some((n) => Math.min(n.b + n.d, wEnd) - Math.max(n.b, t) > 1e-9);
    if (!sounding) {
      windows.push([{ name: "N.C.", sym: null, score: 0 }]);
      continue;
    }
    const candOpts: { limit: number; keyRoot?: number; keyIntervals?: number[]; beatsPerBar: number } = {
      limit: 6, beatsPerBar,
    };
    if (opts.key) {
      candOpts.keyRoot = opts.key.root;
      candOpts.keyIntervals = [...scaleOfMode(opts.key)];
    }
    const cands = chordCandidates(notes, t, wEnd, candOpts);
    if (cands.length === 0) {
      windows.push([{ name: "N.C.", sym: null, score: 0 }]);
    } else {
      windows.push(cands.map((c) => ({ name: c.name, sym: { root: c.root, quality: c.quality, bass: c.bass }, score: c.score })));
    }
  }

  const path = viterbi(windows, changePenalty);

  // merge consecutive same name
  type Merged = { b: number; d: number; name: string; sym: ChordSym | null; scores: number[] };
  const merged: Merged[] = [];
  for (let i = 0; i < path.length; i++) {
    const st = windows[i]![path[i]!]!;
    const b = winStarts[i]!;
    const d = Math.min(b + step, opts.end) - b;
    const last = merged[merged.length - 1];
    if (last && last.name === st.name) {
      last.d = b + d - last.b;
      last.scores.push(st.score);
    } else {
      merged.push({ b, d, name: st.name, sym: st.sym, scores: [st.score] });
    }
  }

  const labelKey = opts.key ?? (analyzeKeys(notes, { start: opts.start, end: opts.end, beatsPerBar })[0]?.key);
  const segs: ChordSegment[] = [];
  for (const m of merged) {
    if (m.name === "N.C." || !m.sym) continue;
    const label = labelKey ? romanOf(m.sym, labelKey) : { roman: "?", fn: "other" as ChordFn, tier: "color" as ChordTier, diatonic: false };
    const meanScore = m.scores.reduce((a, b) => a + b, 0) / m.scores.length;
    segs.push({ ...m.sym, b: m.b, d: m.d, name: m.name, score: meanScore, ...label });
  }
  return segs;
}

// Krumhansl-Kessler
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma, xb = b[i]! - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

type KeyState = { key: KeyRef; score: number };

function viterbiKeys(windows: KeyState[][], changePenalty: number): number[] {
  if (windows.length === 0) return [];
  const dp: number[][] = [];
  const back: number[][] = [];
  dp[0] = windows[0]!.map((s) => s.score);
  back[0] = windows[0]!.map(() => -1);
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1]!;
    const cur = windows[i]!;
    const prevDp = dp[i - 1]!;
    const curDp: number[] = [];
    const curBack: number[] = [];
    for (let j = 0; j < cur.length; j++) {
      let bestK = 0;
      let bestVal = -Infinity;
      for (let k = 0; k < prev.length; k++) {
        const same = prev[k]!.key.root === cur[j]!.key.root && prev[k]!.key.mode === cur[j]!.key.mode;
        const val = prevDp[k]! + (same ? 0 : -changePenalty);
        if (val > bestVal) { bestVal = val; bestK = k; }
      }
      curDp[j] = bestVal + cur[j]!.score;
      curBack[j] = bestK;
    }
    dp.push(curDp);
    back.push(curBack);
  }
  const last = dp[dp.length - 1]!;
  let bestIdx = 0;
  for (let i = 1; i < last.length; i++) if (last[i]! > last[bestIdx]!) bestIdx = i;
  const path: number[] = new Array(windows.length);
  path[windows.length - 1] = bestIdx;
  for (let i = windows.length - 1; i > 0; i--) path[i - 1] = back[i]![path[i]!]!;
  return path;
}

export function analyzeKeys(notes: ChordNote[], opts: {
  start: number; end: number; beatsPerBar?: number; windowBars?: number; changePenalty?: number;
}): KeySegment[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const windowBars = opts.windowBars ?? 4;
  const changePenalty = opts.changePenalty ?? 2;
  const winLen = windowBars * beatsPerBar;
  if (opts.end - opts.start <= 1e-9) return [];

  // windows stepping by one bar
  const barStep = beatsPerBar;
  const winStarts: number[] = [];
  for (let t = opts.start; t < opts.end - 1e-9; t += barStep) winStarts.push(t);
  if (winStarts.length === 0) return [];

  const windows: KeyState[][] = [];
  for (const t of winStarts) {
    const wEnd = Math.min(t + winLen, opts.end);
    const hist = new Array(12).fill(0) as number[];
    for (const n of notes) {
      const ov = Math.min(n.b + n.d, wEnd) - Math.max(n.b, t);
      if (ov > 1e-9) hist[mod12(n.p)] += ov;
    }
    const states: KeyState[] = [];
    for (let root = 0; root < 12; root++) {
      const majProfile: number[] = [];
      const minProfile: number[] = [];
      for (let pc = 0; pc < 12; pc++) {
        const rel = mod12(pc - root);
        majProfile.push(KK_MAJOR[rel]!);
        minProfile.push(KK_MINOR[rel]!);
      }
      states.push({ key: { root, mode: "major" }, score: pearson(hist, majProfile) });
      states.push({ key: { root, mode: "minor" }, score: pearson(hist, minProfile) });
    }
    windows.push(states);
  }

  const path = viterbiKeys(windows, changePenalty);

  // per bar assign the key of the window starting on that bar, merge equal neighbours
  const barKeys: { b: number; key: KeyRef; score: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const st = windows[i]![path[i]!]!;
    barKeys.push({ b: winStarts[i]!, key: st.key, score: st.score });
  }

  const merged: KeySegment[] = [];
  for (const bk of barKeys) {
    const last = merged[merged.length - 1];
    if (last && last.key.root === bk.key.root && last.key.mode === bk.key.mode) {
      last.d = bk.b + beatsPerBar - last.b;
      // keep score as mean? spec says "score: number" - average reasonable
      last.score = (last.score + bk.score) / 2; // will normalize below
    } else {
      merged.push({ b: bk.b, d: beatsPerBar, key: { ...bk.key }, score: bk.score });
    }
  }
  // fix merged scores as mean of contributing bars
  // recompute properly
  const result: KeySegment[] = [];
  for (const m of merged) {
    const contrib = barKeys.filter((bk) => bk.b >= m.b - 1e-9 && bk.b < m.b + m.d - 1e-9);
    const mean = contrib.reduce((a, b) => a + b.score, 0) / (contrib.length || 1);
    result.push({ b: m.b, d: m.d, key: m.key, score: mean });
  }
  // clamp to range
  for (const r of result) {
    const end = Math.min(r.b + r.d, opts.end);
    r.b = Math.max(r.b, opts.start);
    r.d = end - r.b;
  }
  return result.filter((r) => r.d > 1e-9);
}
