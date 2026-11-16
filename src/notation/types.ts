// ============================================================
// src/notation/types.ts
//
// 모든 모듈이 공유하는 타입 정의.
// SDK(Ableton)나 DOM에 의존하지 않아 단독 import 가능.
// ============================================================
import type { InstrumentConfig } from "./instruments.js";

/** 에이블톤에서 수집한 MIDI 노트 (compact 포맷 — 필드명을 단일 문자로 유지해 JSON 크기 최소화) */
export type Note = {
    b:    number;          // startBeat  — 어레인지먼트 시작부터의 절대 박자
    d:    number;          // durationBeat
    p:    number;          // MIDI pitch  (0–127)
    v:    number;          // velocity    (1–127)
    f:    number;          // fret        (0–24)
    s:    number;          // string      (1–6, 표준 튜닝)
    src:  "arr" | "ses";   // 소스: arrangement 클립 | session 슬롯
    clip: string;          // 클립 이름
    hammerOn?: boolean;
    pullOff?:  boolean;
    slide?:    "up" | "down";
    bend?:     number; // 반음 단위 (2 = 온음 벤드)
    oor?: number;  // 음역 밖 표시: 1=고음(가상프렛>24), 2=저음(옥타브 폴딩)
};

/** extension.ts → interface.html 으로 전달되는 트랙 페이로드 */
export type TrackPayload = {
    id:        string;
    name:      string;
    noteCount: number;
    /** Phase 1 (현재): AlphaTex 문자열 */
    alphaTex?: string;
    /** Phase 2 (예정): MusicXML 문자열 — alphaTex 대신 사용 */
    musicXml?: string;
    /** MIDI Inspector용 전체 노트 배열 */
    notes:     Note[];
    musicXmlStaff?: string;
    musicXmlTab?:   string;
    /** 악기 설정 */
    instruments?: InstrumentConfig;
    bpm: number;
};

/** 퀀타이즈 그리드: 분음표 단위 (4 = 4분음표, 32 = 32분음표) */
export type QuantizeGrid = 4 | 8 | 16 | 32;

/** 조표 정보 */
export type KeyInfo = {
    fifths: number;              // -7(7플랫) ~ +7(7샵), 0 = C장조/A단조
    mode:   "major" | "minor";
};

/** 박자표 */
export type TimeSig = {
    beats: number;   // 분자 (e.g. 4)
    type:  number;   // 분모 (e.g. 4)
};

/** MusicXML 생성 옵션 */
export type MusicXmlOptions = {
    staffMode?: 'both' | 'staff' | 'tab';  // 기본값: 'both'
    timeSig?:  TimeSig;       // 기본값 4/4
    key?:      KeyInfo;       // 미지정 시 자동 감지
    quantize?: QuantizeGrid;  // 미지정 시 자동 감지
    capo?:     number;        // 카포 포지션 (0 = 없음)
    tuning?:   number[];      // 개방현 MIDI 피치 [1번줄..6번줄], 기본 표준 튜닝
    instrument?: InstrumentConfig;  // 악기 설정 (기본값: 6현 기타)
    skipVoicing?: boolean;  // true면 내부 보이싱 재적용 생략
    transpose?: number;     // 반음 단위로 전체 음정 이동 (양수 = 올림, 음수 = 내림)
};
