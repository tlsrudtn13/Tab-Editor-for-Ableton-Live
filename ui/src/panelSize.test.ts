import { describe, it, expect } from "vitest";
import { fitScale, legendFit } from "./panelSize";

describe("fitScale", () => {
  it("fills the height, never shrinks, stops at max", () => {
    expect(fitScale(300, 150, 2.5)).toBe(2);
    expect(fitScale(100, 150, 2.5)).toBe(1);
    expect(fitScale(1000, 150, 2.5)).toBe(2.5);
    expect(fitScale(300, 0, 2.5)).toBe(1);
  });
});

describe("legendFit", () => {
  // same numbers as the drum map: 31 px panel header, 19 px column header, 23 px rows, 360 px blocks
  const m = { head: 31, th: 19, row: 23, max: 2,
    blocksFor: (w: number, rows: number) => Math.max(1, Math.min(4, Math.floor((w - 20) / 360), rows)) };

  it("keeps scale 1 when the panel is not taller than needed", () => {
    // 11 pads, 1200 px: 3 blocks of 4 rows = 31 + 19 + 92 = 142 px
    expect(legendFit(142, 1200, 11, m)).toEqual({ scale: 1, blocks: 3 });
    expect(legendFit(100, 1200, 11, m)).toEqual({ scale: 1, blocks: 3 });
  });

  it("a taller panel scales the table and may use fewer blocks", () => {
    const r = legendFit(260, 1200, 11, m);
    expect(r.scale).toBeGreaterThan(1);
    // fits: header + scaled table within the height
    expect(31 + r.scale * (19 + Math.ceil(11 / r.blocks) * 23)).toBeLessThanOrEqual(260);
    // and the block count is what the narrower (scaled) width allows
    expect(r.blocks).toBe(m.blocksFor(1200 / r.scale, 11));
  });

  it("never goes past max", () => {
    expect(legendFit(5000, 1200, 11, m).scale).toBe(2);
  });
});
