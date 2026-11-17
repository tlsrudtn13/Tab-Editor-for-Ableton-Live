import { state } from "./state";
import { getOpenStrings, getStringCount, clearFretboard, lightFret } from "./fretboard";
import { rebuildScore } from "./score";
import { renderInspector } from "./inspector";
import { showSelection, overlaySelectedNotes, clearNoteOverlays } from "./overlay";
import { adjustDuration, moveString } from "./editing";
import { detectQuantizeGrid } from "../../src/notation/music.js";
import { log } from "./log";
import { TECH_KEY, toggleSelectedTech, cycleSelectedBend } from "./techUi";

function active() { return !!(state.curTrack && state.curTrack.edit); }
/** Editable ranges in score beats: the clip's region, or each arrangement clip in track view. */
function editSpans(): { start: number; end: number }[] | null {
  const e = state.curTrack && state.curTrack.edit;
  if (!e) return null;
  if (e.mode === "track") return e.spans || [];
  return typeof e.regionLength === "number" ? [{ start: 0, end: e.regionLength }] : null;
}
/** Index of the span containing beat b (-1 = outside every clip; 0 when spans are unknown). */
function spanIndex(b: number): number {
  const sp = editSpans();
  if (!sp) return 0;
  return sp.findIndex(s => b >= s.start - 1e-6 && b < s.end - 1e-6);
}
export function saveUndo(before?: any, deletedBefore?: any) {
  state.editHistory.push({ notes: before || state.curTrack.notes.map(n => ({ ...n })), deletedOids: (deletedBefore || state.deletedOids).slice() });
  if (state.editHistory.length > 50) state.editHistory.shift();
}
function render() {
  if (!state.curTrack) return;
  rebuildScore(); renderInspector(state.curTrack); highlightSelection(); updateEditUi();
}
function highlightSelection() {
  clearFretboard();
  const ns = state.selectedNoteIndices.map(i => state.curTrack.notes[i]).filter(Boolean);
  ns.forEach(n => lightFret(n.s, n.f));
  showSelection(ns.map(n => ({ f:n.f, s:n.s, p:n.p })), ns.length === 1);
  document.querySelectorAll("#note-tbody tr.sel").forEach(r => r.classList.remove("sel"));
  state.selectedNoteIndices.forEach(i => { const r=document.getElementById("nr-"+i); if(r) r.classList.add("sel"); });
  if (state.selectedNoteIndices.length === 0) clearNoteOverlays();
  else { try { overlaySelectedNotes(); } catch(e) {} }
}
export function selectIndex(index) {
  if (!state.curTrack || index < 0 || index >= state.curTrack.notes.length) return;
  state.selectedNoteIndices = [index]; highlightSelection();
  try { overlaySelectedNotes(); } catch(e: any) {}
}
export function updateEditUi() {
  const edits = state.curTrack && state.curTrack.edit ? state.curTrack.notes.filter(n => n.dirty || n.oid === undefined).length + state.deletedOids.length : 0;
  const count = document.getElementById("edit-count"), apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (count) { count.textContent = "* " + edits + " edits"; count.classList.toggle("hidden", edits === 0); }
  const enabled = active();
  if (apply) {
    (apply as HTMLButtonElement).disabled = !enabled;
    apply.title = enabled ? "" : "Apply works in Open (Clip) and Open (Track)";
    apply.textContent = enabled && state.curTrack.edit.mode === "track" ? "Apply to Clips" : "Apply to Clip";
  }
  if (cancel) { (cancel as HTMLButtonElement).disabled = false; cancel.textContent = edits === 0 ? "Close" : "Cancel"; cancel.title = ""; }
}
function pitchChange(delta) {
  const notes=state.curTrack.notes, before=notes.map(n=>({...n})), open=getOpenStrings(), count=getStringCount(); let touched=false;
  state.selectedNoteIndices.forEach(i=>{ const n=notes[i]; if(!n)return; const p=n.p+delta; if(p<0||p>127)return;
    let f=p-(open[n.s]||40), s=n.s;
    if(f<0||f>24){ f=Infinity; for(let st=1;st<=count;st++){const x=p-(open[st]||40);if(x>=0&&x<=24&&x<f){f=x;s=st;}} if(!Number.isFinite(f))return; }
    n.p=p;n.s=s;n.f=f;if(n.oid!==undefined)n.dirty=true;touched=true;
  }); if(touched){saveUndo(before);render();}
}
/** Put the insert cursor on a rest (b, d in beats from the score start). */
export function setRestCursor(b: number, d: number) {
  if (!active()) return;
  const prev = state.restCursor;
  state.restCursor = { b, d: d > 0 ? d : 0.25, s: prev ? prev.s : 1 };
  state.selectedNoteIndices = [];
  showRestCursor();
}
function showRestCursor() {
  const rc = state.restCursor; if (!rc) return;
  clearFretboard(); lightFret(rc.s, 0, "Empty beat " + (rc.b + 1).toFixed(2) + " · string " + rc.s + ": click a fret or type a number (Alt+↑/↓ string)");
}
/** Add a note at the insert cursor, or as a chord tone at the selected note's time (chord=true). */
export function insertNote(s: number, f: number, chord = false) {
  if (!active()) return false;
  const open = getOpenStrings()[s]; if (typeof open !== "number" || f < 0 || f > 24) return false;
  let b: number, d: number;
  if (chord) {
    const ref = state.curTrack.notes[state.selectedNoteIndices[0]]; if (!ref) return false;
    if (state.curTrack.notes.some((n: any) => Math.abs(n.b - ref.b) < 1e-6 && n.s === s)) return false; // string taken
    b = ref.b; d = ref.d;
  } else {
    const rc = state.restCursor; if (!rc) return false;
    b = rc.b; d = rc.d;
    const si = spanIndex(b), sp = editSpans();
    if (si < 0) { log("Insert: that rest is outside every clip"); return false; }
    if (sp && sp[si]) d = Math.min(d, sp[si].end - b);
  }
  const tmpl = state.curTrack.notes[0] || {};
  const before = state.curTrack.notes.map((n: any) => ({ ...n }));
  state.curTrack.notes.push({ b, d, p: open + f, v: 100, s, f, src: tmpl.src || "ses", clip: tmpl.clip || "", lock: true });
  state.restCursor = null;
  saveUndo(before);
  state.selectedNoteIndices = [state.curTrack.notes.length - 1];
  render();
  return true;
}
/** Move the selected notes in time by `steps` grid steps (or whole beats). Refuses a move onto a string already used there. */
export function moveTime(steps: number, wholeBeats = false) {
  if (!active() || !state.selectedNoteIndices.length) return;
  const notes = state.curTrack.notes;
  const grid = state.uiQuantize === "auto" ? detectQuantizeGrid(notes) : state.uiQuantize;
  const unit = wholeBeats ? 1 : 4 / grid, delta = steps * unit;
  const sel = new Set(state.selectedNoteIndices);
  const moved = state.selectedNoteIndices.map(i => notes[i]).filter(Boolean);
  if (moved.some((n: any) => n.b + delta < -1e-6)) { log("Move: already at the start"); return; }
  if (moved.some((n: any) => { const from = spanIndex(n.b), to = spanIndex(n.b + delta); return to < 0 || to !== from; })) {
    log("Move: notes cannot leave their clip"); return;
  }
  const clash = moved.find((n: any) => notes.some((o: any, j: number) => !sel.has(j) && o.s === n.s && Math.abs(o.b - (n.b + delta)) < unit / 2));
  if (clash) { log("Move: string " + clash.s + " is already used there"); return; }
  const before = notes.map((n: any) => ({ ...n }));
  moved.forEach((n: any) => { n.b = Math.max(0, n.b + delta); if (n.oid !== undefined) n.dirty = true; });
  saveUndo(before);
  render();
}
export function setSelectedStringFret(s,f) {
  if(!active())return; const n=state.curTrack.notes[state.selectedNoteIndices[0]], open=getOpenStrings()[s]; if(!n||typeof open!=="number")return;
  const before=state.curTrack.notes.map(n=>({...n})); n.s=s;n.f=f;n.p=open+f;if(n.oid!==undefined)n.dirty=true;n.lock=true;saveUndo(before);render();
}
function onKey(e) {
  if(state.restCursor&&(e.key==="ArrowLeft"||e.key==="ArrowRight"))state.restCursor=null;
  if (e.target instanceof Element && (e.target.matches("input,select,textarea") || e.target.isContentEditable)) return;
  const k=e.key, selected=state.selectedNoteIndices;
  if(e.ctrlKey&&k.toLowerCase()==="enter"){e.preventDefault();window.applyClipEdits&&window.applyClipEdits();return;}
  if(e.ctrlKey&&k.toLowerCase()==="d"&&active()&&selected.length){e.preventDefault();const i=selected[0],n=state.curTrack.notes[i],before=state.curTrack.notes.map(x=>({...x}));if(n){state.curTrack.notes.push({...n,b:n.b+n.d,oid:undefined,dirty:undefined});selectIndex(state.curTrack.notes.length-1);saveUndo(before);render();}return;}
  if(e.ctrlKey&&k.toLowerCase()==="z"&&active()){e.preventDefault();const h=state.editHistory.pop();if(h){state.curTrack.notes=h.notes.map(n=>({...n}));state.deletedOids=h.deletedOids.slice();state.selectedNoteIndices=[];render();}return;}
  if(k==="Escape"){state.selectedNoteIndices=[];state.restCursor=null;clearNoteOverlays();highlightSelection();return;}
  // Insert cursor on a rest: Alt+arrows pick the string, digits add a note there
  if(state.restCursor&&!selected.length&&active()){
    if((k==="ArrowUp"||k==="ArrowDown")&&e.altKey){e.preventDefault();const rc=state.restCursor;rc.s=Math.max(1,Math.min(getStringCount(),rc.s+(k==="ArrowUp"?-1:1)));showRestCursor();return;}
    if(/^[0-9]$/.test(k)){state.digitBuffer+=k;if(state.digitTimer)clearTimeout(state.digitTimer);const go=()=>{const f=Number(state.digitBuffer);state.digitBuffer="";if(f<=24&&state.restCursor)insertNote(state.restCursor.s,f);};state.digitTimer=setTimeout(go,400);if(state.digitBuffer.length>=2)go();return;}
  }
  if(!state.curTrack)return;
  const sorted=state.curTrack.notes.map((n,i)=>({n,i})).sort((a,b)=>a.n.b-b.n.b||b.n.p-a.n.p).map(x=>x.i);
  if((k==="ArrowLeft"||k==="ArrowRight")&&e.shiftKey&&active()&&selected.length){e.preventDefault();moveTime(k==="ArrowLeft"?-1:1,e.ctrlKey);return;}
  if(k==="ArrowLeft"||k==="ArrowRight"){e.preventDefault();let pos=sorted.indexOf(selected[0]);if(pos<0)pos=k==="ArrowLeft"?sorted.length: -1;selectIndex(sorted[Math.max(0,Math.min(sorted.length-1,pos+(k==="ArrowLeft"?-1:1)))] as number);return;}
  if(!active())return;
  if((k==="ArrowUp"||k==="ArrowDown")&&selected.length){e.preventDefault();if(e.altKey)moveString(k==="ArrowUp"?-1:1);else pitchChange((k==="ArrowUp"?1:-1)*(e.shiftKey?12:1));return;}
  if((k==="["||k==="]")&&selected.length){adjustDuration(k==="]"?"+1":"-1");return;}
  if(k.toLowerCase()==="d"&&selected.length){adjustDuration("Auto");return;}
  if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&selected.length&&k.toLowerCase()==="b"){e.preventDefault();cycleSelectedBend(saveUndo,render);return;}
  if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&selected.length&&TECH_KEY[k.toLowerCase()]){e.preventDefault();toggleSelectedTech(TECH_KEY[k.toLowerCase()],saveUndo,render);return;}
  if((k==="Delete"||k==="Backspace")&&selected.length){e.preventDefault();const before=state.curTrack.notes.map(n=>({...n})), deletedBefore=state.deletedOids.slice();const removed=selected.slice().sort((a,b)=>b-a);removed.forEach(i=>{const n=state.curTrack.notes[i];if(n&&n.oid!==undefined)state.deletedOids.push(n.oid);state.curTrack.notes.splice(i,1);});state.selectedNoteIndices=[];saveUndo(before,deletedBefore);render();return;}
  if(/^[0-9]$/.test(k)&&selected.length){state.digitBuffer+=k;if(state.digitTimer)clearTimeout(state.digitTimer);const apply=()=>{const f=Number(state.digitBuffer);state.digitBuffer="";if(f>24)return;const n=state.curTrack.notes[state.selectedNoteIndices[0]];if(!n)return;const open=getOpenStrings()[n.s];if(open!==undefined){const before=state.curTrack.notes.map(x=>({...x}));n.f=f;n.p=open+f;if(n.oid!==undefined)n.dirty=true;n.lock=true;saveUndo(before);render();}};state.digitTimer=setTimeout(apply,400);if(state.digitBuffer.length>=2)apply();return;}
}
/** Palette button / window handler. */
export function toggleTech(t){ if (t === "bend") cycleSelectedBend(saveUndo, render); else toggleSelectedTech(t, saveUndo, render); }
export function bindKeys(){document.addEventListener("keydown",onKey);window.__editKeys={selectIndex,setSelectedStringFret,updateEditUi,insertNote,setRestCursor};updateEditUi();}
