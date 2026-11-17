import { state } from "./state";
import { log } from "./log";
import { NOTE_NAMES, SCALES, pitchToName } from "./musicUi";

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
           +  ' onclick="fretClick(' + s + "," + f + ')"><div class="nd">' + f + "</div></div>";
    }
    html += "</div>";
  }
  grid!.innerHTML = html;
}

export function clearFretboard() {
  var lit = document.querySelectorAll(".fc.lit");
  for (var i = 0; i < lit.length; i++) lit[i].classList.remove("lit");
  document.getElementById("fb-note-label")!.textContent = "";
}

export function lightFret(s: any, f: any, label?: any) {
  var cell = document.getElementById("fc-" + s + "-" + f);
  if (cell) {
    cell.classList.add("lit");
    if (label) document.getElementById("fb-note-label")!.textContent = label;
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
    if (ivs) {
      var iv = ((pc - state.uiScaleRoot) + 12) % 12;
      if (ivs.indexOf(iv) !== -1) {
        c.classList.add("scale");
        if (iv === 0) c.classList.add("scale-root");
      }
      if (nd) nd.textContent = (iv === 0) ? NOTE_NAMES[pc] : "";   // 스케일 모드: 루트만 음이름
    } else {
      if (nd) nd.textContent = String(f);        // 기본 모드: fret 번호
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

export function fretClick(s, f) {
  if (!state.curTrack || !state.curTrack.edit || !state.selectedNoteIndices.length) { log("Fret: String " + s + " / Fret " + f); return; }
  var n = state.curTrack.notes[state.selectedNoteIndices[0]], open = getOpenStrings()[s];
  if (!n || typeof open !== "number") return;
  var keys = window.__editKeys; if (keys) keys.setSelectedStringFret(s, f);
}
