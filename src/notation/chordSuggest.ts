import { chordName, MAJOR_SCALE, MINOR_SCALE, parseRoman, type ChordSym, type KeyRef } from "./harmony.js";
import { romanOf, type ChordTier } from "./harmonyAnalysis.js";

export type SuggestReason = "home" | "away" | "build" | "tension" | "surprise" | "colour" | "same";
export type Suggestion = {
  chord: ChordSym;
  name: string;
  roman: string;
  tier: ChordTier;
  score: number;
  reason: SuggestReason;
};

type TriadClass = "major" | "minor" | "dim";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function scaleOf(key: KeyRef): readonly number[] {
  return key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
}

function triadClass(quality: string): TriadClass {
  if (quality === "dim" || quality === "dim7" || quality === "m7b5") return "dim";
  if (quality === "m" || quality === "m7" || quality === "m6" || quality === "m9" || quality === "mMaj7") return "minor";
  return "major";
}

function sameChord(a: ChordSym, b: ChordSym): boolean {
  return mod12(a.root) === mod12(b.root) && a.quality === b.quality && (a.bass === undefined) === (b.bass === undefined) && (a.bass === undefined || mod12(a.bass) === mod12(b.bass!));
}

type TableEntry = { to: string; weight: number };
type TransitionTable = Record<string, TableEntry[]>;

const MAJOR_TABLE: TransitionTable = {
  I: [
    { to: "IV", weight: 0.25 },
    { to: "V", weight: 0.25 },
    { to: "vi", weight: 0.2 },
    { to: "ii", weight: 0.12 },
    { to: "iii", weight: 0.05 },
  ],
  ii: [
    { to: "V", weight: 0.5 },
    { to: "IV", weight: 0.12 },
    { to: "I", weight: 0.1 },
    { to: "vii°", weight: 0.08 },
    { to: "vi", weight: 0.05 },
  ],
  iii: [
    { to: "vi", weight: 0.4 },
    { to: "IV", weight: 0.3 },
    { to: "ii", weight: 0.1 },
    { to: "I", weight: 0.1 },
  ],
  IV: [
    { to: "V", weight: 0.3 },
    { to: "I", weight: 0.3 },
    { to: "ii", weight: 0.1 },
    { to: "vi", weight: 0.1 },
  ],
  V: [
    { to: "I", weight: 0.55 },
    { to: "vi", weight: 0.25 },
    { to: "IV", weight: 0.1 },
    { to: "iii", weight: 0.05 },
  ],
  vi: [
    { to: "IV", weight: 0.35 },
    { to: "ii", weight: 0.25 },
    { to: "V", weight: 0.2 },
    { to: "iii", weight: 0.1 },
    { to: "I", weight: 0.1 },
  ],
  "vii°": [
    { to: "I", weight: 0.7 },
    { to: "iii", weight: 0.1 },
    { to: "vi", weight: 0.1 },
  ],
};

const MINOR_TABLE: TransitionTable = {
  i: [
    { to: "iv", weight: 0.25 },
    { to: "VI", weight: 0.2 },
    { to: "VII", weight: 0.2 },
    { to: "V", weight: 0.15 },
    { to: "III", weight: 0.1 },
    { to: "v", weight: 0.05 },
    { to: "ii°", weight: 0.05 },
  ],
  "ii°": [
    { to: "V", weight: 0.6 },
    { to: "i", weight: 0.1 },
    { to: "iv", weight: 0.1 },
  ],
  III: [
    { to: "VI", weight: 0.35 },
    { to: "iv", weight: 0.25 },
    { to: "VII", weight: 0.2 },
    { to: "i", weight: 0.1 },
  ],
  iv: [
    { to: "V", weight: 0.3 },
    { to: "i", weight: 0.25 },
    { to: "VII", weight: 0.2 },
    { to: "VI", weight: 0.1 },
  ],
  V: [
    { to: "i", weight: 0.65 },
    { to: "VI", weight: 0.25 },
  ],
  v: [
    { to: "i", weight: 0.4 },
    { to: "VI", weight: 0.3 },
    { to: "iv", weight: 0.2 },
  ],
  VI: [
    { to: "VII", weight: 0.3 },
    { to: "iv", weight: 0.25 },
    { to: "III", weight: 0.15 },
    { to: "V", weight: 0.15 },
    { to: "i", weight: 0.1 },
  ],
  VII: [
    { to: "III", weight: 0.4 },
    { to: "i", weight: 0.3 },
    { to: "VI", weight: 0.2 },
  ],
};

const MAJOR_START: TableEntry[] = [
  { to: "I", weight: 0.4 },
  { to: "IV", weight: 0.2 },
  { to: "vi", weight: 0.2 },
  { to: "V", weight: 0.2 },
];

const MINOR_START: TableEntry[] = [
  { to: "i", weight: 0.4 },
  { to: "iv", weight: 0.2 },
  { to: "VI", weight: 0.2 },
  { to: "VII", weight: 0.2 },
];

