import { state } from "./state";
import { clearFretboard } from "./fretboard";
import { detectChord, pitchToName } from "./musicUi";
import { updateTechPalette } from "./techUi";
import { getStringCount } from "./fretboard";
import { slotAt } from "./cursor";
import { drumHooks } from "./drumHooks";

/* ════════════════════════════════════════════════════════════════════════════
   악보 위 선택 노트 / 커서 강조 오버레이
   ═══════════════════════════════════════════════════════════════════════════ */
export function clearNoteOverlays() {
  document.querySelectorAll(".note-sel-overlay, .cursor-overlay").forEach(function(el) { el.remove(); });
}

export function drawNoteOverlay(b: any, isSingle?: boolean) {
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
export function collectNoteBounds(beat: any): any[] {
  var out: any[] = [];
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
  } catch(e: any) {}
  return out;
}

export function findBeatBoundsAt(bTarget: number): { beat: any; bounds: any; barBounds: any } | null {
  try {
    const bl = state.api && state.api.renderer ? state.api.renderer.boundsLookup : null;
    if (!bl || !bl.staffSystems) return null;
    for (let si = 0; si < bl.staffSystems.length; si++) {
      const mbs = bl.staffSystems[si].bars || [];
      for (let mi = 0; mi < mbs.length; mi++) {
        const bars = mbs[mi].bars || [];
        for (let bi = 0; bi < bars.length; bi++) {
          const bar = bars[bi];
          const beats = bar.beats || [];
          for (let ti = 0; ti < beats.length; ti++) {
            const bb = beats[ti];
            let bp: number | null = null;
            try {
              const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
              const mBeat = bb.beat || bb;
              if (mBar && mBeat.playbackStart !== undefined) bp = (mBar.start + mBeat.playbackStart) / 960;
            } catch {}
            if (bp !== null && Math.abs(bp - bTarget) < 0.03) return { beat: bb.beat || bb, bounds: bb, barBounds: bar };
          }
        }
      }
    }
  } catch {}
  return null;
}

function findTabStaffBarForBeat(bTarget: number): any | null {
  try {
    const bl = state.api && state.api.renderer ? state.api.renderer.boundsLookup : null;
    if (!bl || !bl.staffSystems) return null;
    for (let si = 0; si < bl.staffSystems.length; si++) {
      const mbs = bl.staffSystems[si].bars || [];
      for (let mi = 0; mi < mbs.length; mi++) {
        const bars = mbs[mi].bars || [];
        for (let bi = 0; bi < bars.length; bi++) {
          const bar = bars[bi];
          const beats = bar.beats || [];
          for (let ti = 0; ti < beats.length; ti++) {
            const bb = beats[ti];
            let bp: number | null = null;
            try {
              const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
              const mBeat = bb.beat || bb;
              if (mBar && mBeat.playbackStart !== undefined) bp = (mBar.start + mBeat.playbackStart) / 960;
            } catch {}
            if (bp !== null && Math.abs(bp - bTarget) < 0.03) {
              // Prefer a bar/staff that shows tablature (tab staff)
              const st = bar.bar && bar.bar.staff ? bar.bar.staff : null;
              if (st && st.showTablature) return bar;
              if (!findTabStaffBarForBeat_any) return bar;
            }
          }
        }
      }
    }
  } catch {}
  return null;
}
let findTabStaffBarForBeat_any = false;

function stringYFor(barBounds: any, s: number): { y: number; h: number } | null {
  try {
    const nS = getStringCount();
    const vb = barBounds && barBounds.visualBounds ? barBounds.visualBounds : null;
    if (!vb) return null;
    const top = vb.y, height = vb.h;
    const spacing = nS > 1 ? height / (nS - 1) : height;
    const y = top + (s - 1) * spacing;
    return { y, h: Math.max(10, spacing * 0.8) };
  } catch {}
  return null;
}

/** Bar bounds of the TAB line for the beat at b (Staff+TAB: the lower of the staff's bar bounds). */
export function tabBarBoundsAt(b: number): any {
  let tabBar: any = null;
  try {
    const bl = state.api && state.api.renderer ? state.api.renderer.boundsLookup : null;
    if (!bl || !bl.staffSystems) return null;
    for (const sys of bl.staffSystems) for (const mb of (sys.bars || [])) for (const bar of (mb.bars || [])) {
      const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
      if (!mBar) continue;
      const hit = (bar.beats || []).some((bb: any) => {
        const beat = bb.beat || bb;
        return beat.playbackStart !== undefined && Math.abs((mBar.start + beat.playbackStart) / 960 - b) < 0.03;
      });
      if (!hit) continue;
      const y = bar.visualBounds ? bar.visualBounds.y : -Infinity;
      if (!tabBar || y > (tabBar.visualBounds ? tabBar.visualBounds.y : -Infinity)) tabBar = bar;
    }
  } catch {}
  return tabBar;
}

