// ============================================================
// src/extension.ts  (v2 beta release - 진입점 분리 + 버그픽스)
//   · 진입점 3종: Selection(어레인지) / Clip(단일) / Track(전체)
//   · 전체 트랙 모드는 arrangement 클립만 → session 클립 끼어듦 방지
//   · 셋잇단 미포함 (출시 후 편집기능으로 구현 예정)
// ============================================================

import {
    initialize,
    MidiClip,                          // 클립 핸들 → 실제 객체 복원용
    DataModelObject,                   // 선택 레인 핸들의 범용 복원용
    TakeLane,                          // 테이크 레인 → 부모 트랙 추적용
    type ActivationContext,
    type ArrangementSelection,         // 어레인지 선택영역 인자 타입
} from "@ableton-extensions/sdk";
import modalInterface from "../dist-ui/index.html";

// ── notation 모듈 임포트 (node16 규칙: .js 확장자 필수) ──
import type { Note, TrackPayload } from "./notation/index.js";
import { collectNotes, notesFromClip } from "./notation/collectNotes.js";
import { toAlphaTex }   from "./notation/toAlphaTex.js";
import { toMusicXml }   from "./notation/toMusicXml.js";
import { safeStr }      from "./notation/music.js";
import { applyGuitarVoicing } from "./notation/voicing.js";
import { DEFAULT_INSTRUMENT } from "./notation/instruments.js";
import { detectQuantizeGrid, quantizeBeat } from "./notation/music.js";
import fs   from "node:fs";
import path from "node:path";

// ============================================================
// 공용 헬퍼 1: Note[] → TrackPayload 변환 파이프라인
// (퀀타이즈 → 보이싱 → MusicXML/AlphaTex)
// 세 진입점(Track/Selection/Clip) 모두 이 함수를 공유합니다.
// ============================================================
function buildPayload(
    id: string,          // 트랙/클립 식별자
    name: string,        // 에디터 탭에 표시될 이름
    allNotes: Note[],    // 수집된 원본 노트
    tempo: number        // BPM
): TrackPayload | null {
    if (allNotes.length === 0) return null; // 노트 없으면 페이로드 생성 안 함

    // 퀀타이즈 먼저 → 같은 박자로 snap된 음표들을 코드로 묶어 보이싱
    const grid = detectQuantizeGrid(allNotes);
    const quantized = allNotes.map(n => ({
        ...n,
        b: quantizeBeat(n.b, grid),
    })) as Note[];
    const tabNotes = applyGuitarVoicing(quantized, DEFAULT_INSTRUMENT)
        .filter(n => n.s >= 1 && n.s <= DEFAULT_INSTRUMENT.stringCount && n.f >= 0);

    const xmlOpts = { instrument: DEFAULT_INSTRUMENT, skipVoicing: true };
    return {
        id,
        name,
        noteCount: tabNotes.length,
        notes: tabNotes,
        instruments: DEFAULT_INSTRUMENT,
        bpm: tempo,
        musicXml: toMusicXml(tabNotes, tempo, xmlOpts),
        alphaTex: toAlphaTex(tabNotes, { bpm: tempo }),
    };
}