function tableFor(key: KeyRef): TransitionTable {
  return key.mode === "major" ? MAJOR_TABLE : MINOR_TABLE;
}

function startFor(key: KeyRef): TableEntry[] {
  return key.mode === "major" ? MAJOR_START : MINOR_START;
}

function findFromRow(prev: ChordSym | undefined, key: KeyRef): TableEntry[] {
  if (!prev) return startFor(key);
  const table = tableFor(key);
  const prevClass = triadClass(prev.quality);
  const prevRoot = mod12(prev.root);
  for (const rn of Object.keys(table)) {
    const parsed = parseRoman(rn, key);
    if (mod12(parsed.root) === prevRoot && triadClass(parsed.quality) === prevClass) {
      return table[rn]!;
    }
  }
  return startFor(key);
}

function isDeceptiveTarget(chord: ChordSym, key: KeyRef): boolean {
  const sc = scaleOf(key);
  const deg5Root = mod12(key.root + sc[5]!);
  if (mod12(chord.root) !== deg5Root) return false;
  if (key.mode === "major") return triadClass(chord.quality) === "minor";
  return triadClass(chord.quality) === "major";
}

function reasonFor(prev: ChordSym | undefined, cand: ChordSym, key: KeyRef, isColour: boolean): SuggestReason {
  if (isColour) return "colour";
  const candLbl = romanOf(cand, key);
  if (!prev) return "away";
  const prevLbl = romanOf(prev, key);
  if (prevLbl.fn === "D" && isDeceptiveTarget(cand, key)) return "surprise";
  if (prevLbl.fn === "D" && candLbl.fn === "T") return "home";
  if (prevLbl.fn === "T" && candLbl.fn === "S") return "away";
  if (prevLbl.fn === "S" && candLbl.fn === "D") return "build";
  if (candLbl.fn === "D") return "tension";
  return "away";
}

function suggestionFromChord(chord: ChordSym, key: KeyRef, score: number, reason: SuggestReason): Suggestion {
  const lbl = romanOf(chord, key);
  return { chord, name: chordName(chord), roman: lbl.roman, tier: lbl.tier, score, reason };
}

function colourOptionsNext(key: KeyRef): ChordSym[] {
  const sc = scaleOf(key);
  if (key.mode === "major") {
    return [
      parseRoman("bVII", key),
      parseRoman("iv", key),
      parseRoman("bVI", key),
      { root: mod12(key.root + sc[2]!), quality: "7" }, // V7/vi (dominant 7 on 3rd degree)
      { root: mod12(key.root + sc[5]!), quality: "7" }, // V7/ii (dominant 7 on 6th degree)
    ];
  }
  return [
    { root: mod12(key.root + sc[3]!), quality: "" }, // IV (major, dorian)
    { root: mod12(key.root + 1), quality: "" }, // bII, a semitone above root
  ];
}

export function suggestNext(
  prev: ChordSym | undefined,
  key: KeyRef,
  opts?: { limit?: number },
): Suggestion[] {
  const limit = opts?.limit ?? 6;
  const row = findFromRow(prev, key);
  const out: Suggestion[] = [];
  const seen: ChordSym[] = [];

  for (const entry of row) {
    const chord = parseRoman(entry.to, key);
    if (seen.some((s) => sameChord(s, chord))) continue;
    seen.push(chord);
    out.push(suggestionFromChord(chord, key, entry.weight, reasonFor(prev, chord, key, false)));
  }

  for (const chord of colourOptionsNext(key)) {
    if (seen.some((s) => sameChord(s, chord))) continue;
    seen.push(chord);
    out.push(suggestionFromChord(chord, key, 0.05, "colour"));
  }

  out.sort((a, b) => b.score - a.score || a.roman.localeCompare(b.roman));
  return out.slice(0, limit);
}

function findRowExact(from: ChordSym, key: KeyRef): TableEntry[] | undefined {
  const table = tableFor(key);
  const fromClass = triadClass(from.quality);
  const fromRoot = mod12(from.root);
  for (const rn of Object.keys(table)) {
    const parsed = parseRoman(rn, key);
    if (mod12(parsed.root) === fromRoot && triadClass(parsed.quality) === fromClass) {
      return table[rn]!;
    }
  }
  return undefined;
}

function lookupWeight(from: ChordSym | undefined, to: ChordSym | undefined, key: KeyRef): number {
  if (!from || !to) return 0;
  const row = findRowExact(from, key);
  if (!row) return 0;
  const toClass = triadClass(to.quality);
  const toRoot = mod12(to.root);
  for (const entry of row) {
    const parsed = parseRoman(entry.to, key);
    if (mod12(parsed.root) === toRoot && triadClass(parsed.quality) === toClass) return entry.weight;
  }
  return 0;
}

