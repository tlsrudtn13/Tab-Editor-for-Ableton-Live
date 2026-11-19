import { describe, expect, it } from "vitest";
import { applyLayer, applyLayerV2, clipNoteHash, layerFromNotes, layerV2FromNotes, matchClipLayer, noteHash, type TabLayer, type TabLayerV2 } from "../tabLayer.js";
import { GUITAR_6, GUITAR_6_DROPD } from "../instruments.js";
import { toAlphaTex } from "../toAlphaTex.js";
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

  it("layer round trip: lock + tech", () => {
    const notes = [{ ...n(38, 0, 6, 0), lock: true, tech: ["pm" as const, "vb" as const] }];
    const layer = layerFromNotes(notes, "guitar6-dropd");
    expect(layer.notes[0]).toMatchObject({ h: "38@0", s: 6, f: 0, t: ["pm", "vb"] });
    expect(layer.notes[0]!.k).toBeUndefined();
    const applied = applyLayer([n(38, 0, 1, 1)], layer, GUITAR_6_DROPD);
    expect(applied[0]).toMatchObject({ s: 6, f: 0, lock: true, tech: ["pm", "vb"] });
  });

  it("layer round trip: tech-only (k: 0 keeps fingering unlocked)", () => {
    const notes = [{ ...n(38, 0, 6, 0), tech: ["lr" as const] }];
    const layer = layerFromNotes(notes, "guitar6-dropd");
    expect(layer.notes[0]).toMatchObject({ h: "38@0", k: 0, t: ["lr"] });
    const applied = applyLayer([n(38, 0, 5, 2)], layer, GUITAR_6_DROPD);
    expect(applied[0]).toMatchObject({ s: 5, f: 2, tech: ["lr"] });
    expect(applied[0]!.lock).toBeUndefined();
  });

  it("old entry without k still locks", () => {
    const layer: TabLayer = { v:1, instrument:"guitar6-dropd", capo:0, notes:[{h:"38@0",s:6,f:0,t:["pm"] as any}] };
    const applied = applyLayer([n(38, 0, 1, 1)], layer, GUITAR_6_DROPD);
    expect(applied[0]).toMatchObject({ s: 6, f: 0, lock: true, tech: ["pm"] });
  });

  it("unknown tech dropped", () => {
    const layer: TabLayer = { v:1, instrument:"guitar6-dropd", capo:0, notes:[{h:"38@0",s:6,f:0,t:["pm","zz","vb"] as any}] };
    const applied = applyLayer([n(38, 0)], layer, GUITAR_6_DROPD);
    expect(applied[0]!.tech).toEqual(["pm", "vb"]);
  });

  it("toAlphaTex: note with tech [\"hp\",\"vb\"] contains {h v}; tech-free clip equals previous output", () => {
    const withTech = [{ ...n(38, 0, 6, 0), tech: ["hp" as const, "vb" as const] }];
    const tex = toAlphaTex(withTech, { bpm: 120 });
    expect(tex).toContain("{h v}");
    const plain = [n(38, 0, 6, 0), n(45, 1, 5, 0)];
    const texPlain = toAlphaTex(plain, { bpm: 120 });
    expect(texPlain).toBe(toAlphaTex([n(38, 0, 6, 0), n(45, 1, 5, 0)], { bpm: 120 }));
    expect(texPlain).not.toContain("{");
  });

  it("v2 hash survives quantize change (keyed by cb)", () => {
    const note = { ...n(38, 1.25, 6, 0), cb: 0.5 };
    expect(clipNoteHash({ p: note.p, cb: note.cb! })).toBe("38@48");
    const layer = layerV2FromNotes([{ ...note, lock: true }], { instrument: "guitar6-dropd", hint: { track: "T", clip: "C" } });
    const moved = applyLayerV2([{ ...note, b: 1.0, s: 1, f: 7 }], layer, GUITAR_6_DROPD);
    expect(moved[0]).toMatchObject({ s: 6, f: 0, lock: true });
  });

  it("v2 rename still matches by content and unnamed clips pick their own", () => {
    const a = [{ ...n(40, 0, 6, 0), cb: 0 }, { ...n(45, 1, 5, 0), cb: 1 }];
    const b = [{ ...n(52, 0, 4, 2), cb: 0 }];
    const la = layerV2FromNotes(a, { instrument: "guitar6", hint: { track: "T", clip: "old" }, snapshot: true });
    const lb = layerV2FromNotes(b, { instrument: "guitar6", hint: { track: "T", clip: "" }, snapshot: true });
    const cand = [{ id: "a", layer: la }, { id: "b", layer: lb }];
    expect(matchClipLayer(cand, new Set(a.map(x => clipNoteHash({ p: x.p, cb: x.cb! }))), { track: "T", clip: "new" })).toBe("a");
    expect(matchClipLayer(cand, new Set(b.map(x => clipNoteHash({ p: x.p, cb: x.cb! }))), { track: "T", clip: "" })).toBe("b");
  });

  it("v2 ignores invalid s/f entry and snapshot vs non-snapshot", () => {
    const base = { ...n(40, 0, 5, 0), cb: 0 }; // E2 on string 5 fret 0 in guitar
    const layer: TabLayerV2 = { v: 2, instrument: "guitar6", capo: 0, hint: { track: "T", clip: "C" }, notes: [{ h: "40@0", s: 1, f: 0, k: 2 }] };
    const applied = applyLayerV2([{ ...base, s: 5, f: 0 }], layer, GUITAR_6);
    expect(applied[0]).toMatchObject({ s: 5, f: 0 });
    expect(applied[0]!.lock).toBeUndefined();
    const notes = [{ ...n(40, 0, 5, 0), cb: 0 }, { ...n(45, 1, 4, 0), cb: 1, lock: true }];
    const snap = layerV2FromNotes(notes, { instrument: "guitar6", hint: { track: "T", clip: "C" }, snapshot: true });
    expect(snap.notes).toHaveLength(2);
    expect(snap.notes.find(x => x.h === "40@0")!.k).toBe(2);
    expect(snap.notes.find(x => x.h === "45@96")!.k).toBeUndefined();
    const plain = layerV2FromNotes(notes, { instrument: "guitar6", hint: { track: "T", clip: "C" }, snapshot: false });
    expect(plain.notes).toHaveLength(1);
    expect(plain.notes[0]).toMatchObject({ h: "45@96" });
  });
});

