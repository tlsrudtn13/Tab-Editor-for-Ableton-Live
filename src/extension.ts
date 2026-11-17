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
import { BASS_4, BASS_4_DROPD, BASS_4_EB, BASS_5, BASS_6, GUITAR_6, GUITAR_6_D, GUITAR_6_DROPC, GUITAR_6_DROPD, GUITAR_6_DADGAD, GUITAR_6_EB, GUITAR_6_OPEND, GUITAR_6_OPENG, GUITAR_7, GUITAR_8, GUITAR_12 } from "./notation/instruments.js";
import { layerKey, type TabLayer } from "./notation/tabLayer.js";
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
    const p = buildDrumPayload(id, name, notes, tempo, live, { timeSig, override: layer?.map, hints: rack?.hints, source: rack ? "drum-rack" : "heuristic" });
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
    const finalHtml = modalInterface.replace("<head>", headInject);

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
    console.log(`[TAB] loading from file: ${fileUrl}`);
    
    // dev build: load through the harness server so the editor can report back
    const url = (__TAB_DEV__ && devEditorUrl(htmlPath)) || fileUrl;
    return await context.ui.showModalDialog(url, 1400, 900) as string | undefined;
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
    type TrackEditContext = { refs: TrackNoteRef[]; spans: TrackClipSpan[]; snapshots: Map<number, string> };

    function trackPayload(rawTrack: any, idx: number, tempo: number, live: any, editCtx?: TrackEditContext): TrackPayload | null {
        const collected = collectNotes(rawTrack);
        if (!collected) return null;
        // arr 노트는 이미 arrangement 절대 위치를 가지므로 마디가 정렬됨.
        let allNotes: Note[] = Array.isArray(collected.arr) ? collected.arr : [];
        if (editCtx) {
            // the editor's oid becomes a track-wide id; refs map it back to (clip, index in that clip)
            editCtx.refs = allNotes.map(n => ({ cref: n.cref ?? -1, oid: n.oid ?? -1 }));
            editCtx.spans = collected.arrClips;
            const clips: any[] = rawTrack.arrangementClips ?? [];
            for (const span of collected.arrClips) editCtx.snapshots.set(span.index, JSON.stringify(clips[span.index]?.notes ?? []));
            allNotes = allNotes.map((n, gid) => ({ ...n, oid: gid }));
        }
        const trackId = String(rawTrack.id ?? rawTrack.rawId ?? rawTrack._id ?? `track_${idx}`);
        const trackName = rawTrack.name ?? "Unknown";
        const storageKey = layerKey(trackName, "");
        // Drum tracks are view only: no fingering, no TAB layer, no write-back.
        const drum = drumPayloadFor(context, rawTrack, trackId, trackName, allNotes, tempo, live, storageKey);
        if (drum) return drum;
        const layer = readLayer(context, storageKey);
        const p = buildPayload(trackId, trackName, allNotes, tempo, live, { instrument: instrumentForLayer(layer), layer, capo: layer?.capo, timeSig: layer?.timeSig });
        if (p) (p as any).layerStorageKey = storageKey;
        if (p && editCtx) p.edit = { mode: "track", spans: editCtx.spans.map(s => ({ start: s.start, end: s.end })), noteCount: allNotes.length };
        return p;
    }

    /** Apply editor edits to every arrangement clip they touch, in one undo step. */
    async function applyTrackEdits(rawTrack: any, editCtx: TrackEditContext, edits: any): Promise<void> {
        const { perClip, dropped } = splitTrackEdits(edits, editCtx.refs, editCtx.spans);
        if (!perClip.length) { await notify(context, "Nothing to apply: no valid note changes."); return; }
        const clips: any[] = rawTrack.arrangementClips ?? [];
        for (const part of perClip) {
            const clip = clips[part.cref];
            if (!clip || JSON.stringify(clip.notes ?? []) !== editCtx.snapshots.get(part.cref)) {
                console.warn(`[TAB] Track apply skipped: clip ${part.cref} changed while the editor was open.`);
                await notify(context, "Not applied: a clip on this track changed while the editor was open. Reopen it and try again.", 4000);
                return;
            }
        }
        const total = { changed: 0, added: 0, deleted: 0, dropped };
        const results = perClip.map(part => {
            const merged = mergeClipEdits(clips[part.cref].notes, part.edits, part.regionStart);
            total.changed += merged.stats.changed; total.added += merged.stats.added;
            total.deleted += merged.stats.deleted; total.dropped += merged.stats.dropped;
            return { clip: clips[part.cref], notes: merged.notes };
        });
        if (total.changed + total.added + total.deleted === 0) { await notify(context, "Nothing to apply: no valid note changes."); return; }
        context.withinTransaction(() => { for (const r of results) r.clip.notes = r.notes as any; });
        console.log(`[TAB] Track apply complete (${results.length} clip(s)): ${JSON.stringify(total)}`);
        await notify(context, applySummary(total).replace("Applied to clip:", `Applied to ${results.length} clip(s):`));
    }

    async function openAllTracks(): Promise<void> {
        const tempo = getTempo(context);
        const live = liveContext(context);
        console.log(`[TAB] opening ALL tracks. tempo: ${tempo}`);
        const payloads: TrackPayload[] = [];
        let trackIdx = 0;
        for (const rawTrack of context.application.song.tracks) {
            if (!rawTrack) continue;
            trackIdx++;
            const p = trackPayload(rawTrack, trackIdx, tempo, live);
            if (p) payloads.push(p);
        }
        const result = await showEditor(context, payloads);
        try { const message=JSON.parse(result || "null"); if(message?.layer) saveLayer(context, message.layerKey, message.layer); if(message?.drumLayer) saveDrumLayer(context, message.layerKey, message.drumLayer); } catch(e) { console.warn("[TAB] track layer message ignored:",e); }
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
        const editCtx: TrackEditContext = { refs: [], spans: [], snapshots: new Map() };
        const p = trackPayload(track, 1, tempo, live, editCtx);
        if (!p) {
            console.warn(`[TAB] track "${name}" has no notes in Arrangement clips — editor not opened.`);
            await showEditor(context, [], `No notes in Arrangement clips of "${name}". Open a clip instead (right-click the clip → Open (Clip)).`);
            return;
        }
        console.log(`[TAB] track mode: "${name}"`);
        const result = await showEditor(context, [p]);
        if (!result) return;
        let message: any;
        try { message = JSON.parse(result); } catch { console.log(`[TAB] modal closed without a message (${result.slice(0, 40)})`); return; }
        if (message?.layer) saveLayer(context, message.layerKey || (p as any).layerStorageKey, message.layer);
        if (message?.drumLayer) saveDrumLayer(context, message.layerKey || (p as any).layerStorageKey, message.drumLayer);
        if (message?.action !== "apply" || !message.edits) return;
        try {
            await applyTrackEdits(track, editCtx, message.edits);
        } catch (e) {
            console.warn("[TAB] Track apply failed:", e);
            await notify(context, "Apply failed: " + (e instanceof Error ? e.message : String(e)), 4000);
        }
    });

    register("tabeditor.openAll", async () => { await openAllTracks(); });

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
            if (!track) continue;

            // 트랙 전체 노트 수집 후, 선택 범위 안에서 "시작하는" 노트만 필터
            const collected = collectNotes(track);
            const inRange = (collected?.arr ?? [])
                .filter(n => n.b >= start && n.b < end)
                .map(n => ({ ...n, b: n.b - start })); // 선택 시작 = 0박자

            const name = `${safeStr(track.name, `Lane${laneIdx}`)} [sel]`;
            const p = drumPayloadFor(context, track, `sel_${laneIdx}`, name, inRange as Note[], tempo, live, layerKey(safeStr(track.name, ""), ""))
                ?? buildPayload(`sel_${laneIdx}`, name, inRange as Note[], tempo, live);
            if (p) payloads.push(p);
        }

        if (payloads.length === 0) {
            await showEditor(context, [], "No notes in the selected range.");
            return;
        }
        await showEditor(context, payloads);
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
        const regioned = clipRegion(rawNotes, {
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
        const storageKey = layerKey(trackName, clipName);
        const layer = readLayer(context, storageKey);
        let timeSig = layer?.timeSig;
        try {
            const song: any = context.application.song;
            const slotIndex = where?.slotIndex ?? NaN;   // Session clip: slot i belongs to scene i
            const scene = Number.isInteger(slotIndex) ? song.scenes?.[slotIndex] : undefined;
            const beats = Number(scene?.signatureNumerator), type = Number(scene?.signatureDenominator);
            if (!timeSig && beats >= 1 && beats <= 32 && [1,2,4,8,16].includes(type)) timeSig = { beats, type };
        } catch { /* default to 4/4 */ }
        const drum = drumPayloadFor(context, where?.track, "clip_0", clipName, regioned, tempo, live, storageKey, timeSig);
        if (drum) {
            // Drum clips are view only (editing is a later round): no edit field, only the kit map comes back.
            const result = await showEditor(context, [drum]);
            try { const message = JSON.parse(result || "null"); if (message?.drumLayer) saveDrumLayer(context, message.layerKey || storageKey, message.drumLayer); }
            catch (e) { console.warn("[TAB] drum message ignored:", e); }
            return;
        }
        const p = buildPayload("clip_0", clipName, regioned, tempo, live, { instrument: instrumentForLayer(layer), layer, capo: layer?.capo, timeSig });

        if (!p) {
            await showEditor(context, [], "This clip has no notes in its loop region.");
            return;
        }
        const regionEnd = clip.looping ? clip.loopEnd : clip.endMarker;
        p.edit = { mode: "clip", regionStart, regionLength: regionEnd - regionStart, noteCount: clip.notes.length };
        (p as any).layerStorageKey = storageKey;
        // Snapshot of the notes as opened: edits refer to them by index (oid).
        const openedNotes = JSON.stringify(clip.notes);
        const result = await showEditor(context, [p]);
        if (!result) return;
        let message: any;
        try { message = JSON.parse(result); } catch { console.log(`[TAB] modal closed without a message (${result.slice(0, 40)})`); return; }
        try {
            if (message?.layer) saveLayer(context, message.layerKey || storageKey, message.layer);
            if (message?.drumLayer) saveDrumLayer(context, message.layerKey || storageKey, message.drumLayer);
            if (message?.action !== "apply" || !message.edits) return;
            const current = clip.notes;
            if (!Array.isArray(current) || JSON.stringify(current) !== openedNotes) {
                console.warn("[TAB] Apply skipped: the clip's notes changed while the editor was open.");
                await notify(context, "Not applied: the clip changed while the editor was open. Reopen it and try again.", 4000);
                return;
            }
            const merged = mergeClipEdits(current, message.edits, regionStart);
            if (merged.stats.changed + merged.stats.added + merged.stats.deleted === 0) {
                console.log(`[TAB] Apply has no valid changes: ${JSON.stringify(merged.stats)}`);
                await notify(context, "Nothing to apply: no valid note changes.");
                return;
            }
            context.withinTransaction(() => { clip.notes = merged.notes as any; });
            console.log(`[TAB] Apply complete: ${JSON.stringify(merged.stats)}`);
            await notify(context, applySummary(merged.stats));
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
        ["MidiTrack.ArrangementSelection", "Open (Selection)", "tabeditor.openSelection"],
        ["MidiClip",                       "Open (Clip)",      "tabeditor.openClip"],
        ["MidiTrack",                      "Open (Track)",     "tabeditor.open"],
        ["AudioTrack",                     "Open (All Tracks)", "tabeditor.openAll"],
        ["Scene",                          "Open (All Tracks)", "tabeditor.openAll"],
    ];
    for (const [loc, label, cmd] of menus) {
        try {
            context.ui.registerContextMenuAction(loc as any, label, cmd);
        } catch (e) {
            console.warn(`[TAB] menu (${loc}) failed:`, e);
        }
    }
}
