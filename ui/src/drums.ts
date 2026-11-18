// ============================================================
// ui/src/drums.ts — drum notation mode (docs/DRUMS.md).
// A drum payload (payload.drum) renders as an AlphaTex percussion staff;
// the fretboard, TAB modes and guitar techniques are hidden, and a legend
// lists the pads used. The legend's menus change the per-track kit map,
// which goes back to Live on close/apply (message.drumLayer).
//
// Editing (Open (Clip) - Edit / Open (Track) - Edit, payload.edit set):
// the cursor's s is a drum lane (src/notation/drumEdit.ts), so keys.ts's
// cursor, value toolbar, Ins/Del beat, undo and Apply work unchanged.
// Drum-only keys: Enter add/remove hit, Alt+Up/Down change piece,
// G / A / N ghost / accent / normal velocity.
// ============================================================
import { state } from "./state";
import { log, status } from "./log";
import { createApi } from "./score";
import { slotAt } from "./cursor";
import { drumHooks } from "./drumHooks";
import { median, toDrumAlphaTex } from "../../src/notation/toDrumAlphaTex.js";
import { DRUM_ARTICULATIONS, drumLayerFrom, drumLegend, liveNoteName, resolveDrumPiece, type DrumOverride } from "../../src/notation/drumMap.js";
import { DRUM_VELOCITY, drumLanes, laneRow } from "../../src/notation/drumEdit.js";
import "./drums.css";

export function isDrumTrack(trk: any): boolean {
  return !!(trk && trk.drum && typeof trk.drum.tex === "string");
}
const editable = () => !!(state.curTrack && state.curTrack.edit && isDrumTrack(state.curTrack));

let prevMode: string | null = null;
let kitChanged = false;

export function enterDrumMode(trk: any) {
  document.body.classList.add("drum-mode");
  document.body.classList.toggle("drum-edit", !!trk.edit);
  if (prevMode === null) prevMode = state.dispMode;
  state.dispMode = "staff";            // no TAB for percussion
  kitChanged = false;
  // ghost/accent reference: the clip's velocities as opened (edits must not flip other hits)
  if (typeof trk.drum.median !== "number") trk.drum.median = median((trk.notes || []).map((n: any) => n.v));
  refreshLanes(trk);
  renderLegend(trk);
}

export function leaveDrumMode() {
  if (!document.body.classList.contains("drum-mode")) return;
  document.body.classList.remove("drum-mode", "drum-edit");
  if (prevMode !== null) state.dispMode = prevMode;
  prevMode = null;
  state.drumLanes = [];
  const el = document.getElementById("drum-legend");
  if (el) el.remove();
}

/** Recompute the lanes (pieces used + core kit) and each hit's lane row (note.s). */
function refreshLanes(trk: any) {
  const pitches = (trk.notes || []).map((n: any) => n.p);
  const lanes = drumLanes(pitches, trk.drum.override, trk.drum.hints, trk.drum.pads);
  // keep the cursor on the same piece when the lane list changes
  const curArt = state.cursor && state.drumLanes[state.cursor.s - 1] ? state.drumLanes[state.cursor.s - 1]!.art : undefined;
  state.drumLanes = lanes;
  for (const n of trk.notes || []) { n.s = laneRow(lanes, n.p, trk.drum.override); n.f = 0; }
  if (state.cursor && curArt !== undefined) {
    const row = lanes.findIndex(l => l.art === curArt) + 1;
    if (row > 0) state.cursor.s = row;
  }
}

function hookApi(api: any) {
  if (!api || api.__drumHooked) return;
  api.__drumHooked = true;
  // Runs after score.ts's handlers: undo guitar-only styling (out-of-range colour on ghost notes, let ring).
  api.scoreLoaded.on(prepareDrumScore);
}

