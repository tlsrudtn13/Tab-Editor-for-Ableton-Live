// @ts-nocheck
// ============================================================
// ui/src/main.ts — TAB Editor WebView 메인 (v3)
//
// v2 유지: 1-staff XML, staff 토글 뷰전환, jsPDF 다운로드,
//          tie 엔진, auto-legato, 화음+코드분석, transpose/capo
//
// v3 신규:
//   ① Quantize 드롭다운 (기본 1/16 — 레퍼런스 SHEET 와 동일)
//   ② 오선/마디선을 어둡게 — display.resources 로 음표와 시각적 분리
//      (style.css 의 SVG 색 강제 블록은 제거됨)
//   ③ Inspector/Log 패널 토글 (기본 숨김)
//   ④ Fretboard Scale 오버레이 (Root + Scale 드롭다운, 흰색 표시)
//   ⑤ TAB 줄옮김 — 노트 클릭 선택 → ▲/▼ 버튼 (피치 유지, fret 재계산)
// ============================================================

import * as alphaTab from "@coderline/alphatab";
import { jsPDF } from "jspdf";
import bravuraFontUrl from "@alphatab-font/Bravura.otf?inline";
import { toMusicXml } from "../../src/notation/toMusicXml.js";
import { applyGuitarVoicing } from "../../src/notation/voicing.js";
import {
  GUITAR_6, GUITAR_7, GUITAR_8, GUITAR_12,
  BASS_4, BASS_5, BASS_6
} from "../../src/notation/instruments.js";
import "./style.css";

// ── Bravura 폰트 등록 ────────────────────────────────────────────────────────
(function injectFont() {
  var style = document.createElement("style");
  style.textContent =
    "@font-face { font-family:'alphaTab';" +
    " src: url('" + bravuraFontUrl + "') format('opentype');" +
    " font-weight:normal; font-style:normal; }";
  document.head.appendChild(style);
})();

/* ── Log / Status ─────────────────────────────────────────────────────────── */
var logEl = document.getElementById("log");
function log(m) { logEl.textContent += m + "\n"; logEl.scrollTop = logEl.scrollHeight; }
function status(m) { document.getElementById("status").textContent = m; }

/* ── Theme color ──────────────────────────────────────────────────────────── */
function resolveColor(cssVar, fallback) {
  try {
    var el = document.createElement("div");
    el.style.cssText = "position:absolute;opacity:0;color:var(" + cssVar + ")";
    document.body.appendChild(el);
    var c = window.getComputedStyle(el).color;
    document.body.removeChild(el);
    return (c && c !== "rgba(0, 0, 0, 0)") ? c : fallback;
  } catch(e) { return fallback; }
}
var txtColor = resolveColor("--p-live-text-primary", "rgb(181,181,181)");
document.documentElement.style.setProperty("--at-fg", txtColor);

// ★ 테마: OS 기본값으로 시작, 툴바 버튼으로 수동 토글
var isLight = !!(window.matchMedia &&
                 window.matchMedia("(prefers-color-scheme: light)").matches);
document.documentElement.classList.toggle("light", isLight);

// ★ 아이콘 초기화 (DOM 준비 후 — module script는 defer라 바로 가능)
function syncThemeBtn() {
  var b = document.getElementById("btn-theme");
  if (b) b.textContent = isLight ? "\uD83C\uDF19" : "\u2600";  // 🌙 / ☀
}
setTimeout(syncThemeBtn, 0);

function getAtRes() {
  return isLight ? {
    mainGlyphColor: "#1a1a1a",  secondaryGlyphColor: "#505050",
    staffLineColor: "#b8b8b8",  barSeparatorColor:   "#a8a8a8",
    barNumberColor: "#8a8a8a",  scoreInfoColor:      "#606060"
  } : {
    mainGlyphColor: "#d4d4d4",   secondaryGlyphColor: "#9a9a9a",
    staffLineColor: "#4a4a4a",  barSeparatorColor:   "#5a5a5a",
    barNumberColor: "#6f6f6f",  scoreInfoColor:      "#8a8a8a"
  };
}


window.toggleTheme = function() {
  try {
    console.log("toggleTheme called");

    isLight = !isLight;
    document.documentElement.classList.toggle("light", isLight);

    var b = document.getElementById("btn-theme");
    if (b) syncThemeBtn(); // 🌙 / ☀

    if (api) {
      try { api.destroy(); } catch(e) { console.error("api.destroy error", e); }
      api = null;
      var el = document.getElementById("alphaTab");
      if (el) el.innerHTML = "";
    }

    if (curTrack) rebuildScore();
  } catch (e) {
    console.error("toggleTheme error:", e);
  }
};

/* ── 주입된 트랙 데이터 ───────────────────────────────────────────────────── */
var tracks = (typeof window.tracks !== "undefined" && Array.isArray(window.tracks))
  ? window.tracks : null;

log("Theme: " + txtColor);
log("Tracks: " + (tracks ? tracks.length : "NONE"));

/* ── Musical helpers ──────────────────────────────────────────────────────── */
var NOTE_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

// Ableton 옥타브 컨벤션: MIDI 60 = C3
function pitchToName(p) { return NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 2); }

function durToLabel(b) {
  var t = 0.02;
  if (Math.abs(b - 4)     < t) return "Whole";
  if (Math.abs(b - 3)     < t) return "Dotted Half";
  if (Math.abs(b - 2)     < t) return "Half";
  if (Math.abs(b - 1.5)   < t) return "Dotted Qtr";
  if (Math.abs(b - 1)     < t) return "Quarter";
  if (Math.abs(b - 0.75)  < t) return "Dotted 8th";
  if (Math.abs(b - 0.5)   < t) return "8th";
  if (Math.abs(b - 0.375) < t) return "Dotted 16th";
  if (Math.abs(b - 0.25)  < t) return "16th";
  if (Math.abs(b - 0.125) < t) return "32nd";
  return b.toFixed(3) + " b";
}

function beatToBarBeat(b) {
  var bar  = Math.floor(b / 4) + 1;
  var beat = (b % 4) + 1;
  return "B" + bar + ":" + beat.toFixed(1);
}