describe("annotation-only layers (Fable review #4)", () => {
    const layer = (hint: { track: string; clip: string }, hashes: string[]): TabLayerV2 =>
        ({ v: 2, instrument: "guitar6", capo: 0, hint, notes: hashes.map(h => ({ h, s: 0, f: 0, k: 0 as const })) });
    const hint = { track: "Guitar", clip: "Clip" };
    it("a file that matches the notes wins over an old name-only file", () => {
        const cand = [
            { id: "nameOnly", layer: layer(hint, []) },
            { id: "byNotes", layer: layer(hint, ["60@0", "62@96"]) },
        ];
        expect(matchClipLayer(cand, new Set(["60@0", "62@96"]), hint)).toBe("byNotes");
    });
    it("two same-named clips with different notes find their own files", () => {
        const cand = [
            { id: "A", layer: layer(hint, ["60@0", "62@96"]) },
            { id: "B", layer: layer(hint, ["40@0", "43@96"]) },
        ];
        expect(matchClipLayer(cand, new Set(["40@0", "43@96"]), hint)).toBe("B");
        expect(matchClipLayer(cand, new Set(["50@0"]), hint)).toBeUndefined();
    });
    it("an old name-only file is still found when nothing matches the notes", () => {
        expect(matchClipLayer([{ id: "old", layer: layer(hint, []) }], new Set(["50@0"]), hint)).toBe("old");
    });
});
