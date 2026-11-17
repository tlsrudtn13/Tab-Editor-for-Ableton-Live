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

import { state } from "./state";
import { initLog, log, status } from "./log";
import { getAtRes, initTheme, syncThemeBtn, toggleTheme } from "./theme";
import { bindScaleControls, buildFretboard, clearFretboard, fretClick, updateScaleOverlay } from "./fretboard";
import { clearNoteOverlays, showSelection } from "./overlay";
import { bindControls, bindInstrument, instrumentKeyOf, rebuildScore, renderScore, setInstrument, setMode } from "./score";
import { adjustDuration, moveString } from "./editing";
import { inspectorRowClick, renderInspector, renderTrackList, togglePanel, toggleSidebar } from "./inspector";
import { exportAlphaTex, exportPDF } from "./export";
import { stopPlay, togglePlay } from "./player";
import { startDevReporter } from "./devReporter";
import "./style.css";

// Dev builds only: report to the test harness, expose state for its UI commands.
if (__TAB_DEV__) { window.__tabState = state; startDevReporter(); }

/* ── Init & start-up (same order as today) ────────────────────────────────── */
var txtColor = initTheme();
initLog();
setTimeout(syncThemeBtn, 0);

/* ── 주입된 트랙 데이터 ───────────────────────────────────────────────────── */
state.tracks = (typeof window.tracks !== "undefined" && Array.isArray(window.tracks))
  ? window.tracks : null;

log("Theme: " + txtColor);
log("Tracks: " + (state.tracks ? state.tracks.length : "NONE"));

buildFretboard();
bindScaleControls();

renderTrackList();
bindInstrument();
bindControls();

/* ── loadTrack ────────────────────────────────────────────────────────────── */
export function loadTrack(id) {
  var items = document.querySelectorAll(".ti");
  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");
  var el = document.getElementById("ti-" + id);
  if (el) el.classList.add("active");

  var trk = null;
  if (state.tracks) {
    for (var i = 0; i < state.tracks.length; i++) {
      if (String(state.tracks[i].id) === String(id)) { trk = state.tracks[i]; break; }
    }
  }
  if (!trk) { log("track \"" + id + "\" not found"); return; }

  state.curTrack = trk;
  state.selectedNoteIndices = [];
  clearNoteOverlays();
  // 악기 드롭다운을 현재 트랙의 악기와 동기화
  var instSel = document.getElementById("ui-instrument");
  if (instSel) instSel.value = instrumentKeyOf(trk.instrument);
  buildFretboard();          // 트랙별 악기(줄 수) 반영
  log("Loading: \"" + trk.name + "\" (" + trk.noteCount + " notes)");
  clearFretboard();
  showSelection(null);
  renderInspector(trk);
  // Live scale → fretboard selects (when enabled & name maps)
  if (trk && trk.live && trk.live.scale && trk.live.scale.enabled) {
    var _scaleMap = {
      "Major": "major",
      "Minor": "minor",
      "Dorian": "dorian",
      "Mixolydian": "mixolydian",
      "Harmonic Minor": "harm-minor",
      "Minor Pentatonic": "pent-minor",
      "Major Pentatonic": "pent-major",
      "Minor Blues": "blues",
      "Blues": "blues"
    };
    var _mapped = _scaleMap[trk.live.scale.name];
    if (_mapped) {
      var _rootSel = document.getElementById("ui-scale-root");
      var _keySel = document.getElementById("ui-scale");
      if (_rootSel) _rootSel.value = String(trk.live.scale.root);
      if (_keySel) _keySel.value = _mapped;
      state.uiScaleRoot = trk.live.scale.root;
      state.uiScaleKey = _mapped;
    }
  }
  updateScaleOverlay();   // 악기(개방현)에 맞춰 스케일 표시 갱신

  // ★ v3: notes 가 있으면 항상 웹뷰에서 재생성 (Quantize 1/16 기본 적용)
  if (Array.isArray(trk.notes) && trk.notes.length > 0) rebuildScore();
  else renderScore();
}

/* ── Window handlers (must stay on window) ────────────────────────────────── */
window.toggleTheme = toggleTheme;
window.fretClick = fretClick;
window.setInstrument = setInstrument;
window.adjustDuration = adjustDuration;
window.moveString = moveString;
window.togglePanel = togglePanel;
window.toggleSidebar = toggleSidebar;
window.setMode = setMode;
window.inspectorRowClick = inspectorRowClick;
window.exportPDF = exportPDF;
window.exportAlphaTex = exportAlphaTex;
window.togglePlay = togglePlay;
window.stopPlay = stopPlay;
window.loadTrack = loadTrack;

/* ── 초기 실행 ────────────────────────────────────────────────────────────── */
if (state.tracks && state.tracks.length > 0) {
  setTimeout(function() { window.loadTrack(state.tracks[0].id); }, 100);
} else {
  if (window.tabMessage) {
    status(window.tabMessage);
    var viewer = document.getElementById("viewer");
    if (viewer) {
      viewer.innerHTML = "";
      var msg = document.createElement("div");
      msg.textContent = window.tabMessage;
      msg.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:2rem;white-space:pre-wrap;font-size:1.1rem;opacity:0.8;";
      viewer.appendChild(msg);
    }
  } else {
    status("No tracks");
  }
}
