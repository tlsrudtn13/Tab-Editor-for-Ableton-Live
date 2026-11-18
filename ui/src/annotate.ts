// ui/src/annotate.ts — score annotations: chord names, key signature, title (stored per clip, not in the MIDI).
//
// Chords: K (or the Chord button) opens a picker at the cursor beat (or the selected range) with up to four
// candidates ranked from the MIDI notes (src/notation/chordDetect.ts): 1-4 pick, Up/Down + Enter, type a
// custom name + Enter, Backspace on an empty field removes the chord, Esc cancels. "Auto chords" fills
// every half bar the detector is sure about (never over a chord the user typed).
// Key: toolbar dropdown, "Live" follows Live's scale; a fixed key is saved with the clip.
// Title: printed above the score and in the PDF; empty = the tab name.
// Every change marks the tab (`_annDirty`) so Close / Apply sends it back (ui/src/apply.ts annOf).
import { state } from "./state";
import { log } from "./log";
import { rebuildScore, scoreKey } from "./score";
import { isDrumTrack } from "./drums";
import { tabBarBoundsAt } from "./overlay";
import { chordCandidates, autoChord, type ChordCandidate } from "../../src/notation/chordDetect.js";

const MAJ = ["Cb","Gb","Db","Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#"];   // fifths -7..7
const MIN = ["Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#","G#","D#","A#"];
export const keyLabel = (k: { fifths: number; minor: boolean }) => (k.minor ? MIN : MAJ)[k.fifths + 7] + (k.minor ? " min" : " maj");
const keyOptionLabel = (k: { fifths: number; minor: boolean }) => "Key: " + keyLabel(k);

function editable(): boolean { return !!(state.curTrack && state.curTrack.edit && !isDrumTrack(state.curTrack)); }
function ann(): any { const t = state.curTrack; if (!t.ann) t.ann = {}; return t.ann; }
function changed() { state.curTrack._annDirty = true; refreshAnnUi(); rebuildScore(); }
const beatsPerBar = () => { const ts = state.uiTimeSig || state.curTrack.timeSig || { beats: 4, type: 4 }; return ts.beats * 4 / ts.type; };

function keyOpts(): { keyRoot?: number; keyIntervals?: number[]; beatsPerBar: number } {
  const t = state.curTrack, bpb = beatsPerBar();
  const k = t.ann && t.ann.key;
  if (k) {   // fixed key -> its major/minor scale
    const majRoot = ((k.fifths * 7) % 12 + 12) % 12;
    return k.minor ? { keyRoot: (majRoot + 9) % 12, keyIntervals: [0,2,3,5,7,8,10], beatsPerBar: bpb } : { keyRoot: majRoot, keyIntervals: [0,2,4,5,7,9,11], beatsPerBar: bpb };
  }
  const sc = t.live && t.live.scale;
  return sc && sc.enabled ? { keyRoot: sc.root, keyIntervals: sc.intervals, beatsPerBar: bpb } : { beatsPerBar: bpb };
}

/** Beat range for the chord: the selection's span, else the cursor beat up to the next note start (max 1 bar). */
function targetRange(): { start: number; end: number } | null {
  const t = state.curTrack, notes: any[] = t.notes || [];
  const sel = (state.selectedNoteIndices || []).map((i: number) => notes[i]).filter(Boolean);
  const beats = new Set(sel.map((n: any) => Math.round(n.b * 96)));
  if (sel.length && beats.size > 1) {
    const start = Math.min(...sel.map((n: any) => n.b)), end = Math.max(...sel.map((n: any) => n.b + n.d));
    return { start, end };
  }
  const b = state.cursor ? state.cursor.b : (sel[0] ? sel[0].b : null);
  if (b == null) return null;
  const next = notes.map((n: any) => n.b).filter((x: number) => x > b + 1e-6).sort((x: number, y: number) => x - y)[0];
  const end = Math.min(b + beatsPerBar(), next !== undefined ? next : b + 1);
  return { start: b, end: Math.max(end, b + 0.125) };
}

export function chordAt(b: number): any | undefined {
  const t = state.curTrack; const list = (t && t.ann && t.ann.chords) || [];
  return list.find((c: any) => Math.abs(c.b - b) < 1e-6);
}
function setChord(b: number, name: string | null, auto = false) {
  const a = ann();
  const list = (a.chords || []).filter((c: any) => Math.abs(c.b - b) >= 1e-6);
  if (name) list.push(auto ? { b, name, auto: true } : { b, name });
  list.sort((x: any, y: any) => x.b - y.b);
  a.chords = list.length ? list : undefined;
  changed();
}

