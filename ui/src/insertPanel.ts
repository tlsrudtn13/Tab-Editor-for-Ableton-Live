// ui/src/insertPanel.ts — Insert panel (TAB Editor 2.0, design D019).
// Right-side drawer: pick a part, pick a feel, press Insert. The notes go into the open tab as new
// notes (one editor undo step, violet until Apply); Apply writes them to the clip with the other edits.
import { state } from "./state";
import { log, status } from "./log";
import { saveUndo } from "./keys";
import { rebuildScore } from "./score";
import { renderInspector } from "./inspector";
import { refreshAnnUi } from "./annotate";
import { isDrumTrack } from "./drums";
import { getOpenStrings, getStringCount } from "./fretboard";
import "./insert.css";
import { analyzeClip, buildInsert, loopChords, loopOnsets, mergeInsert, type ChordSource, type ClipAnalysis, type InsertRequest, type PlacedChordIn } from "../../src/notation/insertEngine.js";
import { FEELS, feelOf, type FeelOptions, type InsertPart } from "../../src/notation/insertFeels.js";
import { PROGRESSIONS } from "../../src/notation/progressions.js";
import { COMP_PATTERNS } from "../../src/notation/comping.js";
import { DRUM_PATTERNS } from "../../src/notation/drumPresets.js";
import { kickOnsets } from "../../src/notation/bandBass.js";
import { fitToKit, kickPitches, kitPitchMap } from "../../src/notation/drumKit.js";
import { suggestNext } from "../../src/notation/chordSuggest.js";
import { romanOf, type ChordTier } from "../../src/notation/harmonyAnalysis.js";
import { chordName, keyRefFromKeyInfo, PC_NAMES, type ChordSym, type KeyRef } from "../../src/notation/harmony.js";

type Target = "sel" | "1" | "2" | "4" | "8" | "clip";
const PARTS: { id: InsertPart; label: string }[] = [
  { id: "chords", label: "Chords" }, { id: "bass", label: "Bass" }, { id: "riff", label: "Riff" }, { id: "drums", label: "Drums" },
];
const PART_NOUN: Record<InsertPart, string> = { chords: "Chords", bass: "Bass", riff: "Riff", drums: "Drums" };

const ui = {
  open: false,
  part: "chords" as InsertPart,
  feel: { chords: "folk", bass: "root", riff: "hook", drums: "rock" } as Record<InsertPart, string>,
  opts: {} as Record<InsertPart, FeelOptions>,
  custom: { chords: false, bass: false, riff: false, drums: false } as Record<InsertPart, boolean>,
  source: "preset:pop",          // "preset:<id>" | "track:<index>" | "custom"
  sourceSet: false,              // the user picked the source: keep it
  customChords: [] as ChordSym[],
  keyChoice: "auto",             // "auto" | "<root>:<mode>"
  target: "4" as Target,
  kickTrack: -1,                 // index in state.tracks, -1 = none
  seed: 1,
  moreOpen: false,
  lastInsert: null as null | { histLen: number; mode: "add" | "replace" },
};
for (const p of PARTS) ui.opts[p.id] = { ...(feelOf(p.id, ui.feel[p.id])?.opts || {}) };

const analysisCache = new WeakMap<any, { sig: string; a: ClipAnalysis }>();

function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const keyLabel = (k: KeyRef) => PC_NAMES[k.root] + (k.mode === "minor" ? " minor" : " major");
const relative = (k: KeyRef): KeyRef => k.mode === "major" ? { root: mod12(k.root + 9), mode: "minor" } : { root: mod12(k.root + 3), mode: "major" };

function beatsPerBar(): number {
  const ts = state.uiTimeSig || (state.curTrack && state.curTrack.timeSig) || { beats: 4, type: 4 };
  return ts.beats * 4 / ts.type;
}
function editable(): boolean { return !!(state.curTrack && state.curTrack.edit); }
function pitchedTrack(t: any): boolean { return !!t && !isDrumTrack(t) && Array.isArray(t.notes) && t.notes.length > 0; }
function drumTracks(): { t: any; i: number }[] {
  return (state.tracks || []).map((t: any, i: number) => ({ t, i })).filter(x => isDrumTrack(x.t) && x.t.notes && x.t.notes.length);
}

/** Loop length of a Session clip tab (its notes repeat every this many beats in Live), else 0. */
function loopOf(t: any): number {
  const e = t && t.edit;
  return e && e.mode === "clip" && typeof e.regionLength === "number" && e.regionLength > 0 ? e.regionLength : 0;
}

