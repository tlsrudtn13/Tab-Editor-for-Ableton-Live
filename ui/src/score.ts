import * as alphaTab from "@coderline/alphatab";
import bravuraFontUrl from "@alphatab-font/Bravura.otf?inline";
import { installInlineWorker } from "./synthWorker";
import { hideAlphaTabNotice } from "./alphaTabNotice";
installInlineWorker();   // before any AlphaTabApi: the synth needs a worker in the single-file page
import { toMusicXml } from "../../src/notation/toMusicXml.js";
import { keyFromLiveScale } from "../../src/notation/music.js";
import { applyGuitarVoicing } from "../../src/notation/voicing.js";
import {
  GUITAR_6, GUITAR_7, GUITAR_8, GUITAR_12,
  BASS_4, BASS_5, BASS_6, GUITAR_6_DROPD, GUITAR_6_EB, GUITAR_6_D,
  GUITAR_6_DROPC, GUITAR_6_DADGAD, GUITAR_6_OPENG, GUITAR_6_OPEND,
  BASS_4_DROPD, BASS_4_EB
} from "../../src/notation/instruments.js";
import { state } from "./state";
import { log, status } from "./log";
import { getAtRes } from "./theme";
import { buildFretboard, clearFretboard, getOpenStrings, getStringCount, lightFret, updateScaleOverlay } from "./fretboard";
import { applyTechniquesToScore } from "./techUi";
import { clearNoteOverlays, matchTrackNote, overlayBeatNotes, overlayOneNote, overlaySelectedNotes, showSelection, stringAtY, tabBarBoundsAt } from "./overlay";
import { drawLoopOverlay } from "./practice";
import { drawAnalysisOverlay, refreshAnalysisUi } from "./analysisView";
import { ensureCursor, rebuildSlotsFromApi, setCursor, slotAt, noteAtCursor } from "./cursor";
import { bindDragSelection, consumeRecentDrag, isDragSelecting } from "./dragSelect";
import { soundFontUrl, soundFontArrayBuffer, loadSoundFont } from "./soundfont";
import { renderInspector } from "./inspector";
import { pitchToName } from "./musicUi";
import { isDrumTrack, rebuildDrumScore, laneAtY, laneOfNote } from "./drums";

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 악기 변환 — instruments.ts 프리셋 기반
   선택 시 새 악기로 재보이싱(피치 유지) + 프렛보드/스케일/악보 전체 갱신.
   베이스 선택 시 toMusicXml 의 isBass 감지로 낮은음자리표(F clef) 자동 적용.
   ═══════════════════════════════════════════════════════════════════════════ */
export var INSTRUMENTS = {
  "guitar6":  GUITAR_6,
  "guitar7":  GUITAR_7,
  "guitar8":  GUITAR_8,
  "guitar12": GUITAR_12,
  "bass4":    BASS_4,
  "bass5":    BASS_5,
  "bass6":    BASS_6,
  "guitar6-dropd": GUITAR_6_DROPD, "guitar6-eb": GUITAR_6_EB, "guitar6-d": GUITAR_6_D,
  "guitar6-dropc": GUITAR_6_DROPC, "guitar6-dadgad": GUITAR_6_DADGAD,
  "guitar6-openg": GUITAR_6_OPENG, "guitar6-opend": GUITAR_6_OPEND,
  "bass4-dropd": BASS_4_DROPD, "bass4-eb": BASS_4_EB
};

export function instrumentKeyOf(instr) {
  if (typeof instr === "string" && INSTRUMENTS[instr]) return instr;
  if (instr && instr.name) {
    for (var k in INSTRUMENTS) {
      if (INSTRUMENTS[k].name === instr.name) return k;
    }
  }
  return "guitar6";
}

