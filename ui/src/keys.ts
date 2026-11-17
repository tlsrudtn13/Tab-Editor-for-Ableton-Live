import { state } from "./state";
import { onDragSelection } from "./dragSelect";
import { getOpenStrings, getStringCount, clearFretboard, lightFret } from "./fretboard";
import { rebuildScore } from "./score";
import { renderInspector } from "./inspector";
import { showSelection, overlaySelectedNotes, clearNoteOverlays } from "./overlay";
import { moveString } from "./editing";
import { detectQuantizeGrid } from "../../src/notation/music.js";
import { log, status } from "./log";
import { TECH_KEY, toggleSelectedTech, cycleSelectedBend } from "./techUi";
import { barEndSlot, barStartSlot, ensureCursor, firstBarSlot, lastBarSlot, nearestSlot, nextBarSlot, nextSlot, noteAtCursor, prevBarSlot, prevSlot, setCursor, slotAt } from "./cursor";
import { clampDurToSpan, deleteBeatShift, durFromValue, durName, insertBeatShift, tieDecision, valueFromDur } from "./rhythm";

function active() { return !!(state.curTrack && state.curTrack.edit); }
/** Editable ranges in score beats: the clip's region, or each arrangement clip in track view. */
function editSpans(): { start: number; end: number }[] | null {
  const e = state.curTrack && state.curTrack.edit;
  if (!e) return null;
  if (e.mode === "track") return e.spans || [];
  return typeof e.regionLength === "number" ? [{ start: 0, end: e.regionLength }] : null;
}
function spanIndex(b: number): number {
  const sp = editSpans();
  if (!sp) return 0;
  return sp.findIndex(s => b >= s.start - 1e-6 && b < s.end - 1e-6);
}
function spanOf(b: number) {
  const sp = editSpans();
  const i = spanIndex(b);
  return sp && i >= 0 ? sp[i] : null;
}

export function saveUndo(before?: any, deletedBefore?: any) {
  state.sessionChanged = true;
  state.redoHistory = [];
  state.editHistory.push({ notes: before || state.curTrack.notes.map((n: any) => ({ ...n })), deletedOids: (deletedBefore || state.deletedOids).slice() });
  if (state.editHistory.length > 50) state.editHistory.shift();
}

function render() {
  if (!state.curTrack) return;
  rebuildScore(); renderInspector(state.curTrack);
  // a range selection survives the edit (e.g. I then P on the same range); a single note follows the cursor
  const sel = state.selectedNoteIndices, n = state.curTrack.notes.length;
  if (sel.length > 1 && sel.every((i: number) => i >= 0 && i < n)) { highlightSelection(); try { updateRhythmToolbar(); } catch {} }
  else syncFromCursor();
  updateEditUi();
  try { updateRhythmToolbar(); } catch {}
}

function keyId(e: KeyboardEvent): string {
  const k = e.key;
  if (k && k !== "Process" && k !== "Unidentified" && !/^[\u3131-\u318E\uAC00-\uD7A3]$/.test(k)) return k;
  const c = e.code || "";
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
  if (c === "NumpadAdd") return "+";
  if (c === "NumpadSubtract") return "-";
  if (c === "Minus") return "-";
  if (c === "Equal") return "=";
  if (/^Key[A-Z]$/.test(c)) return String(c.slice(3)).toLowerCase();
  return k || "";
}

export function syncFromCursor() {
  ensureCursor();
  // preserve multi-selection only when explicitly managed? spec: "Selection follows the cursor: the note at (cursor.b, cursor.s) is the selection..."
  const hit = noteAtCursor();
  if (hit) state.selectedNoteIndices = [hit.index];
  else state.selectedNoteIndices = [];
  highlightSelection();
  try { overlaySelectedNotes(); } catch {}
  try { updateRhythmToolbar(); } catch {}
}

export function highlightSelection() {
  clearFretboard();
  const ns = state.selectedNoteIndices.map(i => state.curTrack.notes[i]).filter(Boolean);
  if (ns.length === 1 && state.curTrack && Array.isArray(state.curTrack.notes)) {
    const sel = ns[0];
    state.curTrack.notes.forEach((n: any) => {
      if (Math.abs((n.b || 0) - (sel.b || 0)) < 1e-3) lightFret(n.s, n.f, undefined, { beat: true, p: n.p });
    });
    lightFret(sel.s, sel.f, undefined, { p: sel.p });
  } else {
    ns.forEach(n => lightFret(n.s, n.f, undefined, { p: n.p }));
  }
  showSelection(ns.map(n => ({ f:n.f, s:n.s, p:n.p })), ns.length === 1);
  document.querySelectorAll("#note-tbody tr.sel").forEach(r => r.classList.remove("sel"));
  state.selectedNoteIndices.forEach(i => { const r=document.getElementById("nr-"+i); if(r) r.classList.add("sel"); });
  if (state.selectedNoteIndices.length === 0) clearNoteOverlays();
  else { try { overlaySelectedNotes(); } catch {} }
}