// ============================================================
// 공용 헬퍼 2: 페이로드 배열 → 모달 에디터 열기
// ============================================================
async function showEditor(
    context: ReturnType<typeof initialize>,
    payloads: TrackPayload[]
): Promise<void> {
    if (payloads.length === 0) {
        console.warn("[TAB] no MIDI notes found — editor not opened.");
        return;
    }

    // </script 문자열이 HTML을 깨지 않도록 이스케이프
    const safeJson = JSON.stringify(payloads)
        .replace(/<\/script/gi, "<\\/script");

    // tracks 데이터를 <head> 안에 주입 (DOCTYPE 앞은 WebView2 오동작)
    const finalHtml = modalInterface.replace(
        "<head>",
        `<head><script>window.tracks=${safeJson};</script>`
    );

   // ★ SDK 허용 경로 사용 (os.tmpdir()는 권한 차단됨).
    //   tempDirectory가 undefined일 수 있어 storageDirectory로 폴백.
    const tmpDir = context.environment.tempDirectory
        ?? context.environment.storageDirectory;
    if (!tmpDir) {
        console.error("[TAB] no writable directory available (temp/storage both undefined).");
        return;
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
    
    await context.ui.showModalDialog(fileUrl, 1400, 900);
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

// ============================================================
// activate: 커맨드 3종 + 메뉴 등록
// ============================================================
export function activate(activation: ActivationContext) {
    const context = initialize(activation, "1.0.0");

    // ──────────────────────────────────────────────────────
    // ① 전체 트랙 모드 (트랙 이름 우클릭)
    //    arrangement 클립만 사용 → session 클립 끼어듦 방지 (버그픽스)
    // ──────────────────────────────────────────────────────
    context.commands.registerCommand("tabeditor.open", async (..._args: unknown[]) => {
        const tempo = getTempo(context);
        console.log(`[TAB] opening FULL editor. tempo: ${tempo}`);

        const payloads: TrackPayload[] = [];
        let trackIdx = 0;

        for (const rawTrack of context.application.song.tracks) {
            if (!rawTrack) continue;
            trackIdx++;

            const collected = collectNotes(rawTrack);
            if (!collected) continue;

            // ★ 버그픽스: arrangement 클립(arr)만 사용. session(ses)은 제외.
            //   arr 노트는 이미 arrangement 절대 위치를 가지므로 마디가 정렬됨.
            const allNotes: Note[] = Array.isArray(collected.arr) ? collected.arr : [];

            const rawTrackObj = rawTrack as any;
            const trackId = String(
                rawTrackObj.id ?? rawTrackObj.rawId ?? rawTrackObj._id ?? `track_${trackIdx}`
            );

            const p = buildPayload(trackId, rawTrack.name ?? "Unknown", allNotes, tempo);
            if (p) payloads.push(p);
        }

        await showEditor(context, payloads);
    });

    // ──────────────────────────────────────────────────────
    // ② 선택영역 모드 (어레인지: 클립 우클릭 or 드래그 범위)
    //    선택 시작점을 0박자로 재배치(rebase) → 악보가 1마디부터
    // ──────────────────────────────────────────────────────
    context.commands.registerCommand("tabeditor.openSelection", async (arg: unknown) => {
        const sel   = arg as ArrangementSelection;
        const tempo = getTempo(context);
        const start = sel.time_selection_start;
        const end   = sel.time_selection_end;
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
            const p = buildPayload(`sel_${laneIdx}`, name, inRange as Note[], tempo);
            if (p) payloads.push(p);
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

        if (!clip || !Array.isArray(clip.notes)) {
            console.warn("[TAB] clip has no notes array.");
            return;
        }

        const clipName = safeStr(clip.name, "Clip");
        console.log(`[TAB] clip mode: "${clipName}", ${clip.notes.length} raw notes`);

        // 클립 단독 모드는 항상 0박부터 (offset = 0)
        const notes = notesFromClip(clip, 0, "ses", clipName);
        const p = buildPayload("clip_0", clipName, notes, tempo);

        await showEditor(context, p ? [p] : []);
    });

    // ──────────────────────────────────────────────────────
    // 우클릭 메뉴 등록: 스코프별로 다른 커맨드 + 구분 라벨
    //  - ArrangementSelection: 어레인지 선택영역
    //  - MidiClip: 세션/어레인지 클립 단독
    //  - MidiTrack/AudioTrack/Scene: 트랙·씬 → 전체
    // ──────────────────────────────────────────────────────
    const menus: Array<[string, string, string]> = [
        ["MidiTrack.ArrangementSelection", "Open (Selection)", "tabeditor.openSelection"],
        ["MidiClip",                       "Open (Clip)",      "tabeditor.openClip"],
        ["MidiTrack",                      "Open (Track)",     "tabeditor.open"],
        ["AudioTrack",                     "Open (Track)",     "tabeditor.open"],
        ["Scene",                          "Open (Track)",     "tabeditor.open"],
    ];
    for (const [loc, label, cmd] of menus) {
        try {
            context.ui.registerContextMenuAction(loc as any, label, cmd);
        } catch (e) {
            console.warn(`[TAB] menu (${loc}) failed:`, e);
        }
    }
}