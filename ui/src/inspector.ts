import { state } from "./state";
import { clearFretboard, lightFret } from "./fretboard";
import { showSelection, overlaySelectedNotes } from "./overlay";
import { beatToBarBeat, durToLabel, pitchToName, velToDynamic } from "./musicUi";

/* ── MIDI Inspector ───────────────────────────────────────────────────────── */
export function renderInspector(track) {
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
  document.getElementById("insp-stats")!.textContent =
    arrN + " arr  " + sesN + " ses  total " + notes.length;

  var velEl = document.getElementById("vel-lane")!;
  var vH = "";
  for (var i = 0; i < notes.length; i++) {
    var vel = nf(notes[i], "v", "velocity", 100);
    var hh  = Math.max(4, Math.round((vel / 127) * 28));
    var op  = (0.3 + (vel / 127) * 0.7).toFixed(2);
    vH += '<div class="vb" style="height:' + hh + 'px;opacity:' + op + '" title="' + vel + '"></div>';
  }
  velEl.innerHTML = vH;

  var tbody = document.getElementById("note-tbody")!;
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

export function inspectorRowClick(str, fret, idx, pitch) {
  if (window.__editKeys && (window.__editKeys as any).selectIndex) {
    (window.__editKeys as any).selectIndex(idx);
    return;
  }
  clearFretboard();
  lightFret(str, fret, undefined);
  state.selectedNoteIndices = [idx];
  showSelection([{ f: fret, s: str, p: pitch }]);
  var prev = document.querySelector(".sel");
  if (prev) prev.classList.remove("sel");
  var row = document.getElementById("nr-" + idx);
  if (row) row.classList.add("sel");
  try { overlaySelectedNotes(); } catch(e: any) {}
}

/* ── 패널 토글 (Data / Log / Sidebar) ───────────────────────────────────────────────── */
export function togglePanel(id, btnId) {
  var el = document.getElementById(id);
  if (!el) return;
  var nowHidden = el.classList.toggle("hidden");
  var b = document.getElementById(btnId);
  if (b) b.classList.toggle("on", !nowHidden);
}

export function toggleSidebar() {
  var sb = document.getElementById("sidebar");
  if (sb) sb.classList.toggle("collapsed");
}

export function renderTrackList() {
  state.listEl = document.getElementById("track-list");
  if (!state.tracks || state.tracks.length === 0) {
    state.listEl!.innerHTML = '<div class="no-tracks">No MIDI tracks found.</div>';
  } else {
    var h = "";
    for (var i = 0; i < state.tracks.length; i++) {
      var t = state.tracks[i];
      h += '<div class="ti' + (i === 0 ? " active" : "") + '" id="ti-' + t.id + '"'
         + ' onclick="loadTrack(\'' + t.id + '\')">'
         + '<span class="tn" title="' + t.name + '">' + t.name + "</span>"
         + '<span class="tc">' + t.noteCount + "</span>"
         + (t.edit && state.tracks.length > 1 && state.tracks.some(function(x: any) { return !!x.edit; })
            ? '<button class="ti-apply" id="ta-' + t.id + '" disabled aria-pressed="false" onclick="event.stopPropagation();toggleApplyMark(\'' + t.id + '\')">Apply</button>'
            : "")
         + "</div>";
    }
    state.listEl!.innerHTML = h;
  }
}