export function selectIndex(index: number) {
  if (!state.curTrack || index < 0 || index >= state.curTrack.notes.length) return;
  const n = state.curTrack.notes[index];
  setCursor(n.b, n.s);
  state.selectionAnchor = n.b;
  syncFromCursor();
}

export function updateEditUi() {
  const edits = state.curTrack && state.curTrack.edit ? state.curTrack.notes.filter((n: any) => n.dirty || n.oid === undefined).length + state.deletedOids.length : 0;
  const count = document.getElementById("edit-count"), apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (count) { count.textContent = "* " + edits + " edits"; count.classList.toggle("hidden", edits === 0); }
  const enabled = active();
  if (apply) {
    (apply as HTMLButtonElement).disabled = !enabled;
    apply.title = enabled ? "" : "Apply works in Open (Clip) and Open (Track)";
    apply.textContent = enabled && state.curTrack.edit.mode === "track" ? "Apply to Clips" : "Apply to Clip";
  }
  if (cancel) { (cancel as HTMLButtonElement).disabled = false; cancel.textContent = edits === 0 ? "Close" : "Cancel"; cancel.title = ""; }
  const tb = document.getElementById("edit-toolbar");
  if (tb) tb.classList.toggle("hidden", !enabled);
  try { updateRhythmToolbar(); } catch {}
}

function currentSlot() {
  const c = ensureCursor(); if (!c) return null;
  return slotAt(c.b);
}

export function insertNote(s: number, f: number, chord = false) {
  if (!active()) return false;
  const open = getOpenStrings()[s]; if (typeof open !== "number" || f < 0 || f > 24) return false;
  const c = ensureCursor(); if (!c) return false;
  let b = c.b, d = 0.25;
  if (chord) {
    const hit = noteAtCursor();
    if (!hit) return false;
    if (state.curTrack.notes.some((n: any) => Math.abs(n.b - hit.note.b) < 1e-6 && n.s === s)) return false;
    b = hit.note.b; d = hit.note.d;
  } else {
    const sl = currentSlot();
    if (!sl) return false;
    b = sl.b; d = sl.isRest ? (state.defaultInsertDur || sl.d) : sl.d;
    const sp = spanOf(b);
    if (!sp) { log("Insert: that rest is outside every clip"); return false; }
    d = clampDurToSpan(d, b, sp.end);
  }
  const tmpl = state.curTrack.notes[0] || {};
  const before = state.curTrack.notes.map((n: any) => ({ ...n }));
  state.curTrack.notes.push({ b, d, p: open + f, v: 100, s, f, src: tmpl.src || "ses", clip: tmpl.clip || "", lock: true });
  saveUndo(before);
  setCursor(b, s);
  state.selectionAnchor = b;
  render();
  return true;
}

export function moveTime(steps: number, wholeBeats = false) {
  if (!active() || !state.selectedNoteIndices.length) return;
  const notes = state.curTrack.notes;
  const grid = state.uiQuantize === "auto" ? detectQuantizeGrid(notes) : state.uiQuantize;
  const unit = wholeBeats ? 1 : 4 / (grid as number), delta = steps * unit;
  const selIdx = state.selectedNoteIndices.slice();
  const sel = new Set(selIdx);
  const moved = selIdx.map(i => notes[i]).filter(Boolean);
  if (moved.some((n: any) => n.b + delta < -1e-6)) { log("Move: already at the start"); return; }
  if (moved.some((n: any) => { const from = spanIndex(n.b), to = spanIndex(n.b + delta); return to < 0 || to !== from; })) {
    log("Move: notes cannot leave their clip"); return;
  }
  const clash = moved.find((n: any) => notes.some((o: any, j: number) => !sel.has(j) && o.s === n.s && Math.abs(o.b - (n.b + delta)) < unit / 2));
  if (clash) { log("Move: string " + clash.s + " is already used there"); return; }
  const before = notes.map((n: any) => ({ ...n }));
  moved.forEach((n: any) => { n.b = Math.max(0, n.b + delta); if (n.oid !== undefined) n.dirty = true; });
  saveUndo(before);
  const c = ensureCursor(); if (c) c.b = Math.max(0, c.b + delta);
  state.selectionAnchor = c ? c.b : state.selectionAnchor;
  render();
}

