import { state } from "./state";
import { log, status } from "./log";
import { clearFretboard, getOpenStrings, getStringCount, lightFret, lightBar } from "./fretboard";
import { showSelection } from "./overlay";
import { rebuildScore } from "./score";
import { renderInspector } from "./inspector";
import { saveUndo, updateEditUi } from "./keys";
import { detectQuantizeGrid } from "../../src/notation/music.js";

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v4] 노트 길이 편집 — Dur −/+ (grid 단위 증감) / ⟶Next (다음 노트까지 연장)
   "⟶Next" = 기타프로의 let-ring 대용: 선택 노트를 다음 노트 머리까지 늘리면
   tie 엔진이 마디/박자 경계에서 자동으로 붙임줄을 생성하고 쉼표가 사라집니다.
   ═══════════════════════════════════════════════════════════════════════════ */
function durLabel(beats: number) {
  if (Math.abs(beats - 4) < 1e-6) return "1/1";
  if (Math.abs(beats - 2) < 1e-6) return "1/2";
  if (Math.abs(beats - 1) < 1e-6) return "1/4";
  if (Math.abs(beats - 0.5) < 1e-6) return "1/8";
  if (Math.abs(beats - 0.25) < 1e-6) return "1/16";
  if (Math.abs(beats - 0.125) < 1e-6) return "1/32";
  if (Math.abs(beats - 1/3) < 1e-6) return "1/8T";
  if (Math.abs(beats - 1/6) < 1e-6) return "1/16T";
  return beats.toFixed(3) + "b";
}

