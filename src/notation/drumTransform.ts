import { renderDrumPattern, type DrumHit } from "./drumPresets.js";
import { mulberry32 } from "./rng.js";

export type EnergyLevel = 1 | 2 | 3 | 4 | 5;
export type LimbConflict = { b: number; pitches: number[]; limb: "hands" | "feet" };

const EPS = 1e-6;
const roundBeat = (b: number): number => Math.round(b * 1e6) / 1e6;
const isOnGrid = (offset: number, grid: number): boolean => {
  const m = ((offset % grid) + grid) % grid;
  return m < EPS || Math.abs(m - grid) < EPS;
};
const isEorA = (offset: number): boolean => {
  const m = ((offset % 0.5) + 0.5) % 0.5;
  return Math.abs(m - 0.25) < EPS;
};

function sortHits(hits: DrumHit[]): DrumHit[] {
  return hits
    .map((h) => ({ ...h, b: roundBeat(h.b) }))
    .sort((a, b) => (a.b - b.b) || (a.p - b.p));
}

function inRange(b: number, startBeat: number, bars: number, beatsPerBar: number): boolean {
  return b >= startBeat - EPS && b < startBeat + bars * beatsPerBar - EPS;
}

function canAddHit(out: DrumHit[], hit: DrumHit): boolean {
  const feetPitches = new Set([35, 36, 44]);
  const isFoot = feetPitches.has(hit.p);
  const atTime = out.filter((h) => Math.abs(h.b - hit.b) <= EPS + 1e-12);
  if (isFoot) {
    const feet = new Set(atTime.filter((h) => feetPitches.has(h.p)).map((h) => h.p));
    feet.add(hit.p);
    return feet.size <= 2;
  }
  const hands = new Set(atTime.filter((h) => !feetPitches.has(h.p)).map((h) => h.p));
  hands.add(hit.p);
  return hands.size <= 2;
}

