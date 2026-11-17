// Pure helpers and drag-box selection wiring for the score.
import { state } from "./state";
import { getStringCount } from "./fretboard";
import { noteAtCursor, setCursor } from "./cursor";
import { clearNoteOverlays, drawNoteOverlay, overlayCursor, overlaySelectedNotes } from "./overlay";
import { updateTechPalette } from "./techUi";

/** Set by keys.ts (bindKeys): redraws inspector, fretboard and overlays for the selection. */
let selectionChanged: (() => void) | null = null;
export function onDragSelection(fn: () => void) { selectionChanged = fn; }

export type Rect = { x: number; y: number; w: number; h: number };

/** Axis-aligned rectangle intersection (touching edges does not count as overlap area, but bounds often abut; treat >0 area). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function pointsFar(a: { x: number; y: number }, b: { x: number; y: number }, threshold = 4): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy > threshold * threshold;
}

/** Return our note indices whose rendered note-head bounds intersect rect (all staves). */
export function collectNotesInRect(rect: Rect): number[] {
  const api = state.api;
  const track = state.curTrack;
  if (!api || !track || !Array.isArray(track.notes)) return [];
  const bl = api.renderer ? api.renderer.boundsLookup : null;
  if (!bl || !bl.staffSystems) return [];
  const nS = track.instrument && typeof track.instrument.stringCount === "number" ? track.instrument.stringCount : 6;
  const capo = state.uiCapo || 0;
  const found = new Set<number>();
  for (let si = 0; si < bl.staffSystems.length; si++) {
    const sys = bl.staffSystems[si];
    const mbs = sys.bars || sys.masterBarBounds || [];
    for (let mi = 0; mi < mbs.length; mi++) {
      const bars = mbs[mi].bars || [];
      for (let bi = 0; bi < bars.length; bi++) {
        const bar = bars[bi];
        const beats = bar.beats || [];
        for (let ti = 0; ti < beats.length; ti++) {
          const beat = beats[ti];
          let bp: number | null = null;
          try {
            const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
            const mBeat = beat.beat || beat;
            if (mBar && mBeat.playbackStart !== undefined) bp = (mBar.start + mBeat.playbackStart) / 960;
          } catch {}
          const nbs = beat.notes || [];
          for (let ni = 0; ni < nbs.length; ni++) {
            const nb = nbs[ni];
            const hb = nb.noteHeadBounds;
            if (!hb || !rectsIntersect(rect, hb)) continue;
            const an = nb.note;
            if (!an) continue;
            for (let k = 0; k < track.notes.length; k++) {
              const tn = track.notes[k];
              if (bp !== null && tn.b !== undefined && Math.abs(tn.b - bp) > 0.03) continue;
              let matched = false;
              if (an.fret !== undefined && an.string !== undefined && tn.f !== undefined && tn.s !== undefined) {
                if (an.string === nS + 1 - tn.s && an.fret === tn.f - capo) matched = true;
              }
              if (!matched) {
                const pitch = an.realValue !== undefined ? an.realValue : an.displayValue;
                if (pitch !== undefined && tn.p !== undefined && pitch === tn.p) matched = true;
              }
              if (matched) found.add(k);
            }
          }
        }
      }
    }
  }
  return Array.from(found).sort((a, b) => {
    const na = track.notes[a], nb = track.notes[b];
    const db = (na.b || 0) - (nb.b || 0);
    if (Math.abs(db) > 1e-6) return db;
    return (na.s || 0) - (nb.s || 0);
  });
}

let drag: { start: { x: number; y: number }; baseSelection: number[]; shift: boolean; active: boolean } | null = null;
let boxEl: HTMLDivElement | null = null;
let suppressClickUntil = 0;

function ensureBox(host: HTMLElement) {
  if (!boxEl || !boxEl.isConnected) {  // the score element is emptied on every re-render
    boxEl = document.createElement("div");
    boxEl.className = "drag-select-box";
    host.appendChild(boxEl);
  }
  return boxEl;
}

function hideBox() { if (boxEl) boxEl.style.display = "none"; }

export function isDragSelecting() { return !!(drag && drag.active); }
export function consumeRecentDrag(): boolean {
  if (Date.now() < suppressClickUntil) { suppressClickUntil = 0; return true; }
  return false;
}

export function bindDragSelection(host: HTMLElement) {
  host.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button,input,select,textarea")) return;
    const r = host.getBoundingClientRect();
    drag = { start: { x: e.clientX - r.left, y: e.clientY - r.top }, baseSelection: (state.selectedNoteIndices || []).slice(), shift: e.shiftKey, active: false };
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const r = host.getBoundingClientRect();
    const cur = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!drag.active && pointsFar(drag.start, cur, 4)) {
      drag.active = true;
      const el = ensureBox(host);
      el.style.display = "block";
    }
    if (!drag.active) return;
    const rect = normalizeRect(drag.start.x, drag.start.y, cur.x, cur.y);
    const el = ensureBox(host);
    el.style.left = rect.x + "px";
    el.style.top = rect.y + "px";
    el.style.width = rect.w + "px";
    el.style.height = rect.h + "px";
    // auto-scroll near edges if simple
    const view = document.getElementById("viewer");
    if (view) {
      const vr = view.getBoundingClientRect();
      const edge = 24;
      if (e.clientY < vr.top + edge) view.scrollTop -= 18;
      else if (e.clientY > vr.bottom - edge) view.scrollTop += 18;
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (!drag) return;
    const r = host.getBoundingClientRect();
    const cur = { x: e.clientX - r.left, y: e.clientY - r.top };
    const wasActive = drag.active;
    const info = drag;
    drag = null;
    hideBox();
    if (!wasActive) return; // plain click: let alphaTab handlers place cursor
    suppressClickUntil = Date.now() + 250;
    const rect = normalizeRect(info.start.x, info.start.y, cur.x, cur.y);
    let sel = collectNotesInRect(rect);
    if (info.shift) {
      const merged = new Set<number>(info.baseSelection);
      sel.forEach(i => merged.add(i));
      sel = Array.from(merged).sort((a,b)=>{
        const na = state.curTrack.notes[a], nb = state.curTrack.notes[b];
        const db = (na.b||0)-(nb.b||0); if (Math.abs(db)>1e-6) return db; return (na.s||0)-(nb.s||0);
      });
    }
    state.selectedNoteIndices = sel;
    if (sel.length) {
      const n = state.curTrack.notes[sel[0]];
      if (n) { setCursor(n.b, n.s); state.selectionAnchor = n.b; }
    } else {
      const c = state.cursor; if (c) state.selectionAnchor = c.b;
    }
    try { clearNoteOverlays(); if (selectionChanged) selectionChanged(); else overlaySelectedNotes(); } catch {}
    try { overlayCursor(); } catch {}
    try { updateTechPalette(); } catch {}
  });
}

export function shouldIgnoreBeatClick() {
  // if a drag just finished, suppress the synthetic/alphaTab click handling once
  return false; // handled by isDragSelecting timing; active cleared on mouseup before click in most cases
}