/** Percussion staff only; feet-voice rests not drawn; no guitar styling. Safe to call for any score. */
export function prepareDrumScore(score: any) {
  if (!isDrumTrack(state.curTrack)) return;
  for (const t of score.tracks || []) for (const st of t.staves || []) {
    st.showTablature = false; st.showStandardNotation = true;
    for (const bar of st.bars || []) for (const v of bar.voices || []) for (const bt of v.beats || []) {
      // Feet voice: rests are not drawn (common drum-chart practice; alphaTab would
      // lift colliding second-voice rests above the staff). They keep their time.
      if (v.index > 0 && bt.isRest) bt.isEmpty = true;
      for (const n of bt.notes || []) { n.style = undefined; n.isLetRing = false; n.isPalmMute = false; }
    }
  }
}

/** Regenerate the percussion staff from the notes (edits / quantize / time signature / kit map changes). */
export function rebuildDrumScore() {
  const trk = state.curTrack;
  if (!isDrumTrack(trk)) return;
  refreshLanes(trk);
  const tex = toDrumAlphaTex(trk.notes, {
    bpm: trk.bpm || 120,
    timeSig: state.uiTimeSig || trk.timeSig,
    quantize: state.uiQuantize === "auto" ? undefined : (state.uiQuantize as any),
    override: trk.drum.override,
    hints: trk.drum.hints,
    cues: trk.live && trk.live.cues,
    title: trk.name,
    median: trk.drum.median,
  }).tex;
  trk.drum.tex = tex;
  trk.alphaTex = tex;                   // the ATex export button saves this
  renderLegend(trk);
  if (!state.api) createApi();
  hookApi(state.api);
  status("Rendering…");
  try {
    state.api.tex(tex);
    log("Drums: " + trk.drum.pieces.length + " pads, " + trk.notes.length + " hits");
  } catch (e: any) {
    log("Drum render error: " + (e && e.message || e));
    status("Error");
  }
}

// ── Legend ──────────────────────────────────────────────────────────────────
function renderLegend(trk: any) {
  let el = document.getElementById("drum-legend");
  if (!el) {
    el = document.createElement("div");
    el.id = "drum-legend";
    const viewer = document.getElementById("viewer");
    if (viewer && viewer.parentElement) viewer.parentElement.insertBefore(el, viewer.nextSibling);
    else document.body.appendChild(el);
  }
  const override: DrumOverride = trk.drum.override || (trk.drum.override = {});
  const pieces = drumLegend(trk.notes.map((n: any) => n.p), override, trk.drum.hints);
  trk.drum.pieces = pieces;
  el.innerHTML = "";
  const head = document.createElement("div");
  head.className = "dl-head";
  head.textContent = "Drum kit — " + (trk.drum.source === "drum-rack" ? "Drum Rack" : "detected by name") + ", GM map";
  const hint = document.createElement("span");
  hint.className = "dl-note";
  hint.textContent = trk.edit
    ? "Enter add/remove hit · Alt+↑↓ change piece · G ghost · A accent · N normal"
    : "Hands: stems up · Feet: stems down · change a pad to fix a custom kit";
  head.appendChild(hint);
  el.appendChild(head);
  const list = document.createElement("div");
  list.className = "dl-list";
  for (const p of pieces) {
    const row = document.createElement("label");
    row.className = "dl-row" + (p.mapped ? "" : " unmapped") + (p.custom ? " custom" : "");
    row.dataset.art = String(p.articulation);
    row.title = "MIDI " + p.pitch + (p.pad ? " · pad: " + p.pad : "") + (p.mapped ? "" : " · not in the GM map");
    const key = document.createElement("span");
    key.className = "dl-key";
    key.textContent = liveNoteName(p.pitch) + " " + p.pitch;
    const sel = document.createElement("select");
    sel.className = "tsel";
    for (const a of DRUM_ARTICULATIONS) {
      const o = document.createElement("option");
      o.value = String(a.id);
      o.textContent = a.name + (a.limb === "foot" ? " (foot)" : "");
      if (a.id === p.articulation) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", function() {
      override[p.pitch] = Number(sel.value);
      kitChanged = true;
      rebuildDrumScore();
    });
    row.appendChild(key);
    row.appendChild(sel);
    if (p.pad) {
      const pad = document.createElement("span");
      pad.className = "dl-pad";
      pad.textContent = p.pad;
      row.appendChild(pad);
    }
    list.appendChild(row);
  }
  // Edit mode: core-kit pieces the clip does not use yet, as chips the cursor can reach.
  if (trk.edit) {
    state.drumLanes.forEach((lane, i) => {
      if (!lane.empty) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dl-chip";
      chip.dataset.art = String(lane.art);
      chip.textContent = "+ " + lane.name;
      chip.title = lane.label + " — click to put the cursor on this piece";
      chip.addEventListener("click", () => moveCursorToLane(i + 1));
      list.appendChild(chip);
    });
  }
  el.appendChild(list);
  markActiveLane();
}

