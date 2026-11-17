// Guitar techniques in the editor: draw them on the alphaTab score, toggle them on selected notes.
import * as alphaTab from "@coderline/alphatab";
import { state } from "./state";
import { log } from "./log";
import { getStringCount } from "./fretboard";
import { detectLetRing, TECHS } from "../../src/notation/techniques.js";
import { BEND_AMOUNTS, type BendAmount, type Tech } from "../../src/notation/types.js";

export const TECH_LABEL: Record<Tech, string> = {
  lr: "Let ring", pm: "Palm mute", hp: "Hammer-on / pull-off", sl: "Slide", x: "Dead note", vb: "Vibrato",
};
export const TECH_KEY: Record<string, Tech> = { l: "lr", p: "pm", h: "hp", s: "sl", x: "x", v: "vb" };

/** Indices of notes that show let ring without being set by the user (cached per notes array). */
let autoCache: { notes: any[] | null; len: number; set: Set<number> } = { notes: null, len: -1, set: new Set() };
function autoLetRing(): Set<number> {
  const notes = state.curTrack && state.curTrack.notes;
  if (!Array.isArray(notes)) return new Set();
  if (autoCache.notes !== notes || autoCache.len !== notes.length) autoCache = { notes, len: notes.length, set: detectLetRing(notes) };
  return autoCache.set;
}
export function invalidateAutoTech() { autoCache = { notes: null, len: -1, set: new Set() }; }

/** Techniques a note shows: the user's choice, or the automatic let ring when the user never chose. */
export function effectiveTech(index: number): Tech[] {
  const n = state.curTrack && state.curTrack.notes[index];
  if (!n) return [];
  if (Array.isArray(n.tech)) return n.tech;
  return autoLetRing().has(index) ? ["lr"] : [];
}

/**
 * Called from scoreLoaded, before alphaTab draws: copy techniques onto the matching alphaTab notes
 * (same string/fret, nearest beat) and re-run score.finish so let-ring / hammer / slide end points exist.
 */
export function applyTechniquesToScore(score: any) {
  try {
    const notes = state.curTrack && Array.isArray(state.curTrack.notes) ? state.curTrack.notes : [];
    if (!notes.length) return;
    invalidateAutoTech(); // durations may have changed since the last render
    const nS = getStringCount(), capo = state.uiCapo || 0;
    const byString = new Map<number, number[]>();
    notes.forEach((n: any, i: number) => { if (!byString.has(n.s)) byString.set(n.s, []); byString.get(n.s)!.push(i); });
    let changed = 0;
    score.tracks.forEach((t: any) => (t.staves || []).forEach((st: any) => (st.bars || []).forEach((bar: any) =>
      (bar.voices || []).forEach((v: any) => (v.beats || []).forEach((bt: any) => (bt.notes || []).forEach((an: any) => {
        if (an.string === undefined || an.fret === undefined) return;
        const s = nS + 1 - an.string, f = an.fret + capo;
        let bp: number | null = null;
        try { bp = (bar.masterBar.start + bt.playbackStart) / 960; } catch (e) { /* no position */ }
        let best = -1, dist = Infinity;
        for (const i of byString.get(s) || []) {
          const n = notes[i];
          if (n.f !== f) continue;
          const d = bp === null ? 0 : Math.abs(n.b - bp);
          if (d < dist && d < 0.2) { dist = d; best = i; }
        }
        if (best < 0) return;
        const tech = effectiveTech(best);
        const bend = notes[best].bend;
        if (!tech.length && !bend) return;
        if (bend && !an.hasBend) {
          an.addBendPoint(new alphaTab.model.BendPoint(0, 0));
          an.addBendPoint(new alphaTab.model.BendPoint(alphaTab.model.BendPoint.MaxPosition, bend));
        }
        if (tech.includes("lr")) an.isLetRing = true;
        if (tech.includes("pm")) an.isPalmMute = true;
        if (tech.includes("hp")) an.isHammerPullOrigin = true;
        if (tech.includes("sl")) an.slideOutType = alphaTab.model.SlideOutType.Legato;
        if (tech.includes("x")) an.isDead = true;
        if (tech.includes("vb")) an.vibrato = alphaTab.model.VibratoType.Slight;
        changed++;
      }))))));
    if (changed && state.api) {
      // The MusicXML importer adds notes to a beat before it reads their string, so the beat's
      // string lookup is empty and hammer-ons/slides find no target. Rebuild it, then finish again.
      score.tracks.forEach((t: any) => (t.staves || []).forEach((st: any) => (st.bars || []).forEach((bar: any) =>
        (bar.voices || []).forEach((v: any) => (v.beats || []).forEach((bt: any) => {
          if (!bt.noteStringLookup) return;
          bt.noteStringLookup.clear();
          (bt.notes || []).forEach((n: any) => { if (n.string >= 0) bt.noteStringLookup.set(n.string, n); });
        })))));
      score.finish(state.api.settings);
    }
  } catch (e: any) { log("techniques: " + (e.message || e)); }
}

