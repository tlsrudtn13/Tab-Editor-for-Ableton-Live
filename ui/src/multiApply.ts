// ui/src/multiApply.ts — several editable tabs in one editor (Scene, Selected Clips, All Tracks, Selection).
//
// Live's modal returns one message when it closes, so tabs cannot be written while it is open.
// Each tab keeps its own edit session (notes, deleted notes, undo, capo, time signature) when
// the user switches tabs. A tab with edits gets an "Apply" mark in the track list; on Close,
// every marked tab is written to its clip(s) in one Live undo step. Unmarked edits are discarded
// (after a confirm).
import { state } from "./state";
import { log } from "./log";
import { annOf, editsOf, layerOf } from "./apply";
import { drumLayerIfChanged, isDrumTrack } from "./drums";

/** More than one tab, at least one editable: the window works in "apply marked tabs on close" mode. */
export function isMulti(): boolean {
  return !!state.tracks && state.tracks.length > 1 && state.tracks.some((t: any) => !!t.edit);
}

type Session = { deletedOids: number[]; editHistory: any[]; redoHistory: any[]; sessionChanged: boolean; uiCapo: number; uiTimeSig: any };

/** Keep the current tab's edit session on the tab before another tab is loaded. */
export function stashSession(trk: any) {
  if (!trk) return;
  trk._ses = {
    deletedOids: state.deletedOids.slice(), editHistory: state.editHistory, redoHistory: state.redoHistory,
    sessionChanged: state.sessionChanged, uiCapo: state.uiCapo, uiTimeSig: state.uiTimeSig,
  } as Session;
}

/** Restore a tab's edit session; false when the tab was never left (fresh session). */
export function restoreSession(trk: any): boolean {
  const s: Session | undefined = trk && trk._ses;
  if (!s) return false;
  state.deletedOids = s.deletedOids.slice(); state.editHistory = s.editHistory; state.redoHistory = s.redoHistory;
  state.sessionChanged = s.sessionChanged; state.uiCapo = s.uiCapo; state.uiTimeSig = s.uiTimeSig;
  const capoSel = document.getElementById("ui-capo") as HTMLSelectElement | null;
  if (capoSel) capoSel.value = String(state.uiCapo);
  const tsSel = document.getElementById("ui-timesig") as HTMLSelectElement | null;
  if (tsSel && state.uiTimeSig) tsSel.value = state.uiTimeSig.beats + "/" + state.uiTimeSig.type;
  return true;
}

function sessionOf(trk: any): Session {
  if (trk === state.curTrack) return { deletedOids: state.deletedOids, editHistory: state.editHistory, redoHistory: state.redoHistory, sessionChanged: state.sessionChanged, uiCapo: state.uiCapo, uiTimeSig: state.uiTimeSig };
  return trk._ses || { deletedOids: [], editHistory: [], redoHistory: [], sessionChanged: false, uiCapo: trk.capo || 0, uiTimeSig: trk.timeSig || null };
}

/** Number of note edits on a tab (changed + added + deleted). */
export function editCountOf(trk: any): number {
  if (!trk || !trk.edit) return 0;
  return (trk.notes || []).filter((n: any) => n.dirty || n.oid === undefined).length + sessionOf(trk).deletedOids.length;
}

export function toggleApplyMark(id: string) {
  const t = (state.tracks || []).find((x: any) => String(x.id) === String(id));
  if (!t || !editCountOf(t)) return;
  t.applyOnClose = !t.applyOnClose;
  refreshTabMarks();
}

/** Sync the track list's Apply marks and the Close button with the tabs' edits. */
export function refreshTabMarks() {
  if (!isMulti()) return;
  let marked = 0;
  for (const t of state.tracks || []) {
    const n = editCountOf(t);
    if (!n) t.applyOnClose = false;          // nothing left to apply
    if (t.applyOnClose) marked++;
    const b = document.getElementById("ta-" + t.id) as HTMLButtonElement | null;
    if (!b) continue;
    b.disabled = n === 0;
    b.classList.toggle("on", !!t.applyOnClose);
    b.setAttribute("aria-pressed", t.applyOnClose ? "true" : "false");
    b.textContent = n ? (t.applyOnClose ? "✓ Apply " + n : "Apply " + n) : "Apply";
    const row = document.getElementById("ti-" + t.id);
    if (row) row.classList.toggle("queued", !!t.applyOnClose);
    b.title = n === 0 ? "No edits in this tab"
      : t.applyOnClose ? "Will be written to the clip when you close the editor. Click to unmark."
      : "Edited. Click to include this tab in Close & Apply";
  }
  const apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (apply) apply.classList.add("hidden");   // one button in this mode: Close applies the marked tabs
  if (cancel) {
    (cancel as HTMLButtonElement).disabled = false;
    cancel.textContent = marked ? "Close & Apply (" + marked + ")" : "Close";
    cancel.title = marked ? "Write the marked tabs to their clips (one Live undo step) and close" : "Close the editor";
    cancel.classList.toggle("edit-apply", marked > 0);
  }
}

/** Close: write every marked tab, keep the fingering of untouched tabs, discard unmarked edits. */
export function sendMulti() {
  if (state.curTrack) stashSession(state.curTrack);
  const tracks = state.tracks || [];
  const unmarked = tracks.filter((t: any) => editCountOf(t) > 0 && !t.applyOnClose);
  if (unmarked.length && !window.confirm(
      unmarked.length + " tab(s) have edits that are not marked for Apply:\n" + unmarked.map((t: any) => "  · " + t.name).join("\n")
      + "\n\nThose edits will be discarded. Close anyway?")) return;
  const tabs = tracks.map((t: any) => {
    const s = sessionOf(t), n = editCountOf(t), apply = !!t.applyOnClose && n > 0, drum = isDrumTrack(t);
    const tab: any = { id: t.id, apply, edited: n > 0, layerKey: t.layerStorageKey, layerV2Id: t.layerV2Id };
    if (apply) tab.edits = editsOf(t, s.deletedOids);
    // fingering goes back for applied tabs (snapshot) and for opened tabs without edits (as Close does);
    // a tab that was never opened changed nothing, so its saved fingering is left alone
    if (!drum && (apply || (n === 0 && t._ses))) tab.layer = layerOf(t, apply ? true : s.sessionChanged, s.uiCapo, s.uiTimeSig);
    if (drum) { const dl = drumLayerIfChanged(t); if (dl) tab.drumLayer = dl; }
    const ann = annOf(t); if (ann !== undefined) tab.ann = ann;   // chords / key / title: saved whatever happens to note edits
    return tab;
  });
  const msg = { action: "multi", tabs };
  log("Close: " + tabs.filter((t: any) => t.apply).length + " tab(s) to apply");
  window.chrome.webview.postMessage({ method: "close_and_send", params: [JSON.stringify(msg)] });
}