/** Changes whenever a note's time, length or pitch does (the analysis is redone then). */
function notesSig(t: any): string {
  let h = 0;
  for (const n of t.notes) h = (h * 31 + Math.round(n.b * 480) * 7 + Math.round(n.d * 480) * 3 + n.p) % 2147483647;
  return t.notes.length + ":" + h + ":" + beatsPerBar() + ":" + loopOf(t);
}

function analysisOf(t: any): ClipAnalysis | null {
  if (!pitchedTrack(t)) return null;
  const sig = notesSig(t);
  const c = analysisCache.get(t);
  if (c && c.sig === sig) return c.a;
  const end = loopOf(t) || t.notes.reduce((m: number, n: any) => Math.max(m, n.b + n.d), 0);
  const a = analyzeClip(t.notes, { start: 0, end, beatsPerBar: beatsPerBar() });
  analysisCache.set(t, { sig, a });
  return a;
}

/** Chords sound at once in most of the track (a guitar strum, pads), not a single line. */
function chordalTrack(t: any): boolean {
  if (!pitchedTrack(t)) return false;
  const ns = t.notes.slice().sort((a: any, b: any) => a.b - b.b);
  let together = 0;
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    if ((i > 0 && n.b - ns[i - 1].b < 0.08) || (i + 1 < ns.length && ns[i + 1].b - n.b < 0.08)) together++;
  }
  return together >= 0.4 * ns.length && (analysisOf(t)?.chords.length || 0) > 0;
}

const sureWord = (c: number) => c >= 0.7 ? "sure" : c >= 0.4 ? "likely" : "a guess";
function sourceTrack(): any {
  if (!ui.source.startsWith("track:")) return null;
  return (state.tracks || [])[Number(ui.source.slice(6))] || null;
}

/** Key used to build: the panel's choice, else the clip's fixed key, else the analysis, else C major. */
function currentKey(): { key: KeyRef; from: string } {
  if (ui.keyChoice !== "auto") {
    const [r, m] = ui.keyChoice.split(":");
    return { key: { root: Number(r), mode: m === "minor" ? "minor" : "major" }, from: "set" };
  }
  const fixed = state.curTrack && state.curTrack.ann && state.curTrack.ann.key;
  if (fixed) {
    try { return { key: keyRefFromKeyInfo({ fifths: fixed.fifths, mode: fixed.minor ? "minor" : "major" } as any), from: "clip key" }; } catch {}
  }
  const a = analysisOf(sourceTrack()) || analysisOf(state.curTrack);
  if (a && a.key) return { key: a.key, from: sureWord(a.confidence) };
  return { key: { root: 0, mode: "major" }, from: "default" };
}

/** Beat range the insert writes: whole bars from the cursor (or selection), inside the clip. */
function targetRange(): { start: number; end: number; bars: number } | null {
  const t = state.curTrack; if (!t || !t.edit) return null;
  const bpb = beatsPerBar();
  const e = t.edit;
  const spans: { start: number; end: number }[] = e.mode === "track" ? (e.spans || []) :
    [{ start: 0, end: typeof e.regionLength === "number" ? e.regionLength : Math.max(16, ...t.notes.map((n: any) => n.b + n.d)) }];
  if (!spans.length) return null;
  let c = state.cursor ? state.cursor.b : spans[0]!.start;
  const span = spans.find(s => c >= s.start - 1e-6 && c < s.end - 1e-6) || spans[0]!;
  // a cursor parked at (or past) the clip end, e.g. after playback: start from the clip start
  if (c < span.start - 1e-6 || c >= span.end - 1e-6) c = span.start;
  const barStart = (b: number) => span.start + Math.floor((b - span.start + 1e-6) / bpb) * bpb;
  let start = barStart(c), end: number;
  if (ui.target === "clip") { start = span.start; end = span.end; }
  else if (ui.target === "sel") {
    const a = state.selectionAnchor != null ? state.selectionAnchor : c;
    start = barStart(Math.min(a, c));
    end = barStart(Math.max(a, c)) + bpb;
  } else end = start + Number(ui.target) * bpb;
  end = Math.min(end, span.end);
  const bars = Math.max(1, Math.ceil((end - start - 1e-6) / bpb));
  return end - start > 1e-6 ? { start, end, bars } : null;
}