export function setSelectedStringFret(s: number, f: number) {
  if(!active())return;
  const hit = noteAtCursor(); const n = hit ? hit.note : state.curTrack.notes[state.selectedNoteIndices[0]];
  const open=getOpenStrings()[s]; if(!n||typeof open!=="number")return;
  const before=state.curTrack.notes.map((x:any)=>({...x}));
  n.s=s;n.f=f;n.p=open+f;if(n.oid!==undefined)n.dirty=true;n.lock=true;
  saveUndo(before);
  setCursor(n.b, s);
  state.selectionAnchor = n.b;
  render();
}

function setFretAtCursor(f: number) {
  if (!active()) return;
  const c = ensureCursor(); if (!c) return;
  const hit = noteAtCursor();
  if (hit) {
    const open = getOpenStrings()[c.s]; if (open === undefined) return;
    const before = state.curTrack.notes.map((x:any)=>({...x}));
    hit.note.f = f; hit.note.p = open + f; hit.note.lock = true; if (hit.note.oid !== undefined) hit.note.dirty = true;
    saveUndo(before); render();
  } else {
    insertNote(c.s, f, false);
  }
}

function semitoneAtCursor(delta: number) {
  if (!active()) return;
  const hit = noteAtCursor(); if (!hit) return;
  const n = hit.note, open = getOpenStrings()[n.s]; if (open === undefined) return;
  const p = n.p + delta, f = p - open;
  if (f < 0 || f > 24) { log("Semitone: fret would be out of range on this string"); return; }
  const before = state.curTrack.notes.map((x:any)=>({...x}));
  n.p = p; n.f = f; n.lock = true; if (n.oid !== undefined) n.dirty = true;
  saveUndo(before); render();
}

function adjustDur(deltaSteps: number) {
  if (!active() || !state.selectedNoteIndices.length) return;
  const notes = state.curTrack.notes;
  const selected = state.selectedNoteIndices.slice().map(i => notes[i]).filter(Boolean);
  if (!selected.length) return;
  const before = notes.map((n:any)=>({...n}));
  let changed = 0;
  for (const n of selected) {
    const nd = deltaSteps < 0 ? Math.max(0.125, (n.d || 0.25) / 2) : (n.d || 0.25) * 2;
    const sp = editSpans();
    const si = spanIndex(n.b);
    let clamped = nd;
    if (sp && sp[si]) clamped = Math.min(clamped, Math.max(0.125, sp[si].end - n.b));
    if (Math.abs(clamped - n.d) > 1e-6) { n.d = clamped; n.de = true; if (n.oid !== undefined) n.dirty = true; changed++; }
  }
  if (changed) {
    saveUndo(before);
    const d0 = selected[0].d; // after change roughly representative
    log("Duration 1/8 → 1/16"); // generic; overridden below
    render();
  }
}

function adjustDurationHalveOrDouble(shorter: boolean) {
  if (!active()) return;
  const notes = state.curTrack.notes;
  const selected = targetNoteIndices().map(i => notes[i]).filter(Boolean);
  if (!selected.length) return;
  const before = notes.map((n:any)=>({...n}));
  const durName = (b:number) => {
    if (Math.abs(b-4)<1e-6) return "1/1"; if (Math.abs(b-2)<1e-6) return "1/2"; if (Math.abs(b-1)<1e-6) return "1/4";
    if (Math.abs(b-0.5)<1e-6) return "1/8"; if (Math.abs(b-0.25)<1e-6) return "1/16"; if (Math.abs(b-0.125)<1e-6) return "1/32"; return b.toFixed(3);
  };
  let changed = false; let from = "", to = "";
  for (const n of selected) {
    const old = n.d || 0.25;
    let nd = shorter ? Math.max(0.125, old / 2) : old * 2;
    const sp = editSpans();
    const si = spanIndex(n.b);
    if (!shorter && sp && sp[si]) nd = Math.min(nd, Math.max(0.125, sp[si].end - n.b));
    if (Math.abs(nd - old) > 1e-6) { from = durName(old); to = durName(nd); n.d = nd; n.de = true; if (n.oid !== undefined) n.dirty = true; changed = true; }
  }
  if (changed) { saveUndo(before); log("Duration " + from + " → " + to); render(); }
}

