import type { VoicedNote } from "./chordVoicing.js";
import { mulberry32 } from "./rng.js";

export type CompPattern = { id: string; name: string; steps: string }; // one char per 16th of a 4/4 bar

export const COMP_PATTERNS: readonly CompPattern[] = [
  { id: "whole", name: "Whole notes", steps: "D---------------" },
  { id: "halves", name: "Half notes", steps: "D-------D-------" },
  { id: "quarters", name: "Quarters", steps: "D---D---D---D---" },
  { id: "eighths", name: "Eighths D-U", steps: "D-U-D-U-D-U-D-U-" },
  { id: "pop", name: "Pop strum", steps: "D---D-U---U-D-U-" },
  { id: "rock8", name: "Rock eighths", steps: "D-D-D-D-D-D-D-D-" },
  { id: "funk16", name: "Funk 16ths", steps: "D.UDU.D.UDU.D.U." },
  { id: "reggae", name: "Offbeat skank", steps: "....X.......X..." },
  { id: "arpUp", name: "Arpeggio", steps: "A-A-A-A-A-A-A-A-" },
  { id: "arp16", name: "Arpeggio 16ths", steps: "AAAAAAAAAAAAAAAA" },
];

export type CompChord = { b: number; d: number; notes: VoicedNote[] };
export type CompNote = { b: number; d: number; p: number; v: number; s: number; f: number };

type CompOpts = {
  spread?: number /* 0.02 beats between strings */;
  velocity?: number /* 95 */;
  upStrings?: number /* 4 */;
  beatsPerBar?: number /* 4 */;
  arp?: "up" | "updown";
};

const STEP_CHARS = new Set(["D", "U", "X", "A", "-", "."]);

function clampVel(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function normalizePattern(pattern: CompPattern | string, beatsPerBar: number): string {
  // A string is a preset id (like the drum presets) or, if no preset has that id, the raw steps.
  const steps = typeof pattern === "string"
    ? (COMP_PATTERNS.find((p) => p.id === pattern)?.steps ?? pattern)
    : pattern.steps;
  const expected = beatsPerBar * 4;
  let out = steps;
  if (beatsPerBar === 4) {
    if (out.length !== 16) throw new Error(`Pattern must have 16 chars for 4/4, got ${out.length}`);
  } else {
    if (out.length === 0) throw new Error("Pattern must not be empty");
    if (out.length !== expected) {
      // repeat/truncate the pattern per 16th
      if (out.length === 16) {
        if (expected < 16) out = out.slice(0, expected);
        else {
          let rep = "";
          while (rep.length < expected) rep += out;
          out = rep.slice(0, expected);
        }
      } else if (out.length === expected) {
        // ok
      } else {
        // repeat/truncate to expected
        let rep = "";
        while (rep.length < expected) rep += out;
        out = rep.slice(0, expected);
      }
    }
  }
  for (const ch of out) {
    if (!STEP_CHARS.has(ch)) throw new Error(`Invalid pattern char: ${ch}`);
  }
  return out;
}

function isWholeBeat(beat: number): boolean {
  return Math.abs(beat - Math.round(beat)) < 1e-9;
}

function sortedLowToHigh(notes: VoicedNote[]): VoicedNote[] {
  return [...notes].sort((a, b) => a.p - b.p || b.s - a.s);
}

function arpCycleOrder(count: number, mode: "up" | "updown"): number[] {
  if (count <= 0) return [];
  if (mode === "up" || count === 1) return Array.from({ length: count }, (_, i) => i);
  // updown: low->high->low without repeating the ends
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i);
  for (let i = count - 2; i >= 1; i--) out.push(i);
  return out;
}

/** Patterns Vary can change (a held whole / half / quarter chord stays as it is). */
export const VARIABLE_PATTERNS: readonly string[] = ["eighths", "pop", "rock8", "funk16", "reggae", "arpUp", "arp16"];

/**
 * A variation of a strum pattern for Vary (seed 1 = the pattern as written). Beat downstrokes stay; on the "and"
 * of a beat an upstroke may be added or left out. Arpeggios keep their steps (Vary changes their order instead).
 * Same seed, same result.
 */
