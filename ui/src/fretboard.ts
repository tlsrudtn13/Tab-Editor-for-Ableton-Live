import { state } from "./state";
import { log } from "./log";
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
           +  ' onclick="fretClick(' + s + "," + f + ',event)"><div class="nd">' + f + "</div></div>";
    }
    html += "</div>";
  }
  grid!.innerHTML = html;
  applyFretboardHeight();   // string count may change: refit to the saved panel height
}

export function clearFretboard() {
  var cells = document.querySelectorAll(".fc.lit, .fc.beat");
  for (var i = 0; i < cells.length; i++) {
    cells[i].classList.remove("lit");
    cells[i].classList.remove("beat");
    var nd = cells[i].querySelector(".nd");
    if (nd) nd.textContent = String(cells[i].getAttribute("data-f") || "");
  }
  var lbl = document.getElementById("fb-note-label");
  if (lbl) lbl.textContent = "";
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
    var active = c.classList.contains("lit") || c.classList.contains("beat");
    if (ivs) {
      var iv = ((pc - state.uiScaleRoot) + 12) % 12;
      if (ivs.indexOf(iv) !== -1) {
        c.classList.add("scale");
        if (iv === 0) c.classList.add("scale-root");
      }
      if (nd && !active) nd.textContent = (iv === 0) ? NOTE_NAMES[pc] : "";   // 스케일 모드: 루트만 음이름
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
    // move cursor to clicked string at same slot
    const c = state.cursor;
    if (c && keys.setCursor) keys.setCursor(c.b, s);
    if (ev && ev.shiftKey) {
      if (!keys.insertNote(s, f, true)) log("String " + s + " is already used at this beat");
      return;
    }
    // if note exists at cursor slot on this string, change it; else insert
    const notes = state.curTrack.notes || [];
    const b = c ? c.b : 0;
    const has = notes.some((n: any) => n.s === s && Math.abs((n.b || 0) - b) < 1e-6);
    if (has) { keys.setSelectedStringFret(s, f); }
    else { keys.insertNote(s, f, false); }
    return;
  }
  log("Fret: String " + s + " / Fret " + f);
}