function velToDynamic(v) {
  if (v <=  15) return v + " ppp";
  if (v <=  31) return v + " pp";
  if (v <=  47) return v + " p";
  if (v <=  63) return v + " mp";
  if (v <=  79) return v + " mf";
  if (v <=  95) return v + " f";
  if (v <= 111) return v + " ff";
  return v + " fff";
}

/* ── 코드(화음) 분석기 ────────────────────────────────────────────────────── */
var CHORD_PATTERNS = [
  ["maj9",    [0,2,4,7,11]],
  ["9",       [0,2,4,7,10]],
  ["m9",      [0,2,3,7,10]],
  ["maj7",    [0,4,7,11]],
  ["7",       [0,4,7,10]],
  ["m7",      [0,3,7,10]],
  ["m7b5",    [0,3,6,10]],
  ["dim7",    [0,3,6,9]],
  ["6",       [0,4,7,9]],
  ["m6",      [0,3,7,9]],
  ["add9",    [0,2,4,7]],
  ["m(add9)", [0,2,3,7]],
  ["",        [0,4,7]],
  ["m",       [0,3,7]],
  ["dim",     [0,3,6]],
  ["aug",     [0,4,8]],
  ["sus2",    [0,2,7]],
  ["sus4",    [0,5,7]],
  ["5",       [0,7]],
];

function detectChord(pitches) {
  if (!pitches || pitches.length < 2) return "";
  var pcs = [];
  for (var i = 0; i < pitches.length; i++) {
    var pc = ((pitches[i] % 12) + 12) % 12;
    if (pcs.indexOf(pc) === -1) pcs.push(pc);
  }
  if (pcs.length < 2) return "";
  var bassPc = ((Math.min.apply(null, pitches) % 12) + 12) % 12;
  var roots = [bassPc].concat(pcs.filter(function(p) { return p !== bassPc; }));
  for (var r = 0; r < roots.length; r++) {
    var root = roots[r];
    var iv = pcs.map(function(p) { return ((p - root) + 12) % 12; })
                .sort(function(a, b) { return a - b; });
    for (var c = 0; c < CHORD_PATTERNS.length; c++) {
      var pat = CHORD_PATTERNS[c][1];
      if (iv.length === pat.length &&
          iv.every(function(v, k) { return v === pat[k]; })) {
        var name = NOTE_NAMES[root] + CHORD_PATTERNS[c][0];
        if (root !== bassPc) name += "/" + NOTE_NAMES[bassPc];
        return name;
      }
    }
  }
  if (pcs.length === 2) {
    var iv2 = ((pcs[1] - pcs[0]) + 12) % 12;
    var IVN = {1:"m2",2:"M2",3:"m3",4:"M3",5:"P4",6:"TT",7:"P5",8:"m6",9:"M6",10:"m7",11:"M7"};
    return NOTE_NAMES[bassPc] + " +" + (IVN[iv2] || iv2);
  }
  return "";
}

/* ── 악기 정보 ────────────────────────────────────────────────────────────── */
var DEFAULT_OPEN = [0, 64, 59, 55, 50, 45, 40];

function getStringCount() {
  if (curTrack && curTrack.instrument &&
      typeof curTrack.instrument.stringCount === "number")
    return curTrack.instrument.stringCount;
  return 6;
}
function getOpenStrings() {
  if (curTrack && curTrack.instrument &&
      Array.isArray(curTrack.instrument.open))
    return curTrack.instrument.open;
  return DEFAULT_OPEN;
}

/* ── Fretboard HUD ────────────────────────────────────────────────────────── */
var MARKER_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

