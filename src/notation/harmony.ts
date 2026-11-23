import { majorFifths } from "./music.js";
import type { KeyInfo } from "./types.js";

export const PC_NAMES: readonly string[] = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const CHORD_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  "": [0, 4, 7],
  "m": [0, 3, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  "m6": [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "m7": [0, 3, 7, 10],
  "mMaj7": [0, 3, 7, 11],
  "m7b5": [0, 3, 6, 10],
  "dim7": [0, 3, 6, 9],
  "7sus4": [0, 5, 7, 10],
  "add9": [0, 2, 4, 7],
  "9": [0, 2, 4, 7, 10],
  "maj9": [0, 2, 4, 7, 11],
  "m9": [0, 2, 3, 7, 10],
  "7b9": [0, 1, 4, 7, 10],
  "7#9": [0, 3, 4, 7, 10],
};

export type KeyRef = { root: number; mode: "major" | "minor" }; // root pc 0-11

export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 10]; // natural

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function keyRefFromKeyInfo(k: KeyInfo): KeyRef {
  if (k.mode === "major") {
    for (let r = 0; r < 12; r++) {
      if (majorFifths(r) === k.fifths) return { root: r, mode: "major" };
    }
    throw new Error(`No major key root for fifths ${k.fifths}`);
  }
  for (let r = 0; r < 12; r++) {
    if (majorFifths(r) === k.fifths) return { root: mod12(r + 9), mode: "minor" };
  }
  throw new Error(`No minor key root for fifths ${k.fifths}`);
}

export function scaleOf(key: KeyRef): number[] {
  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  return scale.map((iv) => mod12(key.root + iv));
}

export type ChordSym = { root: number; quality: string; bass?: number };

export function chordName(c: ChordSym): string {
  let name = PC_NAMES[mod12(c.root)] + c.quality;
  if (c.bass !== undefined && mod12(c.bass) !== mod12(c.root)) {
    name += "/" + PC_NAMES[mod12(c.bass)];
  }
  return name;
}

export function chordPcs(c: ChordSym): number[] {
  const intervals = CHORD_INTERVALS[c.quality];
  if (!intervals) throw new Error(`Unknown chord quality: ${c.quality}`);
  return intervals.map((iv) => mod12(c.root + iv));
}

const ROMAN_DEGREES: Record<string, number> = {
  i: 0,
  ii: 1,
  iii: 2,
  iv: 3,
  v: 4,
  vi: 5,
  vii: 6,
};

export function parseRoman(rn: string, key: KeyRef): ChordSym {
  const m = /^(b|#)?([ivIV]+)(.*)$/.exec(rn);
  if (!m) throw new Error(`Invalid roman numeral: ${rn}`);

  const accidental = m[1] ?? "";
  const numeral = m[2];
  let rest = m[3] ?? "";

  const degree = ROMAN_DEGREES[numeral.toLowerCase()];
  if (degree === undefined) throw new Error(`Invalid roman numeral: ${rn}`);

  const isUpper = numeral === numeral.toUpperCase() && numeral !== numeral.toLowerCase();
  const baseQuality = isUpper ? "" : "m";

  let bass: number | undefined;
  const slash = /\/([35])$/.exec(rest);
  if (slash) {
    bass = Number(slash[1]) as 3 | 5;
    rest = rest.slice(0, -slash[0].length);
  }

  let quality: string;
  if (rest === "" ) {
    quality = baseQuality;
  } else if (rest === "°" || rest === "dim") {
    quality = "dim";
  } else if (rest === "°7" || rest === "dim7") {
    quality = "dim7";
  } else if (rest === "ø7" || rest === "m7b5") {
    quality = "m7b5";
  } else if (rest === "+" || rest === "aug") {
    quality = "aug";
  } else if (rest === "7") {
    quality = isUpper ? "7" : "m7";
  } else if (rest === "maj7") {
    quality = isUpper ? "maj7" : "mMaj7";
  } else if (rest === "6") {
    quality = isUpper ? "6" : "m6";
  } else if (rest === "9") {
    quality = isUpper ? "9" : "m9";
  } else if (rest === "sus2" || rest === "sus4" || rest === "5" || rest === "add9") {
    quality = rest;
  } else {
    throw new Error(`Invalid roman numeral: ${rn}`);
  }

  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  let root = mod12(key.root + scale[degree]!);
  if (accidental === "b") root = mod12(root - 1);
  if (accidental === "#") root = mod12(root + 1);

  const chord: ChordSym = { root, quality };
  if (bass !== undefined) {
    const pcs = chordPcs(chord);
    // bass /3 = third, /5 = fifth in the chord
    if (bass === 3) chord.bass = pcs[1];
    if (bass === 5) chord.bass = pcs[2];
  }
  return chord;
}
