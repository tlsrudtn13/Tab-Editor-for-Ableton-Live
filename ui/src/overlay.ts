// @ts-nocheck
import { state } from "./state";
import { clearFretboard } from "./fretboard";
import { detectChord, pitchToName } from "./musicUi";

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 악보 위 선택 노트 강조 오버레이
   boundsLookup(includeNoteBounds:true)으로 노트 머리 좌표를 얻어
   #alphaTab 위에 주황 박스를 그립니다. 화음 전체/단일 노트를 시각 구분.
   ═══════════════════════════════════════════════════════════════════════════ */
export function clearNoteOverlays() {
  document.querySelectorAll(".note-sel-overlay").forEach(function(el) { el.remove(); });
}

export function drawNoteOverlay(b, isSingle) {
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
export function collectNoteBounds(beat) {
  var out = [];
  try {
    var bl = (state.api && state.api.renderer) ? state.api.renderer.boundsLookup : null;
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

export function overlayBeatNotes(beat) {
  var nbs = collectNoteBounds(beat);
  for (var i = 0; i < nbs.length; i++) drawNoteOverlay(nbs[i].noteHeadBounds, false);
}

export function overlayOneNote(alphaTabNote) {
  if (!alphaTabNote) return;
  var nbs = collectNoteBounds(alphaTabNote.beat);
  for (var i = 0; i < nbs.length; i++) {
    if (nbs[i].note === alphaTabNote) drawNoteOverlay(nbs[i].noteHeadBounds, true);
  }
}

// Draw cyan boxes over the currently selected track notes (staff + TAB).
export function overlaySelectedNotes() {
  clearNoteOverlays();
  if (!state.selectedNoteIndices || state.selectedNoteIndices.length === 0) return;
  if (!state.curTrack || !state.api) return;
  var notes = state.curTrack.notes || [];
  var sel = state.selectedNoteIndices.map(function(i) { return notes[i]; }).filter(Boolean);
  if (sel.length === 0) return;
  var bl = state.api.renderer ? state.api.renderer.boundsLookup : null;
  if (!bl || !bl.staffSystems) return;
  var nS = (state.curTrack.instrument && typeof state.curTrack.instrument.stringCount === "number")
    ? state.curTrack.instrument.stringCount : 6;
  var capo = state.uiCapo || 0;
  for (var si = 0; si < bl.staffSystems.length; si++) {
    var sys = bl.staffSystems[si];
    var mbs = sys.bars || sys.masterBarBounds || [];
    for (var mi = 0; mi < mbs.length; mi++) {
      var bars = mbs[mi].bars || [];
      for (var bi = 0; bi < bars.length; bi++) {
        var bar = bars[bi];
        var beats = bar.beats || [];
        for (var ti = 0; ti < beats.length; ti++) {
          var beat = beats[ti];
          var bp = null;
          try { if (bar.masterBar && beat.playbackStart !== undefined) bp = (bar.masterBar.start + beat.playbackStart) / 960; } catch(e) {}
          var nbs = beat.notes || [];
          for (var ni = 0; ni < nbs.length; ni++) {
            var an = nbs[ni].note;
            if (!an) continue;
            var matched = false;
            for (var k = 0; k < sel.length; k++) {
              var tn = sel[k];
              // beat position gate
              if (bp !== null && tn.b !== undefined && Math.abs(tn.b - bp) > 0.03) continue;
              // precise fret/string
              if (an.fret !== undefined && an.string !== undefined && tn.f !== undefined && tn.s !== undefined) {
                if (an.string === nS + 1 - tn.s && an.fret === tn.f - capo) { matched = true; break; }
              }
              // pitch fallback
              if (!matched) {
                var pitch = (an.realValue !== undefined) ? an.realValue : an.displayValue;
                if (pitch !== undefined && tn.p !== undefined && pitch === tn.p) { matched = true; break; }
              }
            }
            if (matched) drawNoteOverlay(nbs[ni].noteHeadBounds, true);
          }
        }
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 트랙 노트 매칭 — f/s 우선, 실패 시 피치 매칭(quantize 병합으로
   resolveStringCollisions 가 줄을 재배치한 노트 대응), bp 로 가장 가까운 노트 선택
   ═══════════════════════════════════════════════════════════════════════════ */
export function matchTrackNote(realF, ourStr, pitch, bp, excludeSet) {
  var notes = (state.curTrack && Array.isArray(state.curTrack.notes)) ? state.curTrack.notes : [];
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

/* ── 선택 정보 일괄 표시 ──────────────────────────────────────────────────── */
export function showSelection(noteList, isSingle) {
  var noteDisp  = document.getElementById("inspector-note-display");
  var chordDisp = document.getElementById("inspector-chord-display");
  var has = !!(noteList && noteList.length);
  document.querySelectorAll("#selection-bar .btn").forEach(function(b) { b.classList.toggle("idle", !has); });
  if (!has) {
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