export function setInstrument(key) {
  var preset = INSTRUMENTS[key];
  if (!preset) return;
  if (!state.curTrack) { log("Instrument: load a track first"); return; }

  state.curTrack.instrument = preset;
  // undo entries hold string/fret choices of the old instrument; replaying them would bring back
  // strings the new one does not have (Fable review #7)
  state.editHistory = []; state.redoHistory = [];
  // 새 악기 기준 재보이싱 (MIDI 피치는 유지, fret/string 재계산)
  if (Array.isArray(state.curTrack.notes) && state.curTrack.notes.length > 0) {
    state.curTrack.notes = applyGuitarVoicing(
      state.curTrack.notes.map(function(n) { return Object.assign({}, n); }),
      preset
    );
  }
  state.selectedNoteIndices = [];
  buildFretboard();          // 줄 수/개방현 라벨 갱신
  updateScaleOverlay();
  clearFretboard();
  clearNoteOverlays();
  showSelection(null);
  renderInspector(state.curTrack);
  rebuildScore();
  log("Instrument: " + preset.name);
}

export function bindInstrument() {
  var sel = document.getElementById("ui-instrument") as HTMLSelectElement | null;
  if (sel) sel.addEventListener("change", function() {
    setInstrument((sel as HTMLSelectElement).value);
  });
}

/* ── Staff 레벨 표시 옵션 ─────────────────────────────────────────────────── */
export function applyStaffMode(score) {
  if (!score || !score.tracks) return;
  for (var t = 0; t < score.tracks.length; t++) {
    var staves = score.tracks[t].staves || [];
    for (var s = 0; s < staves.length; s++) {
      staves[s].showTablature        = (state.dispMode !== "staff");
      staves[s].showStandardNotation = (state.dispMode !== "tab");
    }
  }
}

// ★ v5.2: 음역 밖 노트(XML에서 괄호 notehead → isGhost=true) 색상 구별
//   tie 괄호 프렛은 기본색 유지 → 빨간색 = 음역 밖으로 즉시 식별
// out of range = red warning (designer D011); edited, not yet applied = Live orange
var OOR_COLOR = "#e05252", OOR_COLOR_LIGHT = "#c62828";
const INS_COLOR = "#c084fc", INS_COLOR_LIGHT = "#7c3aed";
export function colorizeOutOfRange(score) {
  try {
    var col = alphaTab.model.Color.fromJson(state.isLight ? OOR_COLOR_LIGHT : OOR_COLOR);
    var NS  = alphaTab.model.NoteSubElement;
    score.tracks.forEach(function(t) {
      (t.staves || []).forEach(function(st) {
        (st.bars || []).forEach(function(bar) {
          (bar.voices || []).forEach(function(v) {
            (v.beats || []).forEach(function(bt) {
              (bt.notes || []).forEach(function(n) {
                var dirty = false, ins = false;
                if (state.curTrack && Array.isArray(state.curTrack.notes)) {
                  var bp: number | null = null; try { bp = (bar.masterBar.start + bt.playbackStart) / 960; } catch(e) {}
                  var pitch = n.realValue !== undefined ? n.realValue : n.displayValue;
                  var at = function(tn, tol) { return (bp === null || Math.abs(tn.b-bp)<tol) && tn.p === pitch; };
                  dirty = state.curTrack.notes.some(function(tn) { return tn.dirty && at(tn, 0.03); });
                  // notes from the Insert panel: violet until Apply (design D019); a strum spreads its
                  // strings up to ~0.1 beat after the beat the score shows them on
                  ins = !dirty && state.curTrack.notes.some(function(tn) { return tn.ins && (bp === null || tn.b >= bp - 0.03) && at(tn, 0.13); });
                }
                if (!n.isGhost && !dirty && !ins) return;
                var style = new alphaTab.model.NoteStyle();
                var useColor = dirty ? alphaTab.model.Color.fromJson("#ff764d") : ins ? alphaTab.model.Color.fromJson(state.isLight ? INS_COLOR_LIGHT : INS_COLOR) : col;
                // inserted chords: violet TAB numbers only, stacked violet note heads read as one blob (D020)
                if (!(ins && (bt.notes || []).length > 2)) style.colors.set(NS.StandardNotationNoteHead, useColor);
                style.colors.set(NS.GuitarTabFretNumber, useColor);
                n.style = style;
              });
            });
          });
        });
      });
    });
  } catch(e: any) { log("colorize: " + (e.message || e)); }
}