function instOf(): { name: string; stringCount: number; open: number[] } {
  return { name: "current", stringCount: getStringCount(), open: getOpenStrings().slice() };
}

function chordSource(key: KeyRef, start: number, bars: number): { src: ChordSource; key: KeyRef } | null {
  const bpb = beatsPerBar();
  if (ui.source === "custom" && ui.customChords.length) {
    const list: PlacedChordIn[] = [];
    for (let i = 0; i < bars; i++) { const c = ui.customChords[i % ui.customChords.length]!; list.push({ ...c, b: start + i * bpb, d: bpb }); }
    return { src: { kind: "list", chords: list }, key };
  }
  const tr = sourceTrack();
  if (tr) {
    const a = analysisOf(tr);
    if (!a || !a.chords.length) return null;
    const list = a.chords.map(c => ({ root: c.root, quality: c.quality, ...(c.bass !== undefined ? { bass: c.bass } : {}), b: c.b, d: c.d }));
    // a looping Session clip repeats its chords under the whole range
    const end = start + bars * bpb;
    return { src: { kind: "list", chords: loopOf(tr) ? loopChords(list, loopOf(tr), start, end) : list }, key };
  }
  const id = ui.source.startsWith("preset:") ? ui.source.slice(7) : "pop";
  const p = PROGRESSIONS.find(x => x.id === id) || PROGRESSIONS[0]!;
  // a major progression in a minor key (or the other way) is played in the relative key
  return { src: { kind: "preset", id: p.id }, key: p.mode === key.mode ? key : relative(key) };
}

function request(): { req: InsertRequest; range: { start: number; end: number; bars: number } } | null {
  const range = targetRange(); if (!range) return null;
  const { key } = currentKey();
  const part = ui.part;
  const cs = part === "drums" ? null : chordSource(key, range.start, range.bars);
  const req: InsertRequest = {
    part, inst: instOf(), key: cs ? cs.key : key, startBeat: range.start, bars: range.bars, beatsPerBar: beatsPerBar(),
    chords: cs ? cs.src : undefined, seed: ui.seed, ...ui.opts[part],
  };
  if (part === "bass" && req.bassStyle === "kick") {
    const dt = (state.tracks || [])[ui.kickTrack];
    const kicks = dt ? kickOnsets(dt.notes || [], { kickPitches: kickPitches(kitOf(dt), dt.drum && dt.drum.override, dt.drum && dt.drum.hints) }) : [];
    // a 1-bar drum loop plays its kicks in every bar: repeat them over the range
    req.kicks = dt && loopOf(dt) && kicks.length ? loopOnsets(kicks, loopOf(dt), range.start, range.end) : kicks;
  }
  return { req, range };
}

/** Pitches a drum track can play: its Drum Rack pads, else the pitches its clip uses. */
function kitOf(t: any): number[] {
  const pads = t && t.drum && Array.isArray(t.drum.pads) ? t.drum.pads : [];
  return pads.concat((t && t.notes || []).map((n: any) => n.p));
}

function preview() {
  const r = request(); if (!r) return null;
  try {
    const res = buildInsert(r.req);
    if (r.req.part === "drums" && isDrumTrack(state.curTrack)) {
      const t = state.curTrack;   // GM hits onto the pads the drum map says play those pieces
      res.notes = fitToKit(res.notes, kitPitchMap(kitOf(t), t.drum.override, t.drum.hints));
    }
    res.notes = res.notes.filter(n => n.b < r.range.end - 1e-6).map(n => ({ ...n, d: Math.min(n.d, Math.max(0.05, r.range.end - n.b)) }));
    return { ...r, res };
  } catch (e: any) { return { ...r, res: { notes: [], chords: [], warnings: [String(e.message || e)] } }; }
}

