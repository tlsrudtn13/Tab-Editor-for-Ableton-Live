export type ChordNote = { b: number; d: number; p: number; v?: number };

export type ChordCandidate = {
  name: string;
  root: number; /* pitch class 0-11 */
  bass: number;
  quality: string;
  score: number;
};

const NOTE_NAMES: string[] = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

type Template = { quality: string; intervals: number[] };

const TEMPLATES: Template[] = [
  { quality: "", intervals: [0, 4, 7] },
  { quality: "m", intervals: [0, 3, 7] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "aug", intervals: [0, 4, 8] },
  { quality: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", intervals: [0, 5, 7] },
  { quality: "5", intervals: [0, 7] },
  { quality: "6", intervals: [0, 4, 7, 9] },
  { quality: "m6", intervals: [0, 3, 7, 9] },
  { quality: "7", intervals: [0, 4, 7, 10] },
  { quality: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "m7", intervals: [0, 3, 7, 10] },
  { quality: "mMaj7", intervals: [0, 3, 7, 11] },
  { quality: "m7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "7sus4", intervals: [0, 5, 7, 10] },
  { quality: "add9", intervals: [0, 2, 4, 7] },
  { quality: "9", intervals: [0, 2, 4, 7, 10] },
  { quality: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "m9", intervals: [0, 2, 3, 7, 10] },
  { quality: "7b9", intervals: [0, 1, 4, 7, 10] },
  { quality: "7#9", intervals: [0, 3, 4, 7, 10] },
];

/**
 * Chord-tone roles by interval value (not by position): third = 4 or 3 (sus: 2 or 5), fifth = 7, 6 or 8,
 * sevenths/sixths = 9, 10, 11, everything else (b9, 9, #9) = extension. In 7#9 [0,3,4,7,10] the 4 is the
 * third and the 3 is the #9.
 */
function templateRoles(t: Template): { third?: number; fifth?: number; sevenths: number[]; extensions: number[] } {
  const ivs = t.intervals.filter(iv => iv !== 0);
  let third: number | undefined;
  if (t.quality.startsWith("sus") || t.quality === "7sus4") third = ivs.includes(5) && t.quality !== "sus2" ? 5 : 2;
  else if (t.quality !== "5") third = ivs.includes(4) ? 4 : ivs.includes(3) ? 3 : undefined;
  const fifth = [7, 6, 8].find(iv => ivs.includes(iv) && !(iv === 8 && t.quality !== "aug") && !(iv === 6 && !/dim|b5/.test(t.quality)));
  const sevenths: number[] = ivs.filter(iv => iv === 9 || iv === 10 || iv === 11);
  const extensions = ivs.filter(iv => iv !== third && iv !== fifth && !sevenths.includes(iv));
  return { third, fifth, sevenths, extensions };
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function approxIntMult(b: number, beatsPerBar: number): boolean {
  const r = b % beatsPerBar;
  const eps = 1e-6;
  return r < eps || Math.abs(r - beatsPerBar) < eps;
}

function isWholeBeat(b: number): boolean {
  const r = Math.abs(b - Math.round(b));
  return r < 1e-6;
}

function beatStrength(startB: number, start: number, beatsPerBar: number): number {
  if (startB < start - 1e-9) {
    return 0.8;
  }
  if (approxIntMult(startB, beatsPerBar)) return 1.0;
  if (isWholeBeat(startB)) return 0.8;
  return 0.5;
}

function inKeyScale(pc: number, keyRoot: number, keyIntervals: number[]): boolean {
  const rel = mod12(pc - keyRoot);
  return keyIntervals.some(k => mod12(k) === rel);
}

export function chordCandidates(
  notes: ChordNote[],
  start: number,
  end: number,
  opts?: { limit?: number; keyRoot?: number; keyIntervals?: number[]; beatsPerBar?: number },
): ChordCandidate[] {
  const limit = opts?.limit ?? 4;
  const beatsPerBar = opts?.beatsPerBar ?? 4;
  const keyRoot = opts?.keyRoot;
  const keyIntervals = opts?.keyIntervals;

  // 1) collect overlapping notes
  const overlaps: { note: ChordNote; overlap: number }[] = [];
  for (const n of notes) {
    const ov = Math.min(n.b + n.d, end) - Math.max(n.b, start);
    if (ov > 1e-9) overlaps.push({ note: n, overlap: ov });
  }

  // 2) weight by pitch class
  const wArr = new Array(12).fill(0) as number[];
  for (const { note, overlap } of overlaps) {
    const bs = beatStrength(note.b, start, beatsPerBar);
    const vPart = 0.5 + ((note.v ?? 100) / 254);
    const pc = mod12(note.p);
    wArr[pc] += overlap * bs * vPart;
  }

  // find bass: lowest sounding pitch (ties => longer overlap)
  let bassPc = 0;
  if (overlaps.length > 0) {
    let bestPitch = Infinity;
    let bestOverlap = -1;
    for (const { note, overlap } of overlaps) {
      if (note.p < bestPitch - 1e-9 || (Math.abs(note.p - bestPitch) < 1e-9 && overlap > bestOverlap + 1e-9)) {
        bestPitch = note.p;
        bestOverlap = overlap;
      }
    }
    bassPc = mod12(bestPitch);
  }

  const maxW = Math.max(0, ...wArr);
  if (maxW <= 1e-9) return [];

  const wNorm = wArr.map(w => w / maxW);
  // drop pcs below 0.12 unless bass
  const soundingPcsSet = new Set<number>();
  for (let pc = 0; pc < 12; pc++) {
    if (pc === bassPc) {
      soundingPcsSet.add(pc);
    } else if (wNorm[pc] >= 0.12) {
      soundingPcsSet.add(pc);
    }
  }
  soundingPcsSet.add(bassPc);
  const soundingPcs = Array.from(soundingPcsSet.values()).sort((a, b) => a - b);
  const numSounding = soundingPcs.length;

  if (numSounding < 2) {
    return [];
  }

  // Special case: exactly 2 pcs -> allow "5" and best triad-with-omission only if scores well
  if (numSounding === 2) {
    const candidates2: ChordCandidate[] = [];
    // try power chord "5" for either as root
    for (const root of soundingPcs) {
      const fifth = mod12(root + 7);
      if (soundingPcsSet.has(fifth) || true) {
        // score simply
        let sc = 0;
        sc += 3 * (wNorm[root] || 0);
        if (soundingPcsSet.has(fifth)) sc += 1 * (wNorm[fifth] || 0);
        else sc += -0.3;
        // penalize outside? no other pcs
        if (bassPc === root) sc += 1.5;
        const name = NOTE_NAMES[root] + "5" + (bassPc !== root ? "/" + NOTE_NAMES[bassPc] : "");
        candidates2.push({ name, root, bass: bassPc, quality: "5", score: sc });
      }
    }
    // best triad-with-omission: try major/minor triads where 2 of 3 present
    for (const root of [0,1,2,3,4,5,6,7,8,9,10,11]) {
      for (const qual of ["", "m"]) {
        const ivs = qual === "" ? [0,4,7] : [0,3,7];
        const tones = ivs.map(iv => mod12(root + iv));
        const presentCount = tones.filter(t => soundingPcsSet.has(t)).length;
        if (presentCount >= 2) {
          let sc = 0;
          // root
          if (soundingPcsSet.has(root)) sc += 3 * (wNorm[root] || 0);
          else sc += -2.5;
          // third
          const thirdTone = tones[1];
          if (soundingPcsSet.has(thirdTone)) sc += 2.5 * (wNorm[thirdTone] || 0);
          else sc += -3;
          // fifth
          const fifthTone = tones[2];
          if (soundingPcsSet.has(fifthTone)) sc += 1 * (wNorm[fifthTone] || 0);
          else sc += -0.3;
          // outside tones
          for (const spc of soundingPcs) {
            if (!tones.includes(spc)) {
              sc += -2.5 * (wNorm[spc] || 0);
            }
          }
          if (bassPc === root) sc += 1.5;
          const name = NOTE_NAMES[root] + qual + (bassPc !== root ? "/" + NOTE_NAMES[bassPc] : "");
          candidates2.push({ name, root, bass: bassPc, quality: qual, score: sc });
        }
      }
    }
    // dedupe and sort
    const bestByName = new Map<string, ChordCandidate>();
    for (const c of candidates2) {
      const ex = bestByName.get(c.name);
      if (!ex || c.score > ex.score) bestByName.set(c.name, c);
    }
    const res2 = Array.from(bestByName.values()).sort((a, b) => b.score - a.score);
    return res2.slice(0, limit);
  }

  function scoreCandidate(root: number, templ: Template, ignoreOutsideBass = false): number {
    const intervals = templ.intervals;
    const tonesInTemplate = intervals.map(iv => mod12(root + iv));
    const toneSet = new Set(tonesInTemplate);

    const hasRoot = soundingPcsSet.has(root);
    const isLargeTemplate = intervals.length >= 4;
    if (!hasRoot && !(isLargeTemplate && numSounding >= 4)) {
      return -Infinity;
    }

    let score = 0;
    if (hasRoot) {
      score += 3 * (wNorm[root] || 0);
    } else {
      score += -2.5;
    }

    const roles = templateRoles(templ);
    if (roles.third !== undefined) {
      const thirdTone = mod12(root + roles.third);
      if (soundingPcsSet.has(thirdTone)) {
        score += 2.5 * (wNorm[thirdTone] || 0);
      } else {
        score += -3;
      }
    }
    if (roles.fifth !== undefined) {
      const fifthTone = mod12(root + roles.fifth);
      if (soundingPcsSet.has(fifthTone)) {
        score += 1 * (wNorm[fifthTone] || 0);
      } else {
        score += -0.3;
      }
    }
    for (const iv of roles.sevenths) {
      const tonePc = mod12(root + iv);
      if (soundingPcsSet.has(tonePc)) score += 2 * (wNorm[tonePc] || 0);
      else score += -2;
    }
    for (const iv of roles.extensions) {
      const tonePc = mod12(root + iv);
      if (soundingPcsSet.has(tonePc)) score += 1 * (wNorm[tonePc] || 0);
      else score += -1;
    }

    for (const spc of soundingPcs) {
      if (ignoreOutsideBass && spc === bassPc) continue; // no penalty for bass in this special scoring
      if (!toneSet.has(spc)) {
        const ww = wNorm[spc] || 0;
        if (keyRoot !== undefined && keyIntervals !== undefined && ww < 0.3 && inKeyScale(spc, keyRoot, keyIntervals)) {
          score += -1 * ww;
        } else {
          score += -2.5 * ww;
        }
      }
    }

    if (intervals.length > 3) score += -0.15 * (intervals.length - 3);

    // bass scoring
    if (bassPc === root) {
      score += 1.5;
    } else {
      const thirdTone = roles.third !== undefined ? mod12(root + roles.third) : -1;
      const fifthTone = roles.fifth !== undefined ? mod12(root + roles.fifth) : -1;
      const isSeventhPc = roles.sevenths.some(iv => mod12(root + iv) === bassPc);
      if (bassPc === thirdTone || bassPc === fifthTone) {
        score += 0.5;
      } else if (isSeventhPc) {
        score += 0.2;
      } else {
        // bass not a chord tone
        score += -1;
      }
    }

    if (keyRoot !== undefined && keyIntervals !== undefined && inKeyScale(root, keyRoot, keyIntervals)) {
      score += 0.5;
    }

    return score;
  }

  const candidates: ChordCandidate[] = [];
  for (let root = 0; root < 12; root++) {
    for (const templ of TEMPLATES) {
      const sc = scoreCandidate(root, templ, false);
      if (!isFinite(sc)) continue;
      const nameBase = NOTE_NAMES[root] + templ.quality;
      const intervals = templ.intervals;
      const toneSet = new Set(intervals.map(iv => mod12(root + iv)));
      let name = nameBase;
      if (bassPc !== root) {
        name = nameBase + "/" + NOTE_NAMES[bassPc];
        // if bass not a chord tone, also add a slash candidate scored without outside-tone penalty for bass
        if (!toneSet.has(bassPc)) {
          const sc2 = scoreCandidate(root, templ, true);
          if (isFinite(sc2)) {
            candidates.push({ name, root, bass: bassPc, quality: templ.quality, score: sc2 });
          }
        }
      }
      candidates.push({ name, root, bass: bassPc, quality: templ.quality, score: sc });
    }
  }

  const bestByName = new Map<string, ChordCandidate>();
  for (const c of candidates) {
    const ex = bestByName.get(c.name);
    if (!ex || c.score > ex.score) bestByName.set(c.name, c);
  }
  const result = Array.from(bestByName.values());
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, limit);
}

export function autoChord(
  notes: ChordNote[],
  start: number,
  end: number,
  opts?: { keyRoot?: number; keyIntervals?: number[]; beatsPerBar?: number },
): string | undefined {
  // Count sounding pitch classes in range (rough check)
  const overlaps: { note: ChordNote; overlap: number }[] = [];
  for (const n of notes) {
    const ov = Math.min(n.b + n.d, end) - Math.max(n.b, start);
    if (ov > 1e-9) overlaps.push({ note: n, overlap: ov });
  }
  const pcs = new Set<number>();
  for (const { note } of overlaps) pcs.add(((note.p % 12) + 12) % 12);
  if (pcs.size < 3) return undefined; // too ambiguous for auto
  const cands = chordCandidates(notes, start, end, { ...opts, limit: 4 });
  if (cands.length === 0) return undefined;
  const top = cands[0];
  const second = cands[1];
  if (!second) {
    if (top.score >= 2) return top.name;
    return undefined;
  }
  if (top.score - second.score >= 0.75 && top.score >= 2) {
    return top.name;
  }
  return undefined;
}
