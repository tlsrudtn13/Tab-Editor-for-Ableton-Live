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
import { initZoom } from "./uiZoom";
import { initFretboardSplitter } from "./panelSize";
import { bindBarToggle, bindScaleControls, buildFretboard, clearFretboard, fretClick, updateScaleOverlay } from "./fretboard";
import { clearNoteOverlays, showSelection } from "./overlay";
import { bindControls, bindInstrument, instrumentKeyOf, rebuildScore, refingerNotes, renderScore, setInstrument, setMode } from "./score";
import { moveString } from "./editing";
import { inspectorRowClick, renderInspector, renderTrackList, togglePanel, toggleSidebar } from "./inspector";
import { exportAlphaTex, exportPDF } from "./export";
import { stopPlay, togglePlay } from "./player";
import { isMulti, restoreSession, stashSession, toggleApplyMark } from "./multiApply";
import { bindAnnotations, refreshAnnUi, closeLyricsForTabSwitch } from "./annotate";
import { startDevReporter } from "./devReporter";
import { annSnapshot, bindKeys, highlightSelection, toggleTech } from "./keys";
import { bindApply } from "./apply";
import "./style.css";
import { bindDrums, enterDrumMode, isDrumTrack, leaveDrumMode } from "./drums";
import { bindInsertPanel, refreshInsertPanel } from "./insertPanel";
import { bindAnalysis, refreshAnalysisUi } from "./analysisView";
import { bindDiagrams, refreshDiagramsUi } from "./chordDiagramsUi";
import { initPractice } from "./practice";

// Duration buttons: + = shorter (halve), - = longer (double), per T010 keymap.
function adjustDuration(mode: string) {
  if (!state.curTrack || !state.curTrack.edit || !state.selectedNoteIndices.length) return;
  const shorter = mode === "-1" || mode === "+";
  const notes = state.curTrack.notes;
  const selected = state.selectedNoteIndices.slice().map(i => notes[i]).filter(Boolean);
  if (!selected.length) return;
  const before = notes.map((n:any)=>({...n}));
  const durName = (b:number) => {
    if (Math.abs(b-4)<1e-6) return "1/1"; if (Math.abs(b-2)<1e-6) return "1/2"; if (Math.abs(b-1)<1e-6) return "1/4";
    if (Math.abs(b-0.5)<1e-6) return "1/8"; if (Math.abs(b-0.25)<1e-6) return "1/16"; if (Math.abs(b-0.125)<1e-6) return "1/32"; return b.toFixed(3);
  };
  let changed = false, from = "", to = "";
  const editSpans = () => {
    const e = state.curTrack && state.curTrack.edit; if (!e) return null;
    if (e.mode === "track") return e.spans || [];
    return typeof e.regionLength === "number" ? [{ start: 0, end: e.regionLength }] : null;
  };
  const spanIndex = (b:number) => { const sp = editSpans(); if (!sp) return 0; return sp.findIndex((s:any)=> b>=s.start-1e-6 && b<s.end-1e-6); };
  for (const n of selected) {
    const old = n.d || 0.25;
    let nd = shorter ? Math.max(0.125, old / 2) : old * 2;
    const sp = editSpans(); const si = spanIndex(n.b);
    if (!shorter && sp && sp[si]) nd = Math.min(nd, Math.max(0.125, sp[si].end - n.b));
    if (Math.abs(nd - old) > 1e-6) { from = durName(old); to = durName(nd); n.d = nd; n.de = true; if (n.oid !== undefined) n.dirty = true; changed = true; }
  }
  if (changed) {
    state.sessionChanged = true; state.redoHistory = [];
    state.editHistory.push({ notes: before, deletedOids: state.deletedOids.slice(), ann: annSnapshot() });
    log("Duration " + from + " → " + to);
    rebuildScore(); renderInspector(state.curTrack); (window.__editKeys as any)?.updateEditUi?.();
  }
}

// Dev builds only: report to the test harness, expose state for its UI commands.
if (__TAB_DEV__) { window.__tabState = state; startDevReporter(); }

/* ── Init & start-up (same order as today) ────────────────────────────────── */
var txtColor = initTheme();
try { const v = document.getElementById("kp-version"); if (v) v.textContent = "v" + __APP_VERSION__; } catch {}
initZoom();   // saved editor zoom (toolbar menu, Ctrl + / - / 0)
initFretboardSplitter();   // drag the fretboard's top edge to resize it
initLog();
setTimeout(syncThemeBtn, 0);

/* ── 주입된 트랙 데이터 ───────────────────────────────────────────────────── */
state.tracks = (typeof window.tracks !== "undefined" && Array.isArray(window.tracks))
  ? window.tracks : null;

log("Theme: " + txtColor);
log("Tracks: " + (state.tracks ? state.tracks.length : "NONE"));

buildFretboard();
bindScaleControls();
bindBarToggle(function() { if (state.curTrack) highlightSelection(); });