/* ── Insert / replace / vary / undo ──────────────────────────────────────── */
function doInsert(mode: "add" | "replace") {
  if (!editable()) { status("Open a clip to insert"); return; }
  if (state.uiCapo) { status("Set Capo to 0 first"); log("Insert: set Capo to 0 first (inserted chords and open strings would sit below the capo)"); return; }
  if (state.uiTranspose !== 0) { status("Set Trans to 0 first"); log("Insert: set Trans to 0 first (TAB positions are for the clip's pitches)"); return; }
  if (ui.part === "drums" ? !isDrumTrack(state.curTrack) : isDrumTrack(state.curTrack)) {
    status(ui.part === "drums" ? "Drums go into a drum track" : "Open a guitar or bass track"); return;
  }
  const p = preview(); if (!p) { status("Put the cursor in the clip first"); return; }
  const t = state.curTrack;
  const before = t.notes.map((n: any) => ({ ...n }));
  const deletedBefore = state.deletedOids.slice();
  const m = mergeInsert(t.notes as any[], p.res.notes, { start: p.range.start, end: p.range.end, mode });
  if (!m.add.length && !m.removed.length) { status("Nothing to insert"); return; }
  for (const n of m.removed) if ((n as any).oid !== undefined) state.deletedOids.push((n as any).oid);
  const tmpl = t.notes[0] || {};
  const added = m.add.map(n => ({ b: n.b, d: n.d, p: n.p, v: n.v, ...(n.s !== undefined ? { s: n.s, f: n.f, lock: true } : {}),
    src: tmpl.src || "ses", clip: tmpl.clip || "", ins: true }));
  t.notes = m.keep.concat(added as any[]);
  saveUndo(before, deletedBefore);
  if (ui.part === "chords") writeChordNames(p.res.chords, mode === "replace" ? p.range : null);
  ui.lastInsert = { histLen: state.editHistory.length, mode };
  rebuildScore(); renderInspector(t);
  (window.__editKeys as any)?.updateEditUi?.();
  const msg = (mode === "replace" ? "Replaced with " : "Inserted ") + added.length + " notes (" + PART_NOUN[ui.part] + ")";
  status(msg); log("Insert: " + msg + " (" + (p.range.bars) + " bars from beat " + p.range.start + ")" + (p.res.warnings.length ? " — " + p.res.warnings.join("; ") : ""));
  render();
}

/** Chord names above the staff for the inserted chords (only where the tab has none). Replace first drops
 *  the automatic names inside its range, so the names follow the new chords; names the user typed stay. */
function writeChordNames(chords: PlacedChordIn[], replaced: { start: number; end: number } | null) {
  const t = state.curTrack; if (!chords.length) return;
  const a = t.ann || (t.ann = {});
  const old = a.chords || [];
  const list = replaced ? old.filter((x: any) => !(x.auto && x.b >= replaced.start - 1e-6 && x.b < replaced.end - 1e-6)) : old.slice();
  let n = list.length !== old.length ? 1 : 0;
  for (const c of chords) {
    if (list.some((x: any) => Math.abs(x.b - c.b) < 1e-6)) continue;
    list.push({ b: c.b, name: chordName(c), auto: true }); n++;
  }
  if (!n) return;
  list.sort((x: any, y: any) => x.b - y.b);
  a.chords = list; t._annDirty = true;
  try { refreshAnnUi(); } catch {}
}

/** The seed changes the result: riffs, drums with ghost notes (energy 4-5) or a human feel. Chords and bass
 *  lines follow the chords exactly, so Vary would insert the same notes again. */
function varies(): boolean {
  const o = ui.opts[ui.part];
  if (ui.part === "riff") return true;
  if (ui.part === "drums") return (o.energy ?? 3) >= 4 || (o.humanizeAmount ?? 0) > 0;
  return false;
}

function lastIsInsert(): boolean { return !!ui.lastInsert && ui.lastInsert.histLen === state.editHistory.length; }
function undoInsert() {
  if (!lastIsInsert()) return;
  (window.__editKeys as any)?.undo?.();
  ui.lastInsert = null;
  status("Insert undone"); render();
}
function vary() {
  ui.seed = (ui.seed % 9999) + 1;
  if (lastIsInsert()) { const mode = ui.lastInsert!.mode; (window.__editKeys as any)?.undo?.(); ui.lastInsert = null; doInsert(mode); }
  else render();
}

/* ── Rendering ───────────────────────────────────────────────────────────── */
const TIER_CLASS: Record<ChordTier, string> = { safe: "t-safe", tension: "t-tension", color: "t-color" };
const TIER_HINT: Record<ChordTier, string> = { safe: "Stable: feels at home", tension: "Tension: wants to move on", color: "Colour: borrowed or surprising" };

function chordStrip(chords: PlacedChordIn[], key: KeyRef): string {
  const seen: string[] = [];
  const cards: string[] = [];
  for (const c of chords) {
    const name = chordName(c);
    if (seen.length < 8 && (seen.length === 0 || seen[seen.length - 1] !== name)) {
      seen.push(name);
      const r = romanOf(c, key);
      cards.push('<div class="ip-card" title="' + esc(TIER_HINT[r.tier]) + '"><span class="ip-dot ' + TIER_CLASS[r.tier] + '"></span><b>' + esc(name) + '</b><i>' + esc(r.roman) + "</i></div>");
    }
  }
  return cards.length ? '<div class="ip-strip">' + cards.join("") + "</div>" : '<div class="ip-empty">No chords in this range</div>';
}

