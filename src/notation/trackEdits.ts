// Track view write-back: split one set of editor edits into per-clip edits (pure).
import type { ClipEdits } from "./clipEdits.js";
import type { TrackClipSpan } from "./collectNotes.js";

/** Track-wide note id (the editor's oid) -> the note's clip and its index in that clip's notes. */
export type TrackNoteRef = { cref: number; oid: number };

export type PerClipEdits = { cref: number; regionStart: number; edits: ClipEdits };

/**
 * Editor edits use track-wide ids and absolute beats. Each clip gets its own edits with clip-local ids;
 * `regionStart` (= -offset) turns an absolute beat back into clip time in mergeClipEdits.
 * New notes go to the clip whose span contains their start; notes outside every clip are dropped.
 */
export function splitTrackEdits(
    edits: ClipEdits, refs: TrackNoteRef[], spans: TrackClipSpan[]
): { perClip: PerClipEdits[]; dropped: number } {
    const byClip = new Map<number, PerClipEdits>();
    const span = new Map(spans.map(s => [s.index, s]));
    let dropped = 0;
    const get = (cref: number) => {
        let entry = byClip.get(cref);
        if (!entry) {
            entry = { cref, regionStart: -(span.get(cref)?.offset ?? 0), edits: { changed: [], added: [], deleted: [] } };
            byClip.set(cref, entry);
        }
        return entry;
    };
    for (const change of edits.changed) {
        const ref = refs[change.oid];
        if (!ref || !span.has(ref.cref)) { dropped++; continue; }
        get(ref.cref).edits.changed.push({ ...change, oid: ref.oid });
    }
    for (const gid of edits.deleted) {
        const ref = refs[gid];
        if (!ref || !span.has(ref.cref)) { dropped++; continue; }
        get(ref.cref).edits.deleted.push(ref.oid);
    }
    for (const add of edits.added) {
        const home = spans.find(s => add.start >= s.start - 1e-9 && add.start < s.end - 1e-9);
        if (!home) { dropped++; continue; }
        get(home.index).edits.added.push(add);
    }
    return { perClip: [...byClip.values()].sort((a, b) => a.cref - b.cref), dropped };
}
