// ============================================================
// src/extension.ts  (v2 beta release - 진입점 분리 + 버그픽스)
//   · 진입점: Selection(어레인지) / Clip(단일) / Track(그 트랙) / All Tracks
//   · 전체 트랙 모드는 arrangement 클립만 → session 클립 끼어듦 방지
//   · 셋잇단 미포함 (출시 후 편집기능으로 구현 예정)
// ============================================================

import {
    initialize,
    MidiClip,                          // 클립 핸들 → 실제 객체 복원용
    DataModelObject,                   // 선택 레인 핸들의 범용 복원용
    TakeLane,                          // 테이크 레인 → 부모 트랙 추적용
    MidiTrack,                         // 트랙 우클릭 핸들 복원용
    Scene,                             // 씬 우클릭 핸들 복원용
    ClipSlot,                          // 클립 슬롯 선택 복원용
    type ClipSlotSelection,            // 세션 클립 여러 개 선택
    type ActivationContext,
    type ArrangementSelection,         // 어레인지 선택영역 인자 타입
} from "@ableton-extensions/sdk";
import modalInterface from "../dist-ui/index.html";

// ── notation 모듈 임포트 (node16 규칙: .js 확장자 필수) ──
import type { Note, TrackPayload } from "./notation/index.js";
import { collectNotes, notesFromClip, clipRegion } from "./notation/collectNotes.js";
import { buildPayload } from "./notation/payload.js";
import { injectableJson } from "./inject.js";
import { mergeClipEdits } from "./notation/clipEdits.js";
import { splitTrackEdits, type TrackNoteRef } from "./notation/trackEdits.js";
import type { TrackClipSpan } from "./notation/collectNotes.js";
import { startDevHarness, devEditorUrl } from "./dev/harness.js";
import { safeStr }      from "./notation/music.js";
import fs   from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { BASS_4, BASS_4_DROPD, BASS_4_EB, BASS_5, BASS_6, DEFAULT_INSTRUMENT, GUITAR_6, GUITAR_6_D, GUITAR_6_DROPC, GUITAR_6_DROPD, GUITAR_6_DADGAD, GUITAR_6_EB, GUITAR_6_OPEND, GUITAR_6_OPENG, GUITAR_7, GUITAR_8, GUITAR_12 } from "./notation/instruments.js";
import { annForClip, applyLayerV2, clipNoteHash, layerKey, matchClipLayer, sanitizeAnn, type LayerAnn, type TabLayer, type TabLayerV2 } from "./notation/tabLayer.js";
import { buildDrumPayload, looksLikeDrums } from "./notation/drumPayload.js";
import { parseDrumLayer, type DrumLayer } from "./notation/drumMap.js";
import { drumRackInfo } from "./drumDetect.js";

const INSTRUMENT_BY_KEY: Record<string, any> = { guitar6:GUITAR_6, guitar7:GUITAR_7, guitar8:GUITAR_8, guitar12:GUITAR_12, bass4:BASS_4, bass5:BASS_5, bass6:BASS_6, "guitar6-dropd":GUITAR_6_DROPD, "guitar6-eb":GUITAR_6_EB, "guitar6-d":GUITAR_6_D, "guitar6-dropc":GUITAR_6_DROPC, "guitar6-dadgad":GUITAR_6_DADGAD, "guitar6-openg":GUITAR_6_OPENG, "guitar6-opend":GUITAR_6_OPEND, "bass4-dropd":BASS_4_DROPD, "bass4-eb":BASS_4_EB };
function layerFile(context: any, key: string): string | undefined {
    const dir = context.environment.storageDirectory;
    if (!dir) return undefined;
    return path.join(dir, "tablayers", createHash("sha256").update(key).digest("hex") + ".json");
}
function readLayer(context: any, key: string): TabLayer | undefined {
    try {
        const file=layerFile(context,key);
        if (file && fs.existsSync(file)) {
            const x=JSON.parse(fs.readFileSync(file,"utf8"));
            const ts=x?.timeSig;
            const validTimeSig=!ts || (Number.isInteger(ts.beats) && ts.beats >= 1 && ts.beats <= 32 && [1,2,4,8,16].includes(ts.type));
            if(x?.v===1 && typeof x.instrument==="string" && INSTRUMENT_BY_KEY[x.instrument] && Number.isFinite(x.capo) && Array.isArray(x.notes) && validTimeSig && x.notes.every((n:any)=>typeof n?.h==="string" && Number.isInteger(n.s) && Number.isInteger(n.f))) return x;
            console.warn("[TAB] invalid saved TAB layer ignored:", file);
        }
    }
    catch(e) { console.warn("[TAB] saved TAB layer ignored:", e); }
    return undefined;
}
function saveLayer(context: any, key: string, layer: TabLayer | undefined) {
    if (!layer) return;
    try { const file=layerFile(context,key); if(!file) return; fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(layer),"utf8"); }
    catch(e) { console.warn("[TAB] TAB layer save failed:", e); }
}
function v2Dir(context: any): string | undefined {
    const dir = context.environment.storageDirectory;
    return dir ? path.join(dir, "tablayers", "v2") : undefined;
}
function v2File(context: any, id: string): string | undefined {
    const dir = v2Dir(context);
    return dir ? path.join(dir, id + ".json") : undefined;
}
function isValidV2(x: any): x is TabLayerV2 {
    const ts=x?.timeSig;
    const validTimeSig=!ts || (Number.isInteger(ts.beats) && ts.beats >= 1 && ts.beats <= 32 && [1,2,4,8,16].includes(ts.type));
    return x?.v===2 && typeof x.instrument==="string" && !!INSTRUMENT_BY_KEY[x.instrument] && Number.isFinite(x.capo) && x.hint && typeof x.hint.track==="string" && typeof x.hint.clip==="string" && Array.isArray(x.notes) && validTimeSig && x.notes.every((n:any)=>typeof n?.h==="string" && Number.isInteger(n.s) && Number.isInteger(n.f));
}
function readClipLayers(context: any): { id: string; layer: TabLayerV2 }[] {
    const dir = v2Dir(context); if (!dir || !fs.existsSync(dir)) return [];
    const out: { id: string; layer: TabLayerV2 }[] = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const file = path.join(dir, name);
        try {
            const x = JSON.parse(fs.readFileSync(file, "utf8"));
            if (isValidV2(x)) { x.ann = sanitizeAnn(x.ann); if (!x.ann) delete x.ann; out.push({ id: name.slice(0, -5), layer: x }); }
            else console.warn("[TAB] invalid v2 TAB layer ignored:", file);
        } catch (e) { console.warn("[TAB] invalid v2 TAB layer ignored:", file, e); }
    }
    return out;
}
function clipRawHashes(clip: any): Set<string> {
    const raw: unknown[] = Array.isArray(clip?.notes) ? clip.notes : [];
    const set = new Set<string>();
    for (const n of raw as any[]) {
        const start = typeof n?.startTime === "number" ? n.startTime : (typeof n?.time === "number" ? n.time : NaN);
        const pitch = Math.min(127, Math.max(0, Math.round(Number(n?.pitch ?? 60))));
        if (Number.isFinite(start)) set.add(`${pitch}@${Math.round(Math.round(start * 96))}`);
    }
    return set;
}
function findClipLayer(context: any, clip: any, hint: { track: string; clip: string }): { id?: string; layer?: TabLayerV2 } {
    const id = matchClipLayer(readClipLayers(context), clipRawHashes(clip), hint);
    if (!id) return {};
    const file = v2File(context, id);
    try { if (file) { const x = JSON.parse(fs.readFileSync(file, "utf8")); if (isValidV2(x)) { x.ann = sanitizeAnn(x.ann); if (!x.ann) delete x.ann; return { id, layer: x }; } } } catch {}
    return {};
}
function newV2Id(hint: { track: string; clip: string }): string {
    return createHash("sha256").update(`${hint.track}\u0000${hint.clip}\u0000${Date.now()}\u0000${Math.random()}`).digest("hex").slice(0, 16);
}
function readV2(context: any, id: string | undefined): TabLayerV2 | undefined {
    const file = id ? v2File(context, id) : undefined;
    try { if (file && fs.existsSync(file)) { const x = JSON.parse(fs.readFileSync(file, "utf8")); if (isValidV2(x)) return x; } } catch { /* none */ }
    return undefined;
}
/** Save a clip's fingering layer. Annotations stored in the file are kept unless the layer carries its own (`keepAnn`). */
function saveClipLayer(context: any, id: string | undefined, layer: TabLayerV2 | undefined, hint: { track: string; clip: string }, keepAnn = true, clipForHashes?: any): string | undefined {
    if (!layer) return id;
    // a layer with no fingering entries would be found by the track / clip name only, and same-named clips
    // ("Clip") would share it: list the clip's note hashes instead (k:0 = no lock) (Fable review #4)
    if (!layer.notes.length && clipForHashes) layer = { ...layer, notes: hashEntries(clipForHashes) };
    try {
        const useId = id || newV2Id(hint);
        const file = v2File(context, useId); if (!file) return id;
        if (keepAnn && !("ann" in layer)) { const old = sanitizeAnn(readV2(context, id)?.ann); if (old) layer = { ...layer, ann: old }; }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(layer), "utf8");
        return useId;
    } catch (e) { console.warn("[TAB] v2 TAB layer save failed:", e); return id; }
}
function hashEntries(clip: any): TabLayerV2["notes"] {
    return [...clipRawHashes(clip)].map(h => ({ h, s: 0, f: 0, k: 0 as const }));
}
/** After notes were written: a layer that only lists hashes (no fingering) gets the clip's new hashes. */
function refreshHashOnlyLayer(context: any, id: string | undefined, clip: any) {
    const layer = readV2(context, id); if (!layer || !id) return;
    // only files that list bare hashes; entries with a lock, techniques or a bend belong to the fingering save
    if (layer.notes.some(n => n.k !== 0 || (n.t && n.t.length) || n.bd !== undefined)) return;
    try { const file = v2File(context, id); if (file) fs.writeFileSync(file, JSON.stringify({ ...layer, notes: hashEntries(clip) }), "utf8"); }
    catch (e) { console.warn("[TAB] layer hash refresh failed:", e); }
}
/** Replace a clip's annotations (chords, key, title), creating a layer file when the clip has none yet. */
function saveClipAnn(context: any, id: string | undefined, hint: { track: string; clip: string }, ann: LayerAnn | undefined, base: { instrument: string; capo: number }, clipForHashes?: any): string | undefined {
    // a drum clip has no fingering: its new layer file lists the clip's note hashes (k:0 = no lock) so it is
    // matched by the notes, not only by the track / clip name
    const notes = clipForHashes ? hashEntries(clipForHashes) : [];
    const layer: TabLayerV2 = readV2(context, id) ?? { v: 2, instrument: base.instrument, capo: base.capo, hint: { ...hint }, notes };
    if (!readV2(context, id) && !ann) return id;          // nothing stored, nothing to store
    const next: TabLayerV2 = { ...layer };
    if (ann) next.ann = ann; else delete next.ann;
    return saveClipLayer(context, id, next, hint, false, clipForHashes);
}
/** Clip annotations -> editor beats: display b = clip beat - regionStart (clip view) or + offset (track view). */
function annToDisplay(ann: LayerAnn | undefined, shift: number): { chords?: { b: number; name: string; auto?: boolean }[]; lyrics?: { b: number; text: string }[]; key?: { fifths: number; minor: boolean }; title?: string } | undefined {
    if (!ann) return undefined;
    const out: any = {};
    if (ann.chords?.length) out.chords = ann.chords.map(c => ({ b: c.cb + shift, name: c.name, ...(c.auto ? { auto: true } : {}) }));
    if (ann.lyrics?.length) out.lyrics = ann.lyrics.map(l => ({ b: l.cb + shift, text: l.text }));
    if (ann.key) out.key = { ...ann.key };
    if (ann.title) out.title = ann.title;
    return Object.keys(out).length ? out : undefined;
}

