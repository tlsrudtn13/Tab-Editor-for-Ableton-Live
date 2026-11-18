import { state } from "./state";
import { layerV2FromNotes } from "../../src/notation/tabLayer.js";
import { instrumentKeyOf } from "./score";
import { drumLayerIfChanged, isDrumTrack } from "./drums";
import { editCountOf, isMulti, sendMulti } from "./multiApply";

function spanForBeat(t: any, b: number): any | undefined {
  const e = t && t.edit;
  if (!e || e.mode !== "track") return undefined;
  return (e.spans || []).find((s: any) => b >= s.start - 1e-6 && b < s.end - 1e-6);
}

function notesForLayer(t: any) {
  if (!t) return [];
  const e = t.edit;
  return (t.notes || []).map((n: any) => {
    const out: any = { ...n };
    let cb = (Math.abs(n.b - n.b0) < 1e-6 && n.cb != null) ? n.cb : undefined;
    if (cb == null) {
      if (e && e.mode === "clip") cb = n.b + (e.regionStart || 0);
      else if (e && e.mode === "track") {
        const sp = spanForBeat(t, n.b);
        if (sp) { cb = n.b - sp.offset; out.c = sp.index; }
      }
    }
    if (cb != null) out.cb = cb;
    if (e && e.mode === "track" && n.cref != null && out.c == null) out.c = n.cref;
    return out;
  });
}

/** TAB layer (fingering) of a tab; capo / time signature come from that tab's own session. */
export function layerOf(t: any, snapshot: boolean, capo: number, timeSig: any) {
  if (!t) return null;
  const hint = t.layerHint || { track: t.name || "", clip: "" };
  return layerV2FromNotes(notesForLayer(t), { instrument: instrumentKeyOf(t.instrument), capo, timeSig: timeSig || t.timeSig, hint, snapshot });
}
function currentLayer(snapshot: boolean) {
  return layerOf(state.curTrack, snapshot, state.uiCapo, state.uiTimeSig);
}

/**
 * The tab's annotations (chord names, fixed key, title) in clip beats, for the extension to store;
 * undefined when they were not changed in this session (nothing to write).
 */
export function annOf(t: any): any {
  if (!t || !t._annDirty || isDrumTrack(t)) return undefined;
  const a = t.ann || {}, e = t.edit, out: any = {};
  const chords = (a.chords || []).map((c: any) => {
    const extra = c.auto ? { auto: true } : {};
    if (e && e.mode === "clip") return { cb: c.b + (e.regionStart || 0), name: c.name, ...extra };
    if (e && e.mode === "track") { const sp = spanForBeat(t, c.b); return sp ? { cb: c.b - sp.offset, c: sp.index, name: c.name, ...extra } : null; }
    return null;
  }).filter(Boolean);
  if (chords.length) out.chords = chords;
  if (a.key) out.key = { ...a.key };
  if (a.title) out.title = a.title;
  return out;
}
/** Adds `ann` to a close message when the tab's annotations changed. */
export function withAnn(msg: any, t: any): any {
  const ann = annOf(t);
  if (ann !== undefined) msg.ann = ann;
  return msg;
}

/** Note edits of a tab, in the form the extension merges into the clip. */
export function editsOf(t: any, deletedOids: number[]) {
  const notes = t.notes || [];
  return {
    changed: notes.filter((n: any) => n.dirty && n.oid !== undefined).map((n: any) => ({
      oid: n.oid, pitch: n.p, velocity: n.v,
      // undefined = unchanged: the extension keeps the clip's original value
      start: Math.abs(n.b - n.b0) > 1e-6 ? n.b : undefined,
      duration: Math.abs(n.d - n.d0) > 1e-6 ? n.d : undefined,
    })),
    added: notes.filter((n: any) => n.oid === undefined).map((n: any) => ({ pitch: n.p, start: n.b, duration: n.d, velocity: n.v })),
    deleted: deletedOids.slice(),
  };
}

export function editCount() {
  return editCountOf(state.curTrack);
}
export function sendApply() {
  if (isMulti()) { sendMulti(); return; }
  if (!state.curTrack || !state.curTrack.edit) return;
  const edits = editsOf(state.curTrack, state.deletedOids);
  // drums: no TAB layer; the kit map goes back when it changed
  const drum = isDrumTrack(state.curTrack);
  const layer = drum ? undefined : currentLayer(true);
  const drumLayer = drum ? drumLayerIfChanged() : undefined;
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify(withAnn({ action:"apply", edits, layer, drumLayer, layerKey:state.curTrack.layerStorageKey, layerV2Id:state.curTrack.layerV2Id, sessionChanged:true }, state.curTrack))] });
}
export function sendCancel() {
  if (isMulti()) { sendMulti(); return; }
  const edits = editCount();
  if (edits && !window.confirm("Discard your edits and close?")) return;
  const snapshot = state.sessionChanged;
  const layer = edits ? undefined : currentLayer(snapshot);
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify(withAnn({ action: edits ? "cancel" : "close", layer, layerKey:state.curTrack.layerStorageKey, layerV2Id:state.curTrack.layerV2Id, sessionChanged:snapshot }, state.curTrack))] });
}
export function bindApply() {
  const apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (apply) apply.addEventListener("click", sendApply);
  if (cancel) cancel.addEventListener("click", sendCancel);
  window.applyClipEdits = sendApply;
}
