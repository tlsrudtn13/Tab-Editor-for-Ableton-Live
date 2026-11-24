import { analyzeProgression, type CadenceKind } from "../../src/notation/progressionAnalysis.js";

export type ProgressionAnalysis = ReturnType<typeof analyzeProgression>;
import { chordName, parseRoman, type KeyRef } from "../../src/notation/harmony.js";
import { state } from "./state.js";
import { isDrumTrack } from "./drums.js";
import { displayRoman, effectiveKey } from "./effectiveKey.js";
import { tabAnalysis } from "./insertPanel.js";
import { findBeatBoundsAt, overlaySelectedNotes } from "./overlay.js";
import { setCursor } from "./cursor.js";
import { status } from "./log.js";

export function barBeatLabel(b: number, bpb: number): string {
  const safeBpb = bpb > 0 ? bpb : 4;
  const bar = Math.floor((b + 1e-9) / safeBpb) + 1;
  const beat = Math.floor(((b % safeBpb) + safeBpb + 1e-9) % safeBpb) + 1;
  return `${bar}.${beat}`;
}

export function fnWords(fn: "T" | "S" | "D" | "other"): string {
  switch (fn) {
    case "T": return "Tonic: home";
    case "S": return "Subdominant: moves away";
    case "D": return "Dominant: wants to go home";
    default: return "Colour chord";
  }
}

/**
 * What a chord does, in words a player with shallow theory reads (design D024): a secondary dominant names the
 * chord it pulls to, the minor key's bVII is a gentle subtonic, tonic-family chords other than I are "stable".
 */
export function chordRole(ch: { root: number; roman: string; fn: "T" | "S" | "D" | "other"; borrowed?: unknown }, key: KeyRef): string {
  const sec = /^V7?\/(.+)$/.exec(ch.roman);
  if (sec) {
    let target = sec[1]!;
    try { target = chordName(parseRoman(sec[1]!, key)) + " (" + sec[1] + ")"; } catch { /* keep the numeral */ }
    return "Pulls to " + target;
  }
  const deg = (((ch.root - key.root) % 12) + 12) % 12;
  if (ch.borrowed) return "Borrowed colour";
  if (key.mode === "minor" && deg === 10) return "Subtonic: gentle pull home";
  if (ch.fn === "T") return deg === 0 ? "Home (tonic)" : "Stable (tonic family)";
  if (ch.fn === "S") return "Moves away (subdominant)";
  if (ch.fn === "D") return "Pulls home (dominant)";
  return "Colour chord";
}

export function cadenceShort(kind: CadenceKind): string {
  switch (kind) {
    case "authentic": return "PAC";
    case "plagal": return "PC";
    case "half": return "HC";
    case "deceptive": return "DC";
    case "ii-V-I": return "ii–V–I";
  }
}

export const CADENCE_TOOLTIP: Record<CadenceKind, string> = {
  authentic: "Authentic cadence — V resolves home",
  plagal: "Plagal cadence — IV to I (amen)",
  half: "Half cadence — pauses on V",
  deceptive: "Deceptive cadence — V goes to vi instead of home",
  "ii-V-I": "ii–V–I — the classic jazz/pop turn home",
};

export type PdfRow = {
  bar: string;
  chord: string;
  numeral: string;
  fn: string;
  scale: string;
};

export function pdfRows(result: ProgressionAnalysis, bpb: number): PdfRow[] {
  const arrivalByTo = new Map<number, CadenceKind>();
  for (const c of result.cadences) arrivalByTo.set(c.to, c.kind);
  return result.chords.map((ch, i) => {
    const cadence = arrivalByTo.get(i);
    const fn = chordRole(ch, result.key);
    return {
      bar: barBeatLabel(ch.b, bpb),
      chord: chordName(ch),
      numeral: displayRoman(ch.roman, result.key) + (ch.borrowed ? " · borrowed" : ""),
      fn: cadence ? `${fn}; ${cadenceShort(cadence)}` : fn,
      scale: i === 0 ? result.scale.name : "",
    };
  });
}

