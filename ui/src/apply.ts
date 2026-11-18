import { state } from "./state";
import { layerV2FromNotes } from "../../src/notation/tabLayer.js";
import { instrumentKeyOf } from "./score";
import { drumLayerIfChanged, isDrumTrack } from "./drums";

function spanForBeat(b: number): any | undefined {
  const e = state.curTrack && state.curTrack.edit;
  if (!e || e.mode !== "track") return undefined;
  return (e.spans || []).find((s: any) => b >= s.start - 1e-6 && b < s.end - 1e-6);
}

function notesForLayer() {
  const t = state.curTrack; if (!t) return [];
  const e = t.edit;
  return (t.notes || []).map((n: any) => {
    const out: any = { ...n };
    let cb = (Math.abs(n.b - n.b0) < 1e-6 && n.cb != null) ? n.cb : undefined;
    if (cb == null) {
      if (e && e.mode === "clip") cb = n.b + (e.regionStart || 0);
      else if (e && e.mode === "track") {
        const sp = spanForBeat(n.b);
        if (sp) { cb = n.b - sp.offset; out.c = sp.index; }
      }
    }
    if (cb != null) out.cb = cb;
    if (e && e.mode === "track" && n.cref != null && out.c == null) out.c = n.cref;
    return out;
  });
}

function currentLayer(snapshot: boolean) {
  const t = state.curTrack; if (!t) return null;
  const hint = t.layerHint || { track: t.name || "", clip: "" };
  return layerV2FromNotes(notesForLayer(), { instrument: instrumentKeyOf(t.instrument), capo: state.uiCapo, timeSig: state.uiTimeSig || t.timeSig, hint, snapshot });
}

export function editCount() {
  return state.curTrack && state.curTrack.edit ? state.curTrack.notes.filter(n => n.dirty || n.oid === undefined).length + state.deletedOids.length : 0;
}
export function sendApply() {
  if (!state.curTrack || !state.curTrack.edit) return;
  const notes = state.curTrack.notes;
  const edits = {
    changed: notes.filter(n => n.dirty && n.oid !== undefined).map(n => ({
      oid: n.oid, pitch: n.p, velocity: n.v,
      // undefined = unchanged: the extension keeps the clip's original value
      start: Math.abs(n.b - n.b0) > 1e-6 ? n.b : undefined,
      duration: Math.abs(n.d - n.d0) > 1e-6 ? n.d : undefined,
    })),
    added: notes.filter(n => n.oid === undefined).map(n => ({ pitch:n.p, start:n.b, duration:n.d, velocity:n.v })),
    deleted: state.deletedOids.slice(),
  };
  // drums: no TAB layer; the kit map goes back when it changed
  const drum = isDrumTrack(state.curTrack);
  const layer = drum ? undefined : currentLayer(true);
  const drumLayer = drum ? drumLayerIfChanged() : undefined;
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify({ action:"apply", edits, layer, drumLayer, layerKey:state.curTrack.layerStorageKey, layerV2Id:state.curTrack.layerV2Id, sessionChanged:true })] });
}
export function sendCancel() {
  const edits = editCount();
  if (edits && !window.confirm("Discard your edits and close?")) return;
  const snapshot = state.sessionChanged;
  const layer = edits ? undefined : currentLayer(snapshot);
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify({ action: edits ? "cancel" : "close", layer, layerKey:state.curTrack.layerStorageKey, layerV2Id:state.curTrack.layerV2Id, sessionChanged:snapshot })] });
}
export function bindApply() {
  const apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (apply) apply.addEventListener("click", sendApply);
  if (cancel) cancel.addEventListener("click", sendCancel);
  window.applyClipEdits = sendApply;
}