// ── Drum tracks (docs/DRUMS.md): per-track kit map, stored next to the TAB layers ──
const drumKey = (key: string) => "drum\u0000" + key;
function readDrumLayer(context: any, key: string): DrumLayer | undefined {
    try {
        const file = layerFile(context, drumKey(key));
        if (file && fs.existsSync(file)) {
            const layer = parseDrumLayer(JSON.parse(fs.readFileSync(file, "utf8")));
            if (layer) return layer;
            console.warn("[TAB] invalid saved drum map ignored:", file);
        }
    } catch (e) { console.warn("[TAB] saved drum map ignored:", e); }
    return undefined;
}
function saveDrumLayer(context: any, key: string | undefined, raw: unknown) {
    const layer = parseDrumLayer(raw);
    if (!layer || !key) return;
    try { const file = layerFile(context, drumKey(key)); if (!file) return; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(layer), "utf8"); }
    catch (e) { console.warn("[TAB] drum map save failed:", e); }
}
/** Drum payload when the track holds a Drum Rack (or, narrowly, looks like drums); else null. */
function drumPayloadFor(context: any, track: any, id: string, name: string, notes: Note[], tempo: number, live: any, storageKey: string, timeSig?: any) {
    const rack = track ? drumRackInfo(track) : null;
    const trackName = String(track?.name ?? "");
    if (!rack && !looksLikeDrums(trackName, notes)) return null;
    const layer = readDrumLayer(context, storageKey);
    const p = buildDrumPayload(id, name, notes, tempo, live, { timeSig, override: layer?.map, hints: rack?.hints, pads: rack?.pads, source: rack ? "drum-rack" : "heuristic" });
    if (p) (p as any).layerStorageKey = storageKey;
    console.log(`[TAB] drum track "${trackName}" (${rack ? `Drum Rack, ${rack.pads.length} pads` : "name heuristic"})`);
    return p;
}

/** Find which track (and Session slot) a clip lives in. The SDK caches objects by handle, so identity works. */
function locateClip(context: any, clip: any): { trackName: string; slotIndex?: number; track?: any } | undefined {
    try {
        for (const t of context.application.song.tracks as any[]) {
            const slots: any[] = Array.isArray(t?.clipSlots) ? t.clipSlots : [];
            for (let i = 0; i < slots.length; i++) if (slots[i]?.clip === clip) return { trackName: String(t.name ?? "Track"), slotIndex: i, track: t };
            const arr: any[] = Array.isArray(t?.arrangementClips) ? t.arrangementClips : [];
            if (arr.includes(clip)) return { trackName: String(t.name ?? "Track"), track: t };
        }
    } catch (e) { console.warn("[TAB] clip location lookup failed:", e); }
    return undefined;
}
function instrumentForLayer(layer?: TabLayer) { return layer ? INSTRUMENT_BY_KEY[layer.instrument] : undefined; }
/** Instrument / capo for a new annotation-only layer file: from the editor's layer, else the stored one, else guitar6. */
function annBase(message: any, stored?: { instrument?: string; capo?: number }): { instrument: string; capo: number } {
    const inst = [message?.layer?.instrument, stored?.instrument].find(k => typeof k === "string" && INSTRUMENT_BY_KEY[k]) ?? "guitar6";
    const capo = Number.isFinite(message?.layer?.capo) ? message.layer.capo : (Number.isFinite(stored?.capo) ? stored!.capo! : 0);
    return { instrument: inst, capo };
}

// 공용 헬퍼 1 (buildPayload) 은 src/notation/payload.ts 로 이동 — dev harness 와 공유