type AnalysisUiState = {
  on: boolean;
  bottomTab: "fretboard" | "analysis";
  includePdf: boolean;
  cache: WeakMap<any, { sig: string; result: ProgressionAnalysis | null }>;
};

const ui: AnalysisUiState = {
  on: false,
  bottomTab: "fretboard",
  includePdf: false,
  cache: new WeakMap(),
};

function beatsPerBar(): number {
  const ts = state.uiTimeSig || (state.curTrack && state.curTrack.timeSig) || { beats: 4, type: 4 };
  return ts.beats * 4 / ts.type;
}

function notesSig(t: any): string {
  let h = 0;
  const notes = Array.isArray(t?.notes) ? t.notes : [];
  for (const n of notes) h = (h * 31 + Math.round((n.b || 0) * 480) * 7 + Math.round((n.d || 0) * 480) * 3 + (n.p || 0) * 5 + (n.v || 0)) % 2147483647;
  const loop = t?.edit?.mode === "clip" && typeof t.edit.regionLength === "number" && t.edit.regionLength > 0 ? t.edit.regionLength : 0;
  const ek = currentKeySig();
  return notes.length + ":" + h + ":" + beatsPerBar() + ":" + loop + ":" + ek;
}

function currentKeySig(): string {
  const t = state.curTrack;
  if (!t) return "none";
  const ek = effectiveKey(t, tabAnalysis(t));
  return ek.key.root + ":" + ek.key.mode;
}

function currentResult(): ProgressionAnalysis | null {
  const t = state.curTrack;
  if (!t || isDrumTrack(t) || !Array.isArray(t.notes) || !t.notes.length) return null;
  const sig = notesSig(t);
  const cached = ui.cache.get(t);
  if (cached && cached.sig === sig) return cached.result;
  let result: ProgressionAnalysis | null = null;
  try {
    const bpb = beatsPerBar();
    const loop = t?.edit?.mode === "clip" && typeof t.edit.regionLength === "number" && t.edit.regionLength > 0 ? t.edit.regionLength : 0;
    const end = loop || t.notes.reduce((m: number, n: any) => Math.max(m, (n.b || 0) + (n.d || 0)), 0);
    const ek = effectiveKey(t, tabAnalysis(t));
    result = analyzeProgression(t.notes, { start: 0, end, beatsPerBar: bpb, key: ek.key });
  } catch {
    result = null;
  }
  ui.cache.set(t, { sig, result });
  return result;
}

export function getAnalysisResult(): ProgressionAnalysis | null { return currentResult(); }
export function isAnalysisOn(): boolean { return ui.on; }
export function isAnalysisPdfIncluded(): boolean { return ui.on && ui.includePdf; }

function tierColor(tier: "safe" | "tension" | "color"): string {
  return tier === "safe" ? "var(--an-safe)" : tier === "tension" ? "var(--an-tension)" : "var(--an-color)";
}

function clearAnalysisOverlay() {
  document.querySelectorAll(".analysis-overlay").forEach(el => el.remove());
}

function topBarVisualBoundsAt(b: number): any | null {
  try {
    const bl = state.api?.renderer?.boundsLookup;
    if (!bl?.staffSystems) return null;
    let best: any = null;
    for (const sys of bl.staffSystems) {
      for (const mb of (sys.bars || [])) {
        for (const bar of (mb.bars || [])) {
          const mBar = bar.bar ? bar.bar.masterBar : bar.masterBar;
          if (!mBar) continue;
          const hit = (bar.beats || []).some((bb: any) => {
            const beat = bb.beat || bb;
            return beat.playbackStart !== undefined && Math.abs((mBar.start + beat.playbackStart) / 960 - b) < 0.03;
          });
          if (!hit) continue;
          const vb = bar.visualBounds;
          if (!vb) continue;
          if (!best || vb.y < best.y) best = vb;
        }
      }
    }
    return best;
  } catch { return null; }
}

