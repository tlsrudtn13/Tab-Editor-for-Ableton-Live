import { state } from "./state";
import { masterBarBoundsAt } from "./overlay";
import { log } from "./log";

/* ── Pure helpers (tested) ─────────────────────────────────────────────── */

export function clampSpeed(pct: number): number {
  const n = Number.isFinite(pct) ? pct : 100;
  const rounded = Math.round(n / 5) * 5;
  return Math.max(50, Math.min(100, rounded));
}

export function toTicks(r: { start: number; end: number }): { startTick: number; endTick: number } {
  return { startTick: Math.round(r.start * 960), endTick: Math.round(r.end * 960) };
}

function barIndex(b: number, beatsPerBar: number): number {
  return Math.floor((b + 1e-9) / beatsPerBar);
}

/**
 * Selected bars (bar-aligned, end exclusive, clamped to clipEnd).
 * Returns null (= whole clip, label All) when anchor/cursor are missing or in the same bar.
 */
export function loopRange(
  cursorB: number | null,
  anchorB: number | null,
  beatsPerBar: number,
  clipEnd: number,
): { start: number; end: number; label: string } | null {
  if (cursorB == null || anchorB == null || !(beatsPerBar > 0)) return null;
  const bc = barIndex(cursorB, beatsPerBar);
  const ba = barIndex(anchorB, beatsPerBar);
  if (bc === ba) return null;
  const lo = Math.min(bc, ba);
  const hi = Math.max(bc, ba);
  const start = lo * beatsPerBar;
  const end = Math.min((hi + 1) * beatsPerBar, clipEnd);
  if (!(end > start)) return null;
  const a = lo + 1;
  const b = hi + 1;
  return { start, end, label: a === b ? `Bar ${a}` : `Bars ${a}–${b}` };
}

/* ── Practice UI ───────────────────────────────────────────────────────── */

type PracticeState = {
  on: boolean;
  loop: boolean;
  speedPct: number;
  countIn: boolean;
  metro: boolean;
};

const ps: PracticeState = { on: false, loop: false, speedPct: 100, countIn: false, metro: false };
let inited = false;

function beatsPerBarNow(): number {
  const ts = state.uiTimeSig || (state.curTrack && state.curTrack.timeSig) || { beats: 4, type: 4 };
  return ts.beats * 4 / ts.type;
}

function clipEndNow(): number {
  const t = state.curTrack;
  if (!t) return 0;
  const bpb = beatsPerBarNow();
  const e = t.edit;
  if (e && e.mode === "clip" && typeof e.regionLength === "number" && e.regionLength > 0) return e.regionLength;
  if (e && e.mode === "track" && Array.isArray(e.spans) && e.spans.length) {
    return e.spans.reduce((m: number, s: any) => Math.max(m, s.end), 0);
  }
  const noteEnd = Array.isArray(t.notes) ? t.notes.reduce((m: number, n: any) => Math.max(m, (n.b || 0) + (n.d || 0)), 0) : 0;
  return noteEnd > 0 ? Math.ceil((noteEnd + 1e-6) / bpb) * bpb : bpb;
}

function currentLoop(): { start: number; end: number; label: string } | null {
  return loopRange(state.cursor ? state.cursor.b : null, state.selectionAnchor, beatsPerBarNow(), clipEndNow());
}

function setBtnOn(id: string, on: boolean) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("on", on);
}

function syncUi() {
  setBtnOn("btn-practice", ps.on);
  const bar = document.getElementById("practice-bar");
  if (bar) bar.style.display = ps.on ? "flex" : "none";
  setBtnOn("btn-loop", ps.loop);
  setBtnOn("btn-countin", ps.countIn);
  setBtnOn("btn-metro", ps.metro);
  const range = ps.loop ? currentLoop() : null;
  const lr = document.getElementById("loop-range");
  if (lr) lr.textContent = ps.loop ? (range ? range.label : "All") : "All";
  const slider = document.getElementById("ui-speed") as HTMLInputElement | null;
  if (slider) slider.value = String(ps.speedPct);
  const val = document.getElementById("speed-val");
  if (val) val.textContent = ps.speedPct + "%";
  document.querySelectorAll<HTMLButtonElement>("#practice-bar .sb[data-speed]").forEach(btn => {
    btn.classList.toggle("on", Number(btn.dataset.speed) === ps.speedPct);
  });
}

function safeSet(obj: any, key: string, value: any) {
  if (!obj) return;
  try {
    if (!(key in obj)) logOnce(`practice:${key}:missing`, "practice: player has no " + key);
    obj[key] = value;
  } catch (e: any) {
    logOnce(`practice:${key}`, "practice: cannot set " + key);
  }
}

const logged: Record<string, boolean> = {};
function logOnce(k: string, msg: string) {
  if (logged[k]) return;
  logged[k] = true;
  log(msg);
}

function applyToApi() {
  const api = state.api;
  if (!api) return;
  if (!ps.on) {
    safeSet(api, "playbackSpeed", 1);
    safeSet(api, "isLooping", false);
    safeSet(api, "playbackRange", null);
    safeSet(api, "countInVolume", 0);
    safeSet(api, "metronomeVolume", 0);
    return;
  }
  safeSet(api, "playbackSpeed", ps.speedPct / 100);
  if (ps.loop) {
    safeSet(api, "isLooping", true);
    const r = currentLoop();
    safeSet(api, "playbackRange", r ? toTicks(r) : null);
  } else {
    safeSet(api, "isLooping", false);
    safeSet(api, "playbackRange", null);
  }
  safeSet(api, "countInVolume", ps.countIn ? 1 : 0);
  safeSet(api, "metronomeVolume", ps.metro ? 1 : 0);
}

