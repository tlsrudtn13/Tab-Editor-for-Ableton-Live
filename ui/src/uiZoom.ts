// ============================================================
// ui/src/uiZoom.ts — editor zoom (text, toolbars, tables, score) like Live's "Zoom Display".
// The Extensions SDK gives no access to Live's zoom setting (only language, storage and
// temp folders) and Live's Preferences.cfg holds no readable key for it, so the editor
// has its own: toolbar menu, Ctrl + / Ctrl - / Ctrl 0. The whole page is scaled with CSS
// zoom, so the score is laid out again at the new width and every overlay keeps lining up.
// The choice is kept per computer (localStorage), like a view preference.
// ============================================================

export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75, 2];
const KEY = "tabEditor.uiZoom";
let current = 1;

/** Nearest allowed level; anything invalid is 100 %. */
export function clampZoom(z: number): number {
  if (!isFinite(z) || z <= 0) return 1;
  let best = ZOOM_LEVELS[0];
  for (const l of ZOOM_LEVELS) if (Math.abs(l - z) < Math.abs(best - z)) best = l;
  return best;
}

/** Next level up (dir 1) or down (dir -1) from z; stays at the ends. */
export function stepZoom(z: number, dir: 1 | -1): number {
  const i = ZOOM_LEVELS.indexOf(clampZoom(z));
  return ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + dir))];
}

export const zoomLabel = (z: number) => Math.round(z * 100) + "%";

function load(): number {
  try { const v = localStorage.getItem(KEY); return v ? clampZoom(Number(v)) : 1; } catch { return 1; }
}
function save(z: number) {
  try { localStorage.setItem(KEY, String(z)); } catch { /* storage off: zoom lasts for this window only */ }
}

export function getZoom(): number { return current; }

export function setZoom(z: number) {
  current = clampZoom(z);
  (document.documentElement.style as any).zoom = current === 1 ? "" : String(current);
  save(current);
  const sel = document.getElementById("ui-zoom") as HTMLSelectElement | null;
  if (sel) sel.value = String(current);
  // the score container got narrower / wider in CSS px: alphaTab lays out again, overlays follow
  try { window.dispatchEvent(new Event("resize")); } catch {}
}

function onKey(e: KeyboardEvent) {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key;
  if (k === "+" || k === "=" || e.code === "NumpadAdd") { e.preventDefault(); e.stopPropagation(); setZoom(stepZoom(current, 1)); }
  else if (k === "-" || k === "_" || e.code === "NumpadSubtract") { e.preventDefault(); e.stopPropagation(); setZoom(stepZoom(current, -1)); }
  else if (k === "0" || e.code === "Numpad0") { e.preventDefault(); e.stopPropagation(); setZoom(1); }
}

/** Fill the toolbar menu, restore the saved zoom, add the keys. Call once at start-up. */
export function initZoom() {
  const sel = document.getElementById("ui-zoom") as HTMLSelectElement | null;
  if (sel) {
    sel.innerHTML = "";
    for (const l of ZOOM_LEVELS) {
      const o = document.createElement("option");
      o.value = String(l); o.textContent = zoomLabel(l);
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { setZoom(Number(sel.value)); sel.blur(); });
  }
  document.addEventListener("keydown", onKey, true);   // capture: before the editor's own keys
  setZoom(load());
}
