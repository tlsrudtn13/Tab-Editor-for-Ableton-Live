import { describe, expect, it } from "vitest";
import { applyLayer, layerFromNotes, noteHash, type TabLayer } from "../tabLayer.js";
import { GUITAR_6_DROPD } from "../instruments.js";
import { toMusicXml } from "../toMusicXml.js";
import type { Note } from "../types.js";

const n = (p: number, b: number, s = 6, f = 0): Note => ({ b, d: 1, p, v: 100, f, s, src: "ses", clip: "x" });

describe("TAB layers", () => {
  it("hashes clip-relative pitch and beat", () => { expect(noteHash(n(38, 1.5))).toBe("38@144"); });
  it("builds and applies locked choices", () => {
    const notes = [{ ...n(38, 0, 6, 0), lock:true }, { ...n(45, 1, 5, 0), lock:true }];
    const layer = layerFromNotes(notes, "guitar6-dropd", 2, { beats: 3, type: 4 });
    expect(layer.notes).toHaveLength(2);
    expect(applyLayer(notes.map(x => ({ ...x, s: 1, f: 7 })), layer, GUITAR_6_DROPD).map(x => [x.s,x.f,x.lock]))
      .toEqual([[6,0,true],[5,0,true]]);
  });
  it("ignores saved choices that cannot sound on the selected tuning", () => {
    const layer: TabLayer = { v:1, instrument:"guitar6-dropd", capo:0, notes:[{h:"38@0",s:1,f:0},{h:"38@0",s:6,f:3}] };
    const applied = applyLayer([n(38,0)], layer, GUITAR_6_DROPD);
    expect(applied[0]).toMatchObject({ s:6, f:0 });
    expect(applied[0]!.lock).toBeUndefined();
  });
  it("writes 3/4 bars and maps notes to three-beat measures", () => {
    const xml = toMusicXml([n(60,0), n(62,3)], 120, { timeSig:{beats:3,type:4} });
    expect(xml).toContain("<beats>3</beats>");
    expect((xml.match(/<measure number=/g) || [])).toHaveLength(2);
  });
});