/** Toggle one technique on the selected notes (on for all if any lacks it, else off for all). */
export function toggleSelectedTech(t: Tech, saveUndo: (before: any[]) => void, render: () => void) {
  if (!state.curTrack || !state.curTrack.edit) return;
  const sel = state.selectedNoteIndices.filter(i => state.curTrack.notes[i]);
  if (!sel.length) return;
  const before = state.curTrack.notes.map((n: any) => ({ ...n }));
  const turnOn = sel.some(i => !effectiveTech(i).includes(t));
  for (const i of sel) {
    const cur = new Set(effectiveTech(i));
    if (turnOn) cur.add(t); else cur.delete(t);
    state.curTrack.notes[i].tech = TECHS.filter(x => cur.has(x));
  }
  invalidateAutoTech();
  saveUndo(before);
  render();
}

export const BEND_LABEL: Record<BendAmount, string> = { 2: "½", 4: "full", 6: "1½" };

/** Cycle the bend of the selected notes: none → ½ → full → 1½ → none (follows the first note). */
export function cycleSelectedBend(saveUndo: (before: any[]) => void, render: () => void) {
  if (!state.curTrack || !state.curTrack.edit) return;
  const sel = state.selectedNoteIndices.filter(i => state.curTrack.notes[i]);
  if (!sel.length) return;
  const before = state.curTrack.notes.map((n: any) => ({ ...n }));
  const cur = state.curTrack.notes[sel[0]!].bend as BendAmount | undefined;
  const next = cur === undefined ? BEND_AMOUNTS[0] : BEND_AMOUNTS[BEND_AMOUNTS.indexOf(cur) + 1];
  for (const i of sel) {
    if (next === undefined) delete state.curTrack.notes[i].bend; else state.curTrack.notes[i].bend = next;
  }
  log(next === undefined ? "Bend off" : "Bend " + BEND_LABEL[next]);
  saveUndo(before);
  render();
}

/** Palette buttons light up for techniques every selected note has. */
export function updateTechPalette() {
  const sel = state.curTrack ? state.selectedNoteIndices.filter(i => state.curTrack.notes[i]) : [];
  document.querySelectorAll<HTMLElement>("#tech-palette [data-tech]").forEach(b => {
    const t = b.dataset.tech as Tech;
    b.classList.toggle("on", sel.length > 0 && sel.every(i => effectiveTech(i).includes(t)));
    b.classList.toggle("idle", sel.length === 0);
  });
  const bendBtn = document.querySelector<HTMLElement>("#tech-palette [data-bend]");
  if (bendBtn) {
    const amt = sel.length ? state.curTrack.notes[sel[0]!].bend as BendAmount | undefined : undefined;
    bendBtn.textContent = amt ? "B " + BEND_LABEL[amt] : "B";
    bendBtn.classList.toggle("on", !!amt);
    bendBtn.classList.toggle("idle", sel.length === 0);
  }
}
