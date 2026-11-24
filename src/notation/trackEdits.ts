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
 * A note moved into another clip's span is deleted from its own clip and added to that clip
 * (`durationOf` gives its original duration when the edit kept it); moved outside every clip, it stays
 * in its own clip as before.
 */
export function splitTrackEdits(
    edits: ClipEdits, refs: TrackNoteRef[], spans: TrackClipSpan[],
    durationOf?: (ref: TrackNoteRef) => number | undefined
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
    const homeOf = (start: number) => spans.find(s => start >= s.start - 1e-9 && start < s.end - 1e-9);
    for (const change of edits.changed) {
        const ref = refs[change.oid];
        if (!ref || !span.has(ref.cref)) { dropped++; continue; }
        const home = change.start !== undefined && change.start !== null ? homeOf(change.start) : undefined;
        if (home && home.index !== ref.cref) {
            const duration = change.duration ?? durationOf?.(ref);
            if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
                get(ref.cref).edits.deleted.push(ref.oid);
                get(home.index).edits.added.push({ pitch: change.pitch, start: change.start!, duration, velocity: change.velocity });
                continue;
            }
        }
        get(ref.cref).edits.changed.push({ ...change, oid: ref.oid });
    }
    for (const gid of edits.deleted) {
        const ref = refs[gid];
        if (!ref || !span.has(ref.cref)) { dropped++; continue; }
        get(ref.cref).edits.deleted.push(ref.oid);
    }
    for (const add of edits.added) {
        const home = homeOf(add.start);
        if (!home) { dropped++; continue; }
        get(home.index).edits.added.push(add);
    }
    return { perClip: [...byClip.values()].sort((a, b) => a.cref - b.cref), dropped };
}

/**
 * The clip spans the editor may edit in. A Selection tab (`shownLength`, rebased to 0) shows only part of each
 * clip: editing stays inside the shown part, so Insert beat / Paste / Move never land on the clip's unshown notes.
 */
export function editableSpans(spans: TrackClipSpan[], shownLength?: number): TrackClipSpan[] {
    if (shownLength === undefined) return spans.map(s => ({ ...s }));
    return spans
        .map(s => ({ ...s, start: Math.max(s.start, 0), end: Math.min(s.end, shownLength) }))
        .filter(s => s.end - s.start > 1e-9);
}
