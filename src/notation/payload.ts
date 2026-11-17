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
import { BASS_4, BASS_5, DEFAULT_INSTRUMENT, GUITAR_6, GUITAR_7 } from "./instruments.js";
import { applyLayer, type TabLayer } from "./tabLayer.js";

export type PayloadOptions = { instrument?: typeof DEFAULT_INSTRUMENT; timeSig?: { beats: number; type: number }; capo?: number; layer?: TabLayer };

export function chooseAutoInstrument(notes: Note[]) {
    const below40 = notes.filter(n => n.p < 40).length;
    const pitches = notes.map(n => n.p).sort((a, b) => a - b);
    const mid = Math.floor(pitches.length / 2);
    const median = pitches.length % 2 ? pitches[mid]! : ((pitches[mid - 1] ?? 0) + (pitches[mid] ?? 0)) / 2;
    const bass = below40 / Math.max(1, notes.length) >= 0.3 || (pitches[0]! < 36 && median < 52);
    if (bass) return pitches.some(p => p < 28) ? BASS_5 : BASS_4;
    return notes.some(n => n.p >= 35 && n.p <= 39) ? GUITAR_7 : GUITAR_6;
}

export function buildPayload(
    id: string,          // 트랙/클립 식별자
    name: string,        // 에디터 탭에 표시될 이름
    allNotes: Note[],    // 수집된 원본 노트
    tempo: number,       // BPM
    live?: TrackPayload["live"],
    options: PayloadOptions = {}
): TrackPayload | null {
    if (allNotes.length === 0) return null; // 노트 없으면 페이로드 생성 안 함

    // 퀀타이즈 먼저 → 같은 박자로 snap된 음표들을 코드로 묶어 보이싱
    const grid = detectQuantizeGrid(allNotes);
    const quantized = allNotes.map(n => ({
        ...n,
        b: quantizeBeat(n.b, grid),
    })) as Note[];
    const instrument = options.instrument ?? chooseAutoInstrument(quantized);
    const layered = options.layer ? applyLayer(quantized, options.layer, instrument) : quantized;
    const tabNotes = applyGuitarVoicing(layered, instrument)
        .filter(n => n.s >= 1 && n.s <= instrument.stringCount && n.f >= 0);

    const timeSig = options.timeSig ?? live?.timeSig;
    const capo = options.capo ?? 0;
    const xmlOpts: any = { instrument, skipVoicing: true, cues: live?.cues, timeSig, capo };
    if (live?.scale?.enabled) {
        const k = keyFromLiveScale(live.scale.root, live.scale.name);
        if (k) xmlOpts.key = k;
    }
    return {
        id,
        name,
        noteCount: tabNotes.length,
        notes: tabNotes,
        instrument,
        instruments: instrument,
        timeSig,
        capo,
        bpm: tempo,
        musicXml: toMusicXml(tabNotes, tempo, xmlOpts),
        alphaTex: toAlphaTex(tabNotes, { bpm: tempo, timeSig }),
        live,
    };
}
