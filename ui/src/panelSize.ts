// ============================================================
// ui/src/panelSize.ts — drag the top edge of a bottom panel to change its height,
// like the split line above Live's Clip / Device view. Double-click = back to the default.
// The content scales up to fill the new height (fretboard, drum map), the score keeps the
// rest. Heights are kept per computer (localStorage), like the editor zoom.
// ============================================================
import { getZoom } from "./uiZoom";

const KEY = "tabEditor.panelH.";

/** Content scale that fills `avail` px with content `natural` px tall: never below 1, at most `max`. */
export function fitScale(avail: number, natural: number, max: number): number {
  if (!(natural > 0) || !(avail > 0)) return 1;
  return Math.max(1, Math.min(max, Math.floor((avail / natural) * 100) / 100));
}

export type LegendMetrics = { head: number; th: number; row: number; max: number; blocksFor: (width: number, rows: number) => number };

/**
 * Drum map in a panel `height` px tall and `width` px wide with `rows` pads: the largest scale
 * (1..max, 0.05 steps) at which header + column header + rows fit, and the column blocks at that
 * scale (a bigger scale leaves fewer blocks, so more rows per block). Scale 1 if nothing larger fits.
 */
export function legendFit(height: number, width: number, rows: number, m: LegendMetrics): { scale: number; blocks: number } {
  for (let z = m.max; z > 1.0001; z = Math.round((z - 0.05) * 100) / 100) {
    const blocks = m.blocksFor(width / z, rows);
    const need = m.head + z * (m.th + Math.ceil(rows / blocks) * m.row);
    if (need <= height) return { scale: z, blocks };
  }
  return { scale: 1, blocks: m.blocksFor(width, rows) };
}

export function savedHeight(key: string): number | null {
  try { const v = Number(localStorage.getItem(KEY + key)); return v > 0 ? v : null; } catch { return null; }
}
function store(key: string, h: number | null) {
  try { if (h === null) localStorage.removeItem(KEY + key); else localStorage.setItem(KEY + key, String(Math.round(h))); } catch { /* storage off */ }
}

/**
 * Puts a splitter right above `panel` (once). Dragging calls onChange(height in CSS px), live;
 * the height is saved on release. Double-click calls onChange(null) and forgets it.
 */
export function attachSplitter(panel: HTMLElement, key: string, min: number, onChange: (h: number | null) => void): HTMLElement {
  const prev = panel.previousElementSibling as HTMLElement | null;
  if (prev && prev.classList.contains("panel-splitter") && prev.dataset.key === key) return prev;
  const bar = document.createElement("div");
  bar.className = "panel-splitter";
  bar.dataset.key = key;
  bar.title = "Drag to resize · double-click: default size";
  panel.parentElement?.insertBefore(bar, panel);
  let drag = false, last: number | null = null;
  const heightAt = (clientY: number) => {
    const r = panel.getBoundingClientRect();
    const ratio = panel.offsetHeight > 0 ? r.height / panel.offsetHeight : 1;   // page zoom, measured
    const maxH = (window.innerHeight / (getZoom() || 1)) * 0.62;               // the score keeps the rest
    return Math.round(Math.max(min, Math.min(maxH, (r.bottom - clientY) / (ratio || 1))));
  };
  bar.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    drag = true; bar.classList.add("drag"); bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  bar.addEventListener("pointermove", e => {
    if (!drag) return;
    last = heightAt(e.clientY); onChange(last);
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    drag = false; bar.classList.remove("drag");
    try { bar.releasePointerCapture(e.pointerId); } catch {}
    if (last !== null) store(key, last);
    try { window.dispatchEvent(new Event("resize")); } catch {}   // the score area changed height
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("dblclick", () => { last = null; store(key, null); onChange(null); try { window.dispatchEvent(new Event("resize")); } catch {} });
  return bar;
}

// ── Fretboard ────────────────────────────────────────────────────────────────
const FB_MAX_SCALE = 2.5;

/** Fretboard panel at height h (null = natural): the grid scales up to fill it. */
export function applyFretboardHeight(h: number | null = savedHeight("fretboard")) {
  const panel = document.getElementById("fretboard-panel");
  const grid = document.getElementById("fretboard-grid") as HTMLElement | null;
  const head = document.getElementById("fb-header");
  if (!panel || !grid) return;
  (grid.style as any).zoom = "";
  if (h === null) { panel.style.height = ""; return; }
  panel.style.height = h + "px";
  const avail = h - (head ? head.offsetHeight : 0) - 16 - 1;   // wrap padding 8+8, border
  const z = fitScale(avail, grid.offsetHeight, FB_MAX_SCALE);
  (grid.style as any).zoom = z === 1 ? "" : String(z);
}

export function initFretboardSplitter() {
  const panel = document.getElementById("fretboard-panel");
  if (!panel) return;
  attachSplitter(panel, "fretboard", 112, h => applyFretboardHeight(h));
  applyFretboardHeight();
}