export function varyPattern(steps: string, seed: number): string {
  if (seed === 1 || !steps.length) return steps;
  const rnd = mulberry32(seed);
  const out = steps.split("");
  if (!out.some((c) => c === "D" || c === "U")) return steps;
  let changed = false;
  for (let i = 0; i < out.length; i++) {
    if (i % 4 !== 2) continue;                       // only the "and" of each beat
    const c = out[i]!;
    if (c === "U" && rnd() < 0.35) { out[i] = "-"; changed = true; }
    else if (c === "-" && rnd() < 0.35) { out[i] = "U"; changed = true; }
  }
  if (!changed) {
    // always give something new: flip the last "and" that can flip
    for (let i = out.length - 2; i >= 2; i -= 4) {
      if (out[i] === "U") { out[i] = "-"; break; }
      if (out[i] === "-") { out[i] = "U"; break; }
    }
  }
  return out.join("");
}

export function compChords(
  chords: CompChord[],
  pattern: CompPattern | string,
  opts?: CompOpts,
): CompNote[] {
  const spread = opts?.spread ?? 0.02;
  const velocity = opts?.velocity ?? 95;
  const upStrings = opts?.upStrings ?? 4;
  const beatsPerBar = opts?.beatsPerBar ?? 4;
  const arpMode = opts?.arp ?? "up";

  const steps = normalizePattern(pattern, beatsPerBar);
  const stepLen = 0.25; // 16th in beats
  const out: CompNote[] = [];

  for (const chord of chords) {
    const chordStart = chord.b;
    const chordEnd = chord.b + chord.d;
    const voiced = sortedLowToHigh(chord.notes);
    const arpOrder = arpCycleOrder(voiced.length, arpMode);
    let arpIdx = 0;

    // determine steps that fall within this chord
    const maxSteps = Math.ceil(chord.d / stepLen);
    for (let i = 0; i < maxSteps; i++) {
      const stepBeatOffset = i * stepLen;
      const stepTime = chordStart + stepBeatOffset;
      if (stepTime >= chordEnd - 1e-9) break;
      const ch = steps[i % steps.length]!;
      if (ch === "-" || ch === ".") continue;

      // find event end: next non-hold step or chord end
      let endTime = chordEnd;
      for (let j = i + 1; j < maxSteps; j++) {
        const jt = chordStart + j * stepLen;
        if (jt >= chordEnd - 1e-9) { endTime = chordEnd; break; }
        const jch = steps[j % steps.length]!;
        if (jch !== "-") { endTime = jt; break; }
      }

      const wholeBeat = isWholeBeat(stepBeatOffset);
      const baseVel = wholeBeat ? velocity : velocity - 8;

      if (ch === "D" || ch === "U" || ch === "X") {
        let strumNotes: VoicedNote[];
        let noteVel = baseVel;
        let noteSpread = spread;
        if (ch === "D") {
          strumNotes = [...voiced]; // low to high
        } else if (ch === "U") {
          const top = voiced.slice(Math.max(0, voiced.length - upStrings));
          strumNotes = [...top].reverse(); // highest first
          noteVel = baseVel - 15;
        } else {
          strumNotes = [...voiced];
          noteSpread = 0;
        }
        for (let k = 0; k < strumNotes.length; k++) {
          const vn = strumNotes[k]!;
          const nb = stepTime + k * noteSpread;
          const d = Math.max(0.05, endTime - nb);
          out.push({
            b: round6(nb),
            d,
            p: vn.p,
            v: clampVel(noteVel),
            s: vn.s,
            f: vn.f,
          });
        }
      } else if (ch === "A") {
        if (voiced.length === 0) continue;
        const orderIdx = arpOrder[arpIdx % arpOrder.length]!;
        arpIdx++;
        const vn = voiced[orderIdx]!;
        const d = Math.max(0.05, endTime - stepTime);
        out.push({
          b: round6(stepTime),
          d,
          p: vn.p,
          v: clampVel(baseVel),
          s: vn.s,
          f: vn.f,
        });
      }
    }
  }

  out.sort((a, b) => a.b - b.b || a.p - b.p);
  return out;
}
