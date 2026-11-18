import { describe, it, expect } from "vitest";
import { clampZoom, stepZoom, zoomLabel, ZOOM_LEVELS } from "./uiZoom";

describe("ui zoom levels", () => {
  it("snaps to the nearest level and treats junk as 100 %", () => {
    expect(clampZoom(1.24)).toBe(1.25);
    expect(clampZoom(3)).toBe(2);
    expect(clampZoom(0.1)).toBe(0.8);
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(-1)).toBe(1);
  });
  it("steps one level and stops at the ends", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(ZOOM_LEVELS[0], -1)).toBe(ZOOM_LEVELS[0]);
    expect(stepZoom(2, 1)).toBe(2);
  });
  it("labels as percent", () => {
    expect(zoomLabel(1.25)).toBe("125%");
    expect(zoomLabel(0.9)).toBe("90%");
  });
});