/* ── createApi ────────────────────────────────────────────────────────────── */
export function createApi() {
  var el = document.getElementById("alphaTab")!;
  if (!(el as any).__dragBound) { (el as any).__dragBound = true; bindDragSelection(el); }
  if (state.api) {
    try { if (state.api.destroy) state.api.destroy(); } catch(e) {}
    state.api = null;
    el.innerHTML = "";
  }

   hideAlphaTabNotice();   // no "rendered by alphaTab" line under the score
   state.api = new alphaTab.AlphaTabApi(el, {
    core: {
      engine: "svg", useWorkers: false,
      // ★ file:// 격리 환경: fontDirectory 대신 Base64 Data URL을 직접 주입
      fontDirectory: null,
      smuflFontSources: new Map([
        [alphaTab.FontFileFormat.OpenType, bravuraFontUrl]
      ]),
      includeNoteBounds: true   // ★ v4: noteMouseDown(단일 노트 클릭) 활성화
    },
    display: {
      layoutMode: 0,
      scale: 1.2,
      stretchForce: 1.0,
      // ★ v3: 오선/마디선은 어둡게(배경), 음표/TAB 숫자는 밝게 → 가독성↑
      resources: getAtRes()

    },
    // ScriptProcessor output: the AudioWorklet output needs a separate script file,
    // which a single-file page in Live's modal cannot provide.
    player: { playerMode: alphaTab.PlayerMode.EnabledSynthesizer, outputMode: alphaTab.PlayerOutputMode.WebAudioScriptProcessor, enableCursor: true, enableUserInteraction: true }
  });

  var api = state.api;
  api.error.on(function(e) {
    log("AlphaTab error: " + (e.message || JSON.stringify(e)));
    state.playing = false;
    var btn = document.getElementById("btn-play");
    if (btn) { btn.innerHTML = "&#9654; Play"; btn.classList.remove("on"); }
    status("Error");
  });

  api.scoreLoaded.on(function(score) {
    hideChordDiagrams(score);
    numberEveryFourBars(score);
    applyStaffMode(score);
    colorizeOutOfRange(score);   // ★ 음역 밖 노트 빨간색, 편집한 노트 주황
    applyTechniquesToScore(score); // let ring, palm mute, hammer, slide, dead, vibrato
    log("Score loaded (" + state.dispMode + ")");
    status("Ready");
  });

  api.postRenderFinished.on(function() {
    log("Render complete (" + Math.round(performance.now()) + " ms after page start)");
    try { rebuildSlotsFromApi(); ensureCursor(); if (window.__editKeys && window.__editKeys.updateEditUi) { /* sync selection */ } } catch(e) {}
    try { if (window.__editKeys && (window.__editKeys as any).selectIndex === undefined) {} } catch(e) {}
    try {
      // sync selection to cursor after render
      // sync a single selection to the cursor; keep a range selection (several notes) as it is
      const sel = state.selectedNoteIndices || [], count = state.curTrack ? state.curTrack.notes.length : 0;
      if (!(sel.length > 1 && sel.every(function(i: number) { return i >= 0 && i < count; }))) {
        const hit = noteAtCursor();
        state.selectedNoteIndices = hit ? [hit.index] : [];
      }
      overlaySelectedNotes();
    } catch(e) {}
    try { drawLoopOverlay(); } catch(e) {}
    try { drawAnalysisOverlay(); } catch(e) {}
    try { refreshAnalysisUi(); } catch(e) {}
  });
  api.soundFontLoaded.on(function() { log("Soundfont loaded"); });
  if (api.playerReady) api.playerReady.on(function() { log("Player ready"); });
  // Feed the inlined soundfont directly (no network / file URL needed in Live's modal).
  loadSoundFont(api);
  // soundFontLoadFailed lives on the synth (api.player), not on the API itself
  var synth = api.player;
  if (synth && synth.soundFontLoadFailed) synth.soundFontLoadFailed.on(function(e) { log("Soundfont load failed: " + ((e && e.message) || e)); });

  let lastMouse: { x: number; y: number } | null = null;
  const trackMouse = (ev: Event) => {
    const r = el.getBoundingClientRect(), m = ev as MouseEvent;
    lastMouse = { x: m.clientX - r.left, y: m.clientY - r.top };
  };
  el.addEventListener("mousemove", trackMouse);
  el.addEventListener("mousedown", trackMouse, true);

  function beatPosOf(beat: any): number | null {
    try { return (beat.voice.bar.masterBar.start + beat.playbackStart) / 960; } catch { return null; }
  }
  function setCursorAtBeat(beat: any, keepString = true) {
    const b = beatPosOf(beat); if (b == null) return;
    const c = ensureCursor();
    const s = keepString && c ? c.s : 1;
    setCursor(b, s);
    state.selectionAnchor = b;
    if (window.__editKeys) {
      const hit = noteAtCursor();
      if (hit) state.selectedNoteIndices = [hit.index]; else state.selectedNoteIndices = [];
    } else {
      const hit = noteAtCursor();
      state.selectedNoteIndices = hit ? [hit.index] : [];
    }
    overlaySelectedNotes();
  }

  api.beatMouseDown.on(function(beat: any) {
    if (!beat) return;
    if (isDragSelecting() || consumeRecentDrag()) return;
    const b = beatPosOf(beat); if (b == null) return;
    // try to detect string from last mouse y on tab staff
    let sPick: number | null = null;
    try {
      // only when the TAB line is shown; the mouse y is taken relative to the score element
      if (lastMouse && isDrumTrack(state.curTrack)) sPick = laneAtY(b, lastMouse.y) || null;   // drum lane from the click height
      else if (lastMouse && state.dispMode !== "staff") sPick = stringAtY(tabBarBoundsAt(b), lastMouse.y);
    } catch {}
    if (sPick != null) { setCursor(b, sPick); state.selectionAnchor = b; state.selectedNoteIndices = noteAtCursor() ? [noteAtCursor()!.index] : []; }
    else { setCursorAtBeat(beat, true); }
    try { overlaySelectedNotes(); } catch {}
  });

  if (api.noteMouseDown) {
    api.noteMouseDown.on(function(note: any) {
      if (!note) return;
      if (isDragSelecting() || consumeRecentDrag()) return;
      if (isDrumTrack(state.curTrack)) {   // drum hit: cursor to its beat and lane
        const row = laneOfNote(note), bt = note.beat;
        let bd: number | null = null;
        try { bd = (bt.voice.bar.masterBar.start + bt.playbackStart) / 960; } catch {}
        if (row > 0 && bd != null) setTimeout(function() { (window.__editKeys as any)?.setCursor?.(bd, row); }, 20);
        return;
      }
      const f = note.fret, sRaw = note.string;
      if (f === undefined || sRaw === undefined || sRaw <= 0) return;
      const nStrings = getStringCount();
      const ourStr = (nStrings + 1) - sRaw;
      let bp: number | null = null;
      try { const bt = note.beat; if (bt && bt.playbackStart !== undefined && bt.voice && bt.voice.bar && bt.voice.bar.masterBar) bp = (bt.voice.bar.masterBar.start + bt.playbackStart) / 960; } catch {}
      setTimeout(function() {
        if (bp == null) return;
        // prefer exact note index match
        const nStrings2 = getStringCount();
        const realF = f + state.uiCapo;
        const pitch = (getOpenStrings()[ourStr] || 40) + realF;
        const idx = matchTrackNote(realF, ourStr, pitch, bp, null);
        if (idx >= 0 && window.__editKeys) (window.__editKeys as any).selectIndex(idx);
        else { setCursor(bp, ourStr); state.selectionAnchor = bp; state.selectedNoteIndices = noteAtCursor() ? [noteAtCursor()!.index] : []; }
        try { overlaySelectedNotes(); } catch {}
      }, 20);
    });
  }
}