export function drumEnergy(
  hits: DrumHit[],
  level: EnergyLevel,
  opts: { startBeat: number; bars: number; beatsPerBar?: number; seed: number },
): DrumHit[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const { startBeat, bars, seed } = opts;
  const rnd = mulberry32(seed);
  let out: DrumHit[] = hits.map((h) => ({ ...h }));

  if (level === 3) return sortHits(out);
  // a swung groove (hits on the triplet grid, not on 16ths) keeps its triplets at every energy level
  const triplet = hits.some((h) => !isOnGrid(h.b - startBeat, 0.25) && isOnGrid(h.b - startBeat, 1 / 3));

  if (level === 2 || level === 1) {
    out = out.filter((h) => {
      if (h.v <= 50) return false;
      if (h.p === 42 || h.p === 46) {
        const offset = h.b - startBeat;
        if (!isOnGrid(offset, 0.5) && !(triplet && isOnGrid(offset, 1 / 3))) return false;
      }
      return true;
    });
  }

  if (level === 1) {
    out = out.filter((h) => {
      if (h.p === 42) {
        const offset = h.b - startBeat;
        if (!isOnGrid(offset, 1)) return false;
      }
      if (h.p === 36) {
        const offset = h.b - startBeat;
        if (!isOnGrid(offset, 1)) return false;
      }
      return true;
    });
  }

  if (level === 4 || level === 5) {
    // start from unchanged copy for 4/5 base? Spec says 4 adds... 5 as 4 plus...
    // 4 is relative to original (not 2/1 reductions). Rebuild from original.
    out = hits.map((h) => ({ ...h }));
    for (let bar = 0; bar < bars; bar++) {
      const barStart = startBeat + bar * beatsPerBar;
      // 2 ghost snares per bar on random empty 16th e/a positions
      const candidates: number[] = [];
      const ghostStep = triplet ? 1 / 3 : 0.25;
      for (let step = 0; step < Math.round(beatsPerBar / ghostStep); step++) {
        const offsetInBar = step * ghostStep;
        // straight grooves: 16th e/a; swung grooves: the middle triplet of each beat
        if (triplet ? step % 3 !== 1 : !isEorA(offsetInBar)) continue;
        const b = roundBeat(barStart + offsetInBar);
        const hasSnare = out.some((h) => h.p === 38 && Math.abs(h.b - b) < EPS);
        if (!hasSnare) candidates.push(b);
      }
      // pick 2 random from candidates
      const pool = candidates.slice();
      let added = 0;
      while (added < 2 && pool.length > 0) {
        const idx = Math.floor(rnd() * pool.length);
        const b = pool.splice(idx, 1)[0]!;
        const hit: DrumHit = { b, d: 0.25, p: 38, v: 35 };
        if (canAddHit(out, hit)) {
          out.push(hit);
          added++;
        }
      }

      // open hat on last 8th of every 2nd bar replacing a closed hat there
      const isSecond = (bar + 1) % 2 === 0; // 2nd,4th,...
      if (isSecond) {
        const b = roundBeat(barStart + beatsPerBar - (triplet ? 1 / 3 : 0.5));
        out = out.filter((h) => !(h.p === 42 && Math.abs(h.b - b) < EPS));
        // only add if not already open hat
        if (!out.some((h) => h.p === 46 && Math.abs(h.b - b) < EPS)) {
          out.push({ b, d: 0.25, p: 46, v: 90 });
        }
      }
    }

    if (level === 5) {
      // fill closed hats to 16ths where there are 8th hats (v 70 on added ones)
      const additions: DrumHit[] = [];
      const hatPositions = out
        .filter((h) => (h.p === 42 || h.p === 46) && inRange(h.b, startBeat, bars, beatsPerBar))
        .map((h) => h.b);
      for (const hb of triplet ? [] : hatPositions) {
        const offset = hb - startBeat;
        if (!isOnGrid(offset, 0.5)) continue;
        const next16 = roundBeat(hb + 0.25);
        if (!inRange(next16, startBeat, bars, beatsPerBar)) continue;
        // don't add if next16 is itself an 8th hat position? next16 offset %0.5==0.25 so no
        const hasHat = out.some((h) => (h.p === 42 || h.p === 46) && Math.abs(h.b - next16) < EPS)
          || additions.some((h) => (h.p === 42 || h.p === 46) && Math.abs(h.b - next16) < EPS);
        if (!hasHat) {
          const hit: DrumHit = { b: next16, d: 0.25, p: 42, v: 70 };
          if (canAddHit(out.concat(additions), hit)) {
            additions.push(hit);
          }
        }
      }
      out.push(...additions);

      // crash at startBeat replacing a hat at that time
      const crashB = roundBeat(startBeat);
      out = out.filter((h) => !((h.p === 42 || h.p === 46) && Math.abs(h.b - crashB) < EPS));
      if (!out.some((h) => h.p === 49 && Math.abs(h.b - crashB) < EPS)) {
        out.push({ b: crashB, d: 0.25, p: 49, v: 110 });
      }
    }
  }

  return sortHits(out);
}

