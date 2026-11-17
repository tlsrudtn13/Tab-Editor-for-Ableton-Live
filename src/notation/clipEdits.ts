export type ClipEdits = {
    /** start/duration undefined = unchanged (keep the clip's original, unquantized value). */
    changed: { oid: number; pitch: number; start?: number; duration?: number; velocity: number }[];
    added: { pitch: number; start: number; duration: number; velocity: number }[];
    deleted: number[];
};

type RawNote = { pitch: number; startTime: number; duration: number; velocity?: number; id?: unknown; [key: string]: unknown };

export function mergeClipEdits(raw: RawNote[], edits: ClipEdits, regionStart: number): {
    notes: Omit<RawNote, "id">[];
    stats: { changed: number; added: number; deleted: number; dropped: number };
} {
    const stats = { changed: 0, added: 0, deleted: 0, dropped: 0 };
    const deleted = new Set(edits.deleted.filter(Number.isInteger));
    const changed = new Map(edits.changed.map(e => [e.oid, e]));
    const notes: Omit<RawNote, "id">[] = [];
    for (let oid = 0; oid < raw.length; oid++) {
        if (deleted.has(oid)) { stats.deleted++; continue; }
        const original = raw[oid];
        const edit = changed.get(oid);
        const { id: _id, ...base } = original;
        if (!edit) { notes.push(base); continue; }
        const startTime = edit.start === undefined || edit.start === null ? original.startTime : edit.start + regionStart;
        const duration = edit.duration === undefined || edit.duration === null ? original.duration : edit.duration;
        if (!valid(edit.pitch, startTime, duration, edit.velocity)) { notes.push(base); stats.dropped++; continue; }
        notes.push({ ...base, pitch: edit.pitch, startTime, duration, velocity: edit.velocity });
        stats.changed++;
    }
    for (const edit of edits.added) {
        const startTime = edit.start + regionStart;
        if (!valid(edit.pitch, startTime, edit.duration, edit.velocity)) { stats.dropped++; continue; }
        notes.push({ pitch: edit.pitch, startTime, duration: edit.duration, velocity: edit.velocity });
        stats.added++;
    }
    return { notes, stats };
}

function valid(pitch: number, start: number, duration: number, velocity: number): boolean {
    return Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 && Number.isFinite(start) && start >= 0 &&
        Number.isFinite(duration) && duration > 0 && Number.isInteger(velocity) && velocity >= 1 && velocity <= 127;
}
