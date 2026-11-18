import * as alphaTab from "@coderline/alphatab";
import { jsPDF } from "jspdf";
import bravuraFontUrl from "@alphatab-font/Bravura.otf?inline";
import { state } from "./state";
import { log, status } from "./log";
import { applyStaffMode, getXmlForMode, hideChordDiagrams, loadXmlIntoApi } from "./score";
import { isDrumTrack, prepareDrumScore } from "./drums";

/* ── PDF Export (v2 그대로) ──────────────────────────────────────────────── */
export var PDF_RENDER_W = 1406;

export function exportPDF() {
  if (!state.curTrack) { log("No track loaded"); return; }
  if (state.pdfBusy)   { log("PDF: already in progress"); return; }
  state.pdfBusy = true;
  log("PDF: rendering at A4 width...");
  status("PDF...");

  var pc: HTMLElement | null = document.getElementById("pdf-render");
  if (!pc) {
    pc = document.createElement("div");
    pc.id = "pdf-render";
    document.body.appendChild(pc);
  }
  pc!.innerHTML = "";

  var printApi = new alphaTab.AlphaTabApi(pc, {
     core: {
      engine: "html5", useWorker: false,
      // ★ file:// 격리 환경: Base64 Data URL 폰트 직접 주입
      fontDirectory: null,
      smuflFontSources: new Map([
        [alphaTab.FontFileFormat.OpenType, bravuraFontUrl]
      ]),
      enableLazyLoading: false
    },
    display: {
      layoutMode: 0, scale: 1.1, barCountPerPartial: 6,
      resources: {
        mainGlyphColor:      "#000000",
        secondaryGlyphColor: "#000000",
        staffLineColor:      "#000000",
        barSeparatorColor:   "#000000",
        barNumberColor:      "#000000",
        scoreInfoColor:      "#000000"
      }
    },
    player: { enablePlayer: false }
  });

  printApi.scoreLoaded.on(function(score) { hideChordDiagrams(score); applyStaffMode(score); });
  printApi.error.on(function(e) {
    log("PDF render error: " + (e.message || JSON.stringify(e)));
    cleanup();
  });

  var fired = false;
  printApi.postRenderFinished.on(function() {
    if (fired) return;
    fired = true;
    setTimeout(function() {
      try { buildPdf(pc!); }
      catch(e: any) { log("PDF build error: " + (e.message || e)); }
      cleanup();
    }, 200);
  });

  function cleanup() {
    try { printApi.destroy(); } catch(e) {}
    pc!.innerHTML = "";
    state.pdfBusy = false;
    status("Ready");
  }

  if (isDrumTrack(state.curTrack)) {   // drum mode: percussion AlphaTex (ui/src/drums.ts)
    printApi.scoreLoaded.on(prepareDrumScore);
    try { printApi.tex(state.curTrack.drum.tex); } catch(e: any) { log("PDF: " + (e.message || e)); cleanup(); }
    return;
  }
  var xml = getXmlForMode(state.curTrack);
  if (!loadXmlIntoApi(printApi, xml)) cleanup();
}

export function buildPdf(pc: HTMLElement) {
  var canvases = Array.prototype.slice.call(pc.querySelectorAll("canvas"))
    .filter(function(c) { return c.width > 4 && c.height > 4; });
  canvases.sort(function(a, b) {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  if (canvases.length === 0) { log("PDF: no rendered content"); return; }
  // alphaTab paints "rendered by alphaTab" as its own last partial: one short, narrow line of text.
  // alphaTab has no setting for it (MPL-2.0 needs no notice in output); leave it out of the PDF.
  // (a staff system is always far taller than 60 px; the notice is 12 px times the render scale)
  var lastCv = canvases[canvases.length - 1];
  if (canvases.length > 1 && lastCv.height < 60) canvases.pop();

  var MARGIN = 12, PAGE_W = 210, PAGE_H = 297;
  var availW = PAGE_W - MARGIN * 2;
  var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  var y = MARGIN;

  for (var i = 0; i < canvases.length; i++) {
    var cv  = canvases[i];
    var hMm = cv.height * (availW / cv.width);
    if (y + hMm > PAGE_H - MARGIN && y > MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.addImage(cv.toDataURL("image/png"), "PNG", MARGIN, y, availW, hMm);
    y += hMm;
  }

  var fname = state.curTrack.name.replace(/[/\\?%*:|"<>]/g, "_") + ".pdf";
  var blob  = pdf.output("blob");
  var url   = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
  log("PDF saved: " + fname + " (" + pdf.getNumberOfPages() + " pages)");
}

/* ── AlphaTex Export ──────────────────────────────────────────────────────── */
export function exportAlphaTex() {
  if (!state.curTrack) { log("No track loaded"); return; }
  var atex = (typeof state.curTrack.alphaTex === "string") ? state.curTrack.alphaTex : "";
  if (!atex) { log("No AlphaTex data available"); return; }
  var content = "// AlphaTex export\n// Track: " + state.curTrack.name + "\n\n" + atex;
  var a = document.createElement("a");
  a.href     = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
  a.download = state.curTrack.name.replace(/[/\\?%*:|"<>]/g, "_") + ".atex";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  log("Saved: " + a.download);
}
