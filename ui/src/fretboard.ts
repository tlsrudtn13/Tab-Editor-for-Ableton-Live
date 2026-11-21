import { state } from "./state";
import { log, status } from "./log";
import { noteAtCursor } from "./cursor";
import { NOTE_NAMES, SCALES, pitchToName } from "./musicUi";
import { applyFretboardHeight } from "./panelSize";

/* ── 악기 정보 ────────────────────────────────────────────────────────────── */
export var DEFAULT_OPEN = [0, 64, 59, 55, 50, 45, 40];

export function getStringCount() {
  if (state.curTrack && state.curTrack.instrument &&
      typeof state.curTrack.instrument.stringCount === "number")
    return state.curTrack.instrument.stringCount;
  return 6;
}
export function getOpenStrings() {
  if (state.curTrack && state.curTrack.instrument &&
      Array.isArray(state.curTrack.instrument.open))
    return state.curTrack.instrument.open;
  return DEFAULT_OPEN;
}

/* ── Fretboard HUD ────────────────────────────────────────────────────────── */
export var MARKER_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];

// ★ v5: 악기(줄 수/개방현)에 맞춰 동적 생성 — 4현 베이스 ~ 8현 기타 대응
export function buildFretboard() {
  var nS   = getStringCount();
  var OPEN = getOpenStrings();
  var grid = document.getElementById("fretboard-grid");
  var html = "";
  var midLane = Math.ceil(nS / 2);
  for (var s = 1; s <= nS; s++) {
    var openMidi = OPEN[s] || 40;
    var label = NOTE_NAMES[openMidi % 12];   // 개방현 음이름 라벨
    html += '<div class="string-lane" data-s="' + s + '">';
    html += '<div class="str-label" title="String ' + s + ' = ' + pitchToName(openMidi) + '">' + label + "</div>";
    for (var f = 0; f <= 24; f++) {
      var dotClass = "";
      if (f === 12) {
        if (s === Math.max(1, midLane - 1) || s === Math.min(nS, midLane + 1)) dotClass = " dot";
      } else if (MARKER_FRETS.indexOf(f) !== -1 && s === midLane) {
        dotClass = " dot";
      }
      html += '<div class="fc' + dotClass + '" id="fc-' + s + "-" + f + '"'
           +  ' data-s="' + s + '" data-f="' + f + '"'
           +  ' onclick="fretClick(' + s + "," + f + ',event)"><div class="nd" data-n="'
           +  NOTE_NAMES[(openMidi + f) % 12] + '">' + f + "</div></div>";
    }
    html += "</div>";
  }
  grid!.innerHTML = html;
  bindFretHover(grid!);
  applyFretboardHeight();   // string count may change: refit to the saved panel height
}

/** Hover shows the note under the mouse without clicking (Guitar Pro): the name in the cell (CSS, data-n)
 *  and string / fret / note with octave in the fretboard header. */
export function fretHoverText(s: number, f: number, open: number, capo: number) {
  var tabFret = f - (capo || 0);
  return "String " + s + " · Fret " + (tabFret >= 0 ? tabFret : f + " (below capo)") + " · " + pitchToName(open + f);
}
function bindFretHover(grid: HTMLElement) {
  if ((grid as any).__hoverBound) return;
  (grid as any).__hoverBound = true;
  grid.addEventListener("mouseover", function(ev) {
    var cell = (ev.target as HTMLElement).closest(".fc") as HTMLElement | null;
    var lbl = document.getElementById("fb-hover-label");
    if (!lbl) return;
    if (!cell) { lbl.textContent = ""; return; }
    var s = parseInt(cell.getAttribute("data-s") || "0", 10), f = parseInt(cell.getAttribute("data-f") || "0", 10);
    lbl.textContent = fretHoverText(s, f, getOpenStrings()[s] || 40, state.uiCapo || 0);
  });
  grid.addEventListener("mouseleave", function() {
    var lbl = document.getElementById("fb-hover-label");
    if (lbl) lbl.textContent = "";
  });
}

/* ── "Bar" toggle: also show the other notes of the current bar, dimmed (kept per computer) ── */
var BAR_KEY = "tabEditor.fretboardBar";
var showBar = (function() { try { return localStorage.getItem(BAR_KEY) === "1"; } catch { return false; } })();