renderTrackList();
bindInstrument();
bindControls();
bindKeys();
bindApply();
var ref = document.getElementById("btn-refinger");
if (ref) ref.addEventListener("click", refingerNotes);
var keysBtn = document.getElementById("btn-keys");
var keysPop = document.getElementById("keys-popover");
if (keysBtn && keysPop) {
  const pop = keysPop;
  keysBtn.addEventListener("click", (e) => { e.stopPropagation(); pop.classList.toggle("hidden"); });
  document.addEventListener("click", (e) => { if (!pop.classList.contains("hidden") && !(e.target as Element)?.closest("#keys-popover") && e.target !== keysBtn) pop.classList.add("hidden"); });
}
const ek = () => (window as any).__editKeys;
const bindRb = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.addEventListener("click", () => { fn(); }); };
bindRb("rb-v-1", () => ek()?.setValueByDen?.(1));
bindRb("rb-v-2", () => ek()?.setValueByDen?.(2));
bindRb("rb-v-4", () => ek()?.setValueByDen?.(4));
bindRb("rb-v-8", () => ek()?.setValueByDen?.(8));
bindRb("rb-v-16", () => ek()?.setValueByDen?.(16));
bindRb("rb-v-32", () => ek()?.setValueByDen?.(32));
bindRb("rb-dot", () => ek()?.toggleDot?.());
bindRb("rb-triplet", () => ek()?.toggleTriplet?.());
bindRb("rb-tie", () => ek()?.tieAtCursor?.());
bindRb("rb-rest", () => ek()?.restAtCursor?.());
bindRb("rb-ins", () => ek()?.insertBeatAtCursor?.());
bindRb("rb-del", () => ek()?.deleteBeatAtCursor?.());
bindDrums();
bindInsertPanel();
bindAnalysis();
bindDiagrams(rebuildScore);
bindAnnotations();
initPractice();

/* ── loadTrack ────────────────────────────────────────────────────────────── */
export function loadTrack(id) {
  closeLyricsForTabSwitch();   // a syllable being typed belongs to the tab it was typed on
  var items = document.querySelectorAll(".ti");
  for (var i = 0; i < items.length; i++) items[i].classList.remove("active");
  var el = document.getElementById("ti-" + id);
  if (el) el.classList.add("active");

  var trk: any = null;
  if (state.tracks) {
    for (var i = 0; i < state.tracks.length; i++) {
      if (String(state.tracks[i].id) === String(id)) { trk = state.tracks[i]; break; }
    }
  }
  if (!trk) { log("track \"" + id + "\" not found"); return; }

  // Re-clicking the current tab keeps its edit session (deleted notes, undo); only a switch stashes / restores.
  const sameTab = state.curTrack === trk;
  if (state.curTrack && !sameTab && isMulti()) stashSession(state.curTrack);   // keep this tab's edits
  state.curTrack = trk;
  if (isDrumTrack(trk)) enterDrumMode(trk); else leaveDrumMode();
  if (!sameTab) {
    state.uiTimeSig = trk.timeSig || { beats: 4, type: 4 };
    var tsSel = document.getElementById("ui-timesig") as HTMLSelectElement | null;
    if (tsSel && state.uiTimeSig) tsSel.value = state.uiTimeSig.beats + "/" + state.uiTimeSig.type;
    state.uiCapo = trk.capo || 0;
    var capoSel = document.getElementById("ui-capo") as HTMLSelectElement | null;
    if (capoSel) capoSel.value = String(state.uiCapo);
  }
  // Remember each note's values as opened, so Apply sends only what changed
  // (a pitch-only edit must not move the note's original, unquantized timing).
  if (Array.isArray(trk.notes)) trk.notes.forEach(function(n) {
    if (n.b0 === undefined) { n.b0 = n.b; n.d0 = n.d; }
  });
  if (!sameTab && !restoreSession(trk)) { state.deletedOids = []; state.editHistory = []; state.redoHistory = []; state.sessionChanged = false; }
  state.cursor = null; state.slots = []; state.selectionAnchor = null;
  state.selectedNoteIndices = [];   // before updateEditUi: the old tab's indices must not be read against this tab's notes
  if (window.__editKeys) window.__editKeys.updateEditUi();
  refreshAnnUi();
  refreshAnalysisUi();
  clearNoteOverlays();
  // 악기 드롭다운을 현재 트랙의 악기와 동기화
  var instSel = document.getElementById("ui-instrument") as HTMLSelectElement | null;
  if (instSel) instSel.value = instrumentKeyOf(trk.instrument);
  buildFretboard();          // 트랙별 악기(줄 수) 반영
  refreshDiagramsUi();
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
      var _rootSel = document.getElementById("ui-scale-root") as HTMLSelectElement | null;
      var _keySel = document.getElementById("ui-scale") as HTMLSelectElement | null;
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
  refreshInsertPanel();
}

/* ── Window handlers (must stay on window) ────────────────────────────────── */
window.toggleTheme = toggleTheme;
window.fretClick = fretClick;
window.toggleTech = toggleTech;
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
(window as any).toggleApplyMark = toggleApplyMark;
window.refingerNotes = refingerNotes;

/* ── 초기 실행 ────────────────────────────────────────────────────────────── */
if (state.tracks && state.tracks.length > 0) {
  setTimeout(function() { window.loadTrack!(state.tracks![0].id); }, 100);
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
