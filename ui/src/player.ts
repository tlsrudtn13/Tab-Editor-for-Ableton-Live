// @ts-nocheck
import { state } from "./state";
import { log } from "./log";
import { clearFretboard } from "./fretboard";

/* ── Play controls ────────────────────────────────────────────────────────── */
export function updPlay(p) {
  var btn = document.getElementById("btn-play");
  if (!btn) return;
  if (p) { btn.innerHTML = "&#9646;&#9646; Pause"; btn.classList.add("on"); }
  else   { btn.innerHTML = "&#9654; Play";         btn.classList.remove("on"); }
}

export function togglePlay() {
  if (!state.api) return;
  try {
    if (state.playing) { if (state.api.pause) state.api.pause(); }
    else         { if (state.api.play)  state.api.play();  }
  } catch(e) { log("player: " + e.message); }
}

export function stopPlay() {
  if (!state.api) return;
  try { if (state.api.stop) state.api.stop(); } catch(e) {}
  state.playing = false; updPlay(false); clearFretboard();
}
