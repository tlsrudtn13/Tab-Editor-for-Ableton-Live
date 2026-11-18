import { beforeEach, describe, expect, it, vi } from "vitest";

// multiApply's own logic only: the score / alphaTab side is not loaded here
vi.mock("./apply", () => ({
  editsOf: (t: any, del: number[]) => ({ changed: t.notes.filter((n: any) => n.dirty && n.oid !== undefined).length, added: t.notes.filter((n: any) => n.oid === undefined).length, deleted: del.slice() }),
  layerOf: () => ({ v: 2, notes: [] }),
  annOf: () => undefined,
}));
vi.mock("./drums", () => ({ isDrumTrack: (t: any) => !!t.drum, drumLayerIfChanged: () => undefined }));
vi.mock("./log", () => ({ log: () => {} }));

import { state } from "./state";
import { editCountOf, isMulti, restoreSession, sendMulti, stashSession, toggleApplyMark } from "./multiApply";

const tab = (id: string, edit = true) => ({ id, name: id, edit: edit ? { mode: "clip", regionStart: 0 } : undefined, notes: [{ b: 0, d: 1, p: 40, oid: 0 }, { b: 1, d: 1, p: 42, oid: 1 }] as any[] });

describe("several editable tabs (apply marked tabs on close)", () => {
  let sent: any[];
  beforeEach(() => {
    sent = [];
    (globalThis as any).document = { getElementById: () => null };
    (globalThis as any).window = { confirm: () => true, chrome: { webview: { postMessage: (m: any) => sent.push(m) } } };
    state.tracks = [tab("a"), tab("b"), tab("c")];
    state.curTrack = state.tracks[0];
    state.deletedOids = []; state.editHistory = []; state.redoHistory = []; state.sessionChanged = false;
    state.uiCapo = 0; state.uiTimeSig = null;
  });

  it("is multi only with more than one tab and an editable one", () => {
    expect(isMulti()).toBe(true);
    state.tracks = [tab("a")];
    expect(isMulti()).toBe(false);
    state.tracks = [tab("a", false), tab("b", false)];
    expect(isMulti()).toBe(false);
  });

  it("keeps each tab's deleted notes and undo history across tab switches", () => {
    const [a, b] = state.tracks!;
    state.deletedOids = [1]; state.editHistory = [{ x: 1 }]; state.uiCapo = 2;
    stashSession(a);
    state.curTrack = b; state.deletedOids = []; state.editHistory = []; state.uiCapo = 0;
    expect(editCountOf(a)).toBe(1);          // the stashed deletion still counts
    expect(editCountOf(b)).toBe(0);
    expect(restoreSession(b)).toBe(false);   // never left: fresh session
    state.curTrack = a;
    expect(restoreSession(a)).toBe(true);
    expect(state.deletedOids).toEqual([1]);
    expect(state.editHistory).toEqual([{ x: 1 }]);
    expect(state.uiCapo).toBe(2);
  });

  it("marks only edited tabs and sends marked ones as apply on close", () => {
    const [a, b, c] = state.tracks!;
    toggleApplyMark("a");
    expect(a.applyOnClose).toBeFalsy();      // no edits: cannot be marked
    a.notes[0].p = 41; a.notes[0].dirty = true;
    toggleApplyMark("a");
    expect(a.applyOnClose).toBe(true);
    b.notes[1].dirty = true;                 // edited, not marked: discarded after a confirm
    sendMulti();
    expect(sent).toHaveLength(1);
    const msg = JSON.parse(sent[0].params[0]);
    expect(msg.action).toBe("multi");
    const byId = Object.fromEntries(msg.tabs.map((t: any) => [t.id, t]));
    expect(byId.a.apply).toBe(true);
    expect(byId.a.edits.changed).toBe(1);
    expect(byId.a.layer).toBeTruthy();
    expect(byId.b.apply).toBe(false);
    expect(byId.b.edited).toBe(true);
    expect(byId.b.edits).toBeUndefined();
    expect(byId.c.layer).toBeUndefined();    // never opened: saved fingering left alone
    expect(c.applyOnClose).toBeFalsy();
  });

  it("does not close when the user keeps unmarked edits", () => {
    (globalThis as any).window.confirm = () => false;
    state.tracks![1].notes[0].dirty = true;
    sendMulti();
    expect(sent).toHaveLength(0);
  });
});
