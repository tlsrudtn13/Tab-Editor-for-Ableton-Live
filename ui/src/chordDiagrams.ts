export interface ChordVoicing {
  /** Frets per string, highest string first (index 0 = string 1). -1 = not played. */
  strings: number[];
  /** First fret shown in the diagram. */
  firstFret: number;
}

export interface TabNote {
  b: number;
  f: number;
  s: number;
}

/**
 * Voicing of the TAB notes that start at beat b (within 1e-3), as a chord-diagram shape.
 * Returns null when fewer than 2 notes sound at that beat.
 */
export function voicingAt(notes: TabNote[], b: number, stringCount: number): ChordVoicing | null {
  const at: TabNote[] = [];
  for (const n of notes) {
    if (Math.abs(n.b - b) <= 1e-3) at.push(n);
  }
  if (at.length < 2) return null;

  const strings = Array.from({ length: stringCount }, () => -1);
  for (const n of at) {
    const si = n.s - 1;
    if (si >= 0 && si < stringCount) strings[si] = n.f;
  }

  let highest = -1;
  let lowestNonZero = Infinity;
  for (const f of strings) {
    if (f < 0) continue;
    if (f > highest) highest = f;
    if (f > 0 && f < lowestNonZero) lowestNonZero = f;
  }

  const firstFret = highest <= 4 ? 1 : (Number.isFinite(lowestNonZero) ? lowestNonZero : 1);
  return { strings, firstFret };
}

/** True when two voicings are the same shape (same string frets and same diagram base). */
export function sameVoicing(a: ChordVoicing | null, b: ChordVoicing | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.firstFret !== b.firstFret) return false;
  if (a.strings.length !== b.strings.length) return false;
  for (let i = 0; i < a.strings.length; i++) {
    if (a.strings[i] !== b.strings[i]) return false;
  }
  return true;
}
