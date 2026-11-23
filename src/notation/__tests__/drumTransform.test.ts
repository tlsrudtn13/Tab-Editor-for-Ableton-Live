import { describe, expect, it } from "vitest";
import { DRUM_PATTERNS, renderDrumPattern, type DrumHit } from "../drumPresets.js";
import { addFills, drumEnergy, humanize, limbCheck } from "../drumTransform.js";

const byId = (id: string) => {
  const p = DRUM_PATTERNS.find((x) => x.id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};

describe("limbCheck", () => {
  it("every DRUM_PATTERN rendered for its own bars has no limbCheck conflicts", () => {
    for (const p of DRUM_PATTERNS) {
      const hits = renderDrumPattern(p, { startBeat: 0 });
      expect(limbCheck(hits), p.id).toEqual([]);
    }
  });

  it("hand-made hit set with snare + hat + crash + tom at one time is a hands conflict", () => {
    const hits: DrumHit[] = [
      { b: 1, d: 0.25, p: 38, v: 100 }, // snare
      { b: 1, d: 0.25, p: 42, v: 90 }, // hhClosed
      { b: 1, d: 0.25, p: 49, v: 110 }, // crash
      { b: 1, d: 0.25, p: 47, v: 100 }, // tomMid
    ];
    const conflicts = limbCheck(hits);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ b: 1, limb: "hands" });
    expect(conflicts[0]!.pitches.sort((a, b) => a - b)).toEqual([38, 42, 47, 49]);
  });
});

describe("drumEnergy", () => {
  it("energy 3 equals input", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 1 });
    const out = drumEnergy(input, 3, { startBeat: 0, bars: 1, seed: 1 });
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("energy 2 on funk removes its ghosts and all 16th hats", () => {
    const input = renderDrumPattern("funk", { startBeat: 0, bars: 1 });
    const out = drumEnergy(input, 2, { startBeat: 0, bars: 1, seed: 1 });
    expect(out.some((h) => h.v <= 50)).toBe(false);
    const hats = out.filter((h) => h.p === 42 || h.p === 46);
    expect(hats.length).toBeGreaterThan(0);
    for (const h of hats) {
      const offset = h.b - 0;
      expect(Math.abs((offset % 0.5) - 0) < 1e-6 || Math.abs((offset % 0.5) - 0.5) < 1e-6).toBe(true);
    }
  });

  it("energy 1 on rock keeps 4 hats per bar", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 1 });
    const out = drumEnergy(input, 1, { startBeat: 0, bars: 1, seed: 1 });
    const hats = out.filter((h) => h.p === 42);
    expect(hats).toHaveLength(4);
    expect(hats.map((h) => h.b)).toEqual([0, 1, 2, 3]);
  });

  it("energy 4 on rock (2 bars) adds exactly 4 ghost snares and one open hat at b 7.5", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 2 });
    const out = drumEnergy(input, 4, { startBeat: 0, bars: 2, seed: 7 });
    const ghostSnares = out.filter((h) => h.p === 38 && h.v === 35);
    expect(ghostSnares).toHaveLength(4);
    const openAt75 = out.filter((h) => h.p === 46 && Math.abs(h.b - 7.5) < 1e-6);
    expect(openAt75).toHaveLength(1);
  });

  it("energy 5 on rock has 16 hats (closed + open) in bar 2 and a crash at 0 with no hat at 0", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 2 });
    const out = drumEnergy(input, 5, { startBeat: 0, bars: 2, seed: 7 });
    const bar2Hats = out.filter((h) => (h.p === 42 || h.p === 46) && h.b >= 4 - 1e-6 && h.b < 8 - 1e-6);
    expect(bar2Hats).toHaveLength(16);
    const crashAt0 = out.filter((h) => h.p === 49 && Math.abs(h.b - 0) < 1e-6);
    expect(crashAt0).toHaveLength(1);
    const hatAt0 = out.filter((h) => (h.p === 42 || h.p === 46) && Math.abs(h.b - 0) < 1e-6);
    expect(hatAt0).toHaveLength(0);
  });

  it("same seed -> identical output; no limb conflicts at any level for every 4/4 groove", () => {
    const grooves = DRUM_PATTERNS.filter((p) => p.kind === "groove" && p.beatsPerBar === 4);
    for (const p of grooves) {
      const input = renderDrumPattern(p, { startBeat: 0, bars: 2 });
      for (const level of [1, 2, 3, 4, 5] as const) {
        const a = drumEnergy(input, level, { startBeat: 0, bars: 2, seed: 99 });
        const b = drumEnergy(input, level, { startBeat: 0, bars: 2, seed: 99 });
        expect(a, `${p.id} level ${level}`).toEqual(b);
        expect(limbCheck(a), `${p.id} level ${level} limb`).toEqual([]);
      }
    }
  });
});

