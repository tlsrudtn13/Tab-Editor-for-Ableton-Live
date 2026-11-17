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
import { mergeClipEdits } from "./notation/clipEdits.js";
import { startDevHarness, devEditorUrl } from "./dev/harness.js";
import { safeStr }      from "./notation/music.js";
import fs   from "node:fs";
import path from "node:path";

// 공용 헬퍼 1 (buildPayload) 은 src/notation/payload.ts 로 이동 — dev harness 와 공유

// ============================================================
// 공용 헬퍼 2: 페이로드 배열 → 모달 에디터 열기
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
    const safeJson = JSON.stringify(safePayloads)
        .replace(/<\/script/gi, "<\\/script");

    // tracks 데이터를 <head> 안에 주입 (DOCTYPE 앞은 WebView2 오동작)
    let headInject = `<head><script>window.tracks=${safeJson};</script>`;
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
    function trackPayload(rawTrack: any, idx: number, tempo: number, live: any): TrackPayload | null {
        const collected = collectNotes(rawTrack);
        if (!collected) return null;
        // arr 노트는 이미 arrangement 절대 위치를 가지므로 마디가 정렬됨.
        const allNotes: Note[] = Array.isArray(collected.arr) ? collected.arr : [];
        const trackId = String(rawTrack.id ?? rawTrack.rawId ?? rawTrack._id ?? `track_${idx}`);
        return buildPayload(trackId, rawTrack.name ?? "Unknown", allNotes, tempo, live);
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
        await showEditor(context, payloads);
    }

    context.commands.registerCommand("tabeditor.open", async (...args: unknown[]) => {
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
        const p = trackPayload(track, 1, tempo, live);
        if (!p) {
            console.warn(`[TAB] track "${name}" has no notes in Arrangement clips — editor not opened.`);
            await showEditor(context, [], `No notes in Arrangement clips of "${name}". Open a clip instead (right-click the clip → Open (Clip)).`);
            return;
        }
        console.log(`[TAB] track mode: "${name}"`);
        await showEditor(context, [p]);
    });

    context.commands.registerCommand("tabeditor.openAll", async () => { await openAllTracks(); });

    // ──────────────────────────────────────────────────────
    // ② 선택영역 모드 (어레인지: 클립 우클릭 or 드래그 범위)
    //    선택 시작점을 0박자로 재배치(rebase) → 악보가 1마디부터
    // ──────────────────────────────────────────────────────
    context.commands.registerCommand("tabeditor.openSelection", async (arg: unknown) => {
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
            const p = buildPayload(`sel_${laneIdx}`, name, inRange as Note[], tempo, live);
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
    context.commands.registerCommand("tabeditor.openClip", async (...args: unknown[]) => {
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
        const p = buildPayload("clip_0", clipName, regioned, tempo, live);

        if (!p) {
            await showEditor(context, [], "This clip has no notes in its loop region.");
            return;
        }
        p.edit = { mode: "clip", regionStart, noteCount: clip.notes.length };
        // Snapshot of the notes as opened: edits refer to them by index (oid).
        const openedNotes = JSON.stringify(clip.notes);
        const result = await showEditor(context, [p]);
        if (!result) return;
        try {
            const message = JSON.parse(result);
            if (message?.action !== "apply" || !message.edits) return;
            const current = clip.notes;
            if (!Array.isArray(current) || JSON.stringify(current) !== openedNotes) {
                console.warn("[TAB] Apply skipped: the clip's notes changed while the editor was open.");
                return;
            }
            const merged = mergeClipEdits(current, message.edits, regionStart);
            if (merged.stats.changed + merged.stats.added + merged.stats.deleted === 0) {
                console.log(`[TAB] Apply has no valid changes: ${JSON.stringify(merged.stats)}`);
                return;
            }
            context.withinTransaction(() => { clip.notes = merged.notes as any; });
            console.log(`[TAB] Apply complete: ${JSON.stringify(merged.stats)}`);
        } catch (e) {
            console.warn("[TAB] Apply message ignored:", e);
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
