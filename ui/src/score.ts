// @ts-nocheck
import * as alphaTab from "@coderline/alphatab";
import bravuraFontUrl from "@alphatab-font/Bravura.otf?inline";
import { toMusicXml } from "../../src/notation/toMusicXml.js";
import { applyGuitarVoicing } from "../../src/notation/voicing.js";
import {
  GUITAR_6, GUITAR_7, GUITAR_8, GUITAR_12,
  BASS_4, BASS_5, BASS_6
} from "../../src/notation/instruments.js";
import { state } from "./state";
import { log, status } from "./log";
import { getAtRes } from "./theme";
import { buildFretboard, clearFretboard, getOpenStrings, getStringCount, lightFret, updateScaleOverlay } from "./fretboard";
import { clearNoteOverlays, matchTrackNote, overlayBeatNotes, overlayOneNote, showSelection } from "./overlay";
import { renderInspector } from "./inspector";
import { pitchToName } from "./musicUi";

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
  "bass6":    BASS_6
};

export function instrumentKeyOf(instr) {
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
  var sel = document.getElementById("ui-instrument");
  if (sel) sel.addEventListener("change", function() {
    setInstrument(sel.value);
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
//   tie 괄호 프렛은 기본색 유지 → 노란색 = 음역 밖으로 즉시 식별
var OOR_COLOR = "#e5c07b";
export function colorizeOutOfRange(score) {
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
export function createApi() {
  var el = document.getElementById("alphaTab");
  if (state.api) {
    try { if (state.api.destroy) state.api.destroy(); } catch(e) {}
    state.api = null;
    el.innerHTML = "";
  }

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
    player: { enablePlayer: true, enableCursor: true, enableUserInteraction: true }
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
    applyStaffMode(score);
    colorizeOutOfRange(score);   // ★ 음역 밖 노트 노란색
    log("Score loaded (" + state.dispMode + ")");
    status("Ready");
  });

  api.postRenderFinished.on(function() { log("Render complete"); });

  // ── beatMouseDown: 클릭 → 화음 표시 + 코드 분석 + ★줄옮김용 선택 ────────
  api.beatMouseDown.on(function(beat) {
    if (!beat) return;
    clearFretboard();
    clearNoteOverlays();
    overlayBeatNotes(beat);          // ★ v5: 화음 전체 주황 박스
    state.selectedNoteIndices = [];

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
          var realF  = sn.fret + state.uiCapo;            // 악보 표기 fret + capo = 실제 fret
          var pitch  = (OPEN[ourStr] || 40) + realF;
          lightFret(ourStr, realF);
          highlightedNotes.push({ f: realF, s: ourStr, p: pitch });
        } else {
          var midiPitch = (sn.realValue !== undefined) ? sn.realValue
                        : (sn.displayValue !== undefined) ? sn.displayValue : -1;
          if (midiPitch < 0) continue;
          if (state.curTrack && Array.isArray(state.curTrack.notes)) {
            for (var k = 0; k < state.curTrack.notes.length; k++) {
              var tn = state.curTrack.notes[k];
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
    if (highlightedNotes.length > 0 && state.curTrack) {
      var notes = Array.isArray(state.curTrack.notes) ? state.curTrack.notes : [];
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
          state.selectedNoteIndices.push(found);
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
      var realF    = f + state.uiCapo;                    // capo 보정
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
        state.selectedNoteIndices = [idx];
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

/* ── XML 로딩 (ArrayBuffer 필수) ──────────────────────────────────────────── */
export function loadXmlIntoApi(targetApi, xmlStr) {
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

export function getXmlForMode(track) {
  if (!track) return "";
  return track.musicXml || track.musicXmlBoth || track.musicXmlStaff || "";
}

/* ── 웹뷰 내 XML 재생성 (Quantize / Transpose / Capo / 줄옮김 반영) ───────── */
export function rebuildScore() {
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
      cues:        state.curTrack.live && state.curTrack.live.cues,   // Live locators → rehearsal marks
      quantize:    state.uiQuantize === "auto" ? undefined : state.uiQuantize  // ★ v3
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
  } catch(e) {
    log("Rebuild error: " + (e.message || e));
  }
}

/* ── 컨트롤 바인딩: Transpose / Capo / Quantize ──────────────────────────── */
export function bindControls() {
  var t = document.getElementById("ui-transpose");
  var c = document.getElementById("ui-capo");
  var q = document.getElementById("ui-quantize");
  function onPitchChange() {
    state.uiTranspose = parseInt((t && t.value) || "0", 10) || 0;
    state.uiCapo      = Math.max(0, parseInt((c && c.value) || "0", 10) || 0);
    clearTimeout(state.rebuildTimer);
    state.rebuildTimer = setTimeout(rebuildScore, 350);
  }
  if (t) t.addEventListener("input", onPitchChange);
  if (c) c.addEventListener("input", onPitchChange);
  if (q) q.addEventListener("change", function() {
    state.uiQuantize = q.value === "auto" ? "auto" : (parseInt(q.value, 10) || 16);
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
