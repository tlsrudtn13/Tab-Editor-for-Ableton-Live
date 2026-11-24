import { describe, expect, it } from "vitest";
import { clampSpeed, loopRange, toTicks } from "./practice";

describe("practice helpers", () => {
  it("same bar → null", () => {
    expect(loopRange(0.5, 1.2, 4, 16)).toBeNull();
  });

  it("bars 2–3 in 4/4 → {4, 12, \"Bars 2–3\"}", () => {
    expect(loopRange(5, 9, 4, 16)).toEqual({ start: 4, end: 12, label: "Bars 2–3" });
  });

  it("reversed anchor/cursor", () => {
    expect(loopRange(9, 5, 4, 16)).toEqual({ start: 4, end: 12, label: "Bars 2–3" });
  });

  it("clamp to clipEnd", () => {
    expect(loopRange(4, 10, 4, 10)).toEqual({ start: 4, end: 10, label: "Bars 2–3" });
  });

  it("3/4", () => {
    // bars 1-2 in 3/4: beats 0-6
    expect(loopRange(0.5, 4, 3, 12)).toEqual({ start: 0, end: 6, label: "Bars 1–2" });
  });

  it("toTicks(4,12) = 3840/11520", () => {
    expect(toTicks({ start: 4, end: 12 })).toEqual({ startTick: 3840, endTick: 11520 });
  });

  it("clampSpeed rounds to nearest 5 and clamps 50-100", () => {
    expect(clampSpeed(42)).toBe(50);
    expect(clampSpeed(77)).toBe(75);
    expect(clampSpeed(120)).toBe(100);
  });
});