export function addFills(
  hits: DrumHit[],
  opts: { startBeat: number; bars: number; beatsPerBar?: number; every: 2 | 4 | 8; fill?: "fillToms" | "fillSnare"; crash?: boolean },
): DrumHit[] {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const { startBeat, bars, every } = opts;
  const fillId = opts.fill ?? "fillToms";
  const crash = opts.crash ?? true;
  let out: DrumHit[] = hits.map((h) => ({ ...h }));

  for (let group = 0; group * every < bars; group++) {
    const fillBarIndex = group * every + (every - 1); // last bar of group, 0-based within opts.bars
    if (fillBarIndex >= bars) continue;
    const barStart = roundBeat(startBeat + fillBarIndex * beatsPerBar);
    const barEnd = barStart + beatsPerBar;

    // keep only a kick at the bar downbeat from the original bar
    const keptKicks = out.filter(
      (h) => h.p === 36 && Math.abs(h.b - barStart) < EPS && h.b >= barStart - EPS && h.b < barEnd - EPS,
    );
    // remove all hits in that bar
    out = out.filter((h) => !(h.b >= barStart - EPS && h.b < barEnd - EPS));
    // add kept kicks (dedupe by b,p)
    for (const k of keptKicks) {
      if (!out.some((h) => h.p === k.p && Math.abs(h.b - k.b) < EPS)) out.push({ ...k });
    }

    // add fill pattern
    const fillHits = renderDrumPattern(fillId, { startBeat: barStart, bars: 1 });
    for (const fh of fillHits) {
      if (!out.some((h) => h.p === fh.p && Math.abs(h.b - fh.b) < EPS)) out.push({ ...fh });
    }

    // crash at first beat after each fill when inside range
    if (crash) {
      const crashB = roundBeat(barEnd);
      const limit = startBeat + bars * beatsPerBar;
      if (crashB < limit - EPS) {
        out = out.filter((h) => !(h.p === 42 && Math.abs(h.b - crashB) < EPS));
        if (!out.some((h) => h.p === 49 && Math.abs(h.b - crashB) < EPS)) {
          out.push({ b: crashB, d: 0.25, p: 49, v: 110 });
        }
      }
    }
  }

  return sortHits(out);
}

export function humanize(
  hits: DrumHit[],
  opts: { seed: number; timing?: number; velocity?: number; min?: number /* 0: earliest beat a hit may move to */ },
): DrumHit[] {
  const min = opts.min ?? 0;
  const rnd = mulberry32(opts.seed);
  const timing = opts.timing ?? 0.01;
  const velocity = opts.velocity ?? 8;
  const out = hits.map((h) => {
    const isOnQuarter = isOnGrid(h.b, 1);
    const isKickOrSnare = h.p === 36 || h.p === 38;
    let b = h.b;
    if (!(isKickOrSnare && isOnQuarter)) {
      const tOff = (rnd() * 2 - 1) * timing;
      b = h.b + tOff;
    } else {
      // consume no timing rng? need deterministic - but we must consume consistently?
      // Better consume rng in a stable way. We'll always consume timing and velocity.
      rnd(); // consume timing
    }
    if (b < min) b = min;
    const vOff = Math.round((rnd() * 2 - 1) * velocity);
    const v = Math.max(1, Math.min(127, Math.round(h.v + vOff)));
    return { ...h, b: roundBeat(b), v };
  });
  return sortHits(out);
}

export function limbCheck(hits: DrumHit[]): LimbConflict[] {
  const feetPitches = new Set([35, 36, 44]);
  // group hits starting within 1e-6
  const groups: { bs: number[]; pitches: number[] }[] = [];
  const sorted = hits.slice().sort((a, b) => a.b - b.b);
  for (const h of sorted) {
    let g = groups.find((x) => x.bs.some((b) => Math.abs(b - h.b) <= EPS + 1e-12));
    if (!g) {
      g = { bs: [h.b], pitches: [] };
      groups.push(g);
    } else {
      g.bs.push(h.b);
    }
    if (!g.pitches.includes(h.p)) g.pitches.push(h.p);
  }
  const conflicts: LimbConflict[] = [];
  for (const g of groups) {
    const b = roundBeat(g.bs.reduce((a, c) => a + c, 0) / g.bs.length);
    const feet = g.pitches.filter((p) => feetPitches.has(p));
    const hands = g.pitches.filter((p) => !feetPitches.has(p));
    if (hands.length > 2) {
      conflicts.push({ b, pitches: hands.slice().sort((a, b) => a - b), limb: "hands" });
    }
    if (feet.length > 2) {
      conflicts.push({ b, pitches: feet.slice().sort((a, b) => a - b), limb: "feet" });
    }
  }
  return conflicts.sort((a, b) => (a.b - b.b) || a.limb.localeCompare(b.limb));
}