function scrollBeatIntoView(b: number) {
  try {
    const viewer = document.getElementById("viewer");
    const host = document.getElementById("alphaTab");
    if (!viewer || !host) return;
    const fb = findBeatBoundsAt(b);
    const vb = fb?.barBounds?.visualBounds || fb?.bounds?.visualBounds;
    if (!vb) return;
    const hostRect = host.getBoundingClientRect();
    const viewerRect = viewer.getBoundingClientRect();
    const top = hostRect.top - viewerRect.top + viewer.scrollTop + vb.y - 40;
    viewer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  } catch { /* ignore */ }
}

export function drawAnalysisOverlay() {
  try {
    clearAnalysisOverlay();
    if (!ui.on) return;
    const t = state.curTrack;
    if (!t || isDrumTrack(t)) return;
    const result = currentResult();
    if (!result || !result.chords.length) return;
    const host = document.getElementById("alphaTab");
    if (!host) return;

    for (const ch of result.chords) {
      const fb = findBeatBoundsAt(ch.b);
      const vb = fb?.bounds?.visualBounds || fb?.bounds?.realBounds;
      const barVb = topBarVisualBoundsAt(ch.b) || fb?.barBounds?.visualBounds;
      if (!vb || !barVb) continue;
      const el = document.createElement("div");
      el.className = "analysis-overlay an-numeral";
      const roman = displayRoman(ch.roman, result.key);
      el.textContent = roman;
      const firstInBar = Math.abs(vb.x - barVb.x) < 16;   // the bar number sits there on bars 1, 5, 9 ...
      el.style.left = (vb.x + (firstInBar ? 12 : 0)) + "px";
      el.style.top = (Math.min(barVb.y, vb.y) - 18) + "px";
      el.style.color = tierColor(ch.tier);
      if (ch.tier === "color") el.style.borderBottom = `1px dotted ${tierColor(ch.tier)}`;
      const borrowed = ch.borrowed ? `\n${ch.borrowed.label}` : "";
      el.title = `${chordName(ch)}\n${roman}\n${chordRole(ch, result.key)}${borrowed}`;
      host.appendChild(el);
    }

    for (const c of result.cadences) {
      const fromCh = result.chords[c.from];
      const toCh = result.chords[c.to];
      if (!fromCh || !toCh) continue;
      const fromFb = findBeatBoundsAt(fromCh.b);
      const toFb = findBeatBoundsAt(toCh.b);
      const fromVb = fromFb?.bounds?.visualBounds;
      const toVb = toFb?.bounds?.visualBounds;
      const barVb = topBarVisualBoundsAt(toCh.b) || topBarVisualBoundsAt(fromCh.b) || toFb?.barBounds?.visualBounds || fromFb?.barBounds?.visualBounds;
      if (!fromVb || !toVb || !barVb) continue;
      const left = Math.min(fromVb.x, toVb.x);
      const right = Math.max(fromVb.x + (fromVb.w || 12), toVb.x + (toVb.w || 12));
      const width = Math.max(16, right - left);
      const top = Math.min(barVb.y, fromVb.y, toVb.y) - 4;
      const wrap = document.createElement("div");
      wrap.className = "analysis-overlay an-cadence";
      wrap.style.left = left + "px";
      wrap.style.top = top + "px";
      wrap.style.width = width + "px";
      wrap.title = CADENCE_TOOLTIP[c.kind];

      const bracket = document.createElement("div");
      bracket.className = "an-cadence-bracket";
      wrap.appendChild(bracket);

      const label = document.createElement("div");
      label.className = "an-cadence-label";
      label.textContent = cadenceShort(c.kind);
      wrap.appendChild(label);
      host.appendChild(wrap);
    }
  } catch {
    try { clearAnalysisOverlay(); } catch { /* ignore */ }
  }
}

function syncBottomTab() {
  const wrap = document.getElementById("fretboard-wrap") as HTMLElement | null;
  const panel = document.getElementById("analysis-panel") as HTMLElement | null;
  const fbBtn = document.getElementById("an-tab-fretboard");
  const anBtn = document.getElementById("an-tab-analysis");
  const showAnalysis = ui.bottomTab === "analysis";
  if (wrap) wrap.style.display = showAnalysis ? "none" : "";
  if (panel) panel.style.display = showAnalysis ? "flex" : "none";
  document.querySelectorAll<HTMLElement>("#fb-header .fb-ctl, #fb-note-label, #fb-hover-label")
    .forEach(el => { el.style.display = showAnalysis ? "none" : ""; });
  fbBtn?.classList.toggle("on", !showAnalysis);
  anBtn?.classList.toggle("on", showAnalysis);
}