function nextChips(chords: PlacedChordIn[], key: KeyRef): string {
  const last = chords.length ? chords[chords.length - 1] : undefined;
  const sug = suggestNext(last, key, { limit: 4 }).filter(s => s.reason !== "same");
  if (!sug.length) return "";
  return '<div class="ip-label">Next chord ideas</div><div class="ip-chips">' + sug.map((s, i) =>
    '<button class="ip-chip" data-next="' + i + '" title="' + esc(TIER_HINT[s.tier] + " — click to add it to your own progression") + '">' +
    '<span class="ip-dot ' + TIER_CLASS[s.tier] + '"></span>' + esc(s.name) + ' <i>' + esc(s.roman) + "</i></button>").join("") + "</div>";
}

function seg(name: string, value: string, items: [string, string][]): string {
  return '<div class="ip-seg" data-opt="' + name + '">' + items.map(([v, l]) =>
    '<button class="' + (v === value ? "on" : "") + '" data-v="' + esc(v) + '">' + esc(l) + "</button>").join("") + "</div>";
}
function select(name: string, value: string, items: [string, string][], groups?: { label: string; items: [string, string][] }[]): string {
  const opt = ([v, l]: [string, string]) => '<option value="' + esc(v) + '"' + (v === value ? " selected" : "") + ">" + esc(l) + "</option>";
  return '<select class="tsel ip-sel" data-sel="' + name + '">' + items.map(opt).join("") +
    (groups || []).map(g => '<optgroup label="' + esc(g.label) + '">' + g.items.map(opt).join("") + "</optgroup>").join("") + "</select>";
}

function sourceSelect(): string {
  const tracks = (state.tracks || []).map((t: any, i: number) => ({ t, i })).filter((x: any) => pitchedTrack(x.t));
  const groups = [
    { label: "Progressions (major)", items: PROGRESSIONS.filter(p => p.mode === "major").map(p => ["preset:" + p.id, p.name] as [string, string]) },
    { label: "Progressions (minor)", items: PROGRESSIONS.filter(p => p.mode === "minor").map(p => ["preset:" + p.id, p.name] as [string, string]) },
  ];
  const items: [string, string][] = tracks.map((x: any) => ["track:" + x.i, x.t === state.curTrack ? "From this clip" : "From track: " + x.t.name] as [string, string]);
  if (ui.customChords.length) items.unshift(["custom", "My progression: " + ui.customChords.map(chordName).join(" ")]);
  return select("source", ui.source, items, groups);
}