/** String (1 = highest) at a y position inside the TAB bar bounds, or null when y is off the TAB lines. */
export function stringAtY(bar: any, y: number): number | null {
  const vb = bar && bar.visualBounds; if (!vb) return null;
  const nS = getStringCount();
  const spacing = nS > 1 ? vb.h / (nS - 1) : vb.h;
  const rel = y - vb.y;
  if (rel < -spacing / 2 || rel > vb.h + spacing / 2) return null;
  return Math.max(1, Math.min(nS, Math.round(rel / spacing) + 1));
}

/** Draw the edit cursor box on the TAB staff at cursor beat/string. */
export function overlayCursor() {
  try {
    if (drumHooks.drawCursor()) return;   // drum staff: lane cursor (ui/src/drums.ts)
    const c = state.cursor; if (!c) return;
    const host = document.getElementById("alphaTab"); if (!host) return;
    const fb = findBeatBoundsAt(c.b);
    if (!fb) return;
    const tabBar = tabBarBoundsAt(c.b);
    const barForY = tabBar || fb.barBounds;
    const sy = stringYFor(barForY, c.s);
    const bb = fb.bounds;
    const vb = bb.visualBounds || bb.realBounds;
    if (!vb || !sy) return;
    const hasNote = !!(state.curTrack && Array.isArray(state.curTrack.notes) && state.curTrack.notes.some((n:any)=> n.s===c.s && Math.abs((n.b||0)-c.b)<1e-6));
    const d = document.createElement("div");
    d.className = "cursor-overlay" + (hasNote ? "" : " empty");
    const w = Math.max(16, (vb.w || 14));
    d.style.left = (vb.x - 2) + "px";
    d.style.top = (sy.y - sy.h/2) + "px";
    d.style.width = (w + 4) + "px";
    d.style.height = Math.max(16, sy.h) + "px";
    d.style.top = (sy.y - Math.max(16, sy.h) / 2) + "px";
    host.appendChild(d);
  } catch {}
}

export function overlayBeatNotes(beat: any) {
  var nbs = collectNoteBounds(beat);
  for (var i = 0; i < nbs.length; i++) drawNoteOverlay(nbs[i].noteHeadBounds, false);
}

export function overlayOneNote(alphaTabNote: any) {
  if (!alphaTabNote) return;
  var nbs = collectNoteBounds(alphaTabNote.beat);
  for (var i = 0; i < nbs.length; i++) {
    if (nbs[i].note === alphaTabNote) drawNoteOverlay(nbs[i].noteHeadBounds, true);
  }
}

// Draw cyan boxes over the currently selected track notes (staff + TAB).
export function overlaySelectedNotes() {
  clearNoteOverlays();
  if (!state.selectedNoteIndices || state.selectedNoteIndices.length === 0) { try { overlayCursor(); } catch {} return; }
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
          var bp: number | null = null;
          // bounds objects wrap the model: BarBounds.bar / BeatBounds.beat hold the positions
          try {
            var mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
            var mBeat = beat.beat || beat;
            if (mBar && mBeat.playbackStart !== undefined) bp = (mBar.start + mBeat.playbackStart) / 960;
          } catch(e) {}
          var nbs = beat.notes || [];
          for (var ni = 0; ni < nbs.length; ni++) {
            var an = nbs[ni].note;
            if (!an) continue;
            var matched = false;
            for (var k = 0; k < sel.length; k++) {
              var tn = sel[k];
              // beat position gate
              if (bp !== null && tn.b !== undefined && Math.abs(tn.b - bp) > 0.03) continue;
              if (drumHooks.noteMatches && state.curTrack && state.curTrack.drum) { if (drumHooks.noteMatches(an, tn)) { matched = true; break; } continue; }
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
  try { overlayCursor(); } catch {}
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v5] 트랙 노트 매칭 — f/s 우선, 실패 시 피치 매칭(quantize 병합으로
   resolveStringCollisions 가 줄을 재배치한 노트 대응), bp 로 가장 가까운 노트 선택
   ═══════════════════════════════════════════════════════════════════════════ */
export function matchTrackNote(realF: any, ourStr: any, pitch: any, bp: any, excludeSet: any) {
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
export function showSelection(noteList: any, isSingle?: boolean) {
  var noteDisp  = document.getElementById("inspector-note-display");
  var chordDisp = document.getElementById("inspector-chord-display");
  var has = !!(noteList && noteList.length);
  try { updateTechPalette(); } catch(e) {}
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
  document.getElementById("fb-note-label")!.textContent = txt;
  var chordName = noteList.length >= 2
    ? detectChord(noteList.map(function(h) { return h.p; })) : "";
  if (chordDisp) chordDisp.textContent = chordName ? "♪  " + chordName : "";
}
