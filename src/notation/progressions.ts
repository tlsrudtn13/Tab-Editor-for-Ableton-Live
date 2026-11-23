import { chordName, parseRoman, type ChordSym, type KeyRef } from "./harmony.js";

export type ProgressionPreset = { id: string; name: string; mode: "major" | "minor"; numerals: string[] };

export const PROGRESSIONS: readonly ProgressionPreset[] = [
  { id: "pop", name: "I–V–vi–IV", mode: "major", numerals: ["I", "V", "vi", "IV"] },
  { id: "fifties", name: "I–vi–IV–V", mode: "major", numerals: ["I", "vi", "IV", "V"] },
  { id: "sensitive", name: "vi–IV–I–V", mode: "major", numerals: ["vi", "IV", "I", "V"] },
  { id: "rock", name: "I–IV–V–IV", mode: "major", numerals: ["I", "IV", "V", "IV"] },
  { id: "canon", name: "Canon", mode: "major", numerals: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"] },
  { id: "jazz251", name: "ii–V–I", mode: "major", numerals: ["ii7", "V7", "Imaj7", "Imaj7"] },
  { id: "blues12", name: "12-bar blues", mode: "major", numerals: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"] },
  { id: "minor251", name: "Minor ii–V–i", mode: "minor", numerals: ["iiø7", "V7", "i", "i"] },
  { id: "andalusian", name: "Andalusian", mode: "minor", numerals: ["i", "VII", "VI", "V"] },
  { id: "epic", name: "i–bVI–bIII–bVII", mode: "minor", numerals: ["i", "VI", "III", "VII"] },
  { id: "aeolianRock", name: "i–iv–v", mode: "minor", numerals: ["i", "iv", "v", "i"] },
];

export type PlacedChord = ChordSym & { b: number; d: number; name: string; roman: string };

export function realizeProgression(
  preset: ProgressionPreset | string,
  key: KeyRef,
  opts: { startBeat: number; beatsPerBar?: number; barsPerChord?: number; repeat?: number },
): PlacedChord[] {
  const p = typeof preset === "string" ? PROGRESSIONS.find((x) => x.id === preset) : preset;
  if (!p) throw new Error(`Unknown progression preset: ${preset}`);

  const beatsPerBar = opts.beatsPerBar ?? 4;
  const barsPerChord = opts.barsPerChord ?? 1;
  const repeat = opts.repeat ?? 1;
  const d = barsPerChord * beatsPerBar;

  const out: PlacedChord[] = [];
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < p.numerals.length; i++) {
      const roman = p.numerals[i]!;
      const chord = parseRoman(roman, key);
      const k = r * p.numerals.length + i;
      out.push({
        ...chord,
        b: opts.startBeat + k * d,
        d,
        name: chordName(chord),
        roman,
      });
    }
  }
  return out;
}