function optionsBlock(chords: PlacedChordIn[], key: KeyRef): string {
  const o = ui.opts[ui.part];
  const h: string[] = [];
  if (ui.part !== "drums") h.push(nextChips(chords, key));
  if (ui.part === "chords") {
    h.push('<div class="ip-label">Guitar voicing</div>' + seg("voicing", o.voicing || "open", [["open", "Open"], ["barre", "Barre"], ["power", "Power"], ["triad", "Triad"]]));
    h.push('<div class="ip-label">Strum</div>' + select("pattern", o.pattern || "pop", COMP_PATTERNS.map(p => [p.id, p.name] as [string, string])));
  } else if (ui.part === "bass") {
    const kick = o.bassStyle === "kick";
    h.push('<div class="ip-label">Rhythm</div>' + seg("bassMode", kick ? "kick" : "style", [["style", "Bass line"], ["kick", "Lock to kick"]]));
    if (kick) {
      const dts = drumTracks();
      h.push(dts.length ? select("kickTrack", String(ui.kickTrack), dts.map(x => [String(x.i), "Kick of " + x.t.name] as [string, string]))
        : '<div class="ip-empty">No drum track with notes in this set: one note per chord</div>');
      h.push('<div class="ip-label">Extra notes</div>' + seg("fill", o.fill || "none", [["none", "None"], ["fifth", "5th"], ["octave", "Octave"]]));
    } else {
      h.push('<div class="ip-label">Line</div>' + seg("bassStyle", o.bassStyle || "root", [["root", "Root"], ["rootEighths", "8ths"], ["rootFifth", "Root-5th"], ["octave", "Octave"], ["walking", "Walk"]]));
    }
  } else if (ui.part === "riff") {
    h.push('<div class="ip-label">Hand position</div>' + seg("position", String(o.position ?? 5), [["0", "Frets 0–4"], ["3", "3–7"], ["5", "5–9"], ["7", "7–11"], ["10", "10–14"]]));
    h.push('<div class="ip-label">Notes</div>' + seg("scale", o.scale || "pentatonic", [["pentatonic", "Pentatonic (safe)"], ["key", "Whole key"]]));
    h.push('<div class="ip-label">Shape</div>' + seg("contour", o.contour || "arch", [["up", "↗ Up"], ["down", "↘ Down"], ["arch", "⌒ Arch"], ["wave", "∿ Wave"]]));
    h.push('<div class="ip-label">Busy</div>' + seg("complexity", String(o.complexity ?? 3), [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]));
  } else {
    h.push('<div class="ip-label">Groove</div>' + select("groove", o.groove || "rock", DRUM_PATTERNS.filter(p => p.kind === "groove").map(p => [p.id, p.name] as [string, string])));
    h.push('<div class="ip-label">Energy</div>' + seg("energy", String(o.energy ?? 3), [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]));
    h.push('<div class="ip-label">Fill</div>' + seg("fillEvery", String(o.fillEvery ?? 0), [["0", "None"], ["2", "2 bars"], ["4", "4 bars"], ["8", "8 bars"]]));
    h.push('<div class="ip-label">Human feel</div>' + seg("humanizeAmount", String(o.humanizeAmount ?? 0), [["0", "Tight"], ["0.3", "Light"], ["0.6", "Loose"]]));
  }
  return h.join("");
}

/** Says so when a progression of the other mode is played in the relative key (same notes, other home chord). */
function relativeNote(key: KeyRef, used: KeyRef): string {
  if (used.root === key.root && used.mode === key.mode) return "";
  return '<div class="ip-note">' + esc((used.mode === "major" ? "Major" : "Minor") + " progression: played in " + keyLabel(used) +
    " (same notes as " + keyLabel(key) + "). Pick a " + key.mode + " one to stay in " + keyLabel(key) + ".") + "</div>";
}

function keySelect(cur: { key: KeyRef; from: string }): string {
  const items: [string, string][] = [["auto", "Key: " + keyLabel(cur.key) + (ui.keyChoice === "auto" ? " (" + cur.from + ")" : "")]];
  const groups = [
    { label: "Major", items: PC_NAMES.map((n, r) => [r + ":major", n + " major"] as [string, string]) },
    { label: "Minor", items: PC_NAMES.map((n, r) => [r + ":minor", n + " minor"] as [string, string]) },
  ];
  return select("key", ui.keyChoice, items, groups);
}

