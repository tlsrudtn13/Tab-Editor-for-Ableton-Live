// @ts-nocheck
import { state } from "./state";
import { getOpenStrings, getStringCount, clearFretboard, lightFret } from "./fretboard";
import { rebuildScore } from "./score";
import { renderInspector } from "./inspector";
import { showSelection, overlaySelectedNotes, clearNoteOverlays } from "./overlay";
import { adjustDuration, moveString } from "./editing";

function active() { return !!(state.curTrack && state.curTrack.edit); }
export function saveUndo(before, deletedBefore) {
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
  try { overlaySelectedNotes(); } catch(e) {}
}
export function updateEditUi() {
  const edits = state.curTrack && state.curTrack.edit ? state.curTrack.notes.filter(n => n.dirty || n.oid === undefined).length + state.deletedOids.length : 0;
  const count = document.getElementById("edit-count"), apply = document.getElementById("btn-apply"), cancel = document.getElementById("btn-cancel");
  if (count) { count.textContent = "* " + edits + " edits"; count.classList.toggle("hidden", edits === 0); }
  const enabled = active();
  [apply,cancel].forEach(b => { if (b) { b.disabled = !enabled; b.title = enabled ? "" : "Apply works in Open (Clip)"; } });
}
function pitchChange(delta) {
  const notes=state.curTrack.notes, before=notes.map(n=>({...n})), open=getOpenStrings(), count=getStringCount(); let touched=false;
  state.selectedNoteIndices.forEach(i=>{ const n=notes[i]; if(!n)return; const p=n.p+delta; if(p<0||p>127)return;
    let f=p-(open[n.s]||40), s=n.s;
    if(f<0||f>24){ f=Infinity; for(let st=1;st<=count;st++){const x=p-(open[st]||40);if(x>=0&&x<=24&&x<f){f=x;s=st;}} if(!Number.isFinite(f))return; }
    n.p=p;n.s=s;n.f=f;if(n.oid!==undefined)n.dirty=true;touched=true;
  }); if(touched){saveUndo(before);render();}
}
export function setSelectedStringFret(s,f) {
  if(!active())return; const n=state.curTrack.notes[state.selectedNoteIndices[0]], open=getOpenStrings()[s]; if(!n||typeof open!=="number")return;
  const before=state.curTrack.notes.map(n=>({...n})); n.s=s;n.f=f;n.p=open+f;if(n.oid!==undefined)n.dirty=true;n.lock=true;saveUndo(before);render();
}
function onKey(e) {
  if (e.target instanceof Element && (e.target.matches("input,select,textarea") || e.target.isContentEditable)) return;
  const k=e.key, selected=state.selectedNoteIndices;
  if(e.ctrlKey&&k.toLowerCase()==="enter"){e.preventDefault();window.applyClipEdits&&window.applyClipEdits();return;}
  if(e.ctrlKey&&k.toLowerCase()==="d"&&active()&&selected.length){e.preventDefault();const i=selected[0],n=state.curTrack.notes[i],before=state.curTrack.notes.map(x=>({...x}));if(n){state.curTrack.notes.push({...n,b:n.b+n.d,oid:undefined,dirty:undefined});selectIndex(state.curTrack.notes.length-1);saveUndo(before);render();}return;}
  if(e.ctrlKey&&k.toLowerCase()==="z"&&active()){e.preventDefault();const h=state.editHistory.pop();if(h){state.curTrack.notes=h.notes.map(n=>({...n}));state.deletedOids=h.deletedOids.slice();state.selectedNoteIndices=[];render();}return;}
  if(k==="Escape"){state.selectedNoteIndices=[];highlightSelection();return;}
  if(!state.curTrack)return;
  const sorted=state.curTrack.notes.map((n,i)=>({n,i})).sort((a,b)=>a.n.b-b.n.b||b.n.p-a.n.p).map(x=>x.i);
  if(k==="ArrowLeft"||k==="ArrowRight"){e.preventDefault();let pos=sorted.indexOf(selected[0]);if(pos<0)pos=k==="ArrowLeft"?sorted.length: -1;selectIndex(sorted[Math.max(0,Math.min(sorted.length-1,pos+(k==="ArrowLeft"?-1:1)))]);return;}
  if(!active())return;
  if((k==="ArrowUp"||k==="ArrowDown")&&selected.length){e.preventDefault();if(e.altKey)moveString(k==="ArrowUp"?-1:1);else pitchChange((k==="ArrowUp"?1:-1)*(e.shiftKey?12:1));return;}
  if((k==="["||k==="]")&&selected.length){adjustDuration(k==="]"?"+1":"-1");return;}
  if(k.toLowerCase()==="d"&&selected.length){adjustDuration("Auto");return;}
  if((k==="Delete"||k==="Backspace")&&selected.length){e.preventDefault();const before=state.curTrack.notes.map(n=>({...n})), deletedBefore=state.deletedOids.slice();const removed=selected.slice().sort((a,b)=>b-a);removed.forEach(i=>{const n=state.curTrack.notes[i];if(n&&n.oid!==undefined)state.deletedOids.push(n.oid);state.curTrack.notes.splice(i,1);});state.selectedNoteIndices=[];saveUndo(before,deletedBefore);render();return;}
  if(/^[0-9]$/.test(k)&&selected.length){state.digitBuffer+=k;clearTimeout(state.digitTimer);const apply=()=>{const f=Number(state.digitBuffer);state.digitBuffer="";if(f>24)return;const n=state.curTrack.notes[state.selectedNoteIndices[0]],open=getOpenStrings()[n.s];if(n&&open!==undefined){const before=state.curTrack.notes.map(x=>({...x}));n.f=f;n.p=open+f;if(n.oid!==undefined)n.dirty=true;n.lock=true;saveUndo(before);render();}};state.digitTimer=setTimeout(apply,400);if(state.digitBuffer.length>=2)apply();return;}
}
export function bindKeys(){document.addEventListener("keydown",onKey);window.__editKeys={selectIndex,setSelectedStringFret,updateEditUi};updateEditUi();}
