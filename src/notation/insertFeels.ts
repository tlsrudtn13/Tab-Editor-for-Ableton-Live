// Feel presets of the Insert panel (design D019): one click sets the engine options of a part.
// Names are for players, not theory; the "More" section shows the options a feel set.
import type { InsertRequest } from "./insertEngine.js";

export type InsertPart = InsertRequest["part"];
export type FeelOptions = Partial<Pick<InsertRequest,
  "voicing" | "pattern" | "bassStyle" | "fill" | "position" | "complexity" | "contour" | "scale" |
  "groove" | "energy" | "fillEvery" | "humanizeAmount">>;
export type Feel = { id: string; label: string; hint: string; opts: FeelOptions };

export const FEELS: Readonly<Record<InsertPart, readonly Feel[]>> = {
  chords: [
    { id: "folk", label: "Acoustic Folk", hint: "Open chords, down-up strum", opts: { voicing: "open", pattern: "pop" } },
    { id: "rock", label: "Driving Rock", hint: "Power chords, straight 8ths", opts: { voicing: "power", pattern: "rock8" } },
    { id: "funk", label: "Soul / Funk", hint: "Small triads, 16th strum", opts: { voicing: "triad", pattern: "funk16" } },
    { id: "ballad", label: "Picked Ballad", hint: "Open chords, picked 8ths", opts: { voicing: "open", pattern: "arpUp" } },
    { id: "skank", label: "Indie Skank", hint: "Barre chords on the off-beat", opts: { voicing: "barre", pattern: "reggae" } },
    { id: "ambient", label: "Ambient Arp", hint: "Open chords, 16th arpeggio", opts: { voicing: "open", pattern: "arp16" } },
  ],
  bass: [
    { id: "root", label: "Solid Root", hint: "Root note on every chord", opts: { bassStyle: "root" } },
    { id: "eighths", label: "Driving 8ths", hint: "Root in straight 8ths", opts: { bassStyle: "rootEighths" } },
    { id: "kick", label: "Kick Lock", hint: "Plays with the kick drum", opts: { bassStyle: "kick", fill: "none" } },
    { id: "funky", label: "Funky Kick", hint: "Kick rhythm, octave pops", opts: { bassStyle: "kick", fill: "octave" } },
    { id: "rootFifth", label: "Root & 5th", hint: "Root, then the fifth", opts: { bassStyle: "rootFifth" } },
    { id: "walking", label: "Walking", hint: "Quarter notes walking to the next chord", opts: { bassStyle: "walking" } },
  ],
  riff: [
    { id: "hook", label: "Singable Hook", hint: "Few notes, rises and falls", opts: { scale: "pentatonic", contour: "arch", complexity: 2, position: 5 } },
    { id: "blues", label: "Blues Lick", hint: "Pentatonic, wavy", opts: { scale: "pentatonic", contour: "wave", complexity: 3, position: 5 } },
    { id: "driving", label: "Driving Riff", hint: "Busy, climbing", opts: { scale: "key", contour: "up", complexity: 4, position: 0 } },
    { id: "run", label: "Fast Run", hint: "16ths running down", opts: { scale: "key", contour: "down", complexity: 5, position: 7 } },
    { id: "dreamy", label: "Dreamy Motif", hint: "Slow, high on the neck", opts: { scale: "pentatonic", contour: "arch", complexity: 1, position: 7 } },
  ],
  drums: [
    { id: "rock", label: "Straight Rock", hint: "Fill every 4 bars", opts: { groove: "rock", energy: 3, fillEvery: 4, humanizeAmount: 0.3 } },
    { id: "dance", label: "Dance Pop", hint: "Four on the floor", opts: { groove: "house", energy: 4, fillEvery: 8, humanizeAmount: 0 } },
    { id: "funk", label: "Funk Pocket", hint: "Ghost notes, loose", opts: { groove: "funk", energy: 4, fillEvery: 0, humanizeAmount: 0.45 } },
    { id: "half", label: "Half-Time", hint: "Snare on 3", opts: { groove: "halfTime", energy: 3, fillEvery: 4, humanizeAmount: 0.3 } },
    { id: "shuffle", label: "Laidback Shuffle", hint: "Swung, soft", opts: { groove: "shuffle", energy: 2, fillEvery: 0, humanizeAmount: 0.6 } },
  ],
};

export function feelOf(part: InsertPart, id: string): Feel | undefined {
  return FEELS[part].find((f) => f.id === id);
}