export function render() {
  const el = document.getElementById("insert-panel"); if (!el) return;
  el.classList.toggle("hidden", !ui.open);
  document.body.classList.toggle("insert-open", ui.open);
  document.getElementById("btn-insert")?.classList.toggle("on", ui.open);
  if (!ui.open) return;
  const drum = isDrumTrack(state.curTrack);
  if (drum && ui.part !== "drums") ui.part = "drums";
  if (!drum && ui.part === "drums") ui.part = "chords";
  if (ui.kickTrack < 0 || !(state.tracks || [])[ui.kickTrack]) { const d = drumTracks()[0]; ui.kickTrack = d ? d.i : -1; }
  const cur = currentKey();
  const p = preview();
  const chords = p ? p.res.chords : [];
  const warn = p && p.res.warnings.length ? '<div class="ip-warn">' + esc(p.res.warnings.join(" · ")) + "</div>" : "";
  const feels = FEELS[ui.part];
  const can = editable() && !!p;
  el.innerHTML =
    '<div class="ip-head"><span class="ip-title">Insert</span>' + (ui.part === "drums" ? '<span class="ip-sp"></span>' : keySelect(cur)) + '<button class="btn ip-x" data-act="close" title="Close the Insert panel">✕</button></div>' +
    '<div class="ip-parts">' + PARTS.map(x => {
      const off = drum ? x.id !== "drums" : x.id === "drums";
      return '<button class="' + (x.id === ui.part ? "on" : "") + '" data-part="' + x.id + '"' + (off ? ' disabled title="' + (drum ? "This is a drum track" : "Open a drum track for drums") + '"' : "") + ">" + x.label + "</button>";
    }).join("") + "</div>" +
    '<div class="ip-body">' +
    '<div class="ip-row"><span class="ip-label">Where</span>' + select("target", ui.target, [["1", "1 bar from cursor"], ["2", "2 bars from cursor"], ["4", "4 bars from cursor"], ["8", "8 bars from cursor"], ["sel", "Selected bars"], ["clip", "Whole clip"]]) + "</div>" +
    '<div class="ip-label">Feel</div><div class="ip-feels">' + feels.map(f =>
      '<button class="' + (!ui.custom[ui.part] && ui.feel[ui.part] === f.id ? "on" : "") + '" data-feel="' + f.id + '" title="' + esc(f.hint) + '">' + esc(f.label) + "</button>").join("") +
    "</div>" + '<div class="ip-note">' + esc(feelSummary(p ? p.range.bars : 0)) + "</div>" +
    (ui.part !== "drums" ? '<div class="ip-label">Chords</div>' + sourceSelect() + chordStrip(chords, p ? p.req.key : cur.key) + relativeNote(cur.key, p ? p.req.key : cur.key) : "") +
    '<details class="ip-more"' + (ui.moreOpen ? " open" : "") + '><summary>More: ' + (ui.part === "drums" ? "groove, energy, fills" : "next chords, " + (ui.part === "chords" ? "voicing, strum" : ui.part === "bass" ? "rhythm, line" : "position, shape")) + "</summary>" +
    optionsBlock(chords, p ? p.req.key : cur.key) + "</details>" +
    warn + "</div>" +
    '<div class="ip-foot"><div class="ip-util">' +
    (varies() ? '<button class="btn" data-act="vary" title="New variation (replaces the last insert)">⚄ Vary</button>'
      : '<button class="btn" data-act="vary" disabled title="This feel plays the same every time: pick another feel or change More">⚄ Vary</button>') +
    '<button class="btn" data-act="undo"' + (lastIsInsert() ? "" : " disabled") + ' title="Take back the last insert">↩ Undo</button>' +
    '<span class="ip-count">' + (p ? p.res.notes.length + " notes · " + p.range.bars + (p.range.bars === 1 ? " bar" : " bars") : editable() ? "Put the cursor in the clip" : "Open a clip to insert") + "</span></div>" +
    '<div class="ip-main"><button class="btn" data-act="replace"' + (can ? "" : " disabled") + ' title="Remove the notes in these bars, then insert">Replace</button>' +
    '<button class="btn ip-go" data-act="insert"' + (can ? "" : " disabled") + ">+ Insert " + PART_NOUN[ui.part] + "</button></div></div>";
}

/** One line under the feels: what the current settings play (design D020). */
function feelSummary(bars: number): string {
  const o = ui.opts[ui.part];
  const name = (list: readonly { id: string; name: string }[], id?: string) => (list.find(x => x.id === id) || { name: id || "" }).name;
  const parts: string[] = [];
  if (ui.custom[ui.part]) parts.push("Custom");
  if (ui.part === "chords") parts.push((o.voicing || "open").replace(/^./, c => c.toUpperCase()) + " chords", name(COMP_PATTERNS, o.pattern || "pop"));
  else if (ui.part === "bass") parts.push(o.bassStyle === "kick" ? "Follows the kick" + (o.fill && o.fill !== "none" ? " + " + o.fill : "") :
    ({ root: "Root notes", rootEighths: "Root 8ths", rootFifth: "Root and 5th", octave: "Octaves", walking: "Walking line" } as any)[o.bassStyle || "root"]);
  else if (ui.part === "riff") parts.push("Frets " + (o.position ?? 5) + "–" + ((o.position ?? 5) + 4), o.scale === "key" ? "whole key" : "pentatonic", "busy " + (o.complexity ?? 3));
  else parts.push(name(DRUM_PATTERNS, o.groove || "rock"), "energy " + (o.energy ?? 3), o.fillEvery ? "fill every " + o.fillEvery : "no fills");
  if (bars) parts.push(bars + (bars === 1 ? " bar" : " bars"));
  return parts.join(" · ");
}

function setOpt(name: string, v: string) {
  const o = ui.opts[ui.part] as any;
  const num = ["position", "complexity", "energy", "fillEvery", "humanizeAmount"];
  if (name === "bassMode") o.bassStyle = v === "kick" ? "kick" : (o.bassStyle === "kick" ? "root" : o.bassStyle || "root");
  else o[name] = num.includes(name) ? Number(v) : v;
  ui.custom[ui.part] = true;
}

