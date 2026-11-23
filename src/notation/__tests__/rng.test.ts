import { describe, expect, it } from "vitest";
import { mulberry32, pick } from "../rng.js";

describe("mulberry32", () => {
  it("same seed -> same first 5 values", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds differ", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });

  it("values in [0,1)", () => {
    const rnd = mulberry32(123456);
    for (let i = 0; i < 1000; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pick", () => {
  it("picks deterministically from seeded rng", () => {
    const items = ["a", "b", "c", "d"] as const;
    const rnd = mulberry32(7);
    const picked = [pick(rnd, items), pick(rnd, items), pick(rnd, items)];
    const rnd2 = mulberry32(7);
    expect(picked).toEqual([pick(rnd2, items), pick(rnd2, items), pick(rnd2, items)]);
    for (const p of picked) expect(items).toContain(p);
  });
});