function diatonicTriads(key: KeyRef): ChordSym[] {
  const sc = scaleOf(key);
  if (key.mode === "major") {
    return [
      { root: mod12(key.root + sc[0]!), quality: "" },
      { root: mod12(key.root + sc[1]!), quality: "m" },
      { root: mod12(key.root + sc[2]!), quality: "m" },
      { root: mod12(key.root + sc[3]!), quality: "" },
      { root: mod12(key.root + sc[4]!), quality: "" },
      { root: mod12(key.root + sc[5]!), quality: "m" },
      { root: mod12(key.root + sc[6]!), quality: "dim" },
    ];
  }
  return [
    { root: mod12(key.root + sc[0]!), quality: "m" },
    { root: mod12(key.root + sc[1]!), quality: "dim" },
    { root: mod12(key.root + sc[2]!), quality: "" },
    { root: mod12(key.root + sc[3]!), quality: "m" },
    { root: mod12(key.root + sc[4]!), quality: "" }, // V (harmonic minor dominant)
    { root: mod12(key.root + sc[5]!), quality: "" },
    { root: mod12(key.root + sc[6]!), quality: "" },
  ];
}

function sameFunctionGroup(fn: string, key: KeyRef): number[] {
  // returns degree indices in diatonic triads
  if (key.mode === "major") {
    if (fn === "T") return [0, 2, 5];
    if (fn === "S") return [1, 3];
    if (fn === "D") return [4, 6];
  } else {
    if (fn === "T") return [0, 2, 5];
    if (fn === "S") return [1, 3];
    if (fn === "D") return [4, 6];
  }
  return [];
}

function diatonicSeventhQuality(key: KeyRef, degree: number): string {
  if (key.mode === "major") return ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"][degree]!;
  return ["m7", "m7b5", "maj7", "m7", "7", "maj7", "7"][degree]!;
}

function richerVersions(current: ChordSym, key: KeyRef): ChordSym[] {
  const sc = scaleOf(key);
  const deg = sc.findIndex((iv) => mod12(key.root + iv) === mod12(current.root));
  const out: ChordSym[] = [];
  if (deg >= 0) {
    out.push({ root: current.root, quality: diatonicSeventhQuality(key, deg) });
  } else {
    // not on a diatonic scale degree - still provide generic richer versions
    const cls = triadClass(current.quality);
    if (cls === "major") out.push({ root: current.root, quality: "maj7" });
    else if (cls === "minor") out.push({ root: current.root, quality: "m7" });
    else out.push({ root: current.root, quality: "m7b5" });
  }
  out.push({ root: current.root, quality: "sus2" });
  out.push({ root: current.root, quality: "sus4" });
  if (triadClass(current.quality) === "major") out.push({ root: current.root, quality: "add9" });
  return out;
}

function altColourOptions(current: ChordSym, key: KeyRef, next: ChordSym | undefined): ChordSym[] {
  const lbl = romanOf(current, key);
  const fn = lbl.fn;
  const out: ChordSym[] = [];
  if (key.mode === "major") {
    if (fn === "T") {
      out.push(parseRoman("bVI", key));
      out.push(parseRoman("bIII", key));
    } else if (fn === "S") {
      out.push(parseRoman("iv", key));
      out.push(parseRoman("bVII", key));
    } else if (fn === "D") {
      out.push(parseRoman("bVII", key));
      if (next && !(mod12(next.root) === mod12(key.root) && triadClass(next.quality) === "major")) {
        out.push({ root: mod12(next.root + 7), quality: "7" }); // V7/next
      }
    }
  } else {
    if (fn === "S") {
      out.push({ root: mod12(key.root + scaleOf(key)[3]!), quality: "" }); // IV major
    } else if (fn === "D") {
      out.push({ root: mod12(key.root + 1), quality: "" }); // bII
    }
    // T chord → none
  }
  return out;
}

export function suggestAlternatives(
  current: ChordSym,
  key: KeyRef,
  opts?: { prev?: ChordSym; next?: ChordSym; limit?: number },
): Suggestion[] {
  const limit = opts?.limit ?? 6;
  const prev = opts?.prev;
  const next = opts?.next;
  const out: Suggestion[] = [];
  const seen: ChordSym[] = [];

  function add(chord: ChordSym, base: number, reason: SuggestReason) {
    if (sameChord(chord, current)) return;
    if (seen.some((s) => sameChord(s, chord))) return;
    seen.push(chord);
    const wPrev = lookupWeight(prev, chord, key);
    const wNext = lookupWeight(chord, next, key);
    const score = base * (1 + wPrev + wNext);
    out.push(suggestionFromChord(chord, key, score, reason));
  }

  // same function, other diatonic triads
  const curLbl = romanOf(current, key);
  const group = sameFunctionGroup(curLbl.fn, key);
  const triads = diatonicTriads(key);
  for (const deg of group) {
    const cand = triads[deg]!;
    add(cand, 0.5, "same");
  }

  // richer versions of the same root
  for (const cand of richerVersions(current, key)) {
    add(cand, 0.4, "same");
  }

  // colour options
  for (const cand of altColourOptions(current, key, next)) {
    add(cand, 0.2, "colour");
  }

  out.sort((a, b) => b.score - a.score || a.roman.localeCompare(b.roman));
  return out.slice(0, limit);
}