// ── Chord picker ────────────────────────────────────────────────────────────
let picker: HTMLElement | null = null;
function closePicker() { if (picker) { picker.remove(); picker = null; } document.getElementById("btn-chord")?.classList.remove("on"); }

export function openChordPicker() {
  if (!editable()) return;
  closePicker();
  const r = targetRange();
  if (!r) { log("Chord: put the cursor on a beat first"); return; }
  // up to four readings; ones far below the best (e.g. "Daug" for a plain D chord) are noise, not choices
  const all: ChordCandidate[] = chordCandidates(state.curTrack.notes || [], r.start, r.end, { limit: 4, ...keyOpts() });
  const cands = all.filter(c => !all[0] || c.score >= all[0].score - 2.5);
  const existing = chordAt(r.start);
  const box = document.createElement("div");
  box.id = "chord-picker";
  box.setAttribute("role", "dialog");
  const input = document.createElement("input");
  input.type = "text"; input.placeholder = "Custom chord…"; input.maxLength = 24; input.value = "";
  input.setAttribute("aria-label", "Chord name");
  box.appendChild(input);
  const rows: HTMLElement[] = [];
  let active = 0;
  cands.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "cp-row";
    row.innerHTML = '<span class="cp-k">' + (i + 1) + '</span><span class="cp-n"></span>';
    (row.querySelector(".cp-n") as HTMLElement).textContent = c.name;
    row.addEventListener("mousedown", ev => { ev.preventDefault(); pick(c.name); });
    box.appendChild(row); rows.push(row);
  });
  if (!cands.length) { const e = document.createElement("div"); e.className = "cp-empty"; e.textContent = "No notes here: type a name"; box.appendChild(e); }
  const foot = document.createElement("div");
  foot.className = "cp-foot";
  foot.textContent = existing ? "Now: " + existing.name + (existing.auto ? " (auto)" : "") + " · Backspace removes" : "1–4 pick · Enter · Esc";
  box.appendChild(foot);
  const mark = () => rows.forEach((el, i) => el.classList.toggle("on", i === active && !input.value));
  mark();
  function pick(name: string) { closePicker(); setChord(r!.start, name.trim()); log("Chord " + name + " at beat " + r!.start); }
  input.addEventListener("keydown", ev => {
    ev.stopPropagation();
    const k = ev.key;
    if (k === "Escape") { ev.preventDefault(); closePicker(); return; }
    if (/^[1-4]$/.test(k) && !input.value && cands[Number(k) - 1]) { ev.preventDefault(); pick(cands[Number(k) - 1]!.name); return; }
    if (k === "ArrowDown" || k === "ArrowUp") { ev.preventDefault(); if (rows.length) { active = (active + (k === "ArrowDown" ? 1 : rows.length - 1)) % rows.length; mark(); } return; }
    if (k === "Enter") { ev.preventDefault(); const v = input.value.trim(); if (v) pick(v); else if (cands[active]) pick(cands[active]!.name); return; }
    if (k === "Backspace" && !input.value && existing) { ev.preventDefault(); closePicker(); setChord(r!.start, null); log("Chord removed at beat " + r!.start); return; }
  });
  input.addEventListener("input", mark);
  input.addEventListener("blur", () => setTimeout(closePicker, 120));
  document.body.appendChild(box);
  picker = box;
  // anchor (designer D010): 6 px below the TAB staff at the cursor beat, so the staff and the chord row stay
  // visible; above the cursor when there is no room below; below the edit toolbar when there is no cursor
  const cur = document.querySelector("#alphaTab .cursor-overlay") as HTMLElement | null;
  const host = document.getElementById("alphaTab");
  const tb = tabBarBoundsAt(r.start);
  const h = box.offsetHeight || 140, w = box.offsetWidth || 180;
  const a = cur ? cur.getBoundingClientRect() : (document.getElementById("edit-toolbar") || document.body).getBoundingClientRect();
  let top = a.bottom + 6;
  if (cur && host && tb && tb.visualBounds) top = host.getBoundingClientRect().top + tb.visualBounds.y + tb.visualBounds.h + 6;
  if (cur && top + h > window.innerHeight - 8) top = a.top - h - 6;
  box.style.top = Math.round(Math.max(4, top)) + "px";
  box.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, a.left))) + "px";
  document.getElementById("btn-chord")?.classList.add("on");
  input.focus();
}

