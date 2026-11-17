import { describe, expect, it } from "vitest";
import { barEndSlot, barStartSlot, firstBarSlot, firstSlotOfBar, lastBarSlot, lastSlotOfBar, nearestSlot, nextBarSlot, nextSlot, prevBarSlot, prevSlot, type Slot } from "./cursor";

const slots: Slot[] = [
  { b: 0, d: 1, bar: 0, isRest: false },
  { b: 1, d: 1, bar: 0, isRest: true },
  { b: 2, d: 1, bar: 0, isRest: false },
  { b: 3, d: 1, bar: 0, isRest: false },
  { b: 4, d: 1, bar: 1, isRest: false },
  { b: 5, d: 1, bar: 1, isRest: true },
];

describe("cursor slot navigation", () => {
  it("next/prev slot", () => {
    expect(nextSlot(slots, 0)?.b).toBe(1);
    expect(nextSlot(slots, 5)).toBeNull();
    expect(prevSlot(slots, 1)?.b).toBe(0);
    expect(prevSlot(slots, 0)).toEqual(slots[0]);
  });
  it("bar start/end", () => {
    expect(barStartSlot(slots, 2)?.b).toBe(0);
    expect(barEndSlot(slots, 2)?.b).toBe(3);
    expect(barStartSlot(slots, 5)?.b).toBe(4);
    expect(barEndSlot(slots, 4)?.b).toBe(5);
  });
  it("first/last bar", () => {
    expect(firstBarSlot(slots)?.b).toBe(0);
    expect(lastBarSlot(slots)?.b).toBe(5);
  });
  it("prev/next bar slot", () => {
    expect(prevBarSlot(slots, 5)?.b).toBe(0);
    expect(nextBarSlot(slots, 1)?.b).toBe(4);
    expect(nextBarSlot(slots, 5)?.b).toBe(5);
  });
  it("nearest slot", () => {
    expect(nearestSlot(slots, 1.2)?.b).toBe(1);
    expect(nearestSlot(slots, 1.8)?.b).toBe(2);
  });
  it("first/last of specific bar", () => {
    expect(firstSlotOfBar(slots, 1)?.b).toBe(4);
    expect(lastSlotOfBar(slots, 0)?.b).toBe(3);
  });
});