/* ── XML 로딩 (ArrayBuffer 필수) ──────────────────────────────────────────── */
export function loadXmlIntoApi(targetApi, xmlStr) {
  if (!xmlStr || !targetApi) return false;
  try {
    var encoded = new TextEncoder().encode(xmlStr);
    targetApi.load(encoded.buffer);
    return true;
  } catch(e: any) {
    log("XML load error: " + (e.message || e));
    return false;
  }
}

/** Key signature of the score: the clip's fixed key, else Live's scale (when Scale Mode is on), else detected. */
export function scoreKey(trk: any) {
  const k = trk && trk.ann && trk.ann.key;
  if (k) return { fifths: k.fifths, mode: k.minor ? "minor" : "major" } as any;
  return (trk && trk.live && trk.live.scale && trk.live.scale.enabled)
    ? (keyFromLiveScale(trk.live.scale.root, trk.live.scale.name) || undefined)
    : undefined;
}
/** Title printed above the score (and in the PDF): the user's title, else the tab name. */
export function scoreTitle(trk: any): string | undefined {
  if (!trk) return undefined;
  return (trk.ann && trk.ann.title) || trk.name || undefined;
}
/**
 * Bar numbers on bars 1, 5, 9, ... only (every four bars), on screen and in the PDF.
 * Also hides the vertical track label left of the staff: alphaTab cuts it to 10 characters ("TT drums r"), and
 * every score here is one track whose name is already the title (designer D012).
 */