describe("addFills", () => {
  it("every 4 on 8 bars of rock from 0: bars 4 and 8 contain fill, crash at b 16, none at b 32; kick at b 12 kept", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 8 });
    const out = addFills(input, { startBeat: 0, bars: 8, every: 4 });
    const fill = renderDrumPattern("fillToms", { startBeat: 12, bars: 1 });
    for (const fh of fill) {
      expect(out.some((h) => Math.abs(h.b - fh.b) < 1e-6 && h.p === fh.p), `fill hit at ${fh.b} p${fh.p}`).toBe(true);
    }
    const fill8 = renderDrumPattern("fillToms", { startBeat: 28, bars: 1 });
    for (const fh of fill8) {
      expect(out.some((h) => Math.abs(h.b - fh.b) < 1e-6 && h.p === fh.p), `fill8 hit at ${fh.b} p${fh.p}`).toBe(true);
    }
    const crash16 = out.filter((h) => h.p === 49 && Math.abs(h.b - 16) < 1e-6);
    expect(crash16).toHaveLength(1);
    const crash32 = out.filter((h) => h.p === 49 && Math.abs(h.b - 32) < 1e-6);
    expect(crash32).toHaveLength(0);
    const kick12 = out.filter((h) => h.p === 36 && Math.abs(h.b - 12) < 1e-6);
    expect(kick12.length).toBeGreaterThan(0);
  });
});

describe("humanize", () => {
  it("same seed -> same output; kick at b 0 unchanged; all |Δb| ≤ timing; velocities within ±8", () => {
    const input = renderDrumPattern("rock", { startBeat: 0, bars: 1 });
    const a = humanize(input, { seed: 5, timing: 0.01, velocity: 8 });
    const b = humanize(input, { seed: 5, timing: 0.01, velocity: 8 });
    expect(a).toEqual(b);
    const kick0In = input.find((h) => h.p === 36 && Math.abs(h.b - 0) < 1e-6)!;
    const kick0Out = a.find((h) => h.p === 36 && Math.abs(h.b - 0) < 1e-6)!;
    expect(kick0Out.b).toBe(kick0In.b);
    for (let i = 0; i < input.length; i++) {
      const inp = input[i]!;
      const out = a.find((h) => h.p === inp.p && Math.abs(h.v - inp.v) <= 8 && Math.abs(h.b - inp.b) <= 0.011);
      expect(out, `matching hit for ${inp.b},${inp.p}`).toBeDefined();
    }
    for (const outHit of a) {
      const candidates = input.filter((h) => h.p === outHit.p);
      const closest = candidates.reduce((best, h) => (Math.abs(h.b - outHit.b) < Math.abs(best.b - outHit.b) ? h : best), candidates[0]!);
      expect(Math.abs(outHit.b - closest.b)).toBeLessThanOrEqual(0.01 + 1e-9);
      expect(Math.abs(outHit.v - closest.v)).toBeLessThanOrEqual(8);
      expect(outHit.v).toBeGreaterThanOrEqual(1);
      expect(outHit.v).toBeLessThanOrEqual(127);
    }
  });
});
