import { keyRefFromKeyInfo, PC_NAMES, scaleOf, type ChordSym, type KeyRef } from "../../src/notation/harmony.js";
import { romanOf, type ChordTier } from "../../src/notation/harmonyAnalysis.js";
import { keyFromLiveScale } from "../../src/notation/music.js";

export type EffectiveKeySource = "fixed" | "live" | "analysis" | "default";
export type EffectiveKeyResult = { key: KeyRef; source: EffectiveKeySource; sure?: "sure" | "likely" | "est." };

export function sureWord(confidence: number): "sure" | "likely" | "est." {
  return confidence >= 0.7 ? "sure" : confidence >= 0.4 ? "likely" : "est.";
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function effectiveKey(trk: any, analysis: { key: KeyRef | null; confidence: number } | null): EffectiveKeyResult {
  const fixed = trk?.ann?.key;
  if (fixed && typeof fixed.fifths === "number") {
    try {
      return {
        key: keyRefFromKeyInfo({ fifths: fixed.fifths, mode: fixed.minor ? "minor" : "major" } as any),
        source: "fixed",
      };
    } catch { /* fall through */ }
  }
  const live = trk?.live?.scale;
  if (live?.enabled) {
    const ki = keyFromLiveScale(live.root, live.name);
    if (ki) {
      try {
        return { key: keyRefFromKeyInfo(ki), source: "live" };
      } catch { /* fall through */ }
    }
  }
  if (analysis?.key) {
    return { key: analysis.key, source: "analysis", sure: sureWord(analysis.confidence ?? 0) };
  }
  return { key: { root: 0, mode: "major" }, source: "default" };
}

export type SwapChoice = { chord: ChordSym; name: string; roman: string; tier: ChordTier; group: "key" | "borrowed" };

function diatonicTriads(key: KeyRef): ChordSym[] {
  const sc = scaleOf(key);
  if (key.mode === "major") {
    return [
      { root: sc[0]!, quality: "" },
      { root: sc[1]!, quality: "m" },
      { root: sc[2]!, quality: "m" },
      { root: sc[3]!, quality: "" },
      { root: sc[4]!, quality: "" },
      { root: sc[5]!, quality: "m" },
      { root: sc[6]!, quality: "dim" },
    ];
  }
  return [
    { root: sc[0]!, quality: "m" },
    { root: sc[1]!, quality: "dim" },
    { root: sc[2]!, quality: "" },
    { root: sc[3]!, quality: "m" },
    { root: sc[4]!, quality: "" }, // V, harmonic minor dominant
    { root: sc[5]!, quality: "" },
    { root: sc[6]!, quality: "" },
  ];
}

function chordEq(a: ChordSym, b: ChordSym): boolean {
  return mod12(a.root) === mod12(b.root) && a.quality === b.quality;
}

function borrowedChords(key: KeyRef): ChordSym[] {
  const sc = scaleOf(key);
  return [
    { root: mod12(key.root + 10), quality: "" },     // bVII
    { root: sc[3]!, quality: "m" },                  // iv
    { root: mod12(sc[4]! + 7), quality: "7" },       // V7/V
    { root: mod12(key.root + 8), quality: "" },      // bVI
  ];
}

export function chordDisplayName(c: ChordSym): string {
  return PC_NAMES[mod12(c.root)] + c.quality;
}

/** 7 diatonic triads of the key, then borrowed bVII, iv, V7/V, bVI not already in the key. */
export function swapChoices(key: KeyRef): SwapChoice[] {
  const diatonic = diatonicTriads(key);
  const out: SwapChoice[] = diatonic.map(chord => {
    const r = romanOf(chord, key);
    return { chord, name: chordDisplayName(chord), roman: r.roman, tier: r.tier, group: "key" as const };
  });
  for (const chord of borrowedChords(key)) {
    if (diatonic.some(d => chordEq(d, chord))) continue;
    const r = romanOf(chord, key);
    out.push({ chord, name: chordDisplayName(chord), roman: r.roman, tier: "color", group: "borrowed" });
  }
  return out;
}
