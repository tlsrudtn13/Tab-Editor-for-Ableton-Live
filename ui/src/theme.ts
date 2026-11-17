import * as alphaTab from "@coderline/alphatab";
import bravuraFontUrl from "@alphatab-font/Bravura.otf?inline";
import { state } from "./state";
import { rebuildScore } from "./score";

// ── Bravura 폰트 등록 ────────────────────────────────────────────────────────
export function injectFont() {
  var style = document.createElement("style");
  style.textContent =
    "@font-face { font-family:'alphaTab';" +
    " src: url('" + bravuraFontUrl + "') format('opentype');" +
    " font-weight:normal; font-style:normal; }";
  document.head.appendChild(style);
}

/* ── Theme color ──────────────────────────────────────────────────────────── */
export function resolveColor(cssVar, fallback) {
  try {
    var el = document.createElement("div");
    el.style.cssText = "position:absolute;opacity:0;color:var(" + cssVar + ")";
    document.body.appendChild(el);
    var c = window.getComputedStyle(el).color;
    document.body.removeChild(el);
    return (c && c !== "rgba(0, 0, 0, 0)") ? c : fallback;
  } catch(e) { return fallback; }
}

export function initTheme() {
  injectFont();
  var txtColor = resolveColor("--p-live-text-primary", "rgb(181,181,181)");
  document.documentElement.style.setProperty("--at-fg", txtColor);
  // ★ 테마: OS 기본값으로 시작, 툴바 버튼으로 수동 토글
  state.isLight = !!(window.matchMedia &&
                   window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", state.isLight);
  return txtColor;
}

// ★ 아이콘 초기화 (DOM 준비 후 — module script는 defer라 바로 가능)
export function syncThemeBtn() {
  var b = document.getElementById("btn-theme");
  if (b) b.textContent = state.isLight ? "\uD83C\uDF19" : "\u2600";  // 🌙 / ☀
}

export function getAtRes() {
  return state.isLight ? {
    mainGlyphColor: "#111111",  secondaryGlyphColor: "#505050",
    staffLineColor: "#9a9a9a",  barSeparatorColor:   "#7a7a7a",
    barNumberColor: "#8a8a8a",  scoreInfoColor:      "#606060"
  } : {
    mainGlyphColor: "#f0f0f0",   secondaryGlyphColor: "#b8b8b8",
    staffLineColor: "#525252",  barSeparatorColor:   "#757575",
    barNumberColor: "#6f6f6f",  scoreInfoColor:      "#8a8a8a"
  };
}

export function toggleTheme() {
  try {
    console.log("toggleTheme called");

    state.isLight = !state.isLight;
    document.documentElement.classList.toggle("light", state.isLight);

    var b = document.getElementById("btn-theme");
    if (b) syncThemeBtn(); // 🌙 / ☀

    if (state.api) {
      try { state.api.destroy(); } catch(e) { console.error("api.destroy error", e); }
      state.api = null;
      var el = document.getElementById("alphaTab");
      if (el) el.innerHTML = "";
    }

    if (state.curTrack) rebuildScore();
  } catch (e) {
    console.error("toggleTheme error:", e);
  }
}