function deleteSelectionOrCursor() {
  if (!active()) return;
  let sel = state.selectedNoteIndices.slice();
  if (!sel.length) { const hit = noteAtCursor(); if (hit) sel = [hit.index]; }
  if (!sel.length) return;
  const before = state.curTrack.notes.map((n:any)=>({...n})), deletedBefore=state.deletedOids.slice();
  const removed = sel.slice().sort((a,b)=>b-a);
  removed.forEach(i=>{const n=state.curTrack.notes[i];if(n&&n.oid!==undefined)state.deletedOids.push(n.oid);state.curTrack.notes.splice(i,1);});
  state.selectedNoteIndices=[];
  saveUndo(before, deletedBefore);
  render();
}

function selectNotesInRange(a: number, b: number) {
  const lo = Math.min(a,b)-1e-6, hi = Math.max(a,b)+1e-6;
  const idxs: number[] = [];
  state.curTrack.notes.forEach((n:any,i:number)=>{ if (n.b >= lo && n.b <= hi) idxs.push(i); });
  state.selectedNoteIndices = idxs;
  highlightSelection();
  try { overlaySelectedNotes(); } catch {}
}

function selectAllNotesAtSlot(b: number) {
  const idxs: number[] = [];
  state.curTrack.notes.forEach((n:any,i:number)=>{ if (Math.abs(n.b-b) < 1e-6) idxs.push(i); });
  state.selectedNoteIndices = idxs;
  highlightSelection();
  try { overlaySelectedNotes(); } catch {}
}

/** Rhythm targets: every note of the selected beats (duration is per beat, as in Guitar Pro). */
function targetNoteIndices(): number[] {
  const notes = state.curTrack.notes;
  const beats: number[] = [];
  if (state.selectedNoteIndices.length) {
    for (const i of state.selectedNoteIndices) { const n = notes[i]; if (n) beats.push(n.b); }
  } else {
    const c = ensureCursor(); if (!c) return [];
    beats.push(c.b);
  }
  const idxs: number[] = [];
  notes.forEach((n:any,i:number)=>{ if (beats.some(b => Math.abs(n.b-b) < 1e-6)) idxs.push(i); });
  return idxs;
}

function cursorSlotInfo() {
  const c = ensureCursor(); if (!c) return null;
  const sl = slotAt(c.b);
  if (!sl) return null;
  const sp = spanOf(sl.b);
  if (!sp) return null;
  return { c, sl, sp };
}

function updateRhythmToolbar() {
  const activeBtn = (sel: string, on: boolean) => { const el = document.querySelector(sel) as HTMLElement | null; if (el) el.classList.toggle("on", !!on); };
  const info = cursorSlotInfo();
  if (!info) return;
  const idxs = targetNoteIndices();
  const notes = idxs.map(i => state.curTrack.notes[i]).filter(Boolean);
  let v: any = null;
  if (notes.length) v = valueFromDur(notes[0].d || 0);
  else v = valueFromDur(info.sl.d || state.defaultInsertDur || 0.25);
  const dens = [1,2,4,8,16,32];
  dens.forEach(den => activeBtn(`#rb-v-${den}`, !!v && v.den === den));
  activeBtn("#rb-dot", !!v && v.dot);
  activeBtn("#rb-triplet", !!v && v.triplet);
}

function applySetValue(den: number, dot: boolean, triplet: boolean) {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const target = targetNoteIndices();
  const rawDur = durFromValue(den, dot, triplet);
  if (!target.length) {
    // empty slot/rest: set default duration for next inserted note
    state.defaultInsertDur = clampDurToSpan(rawDur, info.sl.b, info.sp.end);
    log("Value: default " + durName(state.defaultInsertDur));
    updateRhythmToolbar();
    return;
  }
  const notes = state.curTrack.notes;
  const before = notes.map((n:any)=>({...n}));
  let from = "", to = "";
  for (const i of target) {
    const n = notes[i]; if (!n) continue;
    const old = n.d || 0.25;
    const nd = clampDurToSpan(rawDur, n.b, info.sp.end);
    if (Math.abs(nd - old) > 1e-6 || !n.de) {
      from = durName(old); to = durName(nd);
      n.d = nd; n.de = true; if (n.oid !== undefined) n.dirty = true;
    }
  }
  if (from || to) {
    saveUndo(before);
    log("Value: " + (from || "?") + " → " + (to || durName(rawDur)));
    render();
  }
  updateRhythmToolbar();
}