export function numberEveryFourBars(score: any) {
  try { if (score.stylesheet) score.stylesheet.singleTrackTrackNamePolicy = 0; } catch (e) {}   // TrackNamePolicy.Hidden
  try {
    for (const t of score.tracks || []) for (const st of t.staves || []) for (const bar of st.bars || []) {
      // alphaTab BarNumberDisplay: 0 = AllBars (show), 2 = Hide
      bar.barNumberDisplay = bar.index % 4 === 0 ? 0 : 2;
    }
  } catch (e) {}
}
/** Chord names only: alphaTab would also draw an empty chord diagram for every chord. */
export function hideChordDiagrams(score: any) {
  try {
    for (const t of score.tracks || []) for (const st of t.staves || []) {
      const chords = st.chords; if (!chords) continue;
      const list = typeof chords.values === "function" ? Array.from(chords.values()) : Object.values(chords);
      for (const c of list as any[]) if (c) c.showDiagram = false;
    }
  } catch (e) {}
}

export function getXmlForMode(track) {
  if (!track) return "";
  return track.musicXml || track.musicXmlBoth || track.musicXmlStaff || "";
}

/* ── 웹뷰 내 XML 재생성 (Quantize / Transpose / Capo / 줄옮김 반영) ───────── */
export function rebuildScore() {
  if (isDrumTrack(state.curTrack)) { rebuildDrumScore(); return; }   // drum mode: ui/src/drums.ts
  if (!state.curTrack || !Array.isArray(state.curTrack.notes) || state.curTrack.notes.length === 0) {
    renderScore(); return;
  }

    var bpm = state.curTrack.bpm || state.curTrack.tempo;

    // ✅ XML에서 BPM 추출
    if (!bpm && state.curTrack.musicXml) {
      var m = state.curTrack.musicXml.match(/tempo="(\d+)"/);
      if (m) bpm = Number(m[1]);
    }

    // ✅ fallback
    if (!bpm) bpm = 120;




  clearNoteOverlays();   // 재렌더 시 기존 좌표 무효
  try {
    var xml = toMusicXml(state.curTrack.notes, bpm, {
      instrument:  state.curTrack.instrument || undefined,
      skipVoicing: true,
      transpose:   state.uiTranspose,
      capo:        state.uiCapo,
      cues:        state.curTrack.live && state.curTrack.live.cues,
      timeSig:     state.uiTimeSig || state.curTrack.timeSig,
      quantize:    state.uiQuantize === "auto" ? undefined : (state.uiQuantize as any),  // ★ v3
      key:         scoreKey(state.curTrack),
      chords:      (state.curTrack.ann && state.curTrack.ann.chords) || undefined,
      lyrics:      (state.curTrack.ann && state.curTrack.ann.lyrics) || undefined,
      title:       scoreTitle(state.curTrack),
    });
    state.curTrack.musicXml = xml;
    if (!state.api) createApi();
    status("Rendering…");
    if (loadXmlIntoApi(state.api, xml)) {
      log("Rebuilt: q=" + (state.uiQuantize === "auto" ? "auto" : "1/" + state.uiQuantize) +
          " trans=" + state.uiTranspose + " capo=" + state.uiCapo);
      // ★ 음역 밖 노트 안내
      var hi = 0, lo = 0;
      for (var oi = 0; oi < state.curTrack.notes.length; oi++) {
        var on = state.curTrack.notes[oi];
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
  } catch(e: any) {
    log("Rebuild error: " + (e.message || e));
  }
}

/* ── 컨트롤 바인딩: Transpose / Capo / Quantize ──────────────────────────── */
export function bindControls() {
  var t = document.getElementById("ui-transpose") as HTMLInputElement | null;
  var c = document.getElementById("ui-capo") as HTMLInputElement | null;
  var q = document.getElementById("ui-quantize") as HTMLSelectElement | null;
  var ts = document.getElementById("ui-timesig") as HTMLSelectElement | null;
  if (ts) ts.addEventListener("change", function() { var a=ts!.value.split("/"); state.uiTimeSig={beats:Number(a[0]),type:Number(a[1])}; rebuildScore(); });
  function onPitchChange() {
    state.uiTranspose = parseInt((t && t.value) || "0", 10) || 0;
    state.uiCapo      = Math.max(0, parseInt((c && c.value) || "0", 10) || 0);
    if (state.rebuildTimer) clearTimeout(state.rebuildTimer);
    state.rebuildTimer = setTimeout(rebuildScore, 350);
  }
  if (t) t.addEventListener("input", onPitchChange);
  if (c) c.addEventListener("input", onPitchChange);
  if (q) q.addEventListener("change", function() {
    state.uiQuantize = q!.value === "auto" ? "auto" : (parseInt(q!.value, 10) || 16);
    rebuildScore();
  });
}

/* ── renderScore (payload XML fallback) ──────────────────────────────────── */
export function renderScore() {
  if (!state.curTrack) return;
  createApi();
  var xmlStr = getXmlForMode(state.curTrack);
  if (!xmlStr) { log("No MusicXML data"); status("No data"); return; }
  status("Rendering…");
  if (loadXmlIntoApi(state.api, xmlStr)) {
    log("XML loaded (" + xmlStr.length + " chars)");
  }
}

export function refingerNotes() {
  if (!state.curTrack || !Array.isArray(state.curTrack.notes)) return;
  var preset = state.curTrack.instrument || GUITAR_6;
  state.curTrack.notes = applyGuitarVoicing(
    state.curTrack.notes.map(function(n) { var c = Object.assign({}, n); delete c.lock; return c; }),
    preset
  );
  state.sessionChanged = true;
  clearNoteOverlays();
  clearFretboard();
  showSelection(null);
  state.selectedNoteIndices = [];
  renderInspector(state.curTrack);
  rebuildScore();
  log("Re-fingered");
}

/* ── View Mode 전환 ───────────────────────────────────────────────────────── */
export function setMode(mode) {
  state.dispMode = mode;
  document.querySelectorAll(".sb").forEach(function(b) { b.classList.remove("on"); });
  var btn = document.getElementById("m-" + mode);
  if (btn) btn.classList.add("on");
  clearNoteOverlays();
  if (state.api && state.api.score) {
    applyStaffMode(state.api.score);
    state.api.render();
  } else {
    renderScore();
  }
}
