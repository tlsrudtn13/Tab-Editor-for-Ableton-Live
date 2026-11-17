// ============================================================
// ui/src/drums.ts — view-only drum notation mode (docs/DRUMS.md).
// A drum payload (payload.drum) renders as an AlphaTex percussion staff;
// the fretboard, TAB modes, guitar techniques and Apply are hidden, and a
// legend lists the pads used. The legend's menus change the per-track kit
// map, which goes back to Live on close (message.drumLayer).
// ============================================================
import { state } from "./state";
import { log, status } from "./log";
import { createApi } from "./score";
import { toDrumAlphaTex } from "../../src/notation/toDrumAlphaTex.js";
import { DRUM_ARTICULATIONS, drumLayerFrom, drumLegend, liveNoteName, type DrumOverride } from "../../src/notation/drumMap.js";
import "./drums.css";

export function isDrumTrack(trk: any): boolean {
  return !!(trk && trk.drum && typeof trk.drum.tex === "string");
}

let prevMode: string | null = null;
let kitChanged = false;

export function enterDrumMode(trk: any) {
  document.body.classList.add("drum-mode");
  if (prevMode === null) prevMode = state.dispMode;
  state.dispMode = "staff";            // no TAB for percussion
  kitChanged = false;
  renderLegend(trk);
}

export function leaveDrumMode() {
  if (!document.body.classList.contains("drum-mode")) return;
  document.body.classList.remove("drum-mode");
  if (prevMode !== null) state.dispMode = prevMode;
  prevMode = null;
  const el = document.getElementById("drum-legend");
  if (el) el.remove();
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

/** Regenerate the percussion staff from the notes (quantize / time signature / kit map changes). */
export function rebuildDrumScore() {
  const trk = state.curTrack;
  if (!isDrumTrack(trk)) return;
  const tex = toDrumAlphaTex(trk.notes, {
    bpm: trk.bpm || 120,
    timeSig: state.uiTimeSig || trk.timeSig,
    quantize: state.uiQuantize === "auto" ? undefined : (state.uiQuantize as any),
    override: trk.drum.override,
    hints: trk.drum.hints,
    cues: trk.live && trk.live.cues,
    title: trk.name,
  }).tex;
  trk.drum.tex = tex;
  trk.alphaTex = tex;                   // the ATex export button saves this
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
  hint.textContent = "Hands: stems up · Feet: stems down · change a pad to fix a custom kit";
  head.appendChild(hint);
  el.appendChild(head);
  const list = document.createElement("div");
  list.className = "dl-list";
  for (const p of pieces) {
    const row = document.createElement("label");
    row.className = "dl-row" + (p.mapped ? "" : " unmapped") + (p.custom ? " custom" : "");
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
      renderLegend(trk);
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
  el.appendChild(list);
}

/** Close from a drum track: send the kit map (if changed) instead of a TAB layer. */
function sendDrumClose(ev: Event) {
  if (!isDrumTrack(state.curTrack)) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  const msg: any = { action: "close", layerKey: state.curTrack.layerStorageKey };
  if (kitChanged) msg.drumLayer = drumLayerFrom(state.curTrack.drum.override || {});
  try { window.chrome.webview.postMessage({ method: "close_and_send", params: [JSON.stringify(msg)] }); }
  catch (e: any) { log("close: " + (e && e.message || e)); }
}

export function bindDrums() {
  const cancel = document.getElementById("btn-cancel");
  // capture phase: runs before apply.ts's own listener
  if (cancel) cancel.addEventListener("click", sendDrumClose, true);
}