function clearLoopOverlay() {
  document.querySelectorAll(".loop-range-overlay").forEach(el => el.remove());
}

function barBoundsForRange(start: number, end: number): any[] {
  const bpb = beatsPerBarNow();
  const out: any[] = [];
  const seen = new Set<string>();
  for (let b = start; b < end - 1e-6; b += bpb) {
    const bar = masterBarBoundsAt(b + 1e-6);   // staff and TAB together (design D024)
    const vb = bar && bar.visualBounds;
    if (!vb) continue;
    const key = `${Math.round(vb.x)}:${Math.round(vb.y)}:${Math.round(vb.w)}:${Math.round(vb.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bar);
  }
  return out;
}

function drawLoopOverlayOnly() {
  clearLoopOverlay();
  if (!ps.on || !ps.loop) return;
  const r = currentLoop();
  const range = r || { start: 0, end: clipEndNow(), label: "All" };
  const bars = barBoundsForRange(range.start, range.end);
  if (!bars.length) return;
  const host = document.getElementById("alphaTab");
  if (!host) return;
  const tint = state.isLight ? "rgba(255,118,77,0.10)" : "rgba(255,118,77,0.08)";

  // Group by visual row (y)
  const groups: any[][] = [];
  for (const bar of bars) {
    const y = bar.visualBounds.y;
    let g = groups.find(gr => Math.abs(gr[0].visualBounds.y - y) < 2);
    if (!g) { g = []; groups.push(g); }
    g.push(bar);
  }

  for (const g of groups) {
    g.sort((a, b) => a.visualBounds.x - b.visualBounds.x);
    const first = g[0].visualBounds;
    const last = g[g.length - 1].visualBounds;
    const left = first.x;
    const top = first.y;
    const width = (last.x + last.w) - first.x;
    const height = Math.max(...g.map(b => b.visualBounds.h));
    const d = document.createElement("div");
    d.className = "loop-range-overlay";
    d.style.position = "absolute";
    d.style.left = left + "px";
    d.style.top = top + "px";
    d.style.width = width + "px";
    d.style.height = height + "px";
    d.style.background = tint;
    d.style.borderTop = "3px solid #ff764d";
    d.style.boxSizing = "border-box";
    d.style.pointerEvents = "none";
    host.appendChild(d);
  }

  // End caps at first and last bar lines of whole range
  const ordered = bars.slice().sort((a, b) => (a.visualBounds.y - b.visualBounds.y) || (a.visualBounds.x - b.visualBounds.x));
  const firstBar = ordered[0];
  const lastBar = ordered[ordered.length - 1];
  if (firstBar && lastBar) {
    const fb = firstBar.visualBounds;
    const lb = lastBar.visualBounds;
    const cap1 = document.createElement("div");
    cap1.className = "loop-range-overlay";
    cap1.style.position = "absolute";
    cap1.style.left = fb.x + "px";
    cap1.style.top = fb.y + "px";
    cap1.style.width = "2px";
    cap1.style.height = fb.h + "px";
    cap1.style.background = "#ff764d";
    cap1.style.pointerEvents = "none";
    host.appendChild(cap1);
    const cap2 = document.createElement("div");
    cap2.className = "loop-range-overlay";
    cap2.style.position = "absolute";
    cap2.style.left = (lb.x + lb.w - 2) + "px";
    cap2.style.top = lb.y + "px";
    cap2.style.width = "2px";
    cap2.style.height = lb.h + "px";
    cap2.style.background = "#ff764d";
    cap2.style.pointerEvents = "none";
    host.appendChild(cap2);
  }
}

export function drawLoopOverlay() {
  try {
    if (ps.on) { syncUi(); applyToApi(); }
    drawLoopOverlayOnly();
  } catch (e) {
    try { clearLoopOverlay(); } catch {}
  }
}

function refresh() {
  syncUi();
  applyToApi();
  drawLoopOverlayOnly();
}

export function initPractice() {
  if (inited) return;
  inited = true;
  const practiceBtn = document.getElementById("btn-practice");
  if (practiceBtn) practiceBtn.addEventListener("click", () => {
    ps.on = !ps.on;
    if (ps.on) {
      // turning on: re-apply strip control values
      refresh();
    } else {
      // turning off: reset api, keep control values
      syncUi();
      applyToApi();
      drawLoopOverlay();
    }
  });

  const loopBtn = document.getElementById("btn-loop");
  if (loopBtn) loopBtn.addEventListener("click", () => { ps.loop = !ps.loop; refresh(); });

  const countIn = document.getElementById("btn-countin");
  if (countIn) countIn.addEventListener("click", () => { ps.countIn = !ps.countIn; refresh(); });

  const metro = document.getElementById("btn-metro");
  if (metro) metro.addEventListener("click", () => { ps.metro = !ps.metro; refresh(); });

  document.querySelectorAll<HTMLButtonElement>("#practice-bar .sb[data-speed]").forEach(btn => {
    btn.addEventListener("click", () => { ps.speedPct = clampSpeed(Number(btn.dataset.speed)); refresh(); });
  });
  const slider = document.getElementById("ui-speed") as HTMLInputElement | null;
  if (slider) slider.addEventListener("input", () => { ps.speedPct = clampSpeed(Number(slider.value)); refresh(); });

  // Recompute range when selection changes
  const recompute = () => { if (ps.on) refresh(); };
  document.addEventListener("mouseup", recompute);
  document.addEventListener("keyup", recompute);

  syncUi();
  applyToApi();
}