function setValueByDen(den: number) {
  const info = cursorSlotInfo(); if (!info) return;
  const target = targetNoteIndices().map(i => state.curTrack.notes[i]).filter(Boolean);
  const cur = valueFromDur(target.length ? (target[0].d||0) : (info.sl.isRest ? (state.defaultInsertDur||info.sl.d) : info.sl.d));
  applySetValue(den, !!(cur && cur.dot), !!(cur && cur.triplet));
}

function toggleDot() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const target = targetNoteIndices();
  if (!target.length) {
    const cur = valueFromDur(state.defaultInsertDur || info.sl.d) || { den: 4, dot: false, triplet: false };
    state.defaultInsertDur = clampDurToSpan(durFromValue(cur.den, !cur.dot, cur.triplet), info.sl.b, info.sp.end);
    log("Value: default " + durName(state.defaultInsertDur));
    updateRhythmToolbar();
    return;
  }
  const notes = state.curTrack.notes, before = notes.map((n:any)=>({...n}));
  const cur = valueFromDur(notes[target[0]].d || 0);
  const mult = cur && cur.dot ? (1/1.5) : 1.5;
  let changed = false;
  for (const i of target) {
    const n = notes[i]; if (!n) continue;
    const nd = clampDurToSpan((n.d || 0.25) * mult, n.b, info.sp.end);
    if (Math.abs(nd - n.d) > 1e-6) { n.d = nd; n.de = true; if (n.oid !== undefined) n.dirty = true; changed = true; }
  }
  if (changed) { saveUndo(before); log("Dot " + (mult>1?"on":"off")); render(); }
  updateRhythmToolbar();
}

function toggleTriplet() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const target = targetNoteIndices();
  if (!target.length) {
    const cur = valueFromDur(state.defaultInsertDur || info.sl.d) || { den: 4, dot: false, triplet: false };
    state.defaultInsertDur = clampDurToSpan(durFromValue(cur.den, cur.dot, !cur.triplet), info.sl.b, info.sp.end);
    log("Value: default " + durName(state.defaultInsertDur));
    updateRhythmToolbar();
    return;
  }
  const notes = state.curTrack.notes, before = notes.map((n:any)=>({...n}));
  const cur = valueFromDur(notes[target[0]].d || 0);
  const mult = cur && cur.triplet ? 1.5 : (2/3);
  let changed = false;
  for (const i of target) {
    const n = notes[i]; if (!n) continue;
    const nd = clampDurToSpan((n.d || 0.25) * mult, n.b, info.sp.end);
    if (Math.abs(nd - n.d) > 1e-6) { n.d = nd; n.de = true; if (n.oid !== undefined) n.dirty = true; changed = true; }
  }
  if (changed) { saveUndo(before); log("Triplet " + (mult<1?"on":"off")); render(); }
  updateRhythmToolbar();
}

function tieAtCursor() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const hit = noteAtCursor();
  if (!hit) { log("Tie: no note at cursor"); return; }
  const slots = state.slots || [];
  const i = slots.findIndex(s => Math.abs(s.b - info.sl.b) < 1e-6);
  const next = i >= 0 ? slots[i + 1] || null : null;
  const dec = tieDecision(state.curTrack.notes, hit.index, next, info.sp.end);
  if (dec.kind === "none") { log("Tie: " + dec.reason); return; }
  const before = state.curTrack.notes.map((n:any)=>({...n}));
  const deletedBefore = state.deletedOids.slice();
  if (dec.kind === "merge-note") {
    const target = state.curTrack.notes[dec.targetIndex];
    if (target && target.oid !== undefined) state.deletedOids.push(target.oid);
    hit.note.d = dec.newDur; hit.note.de = true; if (hit.note.oid !== undefined) hit.note.dirty = true;
    // remove target index carefully
    const ti = dec.targetIndex;
    state.curTrack.notes.splice(ti, 1);
    // selection may shift; clear
    state.selectedNoteIndices = [state.curTrack.notes.indexOf(hit.note)];
  } else {
    hit.note.d = dec.newDur; hit.note.de = true; if (hit.note.oid !== undefined) hit.note.dirty = true;
  }
  saveUndo(before, deletedBefore);
  render();
  log("Tie");
}