function moveCursorToLane(row: number) {
  const c = state.cursor; if (!c) return;
  (window.__editKeys as any)?.setCursor?.(c.b, row);
}

/** Highlight the legend row / chip of the lane under the cursor; show its name in the status line. */
function markActiveLane() {
  const el = document.getElementById("drum-legend"); if (!el) return;
  const lane = state.cursor && editable() ? state.drumLanes[state.cursor.s - 1] : undefined;
  let active: HTMLElement | null = null;
  el.querySelectorAll<HTMLElement>(".dl-row, .dl-chip").forEach(r => {
    const on = !!lane && r.dataset.art === String(lane.art);
    r.classList.toggle("active", on);
    if (on && !active) active = r;
  });
  if (active) { try { (active as HTMLElement).scrollIntoView({ block: "nearest" }); } catch {} }
}

// ── Cursor overlay (called from overlay.ts's overlayCursor) ─────────────────
type Geo = { top: number; half: number };

/** Staff geometry of the bar holding beat b: y of the top line and half a staff space. */
function staffGeometry(b: number): { x: number; w: number; geo: Geo } | null {
  const bl = state.api && state.api.renderer ? state.api.renderer.boundsLookup : null;
  const track = state.api && state.api.score ? state.api.score.tracks[0] : null;
  if (!bl || !bl.staffSystems || !track) return null;
  for (const sys of bl.staffSystems) for (const mb of (sys.bars || [])) for (const bar of (mb.bars || [])) {
    const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
    if (!mBar) continue;
    const hit = (bar.beats || []).find((bb: any) => {
      const beat = bb.beat || bb;
      return beat.playbackStart !== undefined && Math.abs((mBar.start + beat.playbackStart) / 960 - b) < 0.03;
    });
    if (!hit) continue;
    const vb = hit.visualBounds || hit.realBounds;
    // calibrate from the noteheads of this staff system: y = top + staffLine * half
    const pts: { line: number; y: number; h: number }[] = [];
    for (const mb2 of (sys.bars || [])) for (const bar2 of (mb2.bars || [])) for (const bb of (bar2.beats || [])) for (const nb of (bb.notes || [])) {
      const art = nb.note && track.percussionArticulations ? track.percussionArticulations[nb.note.percussionArticulation] : null;
      const hb = nb.noteHeadBounds;
      if (art && hb) pts.push({ line: art.staffLine, y: hb.y + hb.h / 2, h: hb.h });
    }
    let geo: Geo | null = null;
    const lines = [...new Set(pts.map(p => p.line))];
    if (lines.length >= 2) {
      const lo = Math.min(...lines), hi = Math.max(...lines);
      const yLo = avg(pts.filter(p => p.line === lo).map(p => p.y)), yHi = avg(pts.filter(p => p.line === hi).map(p => p.y));
      const half = (yHi - yLo) / (hi - lo);
      geo = { top: yLo - lo * half, half };
    } else if (pts.length) {
      const half = avg(pts.map(p => p.h)) / 2;
      geo = { top: pts[0]!.y - pts[0]!.line * half, half };
    } else if (bar.visualBounds) {
      geo = { top: bar.visualBounds.y, half: bar.visualBounds.h / 8 };
    }
    if (!geo || !vb) return null;
    return { x: vb.x, w: vb.w, geo };
  }
  return null;
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Draw the drum cursor; returns false when not in drum edit mode (overlay.ts then draws the TAB cursor). */
export function drawDrumCursor(): boolean {
  if (!isDrumTrack(state.curTrack)) return false;
  markActiveLane();
  if (!editable()) return true;
  const c = state.cursor, host = document.getElementById("alphaTab");
  const lane = c ? state.drumLanes[c.s - 1] : undefined;
  if (!c || !host || !lane) return true;
  const g = staffGeometry(c.b); if (!g) return true;
  const space = g.geo.half * 2;
  const w = Math.max(14, 1.5 * space), h = Math.max(10, 1.1 * space);
  const cx = g.x + Math.max(g.w, 10) / 2, cy = g.geo.top + lane.staffLine * g.geo.half;
  const hasHit = (state.curTrack.notes || []).some((n: any) => n.s === c.s && Math.abs((n.b || 0) - c.b) < 1e-6);
  const d = document.createElement("div");
  d.className = "cursor-overlay drum" + (hasHit ? "" : " empty");
  d.style.left = (cx - w / 2) + "px"; d.style.top = (cy - h / 2) + "px";
  d.style.width = w + "px"; d.style.height = h + "px";
  const tag = document.createElement("span");
  // near the right edge of the system the tag goes to the left of the box
  tag.className = "drum-lane-tag" + (cx + w / 2 + 84 > host.clientWidth ? " left" : "");
  tag.textContent = lane.name;
  d.appendChild(tag);
  host.appendChild(d);
  status(lane.label + (hasHit ? "" : " — Enter adds a hit"));
  return true;
}

// ── Drum edit keys (called from keys.ts's onKey) ────────────────────────────
type EditHooks = { saveUndo: (before?: any, deletedBefore?: any) => void; render: () => void };

/** Handles a drum-only key; true when consumed. Keys shared with guitar stay in keys.ts. */
export function drumKey(e: KeyboardEvent, k: string, kl: string, hooks: EditHooks): boolean {
  if (!isDrumTrack(state.curTrack)) return false;
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
  // guitar-only keys do nothing on drums: digits (fret), techniques, bend, tie, semitone
  if (plain && !e.shiftKey && (/^[0-9]$/.test(k) || "iphsxvbl".includes(kl) && kl.length === 1)) { e.preventDefault(); return true; }
  if (!editable()) return false;
  if (plain && !e.shiftKey && k === "Enter") { e.preventDefault(); toggleHit(hooks); return true; }
  if (e.altKey && !e.ctrlKey && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); if (!e.shiftKey) changePiece(k === "ArrowUp" ? -1 : 1, hooks); return true; }
  if (plain && !e.shiftKey && (kl === "g" || kl === "a" || kl === "n")) {
    e.preventDefault();
    setVelocity(kl === "g" ? DRUM_VELOCITY.ghost : kl === "a" ? DRUM_VELOCITY.accent : DRUM_VELOCITY.normal, hooks);
    return true;
  }
  return false;
}