/** Fill half bars with confident chord names; never replaces a chord the user set. Returns the count added. */
export function autoChords(): number {
  if (!editable()) return 0;
  const t = state.curTrack, notes: any[] = t.notes || [];
  if (!notes.length) return 0;
  const a = ann(), bpb = beatsPerBar(), step = bpb % 2 === 0 && bpb >= 4 ? bpb / 2 : bpb;
  const end = Math.max(...notes.map((n: any) => n.b + n.d));
  const user = (a.chords || []).filter((c: any) => !c.auto);
  const list: any[] = [...user];
  let prev: string | undefined, added = 0;
  for (let s = 0; s < end - 1e-6; s += step) {
    const mine = user.find((c: any) => c.b >= s - 1e-6 && c.b < s + step - 1e-6);
    if (mine) { prev = mine.name; continue; }
    const name = autoChord(notes, s, s + step, keyOpts());
    if (!name || name === prev) continue;
    const b = notes.filter((n: any) => n.b >= s - 1e-6 && n.b < s + step - 1e-6).map((n: any) => n.b).sort((x: number, y: number) => x - y)[0] ?? s;
    list.push({ b, name, auto: true }); prev = name; added++;
  }
  list.sort((x, y) => x.b - y.b);
  a.chords = list.length ? list : undefined;
  changed();
  log("Auto chords: " + added + " added");
  return added;
}
export function clearAutoChords() {
  if (!editable()) return;
  const a = ann(); const list = (a.chords || []).filter((c: any) => !c.auto);
  a.chords = list.length ? list : undefined;
  changed();
}

// ── Key and title ───────────────────────────────────────────────────────────
export function setKeyFromUi(v: string) {
  if (!state.curTrack || isDrumTrack(state.curTrack)) return;
  const a = ann();
  if (v === "live") delete a.key;
  else { const [f, m] = v.split(":"); a.key = { fifths: Number(f), minor: m === "min" }; }
  changed();
}
export function setTitleFromUi(v: string) {
  if (!state.curTrack || isDrumTrack(state.curTrack)) return;
  const a = ann(), s = String(v || "").trim().slice(0, 120);
  if (s && s !== state.curTrack.name) a.title = s; else delete a.title;
  changed();
}

/** Sync the key dropdown, title field and chord buttons with the current tab. */
export function refreshAnnUi() {
  const t = state.curTrack;
  const sel = document.getElementById("ui-key") as HTMLSelectElement | null;
  if (sel) {
    const live = scoreKeyLiveLabel();
    const first = sel.options[0]; if (first) first.textContent = "Live: " + (live || "auto");
    const k = t && t.ann && t.ann.key;
    sel.value = k ? k.fifths + ":" + (k.minor ? "min" : "maj") : "live";
    sel.classList.toggle("fixed", !!k);
    sel.disabled = !t || isDrumTrack(t);
  }
  const title = document.getElementById("ui-title") as HTMLInputElement | null;
  if (title && document.activeElement !== title) { title.value = (t && t.ann && t.ann.title) || ""; title.placeholder = t ? t.name : "Title"; title.disabled = !t || isDrumTrack(t); }
  for (const id of ["btn-chord", "btn-autochords"]) { const b = document.getElementById(id) as HTMLButtonElement | null; if (b) b.disabled = !editable(); }
}
function scoreKeyLiveLabel(): string {
  const t = state.curTrack; if (!t) return "";
  const k = scoreKey({ ...t, ann: undefined });
  return k ? keyLabel({ fifths: k.fifths, minor: k.mode === "minor" }) : "";
}

export function bindAnnotations() {
  const sel = document.getElementById("ui-key") as HTMLSelectElement | null;
  if (sel && sel.options.length <= 1) {
    const add = (v: string, label: string) => { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); };
    for (let f = -7; f <= 7; f++) add(f + ":maj", keyOptionLabel({ fifths: f, minor: false }));
    for (let f = -7; f <= 7; f++) add(f + ":min", keyOptionLabel({ fifths: f, minor: true }));
    sel.addEventListener("change", () => setKeyFromUi(sel.value));
  }
  const title = document.getElementById("ui-title") as HTMLInputElement | null;
  if (title) {
    title.addEventListener("change", () => setTitleFromUi(title.value));
    title.addEventListener("keydown", e => { if (e.key === "Enter") title.blur(); });
  }
  document.getElementById("btn-chord")?.addEventListener("click", openChordPicker);
  document.getElementById("btn-autochords")?.addEventListener("click", e => { if ((e as MouseEvent).shiftKey) clearAutoChords(); else autoChords(); });
  document.addEventListener("mousedown", e => { if (picker && !picker.contains(e.target as Node)) closePicker(); }, true);
  (window as any).__annotate = { openChordPicker, autoChords, clearAutoChords, setKeyFromUi, setTitleFromUi, chordAt };
}
