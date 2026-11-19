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
  // monochrome line icons like Live's (designer D016): moon in light theme, sun in dark
  if (b) b.innerHTML = state.isLight
    ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9.8 7.6A4.3 4.3 0 0 1 4.4 2.2a4.3 4.3 0 1 0 5.4 5.4z"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="2.3"/><path d="M6 .8v1.4M6 9.8v1.4M.8 6h1.4M9.8 6h1.4M2.3 2.3l1 1M8.7 8.7l1 1M2.3 9.7l1-1M8.7 3.3l1-1"/></svg>';
}

/**
 * Score text fonts (designer D011 §4): upright sans-serif instead of alphaTab's italic serif, so chord names
 * ("Gadd9") and lyrics read cleanly. Segoe UI is always there in Live's WebView2 on Windows; Arial elsewhere.
 */
// CSS font shorthand: alphaTab parses it itself (its object form is not accepted in the settings JSON)
const SANS = "'Segoe UI', Arial, sans-serif";
const font = (size: number, bold = false, italic = false) => `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${SANS}`;
export function scoreFonts(): Map<string, any> {
  return new Map<string, any>([
    ["scoretitle", font(22, true)],
    ["effectchordnames", font(13, true)],
    ["effectlyrics", font(11.5)],
    ["barnumber", font(10, true)],
    ["guitartuning", font(11, false, true)],
    ["effectmarker", font(12, true)],    // tempo "= 120" (alphaTab draws it with the marker font) and section markers (designer D012)
  ]);
}

export function getAtRes() {
  // D011 §2: title / tuning (scoreInfo) and bar numbers were too faint, light staff lines a touch lighter
  return state.isLight ? {
    mainGlyphColor: "#111111",  secondaryGlyphColor: "#505050",
    staffLineColor: "#a8a8a8",  barSeparatorColor:   "#7a7a7a",
    barNumberColor: "#5c5c5c",  scoreInfoColor:      "#2a2a2a",
    elementFonts: scoreFonts()
  } : {
    mainGlyphColor: "#f0f0f0",   secondaryGlyphColor: "#b8b8b8",
    staffLineColor: "#525252",  barSeparatorColor:   "#757575",
    barNumberColor: "#9a9a9a",  scoreInfoColor:      "#d8d8d8",
    elementFonts: scoreFonts()
  };
}

export function toggleTheme() {
  try {
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