/** Start and length (in beats) of the bar that holds beat b; bars count from the clip start. */
export function barRange(b: number, beatsPerBar: number) {
  var len = beatsPerBar > 0 ? beatsPerBar : 4;
  var start = Math.floor((b + 1e-6) / len) * len;
  return { start: start, end: start + len };
}
function beatsPerBar() {
  var ts = state.uiTimeSig || (state.curTrack && state.curTrack.timeSig) || { beats: 4, type: 4 };
  return ts.beats * 4 / ts.type;
}
/** Dim the notes of the bar around beat b (cells already lit as selection/beat stay as they are). */
export function lightBar(b: number | null | undefined) {
  if (!showBar || typeof b !== "number" || !state.curTrack || !Array.isArray(state.curTrack.notes)) return;
  var r = barRange(b, beatsPerBar());
  state.curTrack.notes.forEach(function(n: any) {
    var nb = n.b || 0;
    if (nb < r.start - 1e-6 || nb >= r.end - 1e-6) return;
    var cell = document.getElementById("fc-" + n.s + "-" + n.f);
    if (!cell || cell.classList.contains("lit") || cell.classList.contains("beat")) return;
    cell.classList.add("bar");
    var nd = cell.querySelector(".nd");
    if (nd) nd.textContent = NOTE_NAMES[((n.p % 12) + 12) % 12];
  });
}
export function bindBarToggle(refresh: () => void) {
  var cb = document.getElementById("ui-fb-bar") as HTMLInputElement | null;
  if (!cb) return;
  cb.checked = showBar;
  cb.addEventListener("change", function() {
    showBar = cb!.checked;
    try { localStorage.setItem(BAR_KEY, showBar ? "1" : "0"); } catch { /* storage off */ }
    refresh();
  });
}

export function clearFretboard() {
  var cells = document.querySelectorAll(".fc.lit, .fc.beat, .fc.bar");
  for (var i = 0; i < cells.length; i++) {
    cells[i].classList.remove("lit");
    cells[i].classList.remove("beat");
    cells[i].classList.remove("bar");
    var nd = cells[i].querySelector(".nd");
    if (nd) nd.textContent = String(cells[i].getAttribute("data-f") || "");
  }
  var lbl = document.getElementById("fb-note-label");
  if (lbl) lbl.textContent = "";
  updateScaleOverlay();   // freed cells get their scale names (or fret numbers) back
}

export function lightFret(s: any, f: any, label?: any, opts?: { beat?: boolean; p?: number }) {
  var cell = document.getElementById("fc-" + s + "-" + f);
  if (cell) {
    var beat = !!(opts && opts.beat);
    cell.classList.toggle("lit", !beat);
    cell.classList.toggle("beat", beat);
    var nd = cell.querySelector(".nd");
    if (nd) {
      var p = opts && typeof opts.p === "number" ? opts.p : ((getOpenStrings()[s] || 40) + f);
      nd.textContent = NOTE_NAMES[((p % 12) + 12) % 12];
    }
    if (label) {
      var lbl = document.getElementById("fb-note-label");
      if (lbl) lbl.textContent = label;
    }
  }
}

export function updateScaleOverlay() {
  var ivs  = SCALES[state.uiScaleKey] || null;
  var OPEN = getOpenStrings();
  var cells = document.querySelectorAll("#fretboard-grid .fc");
  for (var i = 0; i < cells.length; i++) {
    var c  = cells[i];
    var s  = parseInt(c.getAttribute("data-s") || "0", 10);
    var f  = parseInt(c.getAttribute("data-f") || "0", 10);
    var nd = c.querySelector(".nd");
    c.classList.remove("scale", "scale-root");
    var pitch = (OPEN[s] || 40) + f;
    var pc    = ((pitch % 12) + 12) % 12;
    var active = c.classList.contains("lit") || c.classList.contains("beat") || c.classList.contains("bar");
    if (ivs) {
      var iv = ((pc - state.uiScaleRoot) + 12) % 12;
      if (ivs.indexOf(iv) !== -1) {
        c.classList.add("scale");
        if (iv === 0) c.classList.add("scale-root");
      }
      if (nd && !active) nd.textContent = (ivs.indexOf(iv) !== -1) ? NOTE_NAMES[pc] : "";   // scale tones show their names
    } else {
      if (nd && !active) nd.textContent = String(f);        // 기본 모드: fret 번호
    }
  }
}

export function bindScaleControls() {
  var r = document.getElementById("ui-scale-root");
  var k = document.getElementById("ui-scale");
  if (r) r.addEventListener("change", function() {
    state.uiScaleRoot = parseInt((r as HTMLSelectElement).value, 10) || 0;
    updateScaleOverlay();
  });
  if (k) k.addEventListener("change", function() {
    state.uiScaleKey = (k as HTMLSelectElement).value;
    updateScaleOverlay();
  });
}

export function fretClick(s, f, ev?: MouseEvent) {
  var keys = window.__editKeys as any;
  if (state.curTrack && state.curTrack.edit && keys) {
    const c = state.cursor;
    if (!c) { status("Click the score first to place the cursor"); return; }
    keys.setCursor(c.b, s);   // cursor to the clicked string at the same beat
    // Guitar Pro: click an empty fret = add (a chord when other strings sound), click the note that is
    // there = remove, click another fret on a string that already sounds at this beat = move it there.
    // Same lookup as the keyboard (noteAtCursor), so the lit note is the one that gets removed.
    const hit = noteAtCursor();
    if (hit && hit.note.f === f) { keys.deleteNoteIndex(hit.index); return; }
    if (state.uiTranspose !== 0) { status("Set Trans to 0 to enter notes on the fretboard"); return; }
    if (f < (state.uiCapo || 0)) { status("Fret " + f + " is below the capo"); return; }
    if (hit) keys.setSelectedStringFret(s, f);
    else keys.insertNote(s, f, false);
    return;
  }
  log("Fret: String " + s + " / Fret " + f);
}
