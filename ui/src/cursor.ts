import { state } from "./state";

export type Cursor = { b: number; s: number };
export type Slot = { b: number; d: number; bar: number; isRest: boolean };

/** Pure: index of slot with beat b, or -1. */
export function slotIndex(slots: Slot[], b: number): number {
  for (let i = 0; i < slots.length; i++) {
    if (Math.abs(slots[i].b - b) < 1e-6) return i;
  }
  return -1;
}

export function nextSlot(slots: Slot[], b: number): Slot | null {
  const i = slotIndex(slots, b);
  if (i < 0) return slots.length ? slots[slots.length - 1] : null;
  return slots[i + 1] || null;
}

export function prevSlot(slots: Slot[], b: number): Slot | null {
  const i = slotIndex(slots, b);
  if (i <= 0) return slots.length ? slots[0] : null;
  return slots[i - 1] || null;
}

export function firstSlotOfBar(slots: Slot[], bar: number): Slot | null {
  for (const s of slots) if (s.bar === bar) return s;
  return null;
}

export function lastSlotOfBar(slots: Slot[], bar: number): Slot | null {
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i].bar === bar) return slots[i];
  return null;
}

export function firstBarSlot(slots: Slot[]): Slot | null {
  return slots.length ? slots[0] : null;
}

export function lastBarSlot(slots: Slot[]): Slot | null {
  return slots.length ? slots[slots.length - 1] : null;
}

export function nearestSlot(slots: Slot[], b: number): Slot | null {
  if (!slots.length) return null;
  let best = slots[0], dist = Math.abs(slots[0].b - b);
  for (let i = 1; i < slots.length; i++) {
    const d = Math.abs(slots[i].b - b);
    if (d < dist) { dist = d; best = slots[i]; }
  }
  return best;
}

/** Bar number (0-based in score order) of slot at beat b. */
export function barOfBeat(slots: Slot[], b: number): number {
  const i = slotIndex(slots, b);
  if (i >= 0) return slots[i].bar;
  const n = nearestSlot(slots, b);
  return n ? n.bar : 0;
}

export function barStartSlot(slots: Slot[], b: number): Slot | null {
  return firstSlotOfBar(slots, barOfBeat(slots, b));
}

export function barEndSlot(slots: Slot[], b: number): Slot | null {
  return lastSlotOfBar(slots, barOfBeat(slots, b));
}

export function prevBarSlot(slots: Slot[], b: number): Slot | null {
  const bar = barOfBeat(slots, b);
  const prevBar = bar - 1;
  if (prevBar < 0) return firstBarSlot(slots);
  return firstSlotOfBar(slots, prevBar);
}

export function nextBarSlot(slots: Slot[], b: number): Slot | null {
  const bar = barOfBeat(slots, b);
  const nextBar = bar + 1;
  const s = firstSlotOfBar(slots, nextBar);
  return s || lastBarSlot(slots);
}

/** Build slots from the shown track's first staff, first voice. */
export function buildSlots(score: any, trackIndex = 0): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<number>();
  try {
    const track = score && score.tracks && score.tracks[trackIndex];
    const staff = track && track.staves && track.staves[0];
    const bars = staff && staff.bars ? staff.bars : [];
    for (let bi = 0; bi < bars.length; bi++) {
      const bar = bars[bi];
      const voice = bar && bar.voices && bar.voices[0];
      const beats = voice && voice.beats ? voice.beats : [];
      for (const bt of beats) {
        let b = 0, d = 0.25;
        try { b = (bar.masterBar.start + bt.playbackStart) / 960; } catch {}
        try { d = (bt.playbackDuration || 240) / 960; } catch {}
        const key = Math.round(b * 1e6);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ b, d: d > 0 ? d : 0.25, bar: bi, isRest: !!bt.isRest });
      }
    }
  } catch {}
  out.sort((a, b2) => a.b - b2.b);
  return out;
}

export function rebuildSlotsFromApi() {
  const api = state.api;
  state.slots = api && api.score ? buildSlots(api.score, 0) : [];
  return state.slots;
}

/** Find track note at cursor (b,s). */
export function noteAtCursor(): { index: number; note: any } | null {
  const c = state.cursor, t = state.curTrack;
  if (!c || !t || !Array.isArray(t.notes)) return null;
  for (let i = 0; i < t.notes.length; i++) {
    const n = t.notes[i];
    if (n && n.s === c.s && Math.abs((n.b || 0) - c.b) < 1e-6) return { index: i, note: n };
  }
  // fallback tolerance
  for (let i = 0; i < t.notes.length; i++) {
    const n = t.notes[i];
    if (n && n.s === c.s && Math.abs((n.b || 0) - c.b) < 0.03) return { index: i, note: n };
  }
  return null;
}

export function slotAt(b: number): Slot | null {
  const slots = state.slots || [];
  const i = slotIndex(slots, b);
  return i >= 0 ? slots[i] : nearestSlot(slots, b);
}

export function setCursor(b: number, s: number) {
  const t = state.curTrack;
  const nS = t && t.instrument && typeof t.instrument.stringCount === "number" ? t.instrument.stringCount : 6;
  const ss = Math.max(1, Math.min(nS, Math.round(s)));
  state.cursor = { b, s: ss };
}

export function ensureCursor() {
  const t = state.curTrack;
  if (!t) { state.cursor = null; return null; }
  const nS = t.instrument && typeof t.instrument.stringCount === "number" ? t.instrument.stringCount : 6;
  if (!state.cursor) {
    const first = (state.slots || [])[0];
    state.cursor = { b: first ? first.b : 0, s: 1 };
  } else {
    state.cursor.s = Math.max(1, Math.min(nS, state.cursor.s));
  }
  return state.cursor;
}
