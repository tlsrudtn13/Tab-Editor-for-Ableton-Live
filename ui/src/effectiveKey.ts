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

function transformRomanPart(part: string): string {
  if (part.startsWith("b") || part.startsWith("#")) return part;
  const m = /^(iii|vii|vi|III|VII|VI)(.*)$/.exec(part);
  if (!m) return part;
  const base = m[1]!;
  const rest = m[2]!;
  // vii° / viiø7 are the raised leading tone - already correct.
  if (base === "vii" && (rest.startsWith("°") || rest.startsWith("ø"))) return part;
  return "b" + part;
}

/** Display a roman numeral in a key: in minor keys, natural III/VI/VII (and their lower-case/extended forms,
 *  except the raised leading tone vii°/viiø7) get a flat prefix. Major keys unchanged. */
export function displayRoman(roman: string, key: KeyRef): string {
  if (key.mode !== "minor") return roman;
  return roman.split("/").map(transformRomanPart).join("/");
}

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
  if (key.mode === "minor") {
    return [
      { root: mod12(key.root + 5), quality: "" },      // IV
      { root: key.root, quality: "" },                 // I (picardy)
      { root: mod12(key.root + 1), quality: "" },      // bII
      { root: mod12(sc[4]! + 7), quality: "7" },       // V7/V
    ];
  }
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

/** 7 diatonic triads of the key, then borrowed chords not already in the key. */
export function swapChoices(key: KeyRef): SwapChoice[] {
  const diatonic = diatonicTriads(key);
  const out: SwapChoice[] = diatonic.map(chord => {
    const r = romanOf(chord, key);
    return { chord, name: chordDisplayName(chord), roman: displayRoman(r.roman, key), tier: r.tier, group: "key" as const };
  });
  for (const chord of borrowedChords(key)) {
    if (diatonic.some(d => chordEq(d, chord))) continue;
    const r = romanOf(chord, key);
    out.push({ chord, name: chordDisplayName(chord), roman: displayRoman(r.roman, key), tier: "color", group: "borrowed" });
  }
  return out;
}
