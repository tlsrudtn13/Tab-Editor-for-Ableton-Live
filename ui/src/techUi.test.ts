import { describe, expect, it } from "vitest";
import { techSelectionState } from "./techUi";

describe("techSelectionState", () => {
  it("returns idle for empty selection", () => {
    expect(techSelectionState([], "lr", () => [])).toBe("idle");
  });
  it("returns all when every selected has tech", () => {
    expect(techSelectionState([1, 2], "lr", () => ["lr", "pm"])).toBe("all");
  });
  it("returns none when none have tech", () => {
    expect(techSelectionState([1, 2], "lr", (i) => (i === 1 ? ["pm"] : []))).toBe("none");
  });
  it("returns mixed when some have tech", () => {
    expect(techSelectionState([1, 2, 3], "lr", (i) => (i === 2 ? ["lr"] : []))).toBe("mixed");
  });
});