function renderAnalysisPanel() {
  const panel = document.getElementById("analysis-panel");
  if (!panel) return;
  const t = state.curTrack;
  const bpb = beatsPerBar();
  const result = currentResult();
  const ek = t ? effectiveKey(t, tabAnalysis(t)) : null;
  const keyName = ek ? (["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"][ek.key.root] + (ek.key.mode === "minor" ? " minor" : " major")) : "C major";
  const scaleName = result?.scale?.name || (keyName.includes("minor") ? keyName : keyName.replace(" major", " major"));

  const rows = result?.chords || [];
  const arrivalByTo = new Map<number, CadenceKind>();
  for (const c of (result?.cadences || [])) arrivalByTo.set(c.to, c.kind);

  let html = "";
  html += '<div class="an-subhead">';
  html += '<span class="an-meta">Key: ' + esc(keyName) + ' · Scale: ' + esc(scaleName) + '</span>';
  html += '<label class="an-pdf"><input type="checkbox" id="ui-analysis-pdf"' + (ui.includePdf ? " checked" : "") + '> Include in PDF</label>';
  html += '</div>';
  html += '<div class="an-table-wrap"><table class="an-table"><thead><tr>';
  html += '<th class="an-col-bar">Bar</th><th class="an-col-chord">Chord</th><th class="an-col-num">Numeral</th><th class="an-col-fn">Function / Cadence</th><th class="an-col-scale">Scale</th>';
  html += '</tr></thead><tbody>';
  rows.forEach((ch, i) => {
    const cadence = arrivalByTo.get(i);
    const fn = result ? chordRole(ch, result.key) : fnWords(ch.fn);
    const fnCell = cadence ? esc(fn) + "; " + esc(cadenceShort(cadence)) : esc(fn);
    const borrowed = ch.borrowed ? ' <span class="an-borrowed">· borrowed</span>' : "";
    html += '<tr data-an-idx="' + i + '" data-b="' + ch.b + '">';
    html += '<td class="an-col-bar">' + esc(barBeatLabel(ch.b, bpb)) + '</td>';
    html += '<td class="an-col-chord">' + esc(chordName(ch)) + '</td>';
    const roman = result ? displayRoman(ch.roman, result.key) : ch.roman;
    html += '<td class="an-col-num" style="color:' + tierColor(ch.tier) + '">' + esc(roman) + borrowed + '</td>';
    html += '<td class="an-col-fn">' + fnCell + '</td>';
    html += '<td class="an-col-scale">' + (i === 0 ? esc(scaleName) : "") + '</td>';
    html += '</tr>';
  });
  if (!rows.length) {
    html += '<tr><td colspan="5" class="an-empty">No chords detected</td></tr>';
  }
  html += '</tbody></table></div>';
  panel.innerHTML = html;

  const pdfCb = panel.querySelector("#ui-analysis-pdf") as HTMLInputElement | null;
  pdfCb?.addEventListener("change", () => { ui.includePdf = !!pdfCb.checked; });

  panel.querySelectorAll("tbody tr[data-b]").forEach(row => {
    row.addEventListener("click", () => {
      panel.querySelectorAll("tbody tr").forEach(r => r.classList.remove("sel"));
      row.classList.add("sel");
      const b = Number((row as HTMLElement).dataset.b || "0");
      try {
        setCursor(b, 1);
        state.selectionAnchor = b;
        state.selectedNoteIndices = [];
        overlaySelectedNotes();
      } catch { /* ignore */ }
      try { scrollBeatIntoView(b); } catch { /* ignore */ }
      try { drawAnalysisOverlay(); } catch { /* ignore */ }
    });
  });
}

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function refreshAnalysisUi() {
  try {
    const btn = document.getElementById("btn-analysis") as HTMLButtonElement | null;
    const drum = isDrumTrack(state.curTrack);
    if (btn) {
      btn.classList.toggle("is-off", !!drum);
      if (drum) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
      btn.title = drum ? "Harmonic analysis is for pitched tracks" : "Show harmonic analysis";
      btn.classList.toggle("on", ui.on && !drum);
    }
    renderAnalysisPanel();
    syncBottomTab();
  } catch { /* ignore */ }
}

