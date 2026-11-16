import { describe, expect, it } from "vitest";
import { detectChord, durToLabel, pitchToName, velToDynamic } from "./musicUi";

describe("musicUi", () => {
  it("pitchToName(60) === C3 (Ableton convention)", () => {
    expect(pitchToName(60)).toBe("C3");
  });

  it("detectChord on C major, A minor, G7 and a two-note interval", () => {
    expect(detectChord([60, 64, 67])).toBe("C");
    expect(detectChord([57, 60, 64])).toBe("Am");
    expect(detectChord([55, 59, 62, 65])).toBe("G7");
    expect(detectChord([60, 67])).toBe("C5");
  });

  it("durToLabel(1) === Quarter", () => {
    expect(durToLabel(1)).toBe("Quarter");
  });

  it("velToDynamic boundaries", () => {
    expect(velToDynamic(15)).toBe("15 ppp");
    expect(velToDynamic(16)).toBe("16 pp");
    expect(velToDynamic(31)).toBe("31 pp");
    expect(velToDynamic(32)).toBe("32 p");
    expect(velToDynamic(47)).toBe("47 p");
    expect(velToDynamic(48)).toBe("48 mp");
    expect(velToDynamic(63)).toBe("63 mp");
    expect(velToDynamic(64)).toBe("64 mf");
    expect(velToDynamic(79)).toBe("79 mf");
    expect(velToDynamic(80)).toBe("80 f");
    expect(velToDynamic(95)).toBe("95 f");
    expect(velToDynamic(96)).toBe("96 ff");
    expect(velToDynamic(111)).toBe("111 ff");
    expect(velToDynamic(112)).toBe("112 fff");
  });
});
