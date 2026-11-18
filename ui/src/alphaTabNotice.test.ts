import { describe, it, expect } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { hideAlphaTabNotice, NOTICE_METHOD } from "./alphaTabNotice";

describe("hideAlphaTabNotice", () => {
  it("alphaTab still draws the notice through the method we override", () => {
    // fails when alphaTab renames it: then the notice would show again under the score
    const src = String((alphaTab as any).Environment.layoutEngines.get(alphaTab.LayoutMode.Page).createLayout({})[NOTICE_METHOD]);
    expect(src).toContain("rendered by alphaTab");
  });

  it("every layout created afterwards skips it and keeps y", () => {
    expect(hideAlphaTabNotice()).toBe(true);
    for (const mode of [alphaTab.LayoutMode.Page, alphaTab.LayoutMode.Horizontal]) {
      const layout = (alphaTab as any).Environment.layoutEngines.get(mode).createLayout({});
      expect(Object.prototype.hasOwnProperty.call(layout, NOTICE_METHOD)).toBe(true);
      expect(layout[NOTICE_METHOD](123)).toBe(123);
    }
    expect(hideAlphaTabNotice()).toBe(true);   // idempotent
  });
});
