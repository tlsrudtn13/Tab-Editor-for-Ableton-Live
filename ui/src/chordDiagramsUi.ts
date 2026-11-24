import { getStringCount } from "./fretboard";
import { status } from "./log";
import { state } from "./state";
import { isDrumTrack } from "./drums";
import { sameVoicing, voicingAt, type ChordVoicing, type TabNote } from "./chordDiagrams";

let diagramsOn = false;

function instrumentKey(): string {
  const sel = document.getElementById("ui-instrument") as HTMLSelectElement | null;
  if (sel && sel.value) return sel.value;
  const inst = state.curTrack?.instrument;
  if (typeof inst === "string") return inst;
  return String(inst?.name || "");
}

export function isBassTrack(): boolean {
  return instrumentKey().toLowerCase().startsWith("bass");
}

export function isDiagramsDisabled(): boolean {
  return isDrumTrack(state.curTrack) || isBassTrack();
}

export function isDiagramsOn(): boolean {
  return diagramsOn;
}

export function refreshDiagramsUi(): void {
  const btn = document.getElementById("btn-diagrams") as HTMLButtonElement | null;
  if (!btn) return;
  const disabled = isDiagramsDisabled();
  btn.classList.toggle("is-off", disabled);
  if (disabled) btn.setAttribute("aria-disabled", "true");
  else btn.removeAttribute("aria-disabled");
  btn.title = disabled ? "Chord diagrams are for guitar" : "Show chord diagrams above the score";
  btn.classList.toggle("on", diagramsOn && !disabled);
}

export function bindDiagrams(rebuild: () => void): void {
  const btn = document.getElementById("btn-diagrams") as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (isDiagramsDisabled()) {
      status("Chord diagrams are for guitar");
      return;
    }
    diagramsOn = !diagramsOn;
    refreshDiagramsUi();
    rebuild();
  });
  refreshDiagramsUi();
}

function hideAllChordDiagrams(score: any): void {
  for (const t of score?.tracks || []) for (const st of t.staves || []) {
    const chords = st.chords; if (!chords) continue;
    const list = typeof chords.values === "function" ? Array.from(chords.values()) : Object.values(chords);
    for (const c of list as any[]) if (c) c.showDiagram = false;
  }
}

function beatPosOf(beat: any): number | null {
  try { return (beat.voice.bar.masterBar.start + beat.playbackStart) / 960; } catch { return null; }
}

function cloneChord(chord: any, id: string): any | null {
  try {
    const Ctor = chord.constructor;
    const c = new Ctor();
    c.name = chord.name;
    c.firstFret = chord.firstFret;
    c.strings = Array.isArray(chord.strings) ? chord.strings.slice() : [];
    c.barreFrets = Array.isArray(chord.barreFrets) ? chord.barreFrets.slice() : [];
    c.staff = chord.staff;
    c.showName = chord.showName;
    c.showDiagram = chord.showDiagram;
    c.showFingering = chord.showFingering;
    if ("id" in c) c.id = id;
    return c;
  } catch {
    return null;
  }
}

/**
 * Apply chord diagrams to a loaded alphaTab score. When off, or on bass/drum, hides all diagrams.
 * Never throws: on error falls back to hiding all diagrams.
 */
export function applyChordDiagrams(score: any): void {
  try {
    if (!score) return;
    if (!diagramsOn || isDiagramsDisabled()) {
      hideAllChordDiagrams(score);
      return;
    }

    try { if (score.stylesheet) { score.stylesheet.globalDisplayChordDiagramsInScore = true; score.stylesheet.globalDisplayChordDiagramsOnTop = false; } } catch { /* ignore */ }
    hideAllChordDiagrams(score);

    const trk = state.curTrack;
    const notes: TabNote[] = Array.isArray(trk?.notes) ? trk.notes : [];
    const stringCount = getStringCount();

    for (const track of score.tracks || []) for (const st of track.staves || []) {
      const chords = st.chords; if (!chords) continue;
      const voicingByChordId = new Map<string, ChordVoicing>();
      let cloneSeq = 0;

      for (const bar of st.bars || []) for (const voice of bar.voices || []) for (const beat of voice.beats || []) {
        const chordId = beat.chordId;
        if (chordId == null) continue;
        const chord = typeof chords.get === "function" ? chords.get(chordId) : chords[chordId];
        if (!chord) continue;

        const bp = beatPosOf(beat);
        const voicing = bp == null ? null : voicingAt(notes, bp, stringCount);
        if (!voicing) continue;   // a single note here; the chord object may still be shown at another beat

        let target = chord;
        const assigned = voicingByChordId.get(String(chordId));
        if (assigned && !sameVoicing(assigned, voicing)) {
          const newId = String(chordId) + "__dg" + (++cloneSeq);
          const cloned = cloneChord(chord, newId);
          if (cloned) {
            if (typeof st.addChord === "function") st.addChord(newId, cloned);
            else if (typeof chords.set === "function") chords.set(newId, cloned);
            else chords[newId] = cloned;
            beat.chordId = newId;
            target = cloned;
            voicingByChordId.set(newId, voicing);
          } else {
            target.strings = assigned.strings.slice();
            target.firstFret = assigned.firstFret;
            target.showName = true;
            target.showDiagram = false;
            continue;
          }
        } else if (!assigned) {
          voicingByChordId.set(String(chordId), voicing);
        }

        target.strings = voicing.strings.slice();
        target.firstFret = voicing.firstFret;
        target.showName = true;

        // a chord object is shared by every beat with that name and voicing: show it (hiding a repeat would hide them all)
        target.showDiagram = true;
      }
    }
  } catch {
    try { hideAllChordDiagrams(score); } catch { /* ignore */ }
  }
}
