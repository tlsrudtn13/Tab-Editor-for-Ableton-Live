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
export const BASS_4: InstrumentConfig = {
    name:        "4-String Bass",
    stringCount: 4,
    open:        [0, 55, 50, 45, 40], // G D A E
};

export const BASS_5: InstrumentConfig = {
    name:        "5-String Bass",
    stringCount: 5,
    open:        [0, 55, 50, 45, 40, 35], // G D A E B(low)
};

export const BASS_6: InstrumentConfig = {
    name:        "6-String Bass",
    stringCount: 6,
    open:        [0, 60, 55, 50, 45, 40, 35], // C G D A E B(low)
};

// ── 기본값 ────────────────────────────────────────────────────
export const DEFAULT_INSTRUMENT = GUITAR_6;