function onClick(e: Event) {
  const b = (e.target as Element).closest("button") as HTMLButtonElement | null; if (!b || b.disabled) return;
  if (b.dataset.part) { ui.part = b.dataset.part as InsertPart; defaultSource(); render(); return; }
  if (b.dataset.feel) {
    const f = feelOf(ui.part, b.dataset.feel); if (!f) return;
    ui.feel[ui.part] = f.id; ui.opts[ui.part] = { ...f.opts }; ui.custom[ui.part] = false; render(); return;
  }
  if (b.dataset.next !== undefined) { addNext(Number(b.dataset.next)); return; }
  const segEl = b.closest(".ip-seg") as HTMLElement | null;
  if (segEl && b.dataset.v !== undefined) { setOpt(segEl.dataset.opt!, b.dataset.v); render(); return; }
  switch (b.dataset.act) {
    case "close": toggleInsertPanel(false); break;
    case "insert": doInsert("add"); break;
    case "replace": doInsert("replace"); break;
    case "vary": vary(); break;
    case "undo": undoInsert(); break;
  }
}

/** A "next chord" chip: the shown chords plus that one become the user's own progression. */
function addNext(i: number) {
  const p = preview(); if (!p) return;
  const key = p.req.key;
  const chords = p.res.chords;
  const sug = suggestNext(chords[chords.length - 1], key, { limit: 4 }).filter(s => s.reason !== "same")[i]; if (!sug) return;
  if (ui.source !== "custom") {
    const names: ChordSym[] = [];
    for (const c of chords) { const last = names[names.length - 1]; if (!last || chordName(last) !== chordName(c)) names.push({ root: c.root, quality: c.quality, ...(c.bass !== undefined ? { bass: c.bass } : {}) }); }
    ui.customChords = names.slice(0, 7);
  }
  if (ui.customChords.length >= 8) ui.customChords.shift();
  ui.customChords.push(sug.chord);
  ui.source = "custom";
  if (ui.keyChoice === "auto") ui.keyChoice = key.root + ":" + key.mode;   // keep the key the chords were picked in
  render();
}

function onChange(e: Event) {
  const s = e.target as HTMLSelectElement; const name = s.dataset && s.dataset.sel; if (!name) return;
  if (name === "source") { ui.source = s.value; ui.sourceSet = true; }
  else if (name === "key") ui.keyChoice = s.value;
  else if (name === "target") ui.target = s.value as Target;
  else if (name === "kickTrack") ui.kickTrack = Number(s.value);
  else setOpt(name, s.value);
  render();
}

/** Until the user picks a chord source: bass and riffs follow another track's chords, chords start from a progression. */
/** Bass/Riff follow another track's chords when one plays chords (not a single line); otherwise, and for
 *  Chords, a progression in the clip's mode (a minor clip gets a minor progression). */
function defaultSource() {
  if (ui.sourceSet || ui.source === "custom") return;
  const other = (state.tracks || []).findIndex((t: any) => t !== state.curTrack && chordalTrack(t));
  if (ui.part !== "chords" && other >= 0) { ui.source = "track:" + other; return; }
  ui.source = "preset:pop";   // so currentKey() reads this clip, not the previously chosen track
  ui.source = currentKey().key.mode === "minor" ? "preset:epic" : "preset:pop";
}

export function toggleInsertPanel(force?: boolean) {
  ui.open = force === undefined ? !ui.open : force;
  if (ui.open) defaultSource();
  render();
  // the score column changed width: let alphaTab lay it out again
  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
}

/** Called after a tab switch or an edit elsewhere: refresh the counts and chords. */
export function refreshInsertPanel() { if (ui.open) { defaultSource(); render(); } }

export function bindInsertPanel() {
  const el = document.getElementById("insert-panel"); if (!el) return;
  el.addEventListener("click", onClick);
  el.addEventListener("change", onChange);
  // the cursor moves on the score while the panel is open: refresh range and count when the mouse comes back
  el.addEventListener("pointerenter", () => { if (ui.open && !el.contains(document.activeElement)) render(); });
  el.addEventListener("toggle", e => { if ((e.target as Element).classList?.contains("ip-more")) ui.moreOpen = (e.target as HTMLDetailsElement).open; }, true);
  document.getElementById("btn-insert")?.addEventListener("click", () => toggleInsertPanel());
}