function hitAtCursor(): number {
  const c = state.cursor; if (!c) return -1;
  return (state.curTrack.notes || []).findIndex((n: any) => n.s === c.s && Math.abs((n.b || 0) - c.b) < 1e-6);
}

function spanEndFor(b: number): number | null {
  const e = state.curTrack.edit;
  if (e.mode === "track") { const sp = (e.spans || []).find((s: any) => b >= s.start - 1e-6 && b < s.end - 1e-6); return sp ? sp.end : null; }
  return typeof e.regionLength === "number" ? (b < e.regionLength - 1e-6 ? e.regionLength : null) : Infinity;
}

/** Enter: add a hit of the cursor's piece at the cursor's beat, or remove the one there. */
function toggleHit(hooks: EditHooks) {
  const c = state.cursor, lane = c ? state.drumLanes[c.s - 1] : undefined;
  if (!c || !lane) return;
  const notes = state.curTrack.notes;
  const before = notes.map((n: any) => ({ ...n })), deletedBefore = state.deletedOids.slice();
  const i = hitAtCursor();
  if (i >= 0) {
    const n = notes[i];
    if (n.oid !== undefined) state.deletedOids.push(n.oid);
    notes.splice(i, 1);
    state.selectedNoteIndices = [];
    hooks.saveUndo(before, deletedBefore);
    log("Removed " + lane.name);
  } else {
    const end = spanEndFor(c.b);
    if (end === null) { log("Add hit: the cursor is outside every clip"); status("Outside the clip"); return; }
    const sl = slotAt(c.b);
    const d = Math.max(0.125, Math.min(sl ? sl.d : 0.25, end - c.b));
    const tmpl = notes[0] || {};
    notes.push({ b: c.b, d, p: lane.pitch, v: DRUM_VELOCITY.normal, s: c.s, f: 0, src: tmpl.src || "ses", clip: tmpl.clip || "" });
    hooks.saveUndo(before, deletedBefore);
    log("Added " + lane.label);
  }
  hooks.render();
}