// ★ v5: 악기(줄 수/개방현)에 맞춰 동적 생성 — 4현 베이스 ~ 8현 기타 대응
function buildFretboard() {
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
      if (f === 12 || f === 24) {
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
  grid.innerHTML = html;
}
buildFretboard();

function clearFretboard() {
  var lit = document.querySelectorAll(".fc.lit");
  for (var i = 0; i < lit.length; i++) lit[i].classList.remove("lit");
  document.getElementById("fb-note-label").textContent = "";
}

function lightFret(s, f, label) {
  var cell = document.getElementById("fc-" + s + "-" + f);
  if (cell) {
    cell.classList.add("lit");
    if (label) document.getElementById("fb-note-label").textContent = label;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 악보 위 선택 노트 강조 오버레이
   boundsLookup(includeNoteBounds:true)으로 노트 머리 좌표를 얻어
   #alphaTab 위에 주황 박스를 그립니다. 화음 전체/단일 노트를 시각 구분.
   ═══════════════════════════════════════════════════════════════════════════ */
function clearNoteOverlays() {
  document.querySelectorAll(".note-sel-overlay").forEach(function(el) { el.remove(); });
}

function drawNoteOverlay(b, isSingle) {
  if (!b) return;
  var host = document.getElementById("alphaTab");
  if (!host) return;
  var d = document.createElement("div");
  d.className = "note-sel-overlay" + (isSingle ? " single" : "");
  var pad = 3;
  d.style.left   = (b.x - pad) + "px";
  d.style.top    = (b.y - pad) + "px";
  d.style.width  = (b.w + pad * 2) + "px";
  d.style.height = (b.h + pad * 2) + "px";
  host.appendChild(d);
}

// ── ★ FIX: beat 의 NoteBounds 를 모든 staff(오선+TAB)에서 수집 ──
// findBeat() 는 한 staff 만 반환 → staffSystems 전체 순회로 양쪽 박스 표시
function collectNoteBounds(beat) {
  var out = [];
  try {
    var bl = (api && api.renderer) ? api.renderer.boundsLookup : null;
    if (!bl || !beat || !bl.staffSystems) return out;
    for (var si = 0; si < bl.staffSystems.length; si++) {
      var sys = bl.staffSystems[si];
      var mbs = sys.bars || sys.masterBarBounds || [];
      for (var mi = 0; mi < mbs.length; mi++) {
        var bars = mbs[mi].bars || [];
        for (var bi = 0; bi < bars.length; bi++) {
          var beats = bars[bi].beats || [];
          for (var ti = 0; ti < beats.length; ti++) {
            if (beats[ti].beat !== beat) continue;
            var nbs = beats[ti].notes || [];
            for (var ni = 0; ni < nbs.length; ni++) out.push(nbs[ni]);
          }
        }
      }
    }
  } catch(e) {}
  return out;
}

function overlayBeatNotes(beat) {
  var nbs = collectNoteBounds(beat);
  for (var i = 0; i < nbs.length; i++) drawNoteOverlay(nbs[i].noteHeadBounds, false);
}

function overlayOneNote(alphaTabNote) {
  if (!alphaTabNote) return;
  var nbs = collectNoteBounds(alphaTabNote.beat);
  for (var i = 0; i < nbs.length; i++) {
    if (nbs[i].note === alphaTabNote) drawNoteOverlay(nbs[i].noteHeadBounds, true);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 트랙 노트 매칭 — f/s 우선, 실패 시 피치 매칭(quantize 병합으로
   resolveStringCollisions 가 줄을 재배치한 노트 대응), bp 로 가장 가까운 노트 선택
   ═══════════════════════════════════════════════════════════════════════════ */
function matchTrackNote(realF, ourStr, pitch, bp, excludeSet) {
  var notes = (curTrack && Array.isArray(curTrack.notes)) ? curTrack.notes : [];
  function best(pred) {
    var bi = -1, bd = Infinity;
    for (var i = 0; i < notes.length; i++) {
      if (excludeSet && excludeSet[i]) continue;
      var n = notes[i];
      if (!pred(n)) continue;
      var d = (bp === null || bp === undefined)
        ? i * 1e-9
        : Math.abs((n.b || 0) - bp);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }
  // 1순위: fret + string 일치 (가장 가까운 박자 위치)
  var idx = best(function(n) {
    return (n.f !== undefined ? n.f : 0) === realF &&
           (n.s !== undefined ? n.s : 0) === ourStr;
  });
  if (idx >= 0) return idx;
  // 2순위: 피치 일치 — 충돌 해소로 줄이 바뀐 노트도 선택 가능
  return best(function(n) { return n.p === pitch; });
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v3] Scale 오버레이
   Root + Scale 선택 → 스케일 구성음을 프렛보드 전체에 흰색 표시.
   루트음은 더 밝게 강조. Scale ON 동안은 점에 음이름 표시(OFF 면 fret 번호).
   MIDI/클릭 하이라이트(.lit 주황)는 CSS 정의 순서상 항상 우선.
   ═══════════════════════════════════════════════════════════════════════════ */
var SCALES = {
  "off":        null,
  "major":      [0,2,4,5,7,9,11],
  "minor":      [0,2,3,5,7,8,10],
  "pent-major": [0,2,4,7,9],
  "pent-minor": [0,3,5,7,10],
  "blues":      [0,3,5,6,7,10],
  "dorian":     [0,2,3,5,7,9,10],
  "mixolydian": [0,2,4,5,7,9,10],
  "harm-minor": [0,2,3,5,7,8,11],
};
var uiScaleRoot = 0;     // 0=C … 11=B
var uiScaleKey  = "off";

function updateScaleOverlay() {
  var ivs  = SCALES[uiScaleKey] || null;
  var OPEN = getOpenStrings();
  var cells = document.querySelectorAll("#fretboard-grid .fc");
  for (var i = 0; i < cells.length; i++) {
    var c  = cells[i];
    var s  = parseInt(c.getAttribute("data-s"), 10);
    var f  = parseInt(c.getAttribute("data-f"), 10);
    var nd = c.querySelector(".nd");
    c.classList.remove("scale", "scale-root");
    var pitch = (OPEN[s] || 40) + f;
    var pc    = ((pitch % 12) + 12) % 12;
    if (ivs) {
      var iv = ((pc - uiScaleRoot) + 12) % 12;
      if (ivs.indexOf(iv) !== -1) {
        c.classList.add("scale");
        if (iv === 0) c.classList.add("scale-root");
      }
      if (nd) nd.textContent = NOTE_NAMES[pc];   // 스케일 모드: 음이름
    } else {
      if (nd) nd.textContent = String(f);        // 기본 모드: fret 번호
    }
  }
}

(function bindScaleControls() {
  var r = document.getElementById("ui-scale-root");
  var k = document.getElementById("ui-scale");
  if (r) r.addEventListener("change", function() {
    uiScaleRoot = parseInt(r.value, 10) || 0;
    updateScaleOverlay();
  });
  if (k) k.addEventListener("change", function() {
    uiScaleKey = k.value;
    updateScaleOverlay();
  });
})();

/* ── 선택 정보 일괄 표시 ──────────────────────────────────────────────────── */
function showSelection(noteList, isSingle) {
  var noteDisp  = document.getElementById("inspector-note-display");
  var chordDisp = document.getElementById("inspector-chord-display");
  if (!noteList || noteList.length === 0) {
    if (noteDisp)  noteDisp.textContent  = "Click a note on the score...";
    if (chordDisp) chordDisp.textContent = "";
    return;
  }
  var sorted = noteList.slice().sort(function(a, b) { return b.s - a.s; });
  var txt = sorted.map(function(h) {
  return (h.s >= 1 ? h.s : "\u2013") + ":" + pitchToName(h.p);
}).join("  \u00b7  ");
  if (isSingle) txt = "▶ " + txt + "  (selected)";   // ★ v4: 단일 선택 표시
  if (noteDisp) noteDisp.textContent = txt;
  document.getElementById("fb-note-label").textContent = txt;
  var chordName = noteList.length >= 2
    ? detectChord(noteList.map(function(h) { return h.p; })) : "";
  if (chordDisp) chordDisp.textContent = chordName ? "♪  " + chordName : "";
}

window.fretClick = function(s, f) { log("Fret: String " + s + " / Fret " + f); };

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
var listEl = document.getElementById("track-list");
if (!tracks || tracks.length === 0) {
  listEl.innerHTML = '<div class="no-tracks">No MIDI tracks found.</div>';
} else {
  var h = "";
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    h += '<div class="ti' + (i === 0 ? " active" : "") + '" id="ti-' + t.id + '"'
       + ' onclick="loadTrack(\'' + t.id + '\')">'
       + '<span class="tn" title="' + t.name + '">' + t.name + "</span>"
       + '<span class="tc">' + t.noteCount + "</span>"
       + "</div>";
  }
  listEl.innerHTML = h;
}

/* ── 전역 상태 ────────────────────────────────────────────────────────────── */
var api         = null;
var curTrack    = null;
var dispMode    = "both";
var playing     = false;
var pdfBusy     = false;
var uiTranspose = 0;
var uiCapo      = 0;
var uiQuantize  = 16;          // ★ v3: 기본 1/16 (레퍼런스와 동일)
var selectedNoteIndices = [];  // ★ v3: 줄옮김용 — 클릭으로 선택된 노트 인덱스

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 악기 변환 — instruments.ts 프리셋 기반
   선택 시 새 악기로 재보이싱(피치 유지) + 프렛보드/스케일/악보 전체 갱신.
   베이스 선택 시 toMusicXml 의 isBass 감지로 낮은음자리표(F clef) 자동 적용.
   ═══════════════════════════════════════════════════════════════════════════ */
var INSTRUMENTS = {
  "guitar6":  GUITAR_6,
  "guitar7":  GUITAR_7,
  "guitar8":  GUITAR_8,
  "guitar12": GUITAR_12,
  "bass4":    BASS_4,
  "bass5":    BASS_5,
  "bass6":    BASS_6
};

function instrumentKeyOf(instr) {
  if (instr && instr.name) {
    for (var k in INSTRUMENTS) {
      if (INSTRUMENTS[k].name === instr.name) return k;
    }
  }
  return "guitar6";
}

window.setInstrument = function(key) {
  var preset = INSTRUMENTS[key];
  if (!preset) return;
  if (!curTrack) { log("Instrument: load a track first"); return; }

  curTrack.instrument = preset;
  // 새 악기 기준 재보이싱 (MIDI 피치는 유지, fret/string 재계산)
  if (Array.isArray(curTrack.notes) && curTrack.notes.length > 0) {
    curTrack.notes = applyGuitarVoicing(
      curTrack.notes.map(function(n) { return Object.assign({}, n); }),
      preset
    );
  }
  selectedNoteIndices = [];
  buildFretboard();          // 줄 수/개방현 라벨 갱신
  updateScaleOverlay();
  clearFretboard();
  clearNoteOverlays();
  showSelection(null);
  renderInspector(curTrack);
  rebuildScore();
  log("Instrument: " + preset.name);
};

(function bindInstrument() {
  var sel = document.getElementById("ui-instrument");
  if (sel) sel.addEventListener("change", function() {
    window.setInstrument(sel.value);
  });
})();

/* ── Staff 레벨 표시 옵션 ─────────────────────────────────────────────────── */
function applyStaffMode(score) {
  if (!score || !score.tracks) return;
  for (var t = 0; t < score.tracks.length; t++) {
    var staves = score.tracks[t].staves || [];
    for (var s = 0; s < staves.length; s++) {
      staves[s].showTablature        = (dispMode !== "staff");
      staves[s].showStandardNotation = (dispMode !== "tab");
    }
  }
}

// ★ v5.2: 음역 밖 노트(XML에서 괄호 notehead → isGhost=true) 색상 구별
//   tie 괄호 프렛은 기본색 유지 → 노란색 = 음역 밖으로 즉시 식별
var OOR_COLOR = "#E5C07B";
function colorizeOutOfRange(score) {
  try {
    var col = alphaTab.model.Color.fromJson(OOR_COLOR);
    var NS  = alphaTab.model.NoteSubElement;
    score.tracks.forEach(function(t) {
      (t.staves || []).forEach(function(st) {
        (st.bars || []).forEach(function(bar) {
          (bar.voices || []).forEach(function(v) {
            (v.beats || []).forEach(function(bt) {
              (bt.notes || []).forEach(function(n) {
                if (!n.isGhost) return;
                var style = new alphaTab.model.NoteStyle();
                style.colors.set(NS.StandardNotationNoteHead, col);
                style.colors.set(NS.GuitarTabFretNumber, col);
                n.style = style;
              });
            });
          });
        });
      });
    });
  } catch(e) { log("colorize: " + (e.message || e)); }
}

/* ── createApi ────────────────────────────────────────────────────────────── */
function createApi() {
  var el = document.getElementById("alphaTab");
  if (api) {
    try { if (api.destroy) api.destroy(); } catch(e) {}
    api = null;
    el.innerHTML = "";
  }

   api = new alphaTab.AlphaTabApi(el, {
    core: {
      engine: "svg", useWorker: false,
      // ★ file:// 격리 환경: fontDirectory 대신 Base64 Data URL을 직접 주입
      fontDirectory: null,
      smuflFontSources: new Map([
        [alphaTab.FontFileFormat.OpenType, bravuraFontUrl]
      ]),
      includeNoteBounds: true   // ★ v4: noteMouseDown(단일 노트 클릭) 활성화
    },
    display: {
      layoutMode: 0,
      // ★ v3: 오선/마디선은 어둡게(배경), 음표/TAB 숫자는 밝게 → 가독성↑
      resources: getAtRes()
      
    },
    player: { enablePlayer: true, enableCursor: true, enableUserInteraction: true }
  });

  api.error.on(function(e) {
    log("AlphaTab error: " + (e.message || JSON.stringify(e)));
    playing = false; updPlay(false); status("Error");
  });

  api.scoreLoaded.on(function(score) {
    applyStaffMode(score);
    colorizeOutOfRange(score);   // ★ 음역 밖 노트 노란색
    log("Score loaded (" + dispMode + ")");
    status("Ready");
  });

  api.postRenderFinished.on(function() { log("Render complete"); });

  // ── beatMouseDown: 클릭 → 화음 표시 + 코드 분석 + ★줄옮김용 선택 ────────
  api.beatMouseDown.on(function(beat) {
    if (!beat) return;
    clearFretboard();
    clearNoteOverlays();
    overlayBeatNotes(beat);          // ★ v5: 화음 전체 주황 박스
    selectedNoteIndices = [];

    var highlightedNotes = [];
    var nStrings = getStringCount();
    var OPEN     = getOpenStrings();

    // 클릭한 beat 의 절대 박자 위치 (가능하면 — 줄옮김의 정확한 노트 식별용)
    var beatPos = null;
try {
  if (beat.playbackStart !== undefined && beat.voice && beat.voice.bar && beat.voice.bar.masterBar) {
    beatPos = (beat.voice.bar.masterBar.start + beat.playbackStart) / 960;
  }
} catch(e) {}

    if (Array.isArray(beat.notes)) {
      for (var bi = 0; bi < beat.notes.length; bi++) {
        var sn = beat.notes[bi];
        if (!sn) continue;

        if (sn.fret !== undefined && sn.string !== undefined && sn.string > 0) {
          var ourStr = (nStrings + 1) - sn.string;
          var realF  = sn.fret + uiCapo;            // 악보 표기 fret + capo = 실제 fret
          var pitch  = (OPEN[ourStr] || 40) + realF;
          lightFret(ourStr, realF);
          highlightedNotes.push({ f: realF, s: ourStr, p: pitch });
        } else {
          var midiPitch = (sn.realValue !== undefined) ? sn.realValue
                        : (sn.displayValue !== undefined) ? sn.displayValue : -1;
          if (midiPitch < 0) continue;
          if (curTrack && Array.isArray(curTrack.notes)) {
            for (var k = 0; k < curTrack.notes.length; k++) {
              var tn = curTrack.notes[k];
              if ((tn.p !== undefined ? tn.p : -1) === midiPitch) {
                lightFret(tn.s, tn.f);
                highlightedNotes.push({ f: tn.f, s: tn.s, p: midiPitch });
                break;
              }
            }
          }
        }
      }
    }

    showSelection(highlightedNotes);

    // ── curTrack.notes 인덱스 매칭 (행 하이라이트 + 줄옮김 대상) ──────────
    if (highlightedNotes.length > 0 && curTrack) {
      var notes = Array.isArray(curTrack.notes) ? curTrack.notes : [];
      document.querySelectorAll("#note-tbody tr.sel").forEach(function(r) {
        r.classList.remove("sel");
      });
      var used = {};
      var firstRow = null;
      for (var hi = 0; hi < highlightedNotes.length; hi++) {
        var hN = highlightedNotes[hi];
        var found = matchTrackNote(hN.f, hN.s, hN.p, beatPos, used);  // ★ v5
        if (found >= 0) {
          used[found] = true;
          selectedNoteIndices.push(found);
          var row = document.getElementById("nr-" + found);
          if (row) { row.classList.add("sel"); if (!firstRow) firstRow = row; }
        }
      }
      if (firstRow) firstRow.scrollIntoView({ block: "nearest" });
    }

    if (highlightedNotes.length > 0) {
      log("Click: " + highlightedNotes.map(function(h) {
        return h.s + ":" + pitchToName(h.p) + "(f" + h.f + ")";
      }).join(" "));
    }
  });

  // ── ★ v4: noteMouseDown — TAB 번호(단일 노트) 직접 클릭 → 그 노트만 선택 ──
  // includeNoteBounds:true 필요. beatMouseDown(화음 전체)이 먼저 처리된 후
  // 20ms 뒤에 단일 선택으로 좁힙니다 (이벤트 순서와 무관하게 안전).
  if (api.noteMouseDown) {
    api.noteMouseDown.on(function(note) {
      if (!note) return;
      var f    = note.fret;
      var sRaw = note.string;
      if (f === undefined || sRaw === undefined || sRaw <= 0) return;

      var nStrings = getStringCount();
      var OPEN     = getOpenStrings();
      var ourStr   = (nStrings + 1) - sRaw;
      var realF    = f + uiCapo;                    // capo 보정
      var pitch    = (OPEN[ourStr] || 40) + realF;

      // beat 절대 위치 (정확한 노트 식별용)
      // ✅ 교체
      var bp = null;
      try {
      var bt = note.beat;
      if (bt && bt.playbackStart !== undefined && bt.voice && bt.voice.bar && bt.voice.bar.masterBar) {
        bp = (bt.voice.bar.masterBar.start + bt.playbackStart) / 960;
      }
      } catch(e) {}

      setTimeout(function() {
        // ★ v5: 통합 매칭 (f+s 우선 → 피치 fallback, 가장 가까운 박자)
        var idx = matchTrackNote(realF, ourStr, pitch, bp, null);
        if (idx < 0) return;

        // 단일 선택으로 교체
        selectedNoteIndices = [idx];
        clearFretboard();
        clearNoteOverlays();
        overlayOneNote(note);                       // ★ v5: 이 노트만 주황 박스
        lightFret(ourStr, realF);
        showSelection([{ f: realF, s: ourStr, p: pitch }], true);

        document.querySelectorAll("#note-tbody tr.sel").forEach(function(r) {
          r.classList.remove("sel");
        });
        var row = document.getElementById("nr-" + idx);
        if (row) { row.classList.add("sel"); row.scrollIntoView({ block: "nearest" }); }

        log("Note selected: " + ourStr + ":" + pitchToName(pitch) + " (f" + f + ") @b" +
        (bp === null ? "?" : bp.toFixed(2)));
      }, 20);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v4] 노트 길이 편집 — Dur −/+ (grid 단위 증감) / ⟶Next (다음 노트까지 연장)
   "⟶Next" = 기타프로의 let-ring 대용: 선택 노트를 다음 노트 머리까지 늘리면
   tie 엔진이 마디/박자 경계에서 자동으로 붙임줄을 생성하고 쉼표가 사라집니다.
   ═══════════════════════════════════════════════════════════════════════════ */
window.adjustDuration = function(mode) {
  if (!curTrack || selectedNoteIndices.length === 0) {
    log("Dur: 먼저 노트를 선택하세요 (TAB 번호 클릭 = 단일 선택)");
    status("Select a note first"); return;
  }
  var unit  = 4 / (uiQuantize === "auto" ? 16 : uiQuantize);  // grid 1단위(박)
  var notes = curTrack.notes;
  var changed = 0;

  for (var i = 0; i < selectedNoteIndices.length; i++) {
    var n = notes[selectedNoteIndices[i]];
    if (!n) continue;

    if (mode === "next") {
      // 이 노트 뒤에서 가장 가까운 onset 까지 연장 (let-ring 스타일)
      var next = Infinity;
      for (var k = 0; k < notes.length; k++) {
        var o = notes[k];
        if ((o.b || 0) > (n.b || 0) + 0.001 && o.b < next) next = o.b;
      }
      if (next !== Infinity && next - n.b > n.d) { n.d = next - n.b; changed++; }
      else log("Dur: 이미 다음 노트에 닿아 있음");
    } else {
      var delta = (mode === "+1") ? unit : -unit;
      var nd = Math.max(unit, (n.d || unit) + delta);
      if (Math.abs(nd - n.d) > 0.001) { n.d = nd; changed++; }
    }
  }

  if (changed > 0) {
    log("Duration " + (mode === "next" ? "⟶ next note" : mode) +
        " (" + changed + " note(s))");
    rebuildScore();
    renderInspector(curTrack);
    // 선택 유지 점등
    clearFretboard();
    var sel = [];
    for (var i = 0; i < selectedNoteIndices.length; i++) {
      var n = curTrack.notes[selectedNoteIndices[i]];
      if (n) { lightFret(n.s, n.f); sel.push({ f: n.f, s: n.s, p: n.p }); }
    }
    showSelection(sel, sel.length === 1);
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v3] TAB 줄옮김 — 선택 노트를 인접 줄로 이동 (피치 유지, fret 재계산)
   dir: -1 = 얇은 줄(▲, 줄번호 감소) / +1 = 굵은 줄(▼, 줄번호 증가)
   검증: 줄 범위, fret 0~24, 같은 박자 같은 줄 충돌
   ═══════════════════════════════════════════════════════════════════════════ */
window.moveString = function(dir) {
  if (!curTrack || selectedNoteIndices.length === 0) {
    log("Move: 먼저 악보에서 노트를 클릭해 선택하세요");
    status("Select a note first"); return;
  }
  if (uiTranspose !== 0) {
    log("Move: Trans 를 0 으로 되돌린 후 사용하세요 (transpose 는 자동 재보이싱됨)");
    status("Set Trans=0 first"); return;
  }
  var OPEN = getOpenStrings(), nS = getStringCount();
  var moved = 0;

  for (var i = 0; i < selectedNoteIndices.length; i++) {
    var idx = selectedNoteIndices[i];
    var n = curTrack.notes[idx];
    if (!n) continue;
    if (n.s < 1 || n.f < 0) continue;   // 음역 밖 노트는 줄옮김 불가
    var ns2 = n.s + dir;
    if (ns2 < 1 || ns2 > nS) continue;                 // 줄 범위 밖
    var open = OPEN[ns2];
    if (typeof open !== "number") continue;
    var nf = n.p - open;
    if (nf < 0 || nf > 24) continue;                   // 프렛 범위 밖
    var clash = false;                                  // 같은 박자·줄 충돌
    for (var k = 0; k < curTrack.notes.length; k++) {
      if (k === idx) continue;
      var o = curTrack.notes[k];
      if (Math.abs((o.b || 0) - (n.b || 0)) < 0.01 && o.s === ns2) { clash = true; break; }
    }
    if (clash) continue;
    n.s = ns2; n.f = nf; moved++;
  }

  if (moved > 0) {
    log("Moved " + moved + " note(s) " + (dir < 0 ? "▲ thinner" : "▼ thicker"));
    rebuildScore();
    renderInspector(curTrack);
    // 새 위치 다시 점등
    clearFretboard();
    var sel = [];
    for (var i = 0; i < selectedNoteIndices.length; i++) {
      var n = curTrack.notes[selectedNoteIndices[i]];
      if (n) { lightFret(n.s, n.f); sel.push({ f: n.f, s: n.s, p: n.p }); }
    }
    showSelection(sel);
  } else {
    log("Move: 이동 불가 (범위 밖 또는 줄 충돌)");
    status("Move blocked");
  }
};

/* ── 패널 토글 (Data / Log / Sidebar) ───────────────────────────────────────────────── */
window.togglePanel = function(id, btnId) {
  var el = document.getElementById(id);
  if (!el) return;
  var nowHidden = el.classList.toggle("hidden");
  var b = document.getElementById(btnId);
  if (b) b.classList.toggle("on", !nowHidden);
};

window.toggleSidebar = function() {
  var sb = document.getElementById("sidebar");
  if (sb) sb.classList.toggle("collapsed");
};

/* ── XML 로딩 (ArrayBuffer 필수) ──────────────────────────────────────────── */
function loadXmlIntoApi(targetApi, xmlStr) {
  if (!xmlStr || !targetApi) return false;
  try {
    var encoded = new TextEncoder().encode(xmlStr);
    targetApi.load(encoded.buffer);
    return true;
  } catch(e) {
    log("XML load error: " + (e.message || e));
    return false;
  }
}

function getXmlForMode(track) {
  if (!track) return "";
  return track.musicXml || track.musicXmlBoth || track.musicXmlStaff || "";
}

/* ── 웹뷰 내 XML 재생성 (Quantize / Transpose / Capo / 줄옮김 반영) ───────── */
function rebuildScore() {
  if (!curTrack || !Array.isArray(curTrack.notes) || curTrack.notes.length === 0) {
    renderScore(); return;
  }
  
    var bpm = curTrack.bpm || curTrack.tempo;

    // ✅ XML에서 BPM 추출
    if (!bpm && curTrack.musicXml) {
      var m = curTrack.musicXml.match(/tempo="(\d+)"/);
      if (m) bpm = Number(m[1]);
    }

    // ✅ fallback
    if (!bpm) bpm = 120;




  clearNoteOverlays();   // 재렌더 시 기존 좌표 무효
  try {
    var xml = toMusicXml(curTrack.notes, bpm, {
      instrument:  curTrack.instrument || undefined,
      skipVoicing: true,
      transpose:   uiTranspose,
      capo:        uiCapo,
      quantize:    uiQuantize === "auto" ? undefined : uiQuantize  // ★ v3
    });
    curTrack.musicXml = xml;
    if (!api) createApi();
    status("Rendering…");
    if (loadXmlIntoApi(api, xml)) {
      log("Rebuilt: q=" + (uiQuantize === "auto" ? "auto" : "1/" + uiQuantize) +
          " trans=" + uiTranspose + " capo=" + uiCapo);
      // ★ 음역 밖 노트 안내
      var hi = 0, lo = 0;
      for (var oi = 0; oi < curTrack.notes.length; oi++) {
        var on = curTrack.notes[oi];
        if (on.oor === 1) hi++; else if (on.oor === 2) lo++;
      }
      if (hi + lo > 0) {
        log("\u26a0 Out of range: " +
            (hi ? hi + " high (shown as (fret>24) on string 1)" : "") +
            (hi && lo ? ", " : "") +
            (lo ? lo + " low (folded +1 octave, shown in parens)" : "") +
            " \u2014 try another Instr or Trans \u00b112");
        status("\u26a0 " + (hi + lo) + " out of range");
      }
    }
  } catch(e) {
    log("Rebuild error: " + (e.message || e));
  }
}

/* ── 컨트롤 바인딩: Transpose / Capo / Quantize ──────────────────────────── */
var rebuildTimer = null;
(function bindControls() {
  var t = document.getElementById("ui-transpose");
  var c = document.getElementById("ui-capo");
  var q = document.getElementById("ui-quantize");
  function onPitchChange() {
    uiTranspose = parseInt((t && t.value) || "0", 10) || 0;
    uiCapo      = Math.max(0, parseInt((c && c.value) || "0", 10) || 0);
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildScore, 350);
  }
  if (t) t.addEventListener("input", onPitchChange);
  if (c) c.addEventListener("input", onPitchChange);
  if (q) q.addEventListener("change", function() {
    uiQuantize = q.value === "auto" ? "auto" : (parseInt(q.value, 10) || 16);
    rebuildScore();
  });
})();

/* ── renderScore (payload XML fallback) ──────────────────────────────────── */
function renderScore() {
  if (!curTrack) return;
  createApi();
  var xmlStr = getXmlForMode(curTrack);
  if (!xmlStr) { log("No MusicXML data"); status("No data"); return; }
  status("Rendering…");
  if (loadXmlIntoApi(api, xmlStr)) {
    log("XML loaded (" + xmlStr.length + " chars)");
  }
}

/* ── View Mode 전환 ───────────────────────────────────────────────────────── */
window.setMode = function(mode) {
  dispMode = mode;
  document.querySelectorAll(".sb").forEach(function(b) { b.classList.remove("on"); });
  var btn = document.getElementById("m-" + mode);
  if (btn) btn.classList.add("on");
  clearNoteOverlays();
  if (api && api.score) {
    applyStaffMode(api.score);
    api.render();
  } else {
    renderScore();
  }
};

/* ── MIDI Inspector ───────────────────────────────────────────────────────── */
function renderInspector(track) {
  function nf(n, ck, vk, def) {
    var v = n[ck]; if (v !== undefined && v !== null) return v;
    v = n[vk];     if (v !== undefined && v !== null) return v;
    return def;
  }
  var notes = Array.isArray(track.notes) ? track.notes : [];

  var arrN = 0, sesN = 0;
  for (var i = 0; i < notes.length; i++) {
    var src = nf(notes[i], "src", "source", "arr");
    if (src === "arr" || src === "arrangement") arrN++; else sesN++;
  }
  document.getElementById("insp-stats").textContent =
    arrN + " arr  " + sesN + " ses  total " + notes.length;

  var velEl = document.getElementById("vel-lane");
  var vH = "";
  for (var i = 0; i < notes.length; i++) {
    var vel = nf(notes[i], "v", "velocity", 100);
    var hh  = Math.max(4, Math.round((vel / 127) * 28));
    var op  = (0.3 + (vel / 127) * 0.7).toFixed(2);
    vH += '<div class="vb" style="height:' + hh + 'px;opacity:' + op + '" title="' + vel + '"></div>';
  }
  velEl.innerHTML = vH;

  var tbody = document.getElementById("note-tbody");
  var rows  = "";
  for (var i = 0; i < notes.length; i++) {
    var n    = notes[i];
    var beat = nf(n, "b", "startBeat",  0);
    var dur  = nf(n, "d", "durationBeat", 0);
    var pit  = nf(n, "p", "pitch",      60);
    var vel  = nf(n, "v", "velocity",  100);
    var fret = nf(n, "f", "fret", 0);
    var str  = nf(n, "s", "stringNum", 0);
    var src2 = nf(n, "src", "source", "arr");
    var clip = nf(n, "clip", "clipName", "");
    var cls  = (src2 === "arr" || src2 === "arrangement") ? "ca" : "cg";

    rows += '<tr id="nr-' + i + '"'
          + ' onclick="inspectorRowClick(' + str + "," + fret + "," + i + "," + pit + ')">'
          + "<td>" + beatToBarBeat(beat) + "</td>"
          + "<td>" + durToLabel(dur)     + "</td>"
          + '<td style="font-weight:700">' + pitchToName(pit) + "</td>"
          + "<td>" + velToDynamic(vel)   + "</td>"
          + '<td class="ca">' + ((str < 1 || fret < 0) ? "\u2013" : fret + "." + str) + "</td>"
          + "<td>" + clip + "</td>"
          + '<td class="' + cls + '">' + String(src2).slice(0, 3) + "</td>"
          + "</tr>";
  }
  tbody.innerHTML = rows;
}

window.inspectorRowClick = function(str, fret, idx, pitch) {
  clearFretboard();
  lightFret(str, fret);
  showSelection([{ f: fret, s: str, p: pitch }]);
  selectedNoteIndices = [idx];           // 행 클릭으로도 줄옮김 선택 가능
  var prev = document.querySelector(".sel");
  if (prev) prev.classList.remove("sel");
  var row = document.getElementById("nr-" + idx);
  if (row) row.classList.add("sel");
};

/* ── PDF Export (v2 그대로) ──────────────────────────────────────────────── */
var PDF_RENDER_W = 1406;

window.exportPDF = function() {
  if (!curTrack) { log("No track loaded"); return; }
  if (pdfBusy)   { log("PDF: already in progress"); return; }
  pdfBusy = true;
  log("PDF: rendering at A4 width...");
  status("PDF...");

  var pc = document.getElementById("pdf-render");
  if (!pc) {
    pc = document.createElement("div");
    pc.id = "pdf-render";
    document.body.appendChild(pc);
  }
  pc.innerHTML = "";

  var printApi = new alphaTab.AlphaTabApi(pc, {
     core: {
      engine: "html5", useWorker: false,
      // ★ file:// 격리 환경: Base64 Data URL 폰트 직접 주입
      fontDirectory: null,
      smuflFontSources: new Map([
        [alphaTab.FontFileFormat.OpenType, bravuraFontUrl]
      ]),
      enableLazyLoading: false
    },
    display: {
      layoutMode: 0, scale: 1.1, barCountPerPartial: 6,
      resources: {
        mainGlyphColor:      "#000000",
        secondaryGlyphColor: "#000000",
        staffLineColor:      "#000000",
        barSeparatorColor:   "#000000",
        barNumberColor:      "#000000",
        scoreInfoColor:      "#000000"
      }
    },
    player: { enablePlayer: false }
  });

  printApi.scoreLoaded.on(function(score) { applyStaffMode(score); });
  printApi.error.on(function(e) {
    log("PDF render error: " + (e.message || JSON.stringify(e)));
    cleanup();
  });

  var fired = false;
  printApi.postRenderFinished.on(function() {
    if (fired) return;
    fired = true;
    setTimeout(function() {
      try { buildPdf(pc); }
      catch(e) { log("PDF build error: " + (e.message || e)); }
      cleanup();
    }, 200);
  });

  function cleanup() {
    try { printApi.destroy(); } catch(e) {}
    pc.innerHTML = "";
    pdfBusy = false;
    status("Ready");
  }

  var xml = getXmlForMode(curTrack);
  if (!loadXmlIntoApi(printApi, xml)) cleanup();
};

function buildPdf(pc) {
  var canvases = Array.prototype.slice.call(pc.querySelectorAll("canvas"))
    .filter(function(c) { return c.width > 4 && c.height > 4; });
  canvases.sort(function(a, b) {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  if (canvases.length === 0) { log("PDF: no rendered content"); return; }

  var MARGIN = 12, PAGE_W = 210, PAGE_H = 297;
  var availW = PAGE_W - MARGIN * 2;
  var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  var y = MARGIN;

  for (var i = 0; i < canvases.length; i++) {
    var cv  = canvases[i];
    var hMm = cv.height * (availW / cv.width);
    if (y + hMm > PAGE_H - MARGIN && y > MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.addImage(cv.toDataURL("image/png"), "PNG", MARGIN, y, availW, hMm);
    y += hMm;
  }

  var fname = curTrack.name.replace(/[/\\?%*:|"<>]/g, "_") + ".pdf";
  var blob  = pdf.output("blob");
  var url   = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
  log("PDF saved: " + fname + " (" + pdf.getNumberOfPages() + " pages)");
}

/* ── AlphaTex Export ──────────────────────────────────────────────────────── */
window.exportAlphaTex = function() {
  if (!curTrack) { log("No track loaded"); return; }
  var atex = (typeof curTrack.alphaTex === "string") ? curTrack.alphaTex : "";
  if (!atex) { log("No AlphaTex data available"); return; }
  var content = "// AlphaTex export\n// Track: " + curTrack.name + "\n\n" + atex;
  var a = document.createElement("a");
  a.href     = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
  a.download = curTrack.name.replace(/[/\\?%*:|"<>]/g, "_") + ".atex";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  log("Saved: " + a.download);
};

/* ── Play controls ────────────────────────────────────────────────────────── */
function updPlay(p) {
  var btn = document.getElementById("btn-play");
  if (!btn) return;
  if (p) { btn.innerHTML = "&#9646;&#9646; Pause"; btn.classList.add("on"); }
  else   { btn.innerHTML = "&#9654; Play";         btn.classList.remove("on"); }
}

window.togglePlay = function() {
  if (!api) return;
  try {
    if (playing) { if (api.pause) api.pause(); }
    else         { if (api.play)  api.play();  }
  } catch(e) { log("player: " + e.message); }
};

window.stopPlay = function() {
  if (!api) return;
  try { if (api.stop) api.stop(); } catch(e) {}
  playing = false; updPlay(false); clearFretboard();
};

/* ── loadTrack ────────────────────────────────────────────────────────────── */
window.loadTrack = function(id) {
  var items = document.querySelectorAll(".ti");
  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");
  var el = document.getElementById("ti-" + id);
  if (el) el.classList.add("active");

  var trk = null;
  if (tracks) {
    for (var i = 0; i < tracks.length; i++) {
      if (String(tracks[i].id) === String(id)) { trk = tracks[i]; break; }
    }
  }
  if (!trk) { log("track \"" + id + "\" not found"); return; }

  curTrack = trk;
  selectedNoteIndices = [];
  clearNoteOverlays();
  // 악기 드롭다운을 현재 트랙의 악기와 동기화
  var instSel = document.getElementById("ui-instrument");
  if (instSel) instSel.value = instrumentKeyOf(trk.instrument);
  buildFretboard();          // 트랙별 악기(줄 수) 반영
  log("Loading: \"" + trk.name + "\" (" + trk.noteCount + " notes)");
  clearFretboard();
  showSelection(null);
  renderInspector(trk);
  updateScaleOverlay();   // 악기(개방현)에 맞춰 스케일 표시 갱신

  // ★ v3: notes 가 있으면 항상 웹뷰에서 재생성 (Quantize 1/16 기본 적용)
  if (Array.isArray(trk.notes) && trk.notes.length > 0) rebuildScore();
  else renderScore();
};

/* ── 초기 실행 ────────────────────────────────────────────────────────────── */
if (tracks && tracks.length > 0) {
  setTimeout(function() { window.loadTrack(tracks[0].id); }, 100);
} else {
  status("No tracks");
}