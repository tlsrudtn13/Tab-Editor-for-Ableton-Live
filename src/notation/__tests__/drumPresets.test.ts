import { describe, expect, it } from "vitest";
import {
  DRUM_PATTERNS,
  GM_ROLE_PITCH,
  patternBars,
  renderDrumPattern,
  type DrumPattern,
} from "../drumPresets.js";

const byId = (id: string): DrumPattern => {
  const p = DRUM_PATTERNS.find((x) => x.id === id);
  if (!p) throw new Error(`missing pattern ${id}`);
  return p;
};

const ALLOWED = new Set([".", "x", "X", "g"]);

describe("drumPresets patterns", () => {
  it("every pattern has same-length tracks, valid chars, length divisible by grid", () => {
    for (const p of DRUM_PATTERNS) {
      const lengths = Object.values(p.tracks).map((t) => t!.length);
      expect(lengths.length, p.id).toBeGreaterThan(0);
      expect(new Set(lengths).size, p.id).toBe(1);
      const len = lengths[0]!;
      const grid = p.beatsPerBar * p.stepsPerBeat;
      expect(len % grid, `${p.id} divisible`).toBe(0);
      for (const [role, track] of Object.entries(p.tracks)) {
        for (const ch of track!) {
          expect(ALLOWED.has(ch), `${p.id}:${role} char ${ch}`).toBe(true);
        }
      }
    }
  });
});

describe("GM_ROLE_PITCH", () => {
  it("has exact GM mapping", () => {
    expect(GM_ROLE_PITCH).toMatchObject({
      kick: 36,
      snare: 38,
      rim: 37,
      clap: 39,
      hhClosed: 42,
      hhPedal: 44,
      hhOpen: 46,
      crash: 49,
      ride: 51,
      tomHigh: 50,
      tomMid: 47,
      tomLow: 45,
      tomFloor: 41,
    });
  });
});

describe("renderDrumPattern", () => {
  it("rock 1 bar at startBeat 8: kicks, snares, hats", () => {
    const hits = renderDrumPattern("rock", { startBeat: 8, bars: 1 });
    const kicks = hits.filter((h) => h.p === 36).map((h) => h.b).sort((a, b) => a - b);
    const snares = hits.filter((h) => h.p === 38);
    const hats = hits.filter((h) => h.p === 42);
    expect(kicks).toEqual([8, 10, 10.5]);
    expect(snares.map((h) => h.b).sort((a, b) => a - b)).toEqual([9, 11]);
    expect(snares.every((h) => h.v === 115)).toBe(true);
    expect(hats).toHaveLength(8);
  });

  it("hipHop swing: even step unswung, odd step swung", () => {
    const hits = renderDrumPattern("hipHop", { startBeat: 0, bars: 1 });
    // hat at step 2 (even) -> 0.5
    const hatStep2 = hits.find((h) => h.p === 42 && Math.abs(h.b - 0.5) < 1e-6);
    expect(hatStep2).toBeDefined();
    // kick at step 7 (odd) -> 1.75 + 0.05 = 1.8
    const kickStep7 = hits.find((h) => h.p === 36 && Math.abs(h.b - 1.8) < 1e-6);
    expect(kickStep7).toBeDefined();
  });

  it("shuffle: snare at beat 1 and 3; sixEight bar length 3", () => {
    const shuffle = renderDrumPattern("shuffle", { startBeat: 0, bars: 1 });
    const snares = shuffle.filter((h) => h.p === 38).map((h) => h.b).sort((a, b) => a - b);
    expect(snares).toEqual([1, 3]);
    expect(patternBars(byId("sixEight"))).toBe(1);
    const six = renderDrumPattern("sixEight", { startBeat: 0, bars: 1 });
    expect(six.every((h) => h.b >= 0 && h.b < 3)).toBe(true);
  });

  it("bars repeats and truncates", () => {
    const rock3 = renderDrumPattern("rock", { startBeat: 0, bars: 3 });
    expect(rock3.some((h) => h.b >= 8)).toBe(true);
    expect(rock3.every((h) => h.b < 12)).toBe(true);
    const bossa1 = renderDrumPattern("bossa", { startBeat: 0, bars: 1 });
    expect(bossa1.every((h) => h.b < 4)).toBe(true);
    expect(patternBars(byId("bossa"))).toBe(2);
  });

  it("pitchMap overrides only mapped role; velocityScale clamps; ghost v=40", () => {
    const hits = renderDrumPattern("rock", { startBeat: 0, bars: 1, pitchMap: { kick: 35 } });
    expect(hits.filter((h) => h.p === 35).length).toBeGreaterThan(0);
    expect(hits.filter((h) => h.p === 36)).toHaveLength(0);
    expect(hits.filter((h) => h.p === 38).length).toBeGreaterThan(0); // snare unchanged

    const loud = renderDrumPattern("rock", { startBeat: 0, bars: 1, velocityScale: 2 });
    expect(loud.every((h) => h.v >= 1 && h.v <= 127)).toBe(true);
    expect(loud.some((h) => h.v === 127)).toBe(true); // accent 115*2 clamped

    const funk = renderDrumPattern("funk", { startBeat: 0, bars: 1 });
    const ghosts = funk.filter((h) => h.v === 40);
    expect(ghosts.length).toBeGreaterThan(0);
  });

  it("unknown id throws; custom pattern with bad char throws", () => {
    expect(() => renderDrumPattern("nope", { startBeat: 0 })).toThrow();
    const bad: DrumPattern = {
      id: "bad",
      name: "Bad",
      kind: "groove",
      beatsPerBar: 4,
      stepsPerBeat: 4,
      tracks: { kick: "x..y" },
    };
    expect(() => renderDrumPattern(bad, { startBeat: 0 })).toThrow();
  });

  it("output sorted by b then p, b rounded to 1e-6", () => {
    const hits = renderDrumPattern("house", { startBeat: 0, bars: 1 });
    for (let i = 1; i < hits.length; i++) {
      const a = hits[i - 1]!;
      const b = hits[i]!;
      expect(a.b < b.b || (Math.abs(a.b - b.b) < 1e-12 && a.p <= b.p)).toBe(true);
    }
    for (const h of hits) {
      expect(h.b).toBe(Math.round(h.b * 1e6) / 1e6);
    }
  });
});