/** Alt+Up/Down: move the hit under the cursor to the neighbouring piece (= its pitch changes). */
function changePiece(dir: number, hooks: EditHooks) {
  const c = state.cursor; if (!c) return;
  const i = hitAtCursor();
  if (i < 0) { log("Change piece: no hit at the cursor"); return; }
  const row = c.s + dir, lane = state.drumLanes[row - 1];
  if (!lane) return;
  const notes = state.curTrack.notes;
  if (notes.some((n: any, j: number) => j !== i && n.s === row && Math.abs(n.b - c.b) < 1e-6)) { log("Change piece: " + lane.name + " already plays there"); return; }
  const before = notes.map((n: any) => ({ ...n }));
  const n = notes[i];
  n.p = lane.pitch; n.s = row; if (n.oid !== undefined) n.dirty = true;
  c.s = row;
  hooks.saveUndo(before);
  log("Piece → " + lane.label);
  hooks.render();
}

/** G / A / N: ghost / accent / normal = velocity of the selected hits (or the hit at the cursor). */
function setVelocity(v: number, hooks: EditHooks) {
  const notes = state.curTrack.notes;
  let idx = state.selectedNoteIndices.slice();
  if (!idx.length) { const i = hitAtCursor(); if (i >= 0) idx = [i]; }
  idx = idx.filter(i => notes[i] && notes[i].v !== v);
  if (!idx.length) return;
  const before = notes.map((n: any) => ({ ...n }));
  for (const i of idx) { notes[i].v = v; if (notes[i].oid !== undefined) notes[i].dirty = true; }
  hooks.saveUndo(before);
  log("Velocity " + v + " (" + idx.length + " hit" + (idx.length > 1 ? "s" : "") + ")");
  hooks.render();
}

/** Selected-hit overlay: does this alphaTab note show the editor note tn? (overlay.ts) */
export function drumNoteMatches(an: any, tn: any): boolean {
  if (!isDrumTrack(state.curTrack)) return false;
  const track = state.api && state.api.score ? state.api.score.tracks[0] : null;
  const art = track && track.percussionArticulations ? track.percussionArticulations[an.percussionArticulation] : null;
  return !!art && art.id === resolveDrumPiece(tn.p, state.curTrack.drum.override).articulation;
}

// ── Apply / Close ──────────────────────────────────────────────────────────
/** Kit map to send back with Apply / Close, when the user changed it. */
export function drumLayerIfChanged(): any {
  return isDrumTrack(state.curTrack) && kitChanged ? drumLayerFrom(state.curTrack.drum.override || {}) : undefined;
}

/** Close from a drum track: discard edits after a confirm; send the kit map (if changed) instead of a TAB layer. */
function sendDrumClose(ev: Event) {
  if (!isDrumTrack(state.curTrack)) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  const t = state.curTrack;
  const edits = t.edit ? t.notes.filter((n: any) => n.dirty || n.oid === undefined).length + state.deletedOids.length : 0;
  if (edits && !window.confirm("Discard your edits and close?")) return;
  const msg: any = { action: edits ? "cancel" : "close", layerKey: t.layerStorageKey };
  const layer = drumLayerIfChanged();
  if (layer) msg.drumLayer = layer;
  try { window.chrome.webview.postMessage({ method: "close_and_send", params: [JSON.stringify(msg)] }); }
  catch (e: any) { log("close: " + (e && e.message || e)); }
}

export function bindDrums() {
  drumHooks.drawCursor = drawDrumCursor;
  drumHooks.noteMatches = drumNoteMatches;
  const cancel = document.getElementById("btn-cancel");
  // capture phase: runs before apply.ts's own listener
  if (cancel) cancel.addEventListener("click", sendDrumClose, true);
}