function restAtCursor() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const idxs: number[] = [];
  state.curTrack.notes.forEach((n:any,i:number)=>{ if (Math.abs(n.b-info.sl.b) < 1e-6) idxs.push(i); });
  if (!idxs.length) { log("Rest: slot already empty"); return; }
  const before = state.curTrack.notes.map((n:any)=>({...n}));
  const deletedBefore = state.deletedOids.slice();
  idxs.slice().sort((a,b)=>b-a).forEach(i=>{ const n=state.curTrack.notes[i]; if(n&&n.oid!==undefined) state.deletedOids.push(n.oid); state.curTrack.notes.splice(i,1); });
  state.selectedNoteIndices = [];
  saveUndo(before, deletedBefore);
  render();
  log("Rest");
}

function insertBeatAtCursor() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const r = insertBeatShift(state.curTrack.notes, info.sl.b, info.sl.d, info.sp);
  const before = state.curTrack.notes.map((n:any)=>({...n}));
  const deletedBefore = state.deletedOids.slice();
  const pushedOut = state.curTrack.notes.length - r.notes.length;
  state.curTrack.notes = r.notes;
  state.deletedOids.push(...r.deleted);
  state.selectedNoteIndices = [];
  saveUndo(before, deletedBefore);
  render();
  const msg = pushedOut ? `Insert beat: ${pushedOut} note(s) pushed past the clip end were removed (Ctrl+Z to undo)` : "Insert beat";
  log(msg); status(msg);
}

function deleteBeatAtCursor() {
  if (!active()) return;
  const info = cursorSlotInfo(); if (!info) return;
  const r = deleteBeatShift(state.curTrack.notes, info.sl.b, info.sl.d, info.sp);
  if (r.error) { log("Delete beat: would cross span end"); return; }
  const before = state.curTrack.notes.map((n:any)=>({...n}));
  const deletedBefore = state.deletedOids.slice();
  state.curTrack.notes = r.notes;
  state.deletedOids.push(...r.deleted);
  state.selectedNoteIndices = [];
  saveUndo(before, deletedBefore);
  render();
  log("Delete beat");
}

function copySelection(cut = false) {
  if (!active()) return;
  let idxs = state.selectedNoteIndices.slice();
  if (!idxs.length) { const hit = noteAtCursor(); if (hit) idxs = [hit.index]; }
  const notes = idxs.map(i => state.curTrack.notes[i]).filter(Boolean);
  if (!notes.length) { log(cut ? "Cut: nothing selected" : "Copy: nothing selected"); return; }
  const minB = Math.min(...notes.map(n=>n.b));
  state.clipboard = { notes: notes.map(n => ({ b: n.b - minB, d: n.d, p: n.p, v: n.v, s: n.s, f: n.f, tech: n.tech, bend: n.bend, lock: n.lock })) };
  log((cut?"Cut ":"Copy ") + notes.length + " note(s)");
  if (cut) deleteSelectionOrCursor();
}

function pasteAtCursor() {
  if (!active()) return;
  const cb = state.clipboard;
  if (!cb || !cb.notes.length) { log("Paste: clipboard empty"); return; }
  const info = cursorSlotInfo(); if (!info) return;
  const sp = info.sp;
  const pasted = cb.notes.map(n => ({ ...n, b: info.sl.b + n.b }));
  // validate
  for (const n of pasted) {
    if (n.b < sp.start - 1e-6 || n.b + n.d > sp.end + 1e-6) { log("Paste: would leave span"); return; }
    const clash = state.curTrack.notes.some((o:any)=> o.s === n.s && Math.abs(o.b - n.b) < 1e-6);
    if (clash) { log("Paste: string already used at same beat"); return; }
  }
  const before = state.curTrack.notes.map((n:any)=>({...n}));
  const tmpl = state.curTrack.notes[0] || {};
  const added: any[] = [];
  for (const n of pasted) {
    added.push({ b: n.b, d: n.d, p: n.p, v: n.v ?? 100, s: n.s, f: n.f, tech: n.tech, bend: n.bend, lock: n.lock ?? true, src: tmpl.src || "ses", clip: tmpl.clip || "" });
  }
  state.curTrack.notes.push(...added);
  saveUndo(before);
  // select pasted
  state.selectedNoteIndices = added.map(a => state.curTrack.notes.indexOf(a)).filter(i=>i>=0);
  render();
  log("Paste " + added.length + " note(s)");
}

