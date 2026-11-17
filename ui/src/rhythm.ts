export type Note = { b: number; d: number; p: number; v?: number; s: number; f: number; oid?: number; dirty?: boolean; de?: boolean; lock?: boolean; [k: string]: any };

export function durFromValue(den: number, dot: boolean, triplet: boolean): number {
  let d = 4 / den;
  if (dot) d *= 1.5;
  if (triplet) d *= 2 / 3;
  return d;
}

export function valueFromDur(d: number): { den: number; dot: boolean; triplet: boolean } | null {
  const dens = [1, 2, 4, 8, 16, 32];
  for (const den of dens) {
    for (const triplet of [false, true]) {
      for (const dot of [false, true]) {
        if (Math.abs(durFromValue(den, dot, triplet) - d) < 1e-3) return { den, dot, triplet };
      }
    }
  }
  return null;
}

export function durName(d: number): string {
  const v = valueFromDur(d);
  if (!v) return d.toFixed(3);
  const base = `1/${v.den}`;
  return base + (v.dot ? "." : "") + (v.triplet ? "T" : "");
}

export function clampDurToSpan(d: number, b: number, spanEnd: number): number {
  const max = Math.max(0.125, spanEnd - b);
  return Math.min(d, max);
}

/** Shift notes with b >= fromBeat in span [spanStart,spanEnd) by delta; returns {notes,error}. */
export function shiftNotesInSpan(
  notes: Note[],
  fromBeat: number,
  delta: number,
  span: { start: number; end: number },
): { notes: Note[]; error?: string } {
  const out = notes.map(n => ({ ...n }));
  for (const n of out) {
    if (n.b >= fromBeat - 1e-6 && n.b < span.end - 1e-6 && n.b >= span.start - 1e-6) {
      const nb = n.b + delta;
      const ndEnd = nb + (n.d || 0);
      if (nb < span.start - 1e-6 || ndEnd > span.end + 1e-6) return { notes, error: "span" };
      n.b = nb;
      if (n.oid !== undefined) n.dirty = true;
    }
  }
  return { notes: out };
}

/**
 * Insert a beat: every note of the span starting at or after cursorB moves right by slotLen (like Guitar Pro).
 * The clip does not grow, so notes pushed to or past the span end are removed (their oids in `deleted`) and
 * notes crossing the end are shortened.
 */
export function insertBeatShift(notes: Note[], cursorB: number, slotLen: number, span: { start: number; end: number }): { notes: Note[]; deleted: number[]; trimmed: number } {
  const out: Note[] = [];
  const deleted: number[] = [];
  let trimmed = 0;
  for (const src of notes) {
    const n = { ...src };
    const inSpan = n.b >= span.start - 1e-6 && n.b < span.end - 1e-6;
    if (inSpan && n.b >= cursorB - 1e-6) {
      n.b += slotLen;
      if (n.oid !== undefined) n.dirty = true;
      if (n.b >= span.end - 1e-6) { if (n.oid !== undefined) deleted.push(n.oid); continue; }
      if (n.b + n.d > span.end + 1e-6) { n.d = span.end - n.b; n.de = true; trimmed++; }
    }
    out.push(n);
  }
  return { notes: out, deleted, trimmed };
}

export function deleteBeatShift(notes: Note[], cursorB: number, slotLen: number, span: { start: number; end: number }): { notes: Note[]; deleted: number[]; error?: string } {
  const kept: Note[] = [];
  const deleted: number[] = [];
  for (const n of notes) {
    if (Math.abs(n.b - cursorB) < 1e-6 && n.b >= span.start - 1e-6 && n.b < span.end - 1e-6) {
      if (n.oid !== undefined) deleted.push(n.oid);
      continue;
    }
    kept.push({ ...n });
  }
  const shifted = shiftNotesInSpan(kept, cursorB + 1e-6, -slotLen, span);
  if (shifted.error) return { notes, deleted: [], error: shifted.error };
  return { notes: shifted.notes, deleted };
}

export type TieDecision =
  | { kind: "merge-note"; targetIndex: number; newDur: number }
  | { kind: "extend-rest"; newDur: number }
  | { kind: "none"; reason: string };

/** Decide tie action for note at cursor. notes are all track notes, cursor gives b/s, slots give next slot info. */
export function tieDecision(
  notes: Note[],
  noteIndex: number,
  next: { b: number; d: number; isRest: boolean } | null,
  spanEnd: number,
): TieDecision {
  const n = notes[noteIndex];
  if (!n || !next) return { kind: "none", reason: "no next slot" };
  const tol = 1e-6;
  // next slot starts at current note end?
  const noteEnd = n.b + n.d;
  if (Math.abs(noteEnd - next.b) > 1e-3) return { kind: "none", reason: "next slot not adjacent" };
  if (!next.isRest) {
    const targetIndex = notes.findIndex(m => m.s === n.s && m.p === n.p && Math.abs(m.b - next.b) < tol);
    if (targetIndex >= 0) {
      const t = notes[targetIndex];
      const newDur = n.d + t.d;
      if (n.b + newDur > spanEnd + 1e-6) return { kind: "none", reason: "would cross span end" };
      return { kind: "merge-note", targetIndex, newDur };
    }
    return { kind: "none", reason: "next note differs" };
  }
  // rest slot
  const newDur = n.d + next.d;
  if (n.b + newDur > spanEnd + 1e-6) return { kind: "none", reason: "would cross span end" };
  return { kind: "extend-rest", newDur };
}