// ============================================================
// 공용 헬퍼 2: 페이로드 배열 → 모달 에디터 열기
/** Short message shown in Live after the modal closes (the SDK has no toast; a progress dialog is the closest). */
async function notify(context: ReturnType<typeof initialize>, text: string, ms = 1800): Promise<void> {
    try {
        await context.ui.withinProgressDialog(text, { progress: 100 },
            (_update, signal) => new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, ms);
                signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); });
            }));
    } catch (e) {
        console.warn("[TAB] notify failed:", e);
    }
}

function applySummary(stats: { changed: number; added: number; deleted: number; dropped: number }): string {
    const parts: string[] = [];
    if (stats.changed) parts.push(`${stats.changed} changed`);
    if (stats.added) parts.push(`${stats.added} added`);
    if (stats.deleted) parts.push(`${stats.deleted} deleted`);
    let text = "Applied to clip: " + parts.join(", ") + ". Use Undo in Live to revert.";
    if (stats.dropped) text += ` ${stats.dropped} invalid edit(s) skipped.`;
    return text;
}

// ============================================================
async function showEditor(
    context: ReturnType<typeof initialize>,
    payloads: TrackPayload[],
    message?: string
): Promise<string | undefined> {
    if (payloads.length === 0 && !message) {
        console.warn("[TAB] no MIDI notes found — editor not opened.");
        return undefined;
    }

    const safePayloads = payloads ?? [];
    // </script 문자열이 HTML을 깨지 않도록 이스케이프
    // Injected as JSON.parse("…"): large payloads parse faster from a string than from an object literal.
    const safeJson = injectableJson(safePayloads);

    // tracks 데이터를 <head> 안에 주입 (DOCTYPE 앞은 WebView2 오동작)
    let headInject = `<head><script>window.tracks=JSON.parse(${safeJson});</script>`;
    if (message) {
        headInject += `<script>window.tabMessage=${JSON.stringify(message)};</script>`;
    }
    headInject += "";
    const finalHtml = modalInterface.replace("<head>", () => headInject);   // function form: no $& / $' patterns from names in the payload

   // ★ SDK 허용 경로 사용 (os.tmpdir()는 권한 차단됨).
    //   tempDirectory가 undefined일 수 있어 storageDirectory로 폴백.
    const tmpDir = context.environment.tempDirectory
        ?? context.environment.storageDirectory;
    if (!tmpDir) {
        console.error("[TAB] no writable directory available (temp/storage both undefined).");
        return undefined;
    }
    const htmlPath = path.join(tmpDir, `ableton-tab-editor-ui-${Date.now()}.html`);
    // ※ Step 1: 폰트 복사 제거 (process.cwd()/node_modules 접근이 권한 차단 유발).
    //   폰트 없이도 모달이 뜨는지 먼저 확인 → Step 2에서 .ablx 포함 방식으로 복원.

    fs.writeFileSync(htmlPath, finalHtml, "utf-8");

        // file:// URL 생성: 백슬래시→슬래시 변환 후, 공백 등 특수문자를 인코딩.
    //   SDK temp 경로엔 "Ableton Extensions" 같은 공백이 있어 인코딩 필수.
    //   (encodeURI는 슬래시 ':' 등 URL 구조 문자는 보존하고 공백만 %20 처리)
    const fwdPath = htmlPath.split(path.sep).join("/");
    const fileUrl = encodeURI("file:///" + fwdPath);
    if (__TAB_DEV__) console.log(`[TAB] loading from file: ${fileUrl}`);
    
    // dev build: load through the harness server so the editor can report back
    const url = (__TAB_DEV__ && devEditorUrl(htmlPath)) || fileUrl;
    try {
        return await context.ui.showModalDialog(url, 1400, 900) as string | undefined;
    } finally {
        // the page is ~5 MB; do not leave one behind per open
        try { fs.unlinkSync(htmlPath); } catch { /* already gone or locked */ }
    }
}

// ============================================================
// 공용 헬퍼 3: 현재 곡의 BPM 읽기
// ============================================================
function getTempo(context: ReturnType<typeof initialize>): number {
    const song = context.application.song;
    return typeof song.tempo === "number"
        ? song.tempo
        : (song.tempo as any)?.value ?? 120;
}

function liveContext(context: ReturnType<typeof initialize>, beatOffset = 0): any {
    const song: any = (context as any)?.application?.song ?? {};
    const live: any = {};
    try {
        live.scale = {
            root: song.rootNote,
            name: song.scaleName,
            intervals: song.scaleIntervals,
            enabled: song.scaleMode,
        };
    } catch (e) { /* skip */ }
    try {
        const raw = song.cuePoints;
        const cues = (Array.isArray(raw) ? raw : []).map((c: any) => ({
            beat: (typeof c?.time === "number" ? c.time : 0) - beatOffset,
            name: String(c?.name ?? ""),
        })).filter((c: any) => c.beat >= 0);
        live.cues = cues;
    } catch (e) { /* skip */ }
    try {
        live.grid = {
            quantization: song.gridQuantization,
            triplet: song.gridIsTriplet,
        };
    } catch (e) { /* skip */ }
    return live;
}