function undo() {
  const h = state.editHistory.pop(); if (!h) return;
  state.redoHistory.push({ notes: state.curTrack.notes.map((n:any)=>({...n})), deletedOids: state.deletedOids.slice() });
  state.curTrack.notes = h.notes.map((n:any)=>({...n}));
  state.deletedOids = h.deletedOids.slice();
  syncFromCursor();
  rebuildScore(); renderInspector(state.curTrack); updateEditUi();
}
function redo() {
  const h = state.redoHistory.pop(); if (!h) return;
  state.editHistory.push({ notes: state.curTrack.notes.map((n:any)=>({...n})), deletedOids: state.deletedOids.slice() });
  state.curTrack.notes = h.notes.map((n:any)=>({...n}));
  state.deletedOids = h.deletedOids.slice();
  syncFromCursor();
  rebuildScore(); renderInspector(state.curTrack); updateEditUi();
}

function moveCursorTo(slot: any, keepAnchor = false) {
  if (!slot) return;
  const c = ensureCursor(); if (!c) return;
  setCursor(slot.b, c.s);
  if (!keepAnchor) state.selectionAnchor = slot.b;
  syncFromCursor();
  // scroll into view best-effort
  try { window.requestAnimationFrame(()=>{ /* overlay redraw handled */ }); } catch {}
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof Element && (e.target.matches("input,select,textarea") || (e.target as HTMLElement).isContentEditable)) return;
  const k = keyId(e);
  const kl = String(k).toLowerCase();
  if(e.ctrlKey && kl === "enter"){e.preventDefault();window.applyClipEdits&&window.applyClipEdits();return;}
  if(e.ctrlKey && kl === "d" && active() && state.selectedNoteIndices.length){
    e.preventDefault();
    const i=state.selectedNoteIndices[0], n=state.curTrack.notes[i], before=state.curTrack.notes.map((x:any)=>({...x}));
    if(n){state.curTrack.notes.push({...n,b:n.b+n.d,oid:undefined,dirty:undefined});selectIndex(state.curTrack.notes.length-1);saveUndo(before);render();}
    return;
  }
  if(e.ctrlKey && kl === "z" && !e.shiftKey && active()){e.preventDefault();undo();return;}
  if((e.ctrlKey && kl === "y") || (e.ctrlKey && e.shiftKey && kl === "z")){ if(active()){e.preventDefault();redo();} return; }
  if(e.ctrlKey && !e.shiftKey && !e.altKey && /^[1-6]$/.test(k as string) && active()) {
    e.preventDefault();
    const dens: any = { "1":1, "2":2, "3":4, "4":8, "5":16, "6":32 };
    setValueByDen(dens[k as string]);
    return;
  }
  if(e.ctrlKey && !e.shiftKey && !e.altKey && kl === "c" && active()) { e.preventDefault(); copySelection(false); return; }
  if(e.ctrlKey && !e.shiftKey && !e.altKey && kl === "x" && active()) { e.preventDefault(); copySelection(true); return; }
  if(e.ctrlKey && !e.shiftKey && !e.altKey && kl === "v" && active()) { e.preventDefault(); pasteAtCursor(); return; }
  if(e.ctrlKey && k === "Insert" && active()) { e.preventDefault(); insertBeatAtCursor(); return; }
  if(e.shiftKey && k === "Delete" && active()) { e.preventDefault(); deleteBeatAtCursor(); return; }
  if(k === "Escape"){state.selectedNoteIndices=[];state.selectionAnchor=null;clearNoteOverlays();highlightSelection();return;}
  if(!state.curTrack) return;
  const c = ensureCursor();
  const slots = state.slots || [];

  // Digits (two-digit buffer)
  if (/^[0-9]$/.test(k as string) && active()) {
    e.preventDefault();
    state.digitBuffer += k;
    if (state.digitTimer) clearTimeout(state.digitTimer);
    const go = () => {
      const f = Number(state.digitBuffer); state.digitBuffer = "";
      if (f <= 24) setFretAtCursor(f);
    };
    state.digitTimer = setTimeout(go, 400);
    if (state.digitBuffer.length >= 2) go();
    return;
  }

  // Movement / selection
  if (k === "ArrowLeft" || k === "ArrowRight") {
    e.preventDefault();
    if (e.shiftKey && active()) {
      if (state.selectionAnchor == null) state.selectionAnchor = c!.b;
      const slot = e.ctrlKey ? (k==="ArrowLeft"?prevBarSlot(slots,c!.b):nextBarSlot(slots,c!.b)) : (k==="ArrowLeft"?prevSlot(slots,c!.b):nextSlot(slots,c!.b));
      if (slot) { setCursor(slot.b, c!.s); selectNotesInRange(state.selectionAnchor, slot.b); }
      return;
    }
    if (e.ctrlKey && e.altKey && active()) { moveTime(k==="ArrowLeft"?-1:1, true); return; }
    if (e.altKey && active()) { moveTime(k==="ArrowLeft"?-1:1, false); return; }
    if (e.ctrlKey) { moveCursorTo(k==="ArrowLeft"?prevBarSlot(slots,c!.b):nextBarSlot(slots,c!.b)); return; }
    moveCursorTo(k==="ArrowLeft"?prevSlot(slots,c!.b):nextSlot(slots,c!.b));
    return;
  }
  if (k === "ArrowUp" || k === "ArrowDown") {
    e.preventDefault();
    if (e.altKey && e.shiftKey && active()) { semitoneAtCursor(k==="ArrowUp"?1:-1); return; }
    if (e.altKey && active()) {
      // move note to adjacent string same pitch, cursor follows
      const hit = noteAtCursor();
      if (hit) { moveString(k==="ArrowUp"?-1:1); setCursor(hit.note.b, hit.note.s); state.selectionAnchor = hit.note.b; syncFromCursor(); }
      return;
    }
    if (e.shiftKey) { selectAllNotesAtSlot(c!.b); return; }
    const nS = getStringCount();
    setCursor(c!.b, Math.max(1, Math.min(nS, c!.s + (k==="ArrowUp"?-1:1))));
    state.selectionAnchor = c!.b;
    syncFromCursor();
    return;
  }
  if (k === "Home") { e.preventDefault(); moveCursorTo(e.ctrlKey ? firstBarSlot(slots) : barStartSlot(slots,c!.b)); return; }
  if (k === "End") { e.preventDefault(); moveCursorTo(e.ctrlKey ? lastBarSlot(slots) : barEndSlot(slots,c!.b)); return; }

  if (!active()) return;

  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey && (k === "." || k === ">" )) { e.preventDefault(); toggleDot(); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey && (k === "/" || k === "?")) { e.preventDefault(); toggleTriplet(); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && kl === "l") { e.preventDefault(); tieAtCursor(); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && kl === "r") { e.preventDefault(); restAtCursor(); return; }

  if (e.ctrlKey && kl === "a") { e.preventDefault(); state.selectedNoteIndices = state.curTrack.notes.map((_:any,i:number)=>i); highlightSelection(); try{overlaySelectedNotes();}catch{} return; }

  if (!e.ctrlKey && !e.altKey && !e.metaKey && (k === "+" || k === "=")) { e.preventDefault(); adjustDurationHalveOrDouble(true); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (k === "-" || k === "_")) { e.preventDefault(); adjustDurationHalveOrDouble(false); return; }

  if ((k === "Delete" || k === "Backspace") && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); deleteSelectionOrCursor(); return; }

  if (!e.ctrlKey && !e.altKey && !e.metaKey && kl === "b") { e.preventDefault(); cycleSelectedBend(saveUndo, render); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && TECH_KEY[kl as string]) { e.preventDefault(); toggleSelectedTech(TECH_KEY[kl as string], saveUndo, render); return; }
}

export function toggleTech(t: string){ if (t === "bend") cycleSelectedBend(saveUndo, render); else toggleSelectedTech(t as any, saveUndo, render); }

export function bindKeys(){
  onDragSelection(highlightSelection);
  document.addEventListener("keydown", onKey);
  window.__editKeys = {
    selectIndex,
    setSelectedStringFret,
    updateEditUi,
    insertNote,
    setCursor: (b:number,s:number)=>{ setCursor(b,s); state.selectionAnchor=b; syncFromCursor(); try{overlaySelectedNotes();}catch{} },
    cursor: ()=> state.cursor ? { b: state.cursor.b, s: state.cursor.s } : null,
    setValueByDen,
    toggleDot,
    toggleTriplet,
    tieAtCursor,
    restAtCursor,
    insertBeatAtCursor,
    deleteBeatAtCursor,
    copySelection,
    pasteAtCursor,
    updateRhythmToolbar,
  };
  updateEditUi();
}
