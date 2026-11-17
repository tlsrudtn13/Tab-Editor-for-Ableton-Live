// ============================================================
// src/notation/payload.ts
// Note[] -> TrackPayload (quantize -> voicing -> MusicXML/AlphaTex).
// Shared by the three entry points in extension.ts, the dev harness and
// scripts/preview.ts. No SDK or DOM dependency.
// ============================================================
import type { Note, TrackPayload } from "./types.js";
import { detectQuantizeGrid, quantizeBeat, keyFromLiveScale } from "./music.js";
import { applyGuitarVoicing } from "./voicing.js";
import { toMusicXml } from "./toMusicXml.js";
import { toAlphaTex } from "./toAlphaTex.js";
import { DEFAULT_INSTRUMENT } from "./instruments.js";

export function buildPayload(
    id: string,          // 트랙/클립 식별자
    name: string,        // 에디터 탭에 표시될 이름
    allNotes: Note[],    // 수집된 원본 노트
    tempo: number,       // BPM
    live?: TrackPayload["live"]  // Live 컨텍스트 (선택)
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

    const xmlOpts: any = { instrument: DEFAULT_INSTRUMENT, skipVoicing: true, cues: live?.cues };
    if (live?.scale?.enabled) {
        const k = keyFromLiveScale(live.scale.root, live.scale.name);
        if (k) xmlOpts.key = k;
    }
    return {
        id,
        name,
        noteCount: tabNotes.length,
        notes: tabNotes,
        instruments: DEFAULT_INSTRUMENT,
        bpm: tempo,
        musicXml: toMusicXml(tabNotes, tempo, xmlOpts),
        alphaTex: toAlphaTex(tabNotes, { bpm: tempo }),
        live,
    };
}