// ============================================================
// activate: 커맨드 3종 + 메뉴 등록
// ============================================================
export function activate(activation: ActivationContext) {
    const context = initialize(activation, "1.0.0");
    if (__TAB_DEV__) startDevHarness(context);

    // ──────────────────────────────────────────────────────
    // ① 트랙 모드
    //    tabeditor.open    : 우클릭한 MIDI 트랙 하나 (인자 = 트랙 핸들)
    //    tabeditor.openAll : 모든 트랙 (씬·오디오 트랙 메뉴, 인자 무시)
    //    arrangement 클립만 사용 → session 클립 끼어듦 방지
    // ──────────────────────────────────────────────────────
    /** For write-back in track view: track-wide id -> clip/index, clip spans, and the clips' notes as opened. */
    type TrackEditContext = { refs: TrackNoteRef[]; spans: TrackClipSpan[]; snapshots: Map<number, string>; v2Ids: Map<number, string | undefined> };

    /**
     * Payload for a track's arrangement clips. With editCtx it is editable (track mode).
     * With range (Arrangement selection) only notes starting inside it are shown, rebased so the
     * range starts at beat 0; the clip spans are shifted the same way so Apply lands in place.
     */
    function trackPayload(rawTrack: any, idx: number, tempo: number, live: any, editCtx?: TrackEditContext, range?: { start: number; end: number; id: string; suffix: string }): TrackPayload | null {
        const collected = collectNotes(rawTrack);
        if (!collected) return null;
        let allNotes: Note[] = Array.isArray(collected.arr) ? collected.arr : [];
        const clipAnns = new Map<number, LayerAnn>();   // arrangement clip index -> its annotations
        const trackId = range?.id ?? String(rawTrack.id ?? rawTrack.rawId ?? rawTrack._id ?? `track_${idx}`);
        const trackName = safeStr(rawTrack.name, "Unknown");
        const clips: any[] = rawTrack.arrangementClips ?? [];
        if (editCtx) {
            editCtx.refs = allNotes.map(n => ({ cref: n.cref ?? -1, oid: n.oid ?? -1 }));
            editCtx.spans = collected.arrClips;
            editCtx.v2Ids = new Map();
            for (const span of collected.arrClips) editCtx.snapshots.set(span.index, JSON.stringify(clips[span.index]?.notes ?? []));
            for (const span of collected.arrClips) {
                const clip = clips[span.index];
                const hint = { track: trackName, clip: safeStr(clip?.name, `Clip${span.index + 1}`) };
                const found = clip ? findClipLayer(context, clip, hint) : {};
                editCtx.v2Ids.set(span.index, found.id);
                if (found.layer?.ann) clipAnns.set(span.index, found.layer.ann);
                if (found.layer) {
                    const inst = INSTRUMENT_BY_KEY[found.layer.instrument] || DEFAULT_INSTRUMENT;
                    allNotes = allNotes.map(n => n.cref === span.index ? applyLayerV2([n], found.layer!, inst)[0]! : n);
                }
            }
            allNotes = allNotes.map((n, gid) => ({ ...n, oid: gid }));
        }
        if (range) {
            allNotes = allNotes.filter(n => n.b >= range.start && n.b < range.end).map(n => ({ ...n, b: n.b - range.start }));
            if (editCtx) editCtx.spans = editCtx.spans.map(sp => ({ ...sp, start: sp.start - range.start, end: sp.end - range.start, offset: sp.offset - range.start }));
            if (!allNotes.length) return null;
        }
        const storageKey = layerKey(trackName, "");
        // Drum tracks: no fingering, no TAB layer; editable like guitar (docs/DRUMS.md §5).
        const shownName = trackName + (range?.suffix ?? "");
        const drum = drumPayloadFor(context, rawTrack, trackId, shownName, allNotes, tempo, live, storageKey);
        if (drum) {
            if (editCtx) {
                drum.edit = { mode: "track", spans: editCtx.spans.map(s => ({ start: s.start, end: s.end, offset: s.offset, index: s.index })), noteCount: allNotes.length };
                drum.ann = trackAnnToDisplay(clipAnns, editCtx.spans, range ? range.end - range.start : undefined);
            }
            return drum;
        }
        // v1 note entries are keyed by absolute beat: on a rebased selection keep only instrument / capo / time signature
        const stored = readLayer(context, storageKey);
        const layer = range && stored ? { ...stored, notes: [] } : stored;
        const p = buildPayload(trackId, shownName, allNotes, tempo, live, { instrument: instrumentForLayer(layer), layer, capo: layer?.capo, timeSig: layer?.timeSig });
        if (p) {
            (p as any).layerStorageKey = storageKey;
            (p as any).layerHint = { track: trackName, clip: "" };
        }
        if (p && editCtx) {
            p.edit = { mode: "track", spans: editCtx.spans.map(s => ({ start: s.start, end: s.end, offset: s.offset, index: s.index })), noteCount: allNotes.length };
            (p as any).layerV2IdsByClip = Object.fromEntries([...editCtx.v2Ids.entries()]);
            p.ann = trackAnnToDisplay(clipAnns, editCtx.spans, range ? range.end - range.start : undefined);
        }
        return p;
    }

    type ApplyStats = { changed: number; added: number; deleted: number; dropped: number };
    type ClipWrite = { clip: any; notes: any[] };
    /** Merge a track's edits into its arrangement clips without writing; "stale" when a clip changed while open. */
    function prepareTrackEdits(rawTrack: any, editCtx: TrackEditContext, edits: any): { writes: ClipWrite[]; total: ApplyStats } | "stale" {
        const { perClip, dropped } = splitTrackEdits(edits, editCtx.refs, editCtx.spans);
        const total: ApplyStats = { changed: 0, added: 0, deleted: 0, dropped };
        const clips: any[] = rawTrack.arrangementClips ?? [];
        for (const part of perClip) {
            const clip = clips[part.cref];
            if (!clip || JSON.stringify(clip.notes ?? []) !== editCtx.snapshots.get(part.cref)) {
                console.warn(`[TAB] Track apply skipped: clip ${part.cref} changed while the editor was open.`);
                return "stale";
            }
        }
        const writes = perClip.map(part => {
            const merged = mergeClipEdits(clips[part.cref].notes, part.edits, part.regionStart);
            total.changed += merged.stats.changed; total.added += merged.stats.added;
            total.deleted += merged.stats.deleted; total.dropped += merged.stats.dropped;
            return { clip: clips[part.cref], notes: merged.notes };
        });
        return { writes, total };
    }

    /** Apply editor edits to every arrangement clip they touch, in one undo step. */
    async function applyTrackEdits(rawTrack: any, editCtx: TrackEditContext, edits: any): Promise<boolean> {
        const prep = prepareTrackEdits(rawTrack, editCtx, edits);
        if (prep === "stale") {
            await notify(context, "Not applied: a clip on this track changed while the editor was open. Reopen it and try again.", 4000);
            return false;
        }
        const { writes: results, total } = prep;
        if (total.changed + total.added + total.deleted === 0) { await notify(context, "Nothing to apply: no valid note changes."); return true; }
        context.withinTransaction(() => { for (const r of results) r.clip.notes = r.notes as any; });
        console.log(`[TAB] Track apply complete (${results.length} clip(s)): ${JSON.stringify(total)}`);
        await notify(context, applySummary(total).replace("Applied to clip:", `Applied to ${results.length} clip(s):`));
        return true;
    }

    /**
     * Save a track view's fingering into each clip's layer. `selectionLength` (Selection tabs, rebased
     * spans) means the tab showed only part of each clip: the clip's stored entries for notes that were
     * shown are replaced by the tab's, entries for notes outside the selection are kept.
     */
    function saveTrackV2Layers(rawTrack: any, trackName: string, editCtx: TrackEditContext, message: any, selectionLength?: number) {
        if (!message?.layer || message.layer.v !== 2) return;
        const clips: any[] = rawTrack.arrangementClips ?? [];
        const allLayer = message.layer as TabLayerV2;
        for (const span of editCtx.spans) {
            const clip = clips[span.index];
            const hint = { track: trackName, clip: safeStr(clip?.name, `Clip${span.index + 1}`) };
            const hashes = clip ? clipRawHashes(clip) : new Set<string>();
            // entries carry their clip index (c); older messages without it fall back to the clip's note hashes
            let notes = allLayer.notes
                .filter(n => typeof n.c === "number" ? n.c === span.index : hashes.has(n.h))
                .map(({ c, ...rest }) => rest);
            if (selectionLength !== undefined) {
                const id = editCtx.v2Ids.get(span.index);
                const file = id ? v2File(context, id) : undefined;
                let old: TabLayerV2 | undefined;
                try { if (file && fs.existsSync(file)) { const x = JSON.parse(fs.readFileSync(file, "utf8")); if (isValidV2(x)) old = x; } } catch { /* start fresh */ }
                if (old) {
                    // hashes of this clip's notes that the tab showed (as opened): rebased start in [0, selectionLength)
                    const shown = new Set<string>();
                    try {
                        for (const n of JSON.parse(editCtx.snapshots.get(span.index) ?? "[]") as any[]) {
                            const cb = Number(n?.startTime), b = cb + span.offset;
                            if (Number.isFinite(cb) && b >= -1e-9 && b < selectionLength - 1e-9) shown.add(clipNoteHash({ p: Number(n.pitch), cb }));
                        }
                    } catch { /* keep everything old */ }
                    const fresh = new Set(notes.map(n => n.h));
                    notes = [...old.notes.filter(n => !shown.has(n.h) && !fresh.has(n.h)), ...notes];
                }
            }
            const per: TabLayerV2 = { v: 2, instrument: allLayer.instrument, capo: allLayer.capo, hint, notes };
            if (allLayer.timeSig) per.timeSig = { ...allLayer.timeSig };
            editCtx.v2Ids.set(span.index, saveClipLayer(context, editCtx.v2Ids.get(span.index), per, hint, true, clip));
        }
        // track-level settings in v1 file
        saveLayer(context, layerKey(trackName, ""), { v: 1, instrument: allLayer.instrument, capo: allLayer.capo, notes: [], ...(allLayer.timeSig ? { timeSig: allLayer.timeSig } : {}) });
    }

    // ──────────────────────────────────────────────────────
    // Several tabs in one editor (All Tracks, Scene, Selected Clips, Selection).
    // Every tab is editable. Live's modal answers once, on close: the editor sends one entry
    // per tab ({ id, apply, edited, edits, layer, drumLayer }); marked tabs are written to
    // their clips together, in one undo step (ui/src/multiApply.ts).
    // ──────────────────────────────────────────────────────
    type MultiTarget =
        | { kind: "clip"; name: string; clip: any; regionStart: number; opened: string; v2Id?: string; hint: { track: string; clip: string }; storageKey: string; drum: boolean }
        | { kind: "track"; name: string; track: any; trackName: string; editCtx: TrackEditContext; storageKey: string; drum: boolean; selectionLength?: number };

    /** Track view: every clip's chords at display beats (b = clip beat + span offset); key / title from the first clip that has one. */
    function trackAnnToDisplay(clipAnns: Map<number, LayerAnn>, spans: TrackClipSpan[], visibleLength?: number) {
        const out: any = {};
        const chords: { b: number; name: string; auto?: boolean }[] = [];
        const lyrics: { b: number; text: string }[] = [];
        const shown = (b: number, sp: TrackClipSpan) =>
            b >= sp.start - 1e-9 && b < sp.end - 1e-9 &&                                                  // inside the clip's shown part
            (visibleLength === undefined || (b >= -1e-9 && b < visibleLength - 1e-9));                      // and inside the selection
        for (const sp of spans) {
            const ann = clipAnns.get(sp.index); if (!ann) continue;
            const disp = annToDisplay(ann, sp.offset);
            for (const c of disp?.chords ?? []) if (shown(c.b, sp)) chords.push(c);
            for (const l of disp?.lyrics ?? []) if (shown(l.b, sp)) lyrics.push(l);
            if (!out.key && ann.key) out.key = { ...ann.key };
            if (!out.title && ann.title) out.title = ann.title;
        }
        if (chords.length) out.chords = chords.sort((a, b) => a.b - b.b);
        if (lyrics.length) out.lyrics = lyrics.sort((a, b) => a.b - b.b);
        return Object.keys(out).length ? out : undefined;
    }
    /** Track view: store each clip's part of the editor's annotations (chords carry their clip index `c`).
     *  The view shows one key / title (the first clip's that has one): a clip keeps its own key / title unless
     *  that shown value was changed. Chords and lyrics outside what was shown are kept (Fable review #3). */
    function saveTrackAnn(rawTrack: any, trackName: string, editCtx: TrackEditContext, rawAnn: unknown, base: { instrument: string; capo: number }, selectionLength?: number, drum = false) {
        const ann = sanitizeAnn(rawAnn);
        const clips: any[] = rawTrack.arrangementClips ?? [];
        const stored = new Map<number, LayerAnn | undefined>();
        for (const span of editCtx.spans) stored.set(span.index, readV2(context, editCtx.v2Ids.get(span.index))?.ann);
        let shownKey: LayerAnn["key"], shownTitle: string | undefined;
        for (const span of editCtx.spans) {
            const a = stored.get(span.index); if (!a) continue;
            if (!shownKey && a.key) shownKey = a.key;
            if (!shownTitle && a.title) shownTitle = a.title;
        }
        const sameKey = (a?: LayerAnn["key"], b?: LayerAnn["key"]) => (!a && !b) || (!!a && !!b && a.fifths === b.fifths && !!a.minor === !!b.minor);
        const keyChanged = !sameKey(ann?.key, shownKey);
        const titleChanged = (ann?.title ?? "") !== (shownTitle ?? "");
        for (const span of editCtx.spans) {
            const clip = clips[span.index]; if (!clip) continue;
            const hint = { track: trackName, clip: safeStr(clip?.name, `Clip${span.index + 1}`) };
            const old = stored.get(span.index);
            const part = annForClip(ann, span.index);
            const shown = (cb: number) => { const b = cb + span.offset;
                return b >= span.start - 1e-9 && b < span.end - 1e-9 &&
                    (selectionLength === undefined || (b >= -1e-9 && b < selectionLength - 1e-9)); };
            const merged = sanitizeAnn({
                chords: [...(old?.chords ?? []).filter(c => !shown(c.cb)), ...(part?.chords ?? [])],
                lyrics: [...(old?.lyrics ?? []).filter(l => !shown(l.cb)), ...(part?.lyrics ?? [])],
                ...(keyChanged ? (ann?.key ? { key: ann.key } : {}) : (old?.key ? { key: old.key } : {})),
                ...(titleChanged ? (ann?.title ? { title: ann.title } : {}) : (old?.title ? { title: old.title } : {})),
            });
            editCtx.v2Ids.set(span.index, saveClipAnn(context, editCtx.v2Ids.get(span.index), hint, merged, base, clip));
        }
    }

    function refreshTrackHashes(rawTrack: any, editCtx: TrackEditContext) {
        const clips: any[] = rawTrack.arrangementClips ?? [];
        for (const span of editCtx.spans) { const clip = clips[span.index]; if (clip) refreshHashOnlyLayer(context, editCtx.v2Ids.get(span.index), clip); }
    }
    function refreshTargetHashes(tg: MultiTarget) {
        if (tg.kind === "clip") refreshHashOnlyLayer(context, tg.v2Id, tg.clip);
        else refreshTrackHashes(tg.track, tg.editCtx);
    }

    async function openMulti(payloads: TrackPayload[], targets: Map<string, MultiTarget>, emptyMessage: string): Promise<void> {
        if (!payloads.length) { await showEditor(context, [], emptyMessage); return; }
        const result = await showEditor(context, payloads);
        if (!result) return;
        let message: any;
        try { message = JSON.parse(result); } catch { console.log(`[TAB] modal closed without a message (${result.slice(0, 40)})`); return; }
        // one tab: the editor sends the single-tab message (Apply / Close / Cancel); treat it as that tab's entry
        let tabs: any[] = Array.isArray(message?.tabs) ? message.tabs : [];
        if (!tabs.length && payloads.length === 1) {
            const apply = message?.action === "apply";
            tabs = [{ id: payloads[0]!.id, apply, edited: apply || message?.action === "cancel", edits: message?.edits, layer: message?.layer, drumLayer: message?.drumLayer, ...(message && "ann" in message ? { ann: message.ann } : {}) }];
        }
        try { await applyMultiTabs(tabs, targets); }
        catch (e) {
            console.warn("[TAB] multi apply failed:", e);
            await notify(context, "Apply failed: " + (e instanceof Error ? e.message : String(e)), 4000);
        }
    }

    async function applyMultiTabs(tabs: any[], targets: Map<string, MultiTarget>): Promise<void> {
        const writes: ClipWrite[] = [];
        const after: (() => void)[] = [];          // layer / kit map saves: only once the clips are written
        const total: ApplyStats = { changed: 0, added: 0, deleted: 0, dropped: 0 };
        const skipped: string[] = [];
        const refreshTargets: MultiTarget[] = [];
        const owner = new Map<any, string>();      // clip -> tab that writes it (two tabs must never write one clip)
        let applied = 0;
        const add = (st: ApplyStats) => { total.changed += st.changed; total.added += st.added; total.deleted += st.deleted; total.dropped += st.dropped; };
        const saveLayers = (tg: MultiTarget, tab: any) => {
            if (tg.drum || !tab.layer || tab.layer.v !== 2) return;
            if (tg.kind === "clip") tg.v2Id = saveClipLayer(context, tg.v2Id, tab.layer as TabLayerV2, tg.hint, true, tg.clip);
            else saveTrackV2Layers(tg.track, tg.trackName, tg.editCtx, tab, tg.selectionLength);
        };
        const claim = (clips: any[], name: string): boolean => {
            if (clips.some(c => owner.has(c) && owner.get(c) !== name)) return false;
            for (const c of clips) owner.set(c, name);
            return true;
        };
        for (const tab of tabs) {
            const tg = targets.get(String(tab?.id));
            if (!tg) continue;
            try {
                if (tab.drumLayer) { const dl = tab.drumLayer; after.push(() => saveDrumLayer(context, tg.storageKey, dl)); }
                if ("ann" in tab) after.push(() => {   // before the fingering save, which then keeps them
                    if (tg.kind === "clip") tg.v2Id = saveClipAnn(context, tg.v2Id, tg.hint, sanitizeAnn(tab.ann), annBase(tab, readV2(context, tg.v2Id)), tg.clip);
                    else saveTrackAnn(tg.track, tg.trackName, tg.editCtx, tab.ann, annBase(tab, readLayer(context, tg.storageKey)), tg.selectionLength, tg.drum);
                });
                if (!(tab.apply && tab.edits)) {
                    if (!tab.edited) after.push(() => saveLayers(tg, tab));   // untouched tab: keep its fingering, as Close does
                    continue;
                }
                if (tg.kind === "clip") {
                    const current = tg.clip.notes;
                    if (!Array.isArray(current) || JSON.stringify(current) !== tg.opened) { skipped.push(tg.name); continue; }
                    const merged = mergeClipEdits(current, tab.edits, tg.regionStart);
                    if (merged.stats.changed + merged.stats.added + merged.stats.deleted === 0) { add(merged.stats); after.push(() => saveLayers(tg, tab)); continue; }
                    if (!claim([tg.clip], tg.name)) { skipped.push(tg.name); continue; }
                    add(merged.stats);
                    writes.push({ clip: tg.clip, notes: merged.notes });
                } else {
                    const prep = prepareTrackEdits(tg.track, tg.editCtx, tab.edits);
                    if (prep === "stale") { skipped.push(tg.name); continue; }
                    if (!prep.writes.length || prep.total.changed + prep.total.added + prep.total.deleted === 0) { add(prep.total); continue; }
                    if (!claim(prep.writes.map(w => w.clip), tg.name)) { skipped.push(tg.name); continue; }
                    add(prep.total);
                    writes.push(...prep.writes);
                }
                applied++;
                refreshTargets.push(tg);
                after.push(() => saveLayers(tg, tab));
            } catch (e) {
                // e.g. the clip was deleted while the editor was open: skip this tab, keep the others
                console.warn(`[TAB] tab "${tg.name}" skipped:`, e);
                skipped.push(tg.name);
            }
        }
        if (writes.length) context.withinTransaction(() => { for (const w of writes) w.clip.notes = w.notes as any; });
        for (const f of after) { try { f(); } catch (e) { console.warn("[TAB] layer save failed:", e); } }
        // annotation-only (hash) files of the clips just written get their new note hashes (Fable final review #1)
        for (const tg of refreshTargets) { try { refreshTargetHashes(tg); } catch (e) { console.warn("[TAB] hash refresh failed:", e); } }
        console.log(`[TAB] multi apply: ${applied} tab(s), ${writes.length} clip(s), ${JSON.stringify(total)}, skipped: ${skipped.length}`);
        const skipText = skipped.length ? ` Not applied (the clip changed or is shared with another tab; reopen and try again): ${skipped.join(", ")}.` : "";
        if (writes.length) await notify(context, applySummary(total).replace("Applied to clip:", `Applied to ${writes.length} clip(s) in ${applied} tab(s):`) + skipText, skipped.length ? 5000 : undefined);
        else if (skipped.length) await notify(context, "Nothing applied." + skipText, 5000);
        else if (tabs.some(t => t.apply)) await notify(context, "Nothing to apply: no valid note changes.");
    }

    /** Every MIDI track's Arrangement clips, one editable tab per track. */
    async function openAllTracks(): Promise<void> {
        const tempo = getTempo(context);
        const live = liveContext(context);
        console.log(`[TAB] opening ALL tracks. tempo: ${tempo}`);
        const payloads: TrackPayload[] = [];
        const targets = new Map<string, MultiTarget>();
        let trackIdx = 0;
        for (const rawTrack of context.application.song.tracks) {
            if (!rawTrack) continue;
            trackIdx++;
            const editCtx: TrackEditContext = { refs: [], spans: [], snapshots: new Map(), v2Ids: new Map() };
            const p = trackPayload(rawTrack, trackIdx, tempo, live, editCtx);
            if (!p) continue;
            payloads.push(p);
            const trackName = safeStr((rawTrack as any).name, "Track");
            targets.set(String(p.id), { kind: "track", name: trackName, track: rawTrack, trackName, editCtx, storageKey: layerKey(trackName, ""), drum: !!(p as any).drum });
        }
        await openMulti(payloads, targets, "No notes in Arrangement clips. Open a Session clip or scene instead.");
    }

    /** Editable payload for one Session/Arrangement clip (TAB with its saved fingering, or drum notation). */
    function multiClipPayload(clip: any, track: any, slotIndex: number | undefined, id: string, tempo: number, live: any): { p: TrackPayload; target: MultiTarget } | null {
        if (!clip || !Array.isArray(clip.notes) || !clip.notes.length) return null;
        const clipName = safeStr(clip.name, "Clip");
        const trackName = safeStr(track?.name, "Track");
        const raw = notesFromClip(clip, 0, "ses", clipName);
        let notes = clipRegion(raw, { looping: clip.looping, loopStart: clip.loopStart, loopEnd: clip.loopEnd, startMarker: clip.startMarker, endMarker: clip.endMarker });
        if (!notes.length) return null;
        const hint = { track: trackName, clip: clipName };
        const storageKey = layerKey(trackName, clipName);
        const foundV2 = findClipLayer(context, clip, hint);
        const v1Layer = readLayer(context, storageKey);
        let timeSig = foundV2.layer?.timeSig ?? v1Layer?.timeSig;
        try {
            const scene: any = Number.isInteger(slotIndex) ? (context.application.song as any).scenes?.[slotIndex as number] : undefined;
            const beats = Number(scene?.signatureNumerator), type = Number(scene?.signatureDenominator);
            if (!timeSig && beats >= 1 && beats <= 32 && [1,2,4,8,16].includes(type)) timeSig = { beats, type };
        } catch { /* default to 4/4 */ }
        const name = `${trackName} · ${clipName}`;
        const drumKey = layerKey(trackName, "");
        let p: TrackPayload | null = drumPayloadFor(context, track, id, name, notes, tempo, live, drumKey, timeSig);
        const drum = !!p;
        if (!p && foundV2.layer) {
            const inst = INSTRUMENT_BY_KEY[foundV2.layer.instrument] || DEFAULT_INSTRUMENT;
            notes = applyLayerV2(notes, foundV2.layer, inst);
            p = buildPayload(id, name, notes, tempo, live, { instrument: inst, capo: foundV2.layer.capo, timeSig });
        } else if (!p) {
            p = buildPayload(id, name, notes, tempo, live, { instrument: instrumentForLayer(v1Layer), layer: v1Layer, capo: v1Layer?.capo, timeSig });
        }
        if (!p) return null;
        const regionStart = clip.looping ? clip.loopStart : clip.startMarker;
        const regionEnd = clip.looping ? clip.loopEnd : clip.endMarker;
        p.edit = { mode: "clip", regionStart, regionLength: regionEnd - regionStart, noteCount: clip.notes.length };
        if (!drum) { (p as any).layerStorageKey = storageKey; (p as any).layerHint = hint; (p as any).layerV2Id = foundV2.id; }
        p.ann = annToDisplay(foundV2.layer?.ann, -regionStart);
        return { p, target: { kind: "clip", name, clip, regionStart, opened: JSON.stringify(clip.notes), v2Id: foundV2.id, hint, storageKey: drum ? drumKey : storageKey, drum } };
    }

    /** Several Session clips side by side (one editable tab per clip). */
    async function openSessionClips(items: { clip: any; track: any; slotIndex?: number }[], emptyMessage: string): Promise<void> {
        const tempo = getTempo(context);
        const live = liveContext(context);
        delete live.cues;   // clips start at beat 0: Arrangement cues do not apply
        const payloads: TrackPayload[] = [];
        const targets = new Map<string, MultiTarget>();
        items.forEach((it, i) => {
            try {
                const r = multiClipPayload(it.clip, it.track, it.slotIndex, `ses_${i}`, tempo, live);
                if (r) { payloads.push(r.p); targets.set(String(r.p.id), r.target); }
            } catch (e) { console.warn("[TAB] session clip skipped:", e); }
        });
        console.log(`[TAB] session clips: ${payloads.length} of ${items.length} opened`);
        await openMulti(payloads, targets, emptyMessage);
    }

    // Every command goes through this: an exception inside one must never take down the extension host.
    const register = (id: string, fn: (...args: any[]) => Promise<void>) =>
        context.commands.registerCommand(id, (...args: unknown[]) => {
            fn(...args).catch(async (e: unknown) => {
                console.error(`[TAB] ${id} failed:`, e);
                await notify(context, "Tab Editor could not open this: " + (e instanceof Error ? e.message : String(e)), 4000);
            });
        });

    register("tabeditor.open", async (...args: unknown[]) => {
        let track: any = null;
        if (args[0] != null) {
            try {
                track = context.getObjectFromHandle(args[0] as any, MidiTrack);
            } catch (e) {
                console.warn("[TAB] track resolve failed, opening all tracks:", e);
            }
        }
        if (!track) { await openAllTracks(); return; }

        const tempo = getTempo(context);
        const live = liveContext(context);
        const name = safeStr(track.name, "Track");
        const editCtx: TrackEditContext = { refs: [], spans: [], snapshots: new Map(), v2Ids: new Map() };
        const p = trackPayload(track, 1, tempo, live, editCtx);
        if (!p) {
            console.warn(`[TAB] track "${name}" has no notes in Arrangement clips — editor not opened.`);
            await showEditor(context, [], `No notes in Arrangement clips of "${name}". Open a clip instead (right-click the clip → Open (Clip) - Edit).`);
            return;
        }
        console.log(`[TAB] track mode: "${name}"`);
        const result = await showEditor(context, [p]);
        if (!result) return;
        let message: any;
        try { message = JSON.parse(result); } catch { console.log(`[TAB] modal closed without a message (${result.slice(0, 40)})`); return; }
        if (message?.drumLayer) saveDrumLayer(context, message.layerKey || (p as any).layerStorageKey, message.drumLayer);
        if (message && "ann" in message) {
            try { saveTrackAnn(track, name, editCtx, message.ann, annBase(message, readLayer(context, layerKey(name, ""))), undefined, !!(p as any).drum); }
            catch (e) { console.warn("[TAB] annotation save failed:", e); }
        }
        if (message?.action === "apply" && message.edits) {
            try {
                const ok = await applyTrackEdits(track, editCtx, message.edits);
                if (ok) { saveTrackV2Layers(track, name, editCtx, message); refreshTrackHashes(track, editCtx); }
            } catch (e) {
                console.warn("[TAB] Track apply failed:", e);
                await notify(context, "Apply failed: " + (e instanceof Error ? e.message : String(e)), 4000);
            }
            return;
        }
        const hasEdits = !!(message?.edits && ((message.edits.changed?.length || 0) + (message.edits.added?.length || 0) + (message.edits.deleted?.length || 0)) > 0);
        if (!hasEdits) saveTrackV2Layers(track, name, editCtx, message);
    });

    register("tabeditor.openAll", async () => { await openAllTracks(); });

    // Scene: every MIDI clip in that scene's row (guitar, bass, drums ...) in one editor.
    register("tabeditor.openScene", async (arg: unknown) => {
        let scene: any = null;
        try { scene = context.getObjectFromHandle(arg as any, Scene); } catch (e) { console.warn("[TAB] scene resolve failed:", e); }
        const song: any = context.application.song;
        const sceneIdx = scene ? (song.scenes as any[]).indexOf(scene) : -1;
        if (sceneIdx < 0) { await openAllTracks(); return; }
        const items: { clip: any; track: any; slotIndex: number }[] = [];
        for (const t of song.tracks as any[]) {
            const clip = Array.isArray(t?.clipSlots) ? t.clipSlots[sceneIdx]?.clip : null;
            if (clip && Array.isArray(clip.notes)) items.push({ clip, track: t, slotIndex: sceneIdx });
        }
        console.log(`[TAB] scene mode: scene ${sceneIdx + 1}, ${items.length} MIDI clips`);
        await openSessionClips(items, `No MIDI clips with notes in scene ${sceneIdx + 1}.`);
    });

    // Several selected Session clips (Shift/Ctrl+click) in one editor.
    register("tabeditor.openClips", async (arg: unknown) => {
        const sel = arg as ClipSlotSelection;
        const slots: any[] = [];
        for (const h of sel?.selected_clip_slots ?? []) {
            try { const s = context.getObjectFromHandle(h as any, ClipSlot); if (s) slots.push(s); } catch (e) { console.warn("[TAB] clip slot resolve failed:", e); }
        }
        const items: { clip: any; track: any; slotIndex?: number }[] = [];
        for (const t of context.application.song.tracks as any[]) {
            const ts: any[] = Array.isArray(t?.clipSlots) ? t.clipSlots : [];
            ts.forEach((s, i) => { if (slots.includes(s) && s?.clip && Array.isArray(s.clip.notes)) items.push({ clip: s.clip, track: t, slotIndex: i }); });
        }
        console.log(`[TAB] selected clips mode: ${items.length} MIDI clips of ${slots.length} slots`);
        await openSessionClips(items, "No MIDI clips with notes in the selection.");
    });

    // ──────────────────────────────────────────────────────
    // ② 선택영역 모드 (어레인지: 클립 우클릭 or 드래그 범위)
    //    선택 시작점을 0박자로 재배치(rebase) → 악보가 1마디부터
    // ──────────────────────────────────────────────────────
    register("tabeditor.openSelection", async (arg: unknown) => {
        const sel   = arg as ArrangementSelection;
        const tempo = getTempo(context);
        const start = sel.time_selection_start;
        const end   = sel.time_selection_end;
        const live  = liveContext(context, start);
        console.log(`[TAB] selection mode: beat ${start} → ${end}`);

        const payloads: TrackPayload[] = [];
        const targets = new Map<string, MultiTarget>();
        const seen = new Set<any>();
        let laneIdx = 0;

        for (const handle of sel.selected_lanes ?? []) {
            laneIdx++;
            let obj: unknown;
            try {
                obj = context.getObjectFromHandle(handle as any, DataModelObject);
            } catch (e) {
                console.warn(`[TAB] lane ${laneIdx} resolve failed:`, e);
                continue;
            }

            // 테이크 레인이면 부모 트랙으로 거슬러 올라감
            const track: any = (obj instanceof TakeLane) ? (obj as any).parent : obj;
            // a track and its take lanes resolve to the same track: one tab (two tabs must not write the same clips)
            const key = track ? String(track.handle?.id ?? safeStr(track.name, "")) : "";   // Handle = { id: bigint }
            if (!track || seen.has(key)) continue;
            seen.add(key);

            // Notes that start inside the range, rebased so the range starts at beat 0; editable like the track view.
            const editCtx: TrackEditContext = { refs: [], spans: [], snapshots: new Map(), v2Ids: new Map() };
            const p = trackPayload(track, laneIdx, tempo, live, editCtx, { start, end, id: `sel_${laneIdx}`, suffix: " [sel]" });
            if (!p) continue;
            payloads.push(p);
            const trackName = safeStr(track.name, `Lane${laneIdx}`);
            targets.set(String(p.id), { kind: "track", name: `${trackName} [sel]`, track, trackName, editCtx, storageKey: layerKey(trackName, ""), drum: !!(p as any).drum, selectionLength: end - start });
        }
        await openMulti(payloads, targets, "No notes in the selected range.");
    });

    // ──────────────────────────────────────────────────────
    // ③ 단일 클립 모드 (세션/어레인지 공통: MidiClip 우클릭)
    //    클립 핸들 → MidiClip 복원 → 그 클립 노트만, 0박부터
    // ──────────────────────────────────────────────────────
    register("tabeditor.openClip", async (...args: unknown[]) => {
        const tempo = getTempo(context);
        let clip: any;
        try {
            clip = context.getObjectFromHandle(args[0] as any, MidiClip);
        } catch (e) {
            console.warn("[TAB] clip resolve failed:", e);
            return;
        }

        if (!clip) {
            console.warn("[TAB] clip resolve failed.");
            return;
        }
        if (!Array.isArray(clip.notes)) {
            console.warn("[TAB] clip has no notes array.");
            await showEditor(context, [], "This clip has no notes in its loop region.");
            return;
        }

        const clipName = safeStr(clip.name, "Clip");
        console.log(`[TAB] clip mode: "${clipName}", ${clip.notes.length} raw notes`);

        // 클립 단독 모드는 항상 0박부터 (offset = 0), 루프/마커 영역 적용
        const rawNotes = notesFromClip(clip, 0, "ses", clipName);
        let regioned = clipRegion(rawNotes, {
            looping: clip.looping,
            loopStart: clip.loopStart,
            loopEnd: clip.loopEnd,
            startMarker: clip.startMarker,
            endMarker: clip.endMarker,
        });
        const live = liveContext(context);
        delete live.cues;   // clip mode passes no cues
        const regionStart = clip.looping ? clip.loopStart : clip.startMarker;
        const where = locateClip(context, clip);
        const trackName = where?.trackName ?? "Track";
        const hint = { track: trackName, clip: clipName };
        const storageKey = layerKey(trackName, clipName);
        const foundV2 = findClipLayer(context, clip, hint);
        let v2Id = foundV2.id;
        const v1Layer = readLayer(context, storageKey);
        let timeSig = foundV2.layer?.timeSig ?? v1Layer?.timeSig;
        try {
            const song: any = context.application.song;
            const slotIndex = where?.slotIndex ?? NaN;   // Session clip: slot i belongs to scene i
            const scene = Number.isInteger(slotIndex) ? song.scenes?.[slotIndex] : undefined;
            const beats = Number(scene?.signatureNumerator), type = Number(scene?.signatureDenominator);
            if (!timeSig && beats >= 1 && beats <= 32 && [1,2,4,8,16].includes(type)) timeSig = { beats, type };
        } catch { /* default to 4/4 */ }
        // Drum clips: percussion staff, no TAB layer; the kit map comes back with Close / Apply.
        const drum = drumPayloadFor(context, where?.track, "clip_0", clipName, regioned, tempo, live, storageKey, timeSig);
        let p: TrackPayload | null;
        if (drum) {
            p = drum;
        } else if (foundV2.layer) {
            const inst = INSTRUMENT_BY_KEY[foundV2.layer.instrument] || DEFAULT_INSTRUMENT;
            regioned = applyLayerV2(regioned, foundV2.layer, inst);
            p = buildPayload("clip_0", clipName, regioned, tempo, live, { instrument: inst, capo: foundV2.layer.capo, timeSig });
        } else {
            p = buildPayload("clip_0", clipName, regioned, tempo, live, { instrument: instrumentForLayer(v1Layer), layer: v1Layer, capo: v1Layer?.capo, timeSig });
        }

        if (!p) {
            await showEditor(context, [], "This clip has no notes in its loop region.");
            return;
        }
        const regionEnd = clip.looping ? clip.loopEnd : clip.endMarker;
        p.edit = { mode: "clip", regionStart, regionLength: regionEnd - regionStart, noteCount: clip.notes.length };
        p.ann = annToDisplay(foundV2.layer?.ann, -regionStart);
        (p as any).layerStorageKey = storageKey;
        (p as any).layerHint = hint;
        (p as any).layerV2Id = v2Id;
        // Snapshot of the notes as opened: edits refer to them by index (oid).
        const openedNotes = JSON.stringify(clip.notes);
        const result = await showEditor(context, [p]);
        if (!result) return;
        let message: any;
        try { message = JSON.parse(result); } catch { console.log(`[TAB] modal closed without a message (${result.slice(0, 40)})`); return; }
        if (drum && message?.drumLayer) saveDrumLayer(context, message.layerKey || storageKey, message.drumLayer);
        // annotations (chords, key, title) are saved on every close, whatever happens to the note edits
        if (message && "ann" in message) {
            try { v2Id = saveClipAnn(context, v2Id, hint, sanitizeAnn(message.ann), annBase(message, foundV2.layer), clip); }
            catch (e) { console.warn("[TAB] annotation save failed:", e); }
        }
        try {
            const saveV2 = () => {
                if (!drum && message?.layer && message.layer.v === 2) v2Id = saveClipLayer(context, v2Id, message.layer as TabLayerV2, hint, true, clip);
            };
            if (message?.action === "apply" && message.edits) {
                const current = clip.notes;
                if (!Array.isArray(current) || JSON.stringify(current) !== openedNotes) {
                    console.warn("[TAB] Apply skipped: the clip's notes changed while the editor was open.");
                    await notify(context, "Not applied: the clip changed while the editor was open. Reopen it and try again.", 4000);
                    return;
                }
                const merged = mergeClipEdits(current, message.edits, regionStart);
                if (merged.stats.changed + merged.stats.added + merged.stats.deleted === 0) {
                    console.log(`[TAB] Apply has no valid changes: ${JSON.stringify(merged.stats)}`);
                    saveV2(); // clip unchanged, layer still matches
                    await notify(context, "Nothing to apply: no valid note changes.");
                    return;
                }
                context.withinTransaction(() => { clip.notes = merged.notes as any; });
                saveV2();
                refreshHashOnlyLayer(context, v2Id, clip);   // annotations saved above carried the old hashes (Fable review #6)
                console.log(`[TAB] Apply complete: ${JSON.stringify(merged.stats)}`);
                await notify(context, applySummary(merged.stats));
                return;
            }
            const hasEdits = !!(message?.edits && ((message.edits.changed?.length || 0) + (message.edits.added?.length || 0) + (message.edits.deleted?.length || 0)) > 0);
            if (!hasEdits) saveV2();
        } catch (e) {
            console.warn("[TAB] Apply message ignored:", e);
            await notify(context, "Apply failed: " + (e instanceof Error ? e.message : String(e)), 4000);
        }
    });

    // ──────────────────────────────────────────────────────
    // 우클릭 메뉴 등록: 스코프별로 다른 커맨드 + 구분 라벨
    //  - ArrangementSelection: 어레인지 선택영역
    //  - MidiClip: 세션/어레인지 클립 단독
    //  - MidiTrack: 그 트랙만 / AudioTrack·Scene: 전체 트랙
    // ──────────────────────────────────────────────────────
    const menus: Array<[string, string, string]> = [
        ["MidiTrack.ArrangementSelection", "Open (Selection) - Edit", "tabeditor.openSelection"],
        ["MidiClip",                       "Open (Clip) - Edit",      "tabeditor.openClip"],
        ["MidiTrack",                      "Open (Track) - Edit",     "tabeditor.open"],
        ["AudioTrack",                     "Open (All Tracks) - Edit", "tabeditor.openAll"],
        ["Scene",                          "Open (Scene) - Edit",     "tabeditor.openScene"],
        ["ClipSlotSelection",              "Open (Selected Clips) - Edit", "tabeditor.openClips"],
    ];
    for (const [loc, label, cmd] of menus) {
        try {
            context.ui.registerContextMenuAction(loc as any, label, cmd);
        } catch (e) {
            console.warn(`[TAB] menu (${loc}) failed:`, e);
        }
    }
}
