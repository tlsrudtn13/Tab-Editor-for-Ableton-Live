import { PC_NAMES, chordPcs } from "./harmony.js";
import type { ChordSym } from "./harmony.js";
import type { InstrumentConfig } from "./instruments.js";

export type VoicingStyle = "open" | "power" | "barre" | "triad" | "rootFifth";
export type VoicedNote = { p: number; s: number; f: number };

const STANDARD_6_OPEN = [0, 64, 59, 55, 50, 45, 40] as const;

function sameTuning(open: number[], ref: readonly number[]): boolean {
  return open.length === ref.length && open.every((v, i) => v === ref[i]);
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function place(pitch: number, s: number, open: number[], maxFret: number): VoicedNote | null {
  const f = pitch - open[s]!;
  if (f < 0 || f > maxFret) return null;
  return { p: pitch, s, f };
}

function sortedByPitch(notes: VoicedNote[]): VoicedNote[] {
  return [...notes].sort((a, b) => a.p - b.p || b.s - a.s);
}

function lowestPitchOnString(pc: number, s: number, open: number[], maxFret: number): VoicedNote | null {
  const base = open[s]!;
  // find lowest pitch with that pc and fret in 0..maxFret
  let p = base;
  const rem = mod12(pc - mod12(p));
  p += rem;
  while (p < base) p += 12;
  if (p - base > maxFret) return null;
  return { p, s, f: p - base };
}

function allPitchesOnString(pc: number, s: number, open: number[], maxFret: number): VoicedNote[] {
  const base = open[s]!;
  const out: VoicedNote[] = [];
  let p = base;
  const rem = mod12(pc - mod12(p));
  p += rem;
  while (p < base) p += 12;
  for (; p - base <= maxFret; p += 12) out.push({ p, s, f: p - base });
  return out;
}

function voiceRootFifth(chord: ChordSym, inst: InstrumentConfig, maxFret: number): VoicedNote[] {
  const open = inst.open;
  const rootPc = mod12(chord.root);
  const bassPc = chord.bass !== undefined ? mod12(chord.bass) : rootPc;

  type Cand = { notes: VoicedNote[]; rootFret: number; rootString: number };
  const cands: Cand[] = [];

  const rootStrings = [inst.stringCount, inst.stringCount - 1];
  for (const rs of rootStrings) {
    if (rs < 1) continue;
    const rootNote = lowestPitchOnString(bassPc, rs, open, maxFret);
    if (!rootNote) continue;
    const actualRootPitch = lowestPitchOnString(rootPc, rs, open, maxFret);
    if (!actualRootPitch) continue;
    const rootFret = rootNote.f;
    const chordRootPitch = actualRootPitch.p;
    const fifthString = rs - 1;
    let fifthNote: VoicedNote | null = null;
    if (fifthString >= 1) {
      const targetFifthPitch = chordRootPitch + 7;
      fifthNote = place(targetFifthPitch, fifthString, open, maxFret);
      if (!fifthNote) fifthNote = place(targetFifthPitch, rs, open, maxFret);
    }
    if (!fifthNote) continue;
    if (fifthNote.s === rootNote.s) continue;
    cands.push({ notes: sortedByPitch([rootNote, fifthNote]), rootFret, rootString: rs });
  }

  if (!cands.length) return [];
  cands.sort((a, b) => a.rootFret - b.rootFret || b.rootString - a.rootString);
  return cands[0]!.notes;
}

function voicePower(chord: ChordSym, inst: InstrumentConfig, maxFret: number): VoicedNote[] {
  const open = inst.open;
  const rootPc = mod12(chord.root);
  const bassPc = chord.bass !== undefined ? mod12(chord.bass) : rootPc;

  type Cand = { notes: VoicedNote[]; rootFret: number; rootString: number };
  const cands: Cand[] = [];
  const rootStrings = [inst.stringCount, inst.stringCount - 1];
  for (const rs of rootStrings) {
    if (rs < 1) continue;
    const rootNote = lowestPitchOnString(bassPc, rs, open, maxFret);
    if (!rootNote) continue;
    const actualRootPitch = lowestPitchOnString(rootPc, rs, open, maxFret);
    if (!actualRootPitch) continue;
    const chordRootPitch = actualRootPitch.p;
    const fifthString = rs - 1;
    if (fifthString < 1) continue;
    let fifthNote = place(chordRootPitch + 7, fifthString, open, maxFret);
    if (!fifthNote) fifthNote = place(chordRootPitch + 7, rs, open, maxFret);
    if (!fifthNote) continue;
    if (fifthNote.s === rootNote.s) continue;
    const notes: VoicedNote[] = [rootNote, fifthNote];
    const octaveString = fifthNote.s - 1;
    if (octaveString >= 1) {
      const octNote = place(chordRootPitch + 12, octaveString, open, maxFret);
      if (octNote && !notes.some(n => n.s === octNote.s)) notes.push(octNote);
    }
    cands.push({ notes: sortedByPitch(notes), rootFret: rootNote.f, rootString: rs });
  }
  if (!cands.length) return [];
  cands.sort((a, b) => a.rootFret - b.rootFret || b.rootString - a.rootString);
  return cands[0]!.notes;
}

function barreShapes(): { quality: string; E: number[]; A: number[] }[] {
  return [
    { quality: "", E: [0, 7, 12, 16, 19, 24], A: [0, 7, 12, 16, 19] },
    { quality: "m", E: [0, 7, 12, 15, 19, 24], A: [0, 7, 12, 15, 19] },
    { quality: "7", E: [0, 7, 10, 16, 19, 24], A: [0, 7, 10, 16, 19] },
    { quality: "m7", E: [0, 7, 10, 15, 19, 24], A: [0, 7, 10, 15, 19] },
    { quality: "maj7", E: [0, 7, 11, 16, 19, 24], A: [0, 7, 11, 16, 19] },
  ];
}

function voiceBarre(chord: ChordSym, inst: InstrumentConfig, maxFret: number): VoicedNote[] {
  if (inst.stringCount < 6) return voiceTriad(chord, inst, maxFret);
  const shapeDef = barreShapes().find(s => s.quality === chord.quality);
  if (!shapeDef) return voiceTriad(chord, inst, maxFret);
  const open = inst.open;
  const rootPc = mod12(chord.root);

  type Cand = { notes: VoicedNote[]; rootFret: number; shape: "E" | "A" };
  const cands: Cand[] = [];

  const tryShape = (shape: "E" | "A", rootString: number, intervals: number[], strings: number[]) => {
    for (let fret = 1; fret <= maxFret; fret++) {
      const rootPitch = open[rootString]! + fret;
      if (mod12(rootPitch) !== rootPc) continue;
      // scanning ascending: the first valid fret is the lowest one
      const notes: VoicedNote[] = [];
      let ok = true;
      for (let i = 0; i < intervals.length; i++) {
        const s = strings[i]!;
        const p = rootPitch + intervals[i]!;
        const n = place(p, s, open, maxFret);
        if (!n) { ok = false; break; }
        notes.push(n);
      }
      if (!ok) continue;
      const frets = notes.map(n => n.f);
      const span = Math.max(...frets) - Math.min(...frets);
      if (span > 4) continue;
      cands.push({ notes: sortedByPitch(notes), rootFret: fret, shape });
      break; // lowest such fret on that string
    }
  };

  tryShape("E", 6, shapeDef.E, [6, 5, 4, 3, 2, 1]);
  tryShape("A", 5, shapeDef.A, [5, 4, 3, 2, 1]);

  if (!cands.length) return voiceTriad(chord, inst, maxFret);
  cands.sort((a, b) => a.rootFret - b.rootFret || (a.shape === "E" ? -1 : 1));
  return cands[0]!.notes;
}

const OPEN_TABLE: Record<string, string> = {
  "C": "x32010",
  "A": "x02220",
  "G": "320003",
  "E": "022100",
  "D": "xx0232",
  "Am": "x02210",
  "Em": "022000",
  "Dm": "xx0231",
  "A7": "x02020",
  "D7": "xx0212",
  "E7": "020100",
  "G7": "320001",
  "C7": "x32310",
  "B7": "x21202",
  "Am7": "x02010",
  "Em7": "020000",
  "Dm7": "xx0211",
  "Cmaj7": "x32000",
  "Fmaj7": "xx3210",
  "Amaj7": "x02120",
  "Dmaj7": "xx0222",
  "Asus2": "x02200",
  "Asus4": "x02230",
  "Dsus2": "xx0230",
  "Dsus4": "xx0233",
  "Esus4": "022200",
  "E5": "022xxx",
  "A5": "x022xx",
};

function chordNameSimple(chord: ChordSym): string {
  return PC_NAMES[mod12(chord.root)]! + chord.quality;
}

function voiceOpen(chord: ChordSym, inst: InstrumentConfig, maxFret: number): VoicedNote[] {
  if (!sameTuning(inst.open, STANDARD_6_OPEN)) return voiceBarre(chord, inst, maxFret);
  const lookup: ChordSym = { root: chord.root, quality: chord.quality }; // drop bass for lookup
  const name = chordNameSimple(lookup);
  const pat = OPEN_TABLE[name];
  if (!pat) return voiceBarre(chord, inst, maxFret);
  // frets listed string 6 -> 1
  if (pat.length !== 6) return voiceBarre(chord, inst, maxFret);
  const notes: VoicedNote[] = [];
  for (let i = 0; i < 6; i++) {
    const s = 6 - i;
    const ch = pat[i]!;
    if (ch === "x" || ch === "X") continue;
    const f = parseInt(ch, 16); // 0-9,a-f but our table uses 0-3
    if (Number.isNaN(f)) continue;
    const p = inst.open[s]! + f;
    const n = place(p, s, inst.open, maxFret);
    if (!n) return voiceBarre(chord, inst, maxFret);
    notes.push(n);
  }
  return sortedByPitch(notes);
}

function voiceTriad(chord: ChordSym, inst: InstrumentConfig, maxFret: number): VoicedNote[] {
  const pcsArr = chordPcs(chord);
  if (pcsArr.length < 3) return voiceRootFifth(chord, inst, maxFret);
  const triadPcs = [pcsArr[0]!, pcsArr[1]!, pcsArr[2]!];
  const open = inst.open;

  const stringSets: number[][] = [[3, 2, 1], [4, 3, 2]];
  if (inst.stringCount === 4 || inst.stringCount === 5) {
    stringSets.push([inst.stringCount, inst.stringCount - 1, inst.stringCount - 2]);
  }

  type Cand = { notes: VoicedNote[]; maxFretInChord: number; setIndex: number };
  const cands: Cand[] = [];

  for (let setIndex = 0; setIndex < stringSets.length; setIndex++) {
    const set = stringSets[setIndex]!;
    // set is low->high in pitch? [3,2,1] means strings 3,2,1 (low to high pitch). Yes, descending s = ascending pitch.
    // adjacent strings: 3,2,1 are adjacent.
    for (let inv = 0; inv < 3; inv++) {
      // inversion: which chord tone is bass of triad
      const ordered = [triadPcs[inv]!, triadPcs[(inv + 1) % 3]!, triadPcs[(inv + 2) % 3]!];
      // close position: each tone the next one above the previous
      // try every octave - enumerate by base pitch on lowest string of set
      const lowString = set[0]!;
      const baseCandidates = allPitchesOnString(ordered[0]!, lowString, open, maxFret);
      for (const base of baseCandidates) {
        let prevPitch = base.p;
        const notes: VoicedNote[] = [base];
        let ok = true;
        for (let i = 1; i < 3; i++) {
          const s = set[i]!;
          const pc = ordered[i]!;
          // next above previous
          let p = prevPitch + 1;
          const rem = mod12(pc - mod12(p));
          p += rem;
          if (mod12(p) !== pc) { ok = false; break; }
          const n = place(p, s, open, maxFret);
          if (!n) { ok = false; break; }
          notes.push(n);
          prevPitch = p;
        }
        if (!ok) continue;
        const frets = notes.map(n => n.f);
        const span = Math.max(...frets) - Math.min(...frets);
        if (span > 4) continue;
        cands.push({ notes: sortedByPitch(notes), maxFretInChord: Math.max(...frets), setIndex });
      }
    }
  }

  if (!cands.length) return voiceRootFifth(chord, inst, maxFret);
  cands.sort((a, b) => a.maxFretInChord - b.maxFretInChord || a.setIndex - b.setIndex);
  // tie -> string set [3,2,1] (setIndex 0 is [3,2,1] in our order)
  return cands[0]!.notes;
}

export function voiceChord(
  chord: ChordSym,
  style: VoicingStyle,
  inst: InstrumentConfig,
  opts?: { maxFret?: number },
): VoicedNote[] {
  const maxFret = opts?.maxFret ?? 15;
  try {
    let out: VoicedNote[];
    switch (style) {
      case "rootFifth":
        out = voiceRootFifth(chord, inst, maxFret);
        break;
      case "power":
        out = voicePower(chord, inst, maxFret);
        break;
      case "barre":
        out = voiceBarre(chord, inst, maxFret);
        break;
      case "open":
        out = voiceOpen(chord, inst, maxFret);
        break;
      case "triad":
        out = voiceTriad(chord, inst, maxFret);
        break;
      default:
        out = [];
    }
    // validate
    const seen = new Set<number>();
    const valid: VoicedNote[] = [];
    for (const n of out) {
      if (n.p !== inst.open[n.s]! + n.f) continue;
      if (n.f < 0 || n.f > maxFret) continue;
      if (n.s < 1 || n.s > inst.stringCount) continue;
      if (seen.has(n.s)) continue;
      seen.add(n.s);
      valid.push(n);
    }
    return sortedByPitch(valid);
  } catch {
    return [];
  }
}