function toggleAnalysis() {
  const drum = isDrumTrack(state.curTrack);
  if (drum) {
    status("Harmonic analysis is for pitched tracks");
    return;
  }
  ui.on = !ui.on;
  if (ui.on) {
    ui.bottomTab = "analysis";
    ui.includePdf = true;
  } else {
    ui.bottomTab = "fretboard";
  }
  refreshAnalysisUi();
  drawAnalysisOverlay();
}

function setBottomTab(tab: "fretboard" | "analysis") {
  ui.bottomTab = tab;
  syncBottomTab();
  if (tab === "analysis") renderAnalysisPanel();
}

export function bindAnalysis() {
  const btn = document.getElementById("btn-analysis");
  btn?.addEventListener("click", () => toggleAnalysis());

  const header = document.getElementById("fb-header");
  if (header) {
    const firstSpan = header.querySelector("span");
    if (firstSpan && firstSpan.textContent === "Fretboard") {
      const seg = document.createElement("div");
      seg.className = "seg an-tabs";
      seg.id = "an-bottom-tabs";
      seg.innerHTML = '<button class="sb on" id="an-tab-fretboard">Fretboard</button><button class="sb" id="an-tab-analysis">Analysis</button>';
      firstSpan.replaceWith(seg);
    }
  }
  document.getElementById("an-tab-fretboard")?.addEventListener("click", () => setBottomTab("fretboard"));
  document.getElementById("an-tab-analysis")?.addEventListener("click", () => setBottomTab("analysis"));

  const panelHost = document.getElementById("fretboard-panel");
  if (panelHost && !document.getElementById("analysis-panel")) {
    const panel = document.createElement("div");
    panel.id = "analysis-panel";
    panel.style.display = "none";
    panelHost.appendChild(panel);
  }

  refreshAnalysisUi();
}

export function addAnalysisPdfPage(pdf: any, tabName: string) {
  try {
    if (!isAnalysisPdfIncluded()) return;
    const result = currentResult();
    if (!result) return;
    const bpb = beatsPerBar();
    const ek = state.curTrack ? effectiveKey(state.curTrack, tabAnalysis(state.curTrack)) : null;
    const keyName = ek ? (["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"][ek.key.root] + (ek.key.mode === "minor" ? " minor" : " major")) : "C major";
    const scaleName = result.scale?.name || keyName;
    const rows = pdfRows(result, bpb);

    pdf.addPage();
    const margin = 12;
    let y = margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(`Harmonic analysis — ${tabName}`, margin, y);
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Key: ${keyName} · Scale: ${scaleName}`, margin, y);
    y += 8;

    const colX = [margin, margin + 22, margin + 52, margin + 86, margin + 150];
    const headers = ["Bar", "Chord", "Numeral", "Function / Cadence", "Scale"];
    pdf.setFont("helvetica", "bold");
    headers.forEach((h, i) => pdf.text(h, colX[i], y));
    y += 5;
    pdf.setFont("helvetica", "normal");

    for (const r of rows) {
      if (y > 297 - margin) {
        pdf.addPage();
        y = margin;
        pdf.setFont("helvetica", "bold");
        headers.forEach((h, i) => pdf.text(h, colX[i], y));
        y += 5;
        pdf.setFont("helvetica", "normal");
      }
      const vals = [r.bar, r.chord, r.numeral, r.fn, r.scale];
      vals.forEach((v, i) => {
        const text = String(v ?? "");
        const maxW = (colX[i + 1] ? colX[i + 1] - colX[i] - 2 : 40);
        pdf.text(text.length > 42 ? text.slice(0, 41) + "…" : text, colX[i], y, { maxWidth: maxW });
      });
      y += 5;
    }
  } catch {
    // never throw from export integration
  }
}
