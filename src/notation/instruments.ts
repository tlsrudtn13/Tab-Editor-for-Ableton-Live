// ============================================================
// src/notation/instruments.ts
//
// 악기 튜닝 프리셋 정의.
// 새 악기 추가 시 이 파일에만 추가하면 됩니다.
// ============================================================

export interface InstrumentConfig {
    name:        string;
    stringCount: number;
    /** open[i] = 줄 i의 개방현 MIDI 피치 (index 0은 미사용, 1 = 가장 높은 줄) */
    open:        number[];
}

// ── 기타 ──────────────────────────────────────────────────────
export const GUITAR_6: InstrumentConfig = {
    name:        "6-String Guitar",
    stringCount: 6,
    open:        [0, 64, 59, 55, 50, 45, 40], // e B G D A E
};

export const GUITAR_7: InstrumentConfig = {
    name:        "7-String Guitar",
    stringCount: 7,
    open:        [0, 64, 59, 55, 50, 45, 40, 35], // e B G D A E B(low)
};

export const GUITAR_6_DROPD: InstrumentConfig = { name: "Guitar — Drop D", stringCount: 6, open: [0, 64, 59, 55, 50, 45, 38] };
export const GUITAR_6_EB: InstrumentConfig = { name: "Guitar — Eb Standard", stringCount: 6, open: [0, 63, 58, 54, 49, 44, 39] };
export const GUITAR_6_D: InstrumentConfig = { name: "Guitar — D Standard", stringCount: 6, open: [0, 62, 57, 53, 48, 43, 38] };
export const GUITAR_6_DROPC: InstrumentConfig = { name: "Guitar — Drop C", stringCount: 6, open: [0, 62, 57, 53, 48, 43, 36] };
export const GUITAR_6_DADGAD: InstrumentConfig = { name: "Guitar — DADGAD", stringCount: 6, open: [0, 62, 57, 55, 50, 45, 38] };
export const GUITAR_6_OPENG: InstrumentConfig = { name: "Guitar — Open G", stringCount: 6, open: [0, 62, 59, 55, 50, 43, 38] };
export const GUITAR_6_OPEND: InstrumentConfig = { name: "Guitar — Open D", stringCount: 6, open: [0, 62, 57, 54, 50, 45, 38] };

// ★ v5 추가: 8현 기타 (표준 F# 튜닝)
export const GUITAR_8: InstrumentConfig = {
    name:        "8-String Guitar",
    stringCount: 8,
    open:        [0, 64, 59, 55, 50, 45, 40, 35, 30], // e B G D A E B F#(low)
};

export const GUITAR_12: InstrumentConfig = {
    name:        "12-String Guitar",
    stringCount: 6, // TAB은 6줄 기준으로 표시
    open:        [0, 64, 59, 55, 50, 45, 40],
};

// ── 베이스 ────────────────────────────────────────────────────
// Sounding pitch, like the guitar presets (Live MIDI is sounding pitch):
// 4-string low E = E1 = MIDI 28. Notation adds the octave via the 8vb clef.
export const BASS_4: InstrumentConfig = {
    name:        "4-String Bass",
    stringCount: 4,
    open:        [0, 43, 38, 33, 28], // G2 D2 A1 E1
};
export const BASS_4_DROPD: InstrumentConfig = { name: "Bass 4 — Drop D", stringCount: 4, open: [0, 43, 38, 33, 26] };
export const BASS_4_EB: InstrumentConfig = { name: "Bass 4 — Eb", stringCount: 4, open: [0, 42, 37, 32, 27] };

export const BASS_5: InstrumentConfig = {
    name:        "5-String Bass",
    stringCount: 5,
    open:        [0, 43, 38, 33, 28, 23], // G2 D2 A1 E1 B0
};

export const BASS_6: InstrumentConfig = {
    name:        "6-String Bass",
    stringCount: 6,
    open:        [0, 48, 43, 38, 33, 28, 23], // C3 G2 D2 A1 E1 B0
};

// ── 기본값 ────────────────────────────────────────────────────
export const DEFAULT_INSTRUMENT = GUITAR_6;
