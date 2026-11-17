import { describe, expect, it } from "vitest";
import { normalizeRect, pointsFar, rectsIntersect } from "./dragSelect";

describe("dragSelect pure helpers", () => {
  it("rectsIntersect detects overlap", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it("normalizeRect handles any drag direction", () => {
    expect(normalizeRect(10, 10, 2, 4)).toEqual({ x: 2, y: 4, w: 8, h: 6 });
    expect(normalizeRect(1, 2, 5, 6)).toEqual({ x: 1, y: 2, w: 4, h: 4 });
  });
  it("pointsFar uses 4px threshold by default", () => {
    expect(pointsFar({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(pointsFar({ x: 0, y: 0 }, { x: 4, y: 1 })).toBe(true);
    expect(pointsFar({ x: 0, y: 0 }, { x: 4, y: 0 }, 4)).toBe(false);
  });
});