export function adjustDuration(mode) {
  if (!state.curTrack || !state.curTrack.edit) return;
  if (!state.curTrack || state.selectedNoteIndices.length === 0) {
    log("Dur: 먼저 노트를 선택하세요 (TAB 번호 클릭 = 단일 선택)");
    status("Select a note first"); return;
  }
  var notes = state.curTrack.notes;
  var grid = state.uiQuantize === "auto" ? detectQuantizeGrid(notes) : (state.uiQuantize as number);
  var unit  = 4 / (grid || 16);  // grid 1단위(박)
  var changed = 0;
  var before = notes.map(function(n) { return Object.assign({}, n); });
  var lastLabel = "";

  for (var i = 0; i < state.selectedNoteIndices.length; i++) {
    var n = notes[state.selectedNoteIndices[i]];
    if (!n) continue;

    // The toolbar's "Auto" button sends "Auto"; it used to fall through to
    // the shorten branch below.
    if (mode === "next" || mode === "Auto") {
      // 이 노트 뒤에서 가장 가까운 onset 까지 연장 (let-ring 스타일)
      var next = Infinity;
      for (var k = 0; k < notes.length; k++) {
        var o = notes[k];
        if ((o.b || 0) > (n.b || 0) + 0.001 && o.b < next) next = o.b;
      }
      if (next !== Infinity && next - n.b > n.d) { var od = n.d; n.d = next - n.b; n.de = true; changed++; lastLabel = durLabel(od) + " → " + durLabel(n.d); }
      else log("Dur: 이미 다음 노트에 닿아 있음");
    } else {
      var delta = (mode === "+1") ? unit : -unit;
      var nd = Math.max(unit, (n.d || unit) + delta);
      if (Math.abs(nd - n.d) > 0.001) { var od2 = n.d; n.d = nd; n.de = true; changed++; lastLabel = durLabel(od2) + " → " + durLabel(n.d); }
    }
  }

  if (changed > 0) {
    saveUndo(before);
    for (var di = 0; di < state.selectedNoteIndices.length; di++) {
      var dn = notes[state.selectedNoteIndices[di]]; if (dn && dn.oid !== undefined) dn.dirty = true;
    }
    updateEditUi();
    log("Duration " + (mode === "next" || mode === "Auto" ?"⟶ next note" : mode) +
        " (" + changed + " note(s))");
    status("Duration: " + (lastLabel || ((mode === "next" || mode === "Auto") ? "⟶ next" : mode)));
    rebuildScore();
    renderInspector(state.curTrack);
    // 선택 유지 점등 (highlight via keys state is enough on rebuild, but keep consistent)
    clearFretboard();
    var sel: any[] = [];
    var selNotes = state.selectedNoteIndices.map(function(ii){ return notes[ii]; }).filter(Boolean);
    if (selNotes.length === 1) {
      var s0 = selNotes[0];
      notes.forEach(function(n:any){ if (Math.abs((n.b||0)-(s0.b||0)) < 1e-3) lightFret(n.s,n.f,undefined,{beat:true,p:n.p}); });
      lightFret(s0.s,s0.f,undefined,{p:s0.p});
    } else {
      selNotes.forEach(function(n:any){ lightFret(n.s,n.f,undefined,{p:n.p}); });
    }
    if (selNotes.length) lightBar(selNotes[0].b);
    for (var i = 0; i < selNotes.length; i++) { var sn = selNotes[i]; if (sn) sel.push({ f: sn.f, s: sn.s, p: sn.p }); }
    showSelection(sel, sel.length === 1);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ★ [v3] TAB 줄옮김 — 선택 노트를 인접 줄로 이동 (피치 유지, fret 재계산)
   dir: -1 = 얇은 줄(▲, 줄번호 감소) / +1 = 굵은 줄(▼, 줄번호 증가)
   검증: 줄 범위, fret 0~24, 같은 박자 같은 줄 충돌
   ═══════════════════════════════════════════════════════════════════════════ */
export function moveString(dir) {
  if (!state.curTrack || !state.curTrack.edit) return;
  if (!state.curTrack || state.selectedNoteIndices.length === 0) {
    log("Move: 먼저 악보에서 노트를 클릭해 선택하세요");
    status("Select a note first"); return;
  }
  if (state.uiTranspose !== 0) {
    log("Move: Trans 를 0 으로 되돌린 후 사용하세요 (transpose 는 자동 재보이싱됨)");
    status("Set Trans=0 first"); return;
  }
  var OPEN = getOpenStrings(), nS = getStringCount();
  var moved = 0;
  var before = state.curTrack.notes.map(function(n) { return Object.assign({}, n); });

  for (var i = 0; i < state.selectedNoteIndices.length; i++) {
    var idx = state.selectedNoteIndices[i];
    var n = state.curTrack.notes[idx];
    if (!n) continue;
    if (n.s < 1 || n.f < 0) continue;   // 음역 밖 노트는 줄옮김 불가
    var ns2 = n.s + dir;
    if (ns2 < 1 || ns2 > nS) continue;                 // 줄 범위 밖
    var open = OPEN[ns2];
    if (typeof open !== "number") continue;
    var nf = n.p - open;
    if (nf < 0 || nf > 24) continue;                   // 프렛 범위 밖
    var clash = false;                                  // 같은 박자·줄 충돌
    for (var k = 0; k < state.curTrack.notes.length; k++) {
      if (k === idx) continue;
      var o = state.curTrack.notes[k];
      if (Math.abs((o.b || 0) - (n.b || 0)) < 0.01 && o.s === ns2) { clash = true; break; }
    }
    if (clash) continue;
    n.s = ns2; n.f = nf; n.lock = true; moved++;
  }

  if (moved > 0) {
    saveUndo(before);
    updateEditUi();
    log("Moved " + moved + " note(s) " + (dir < 0 ? "▲ thinner" : "▼ thicker"));
    rebuildScore();
    renderInspector(state.curTrack);
    // 새 위치 다시 점등
    clearFretboard();
    var sel: any[] = [];
    for (var i = 0; i < state.selectedNoteIndices.length; i++) {
      var n = state.curTrack.notes[state.selectedNoteIndices[i]];
      if (n) { lightFret(n.s, n.f); sel.push({ f: n.f, s: n.s, p: n.p }); }
    }
    if (sel.length) lightBar(state.curTrack.notes[state.selectedNoteIndices[0]].b);
    showSelection(sel);
  } else {
    log("Move: 이동 불가 (범위 밖 또는 줄 충돌)");
    status("Move blocked");
  }
}
