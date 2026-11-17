import { state } from "./state";
import { layerFromNotes } from "../../src/notation/tabLayer.js";
import { instrumentKeyOf } from "./score";

function currentLayer() {
  const t=state.curTrack;
  return t ? layerFromNotes(t.notes, instrumentKeyOf(t.instrument), state.uiCapo, state.uiTimeSig || t.timeSig) : null;
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
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify({ action:"apply", edits, layer:currentLayer(), layerKey:state.curTrack.layerStorageKey })] });
}
export function sendCancel() {
  const edits = editCount();
  if (edits && !window.confirm("Discard your edits and close?")) return;
  window.chrome.webview.postMessage({ method:"close_and_send", params:[JSON.stringify({ action: edits ? "cancel" : "close", layer: edits ? undefined : currentLayer(), layerKey:state.curTrack.layerStorageKey })] });
}
export function bindApply() {
  const apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (apply) apply.addEventListener("click", sendApply);
  if (cancel) cancel.addEventListener("click", sendCancel);
  window.applyClipEdits = sendApply;
}
