// ============================================================
// src/notation/music.ts
//
// 순수 음악 유틸리티 함수 모음.
// SDK도 DOM도 없음 → vitest로 단독 테스트 가능.
// ============================================================

import type { Note, QuantizeGrid, KeyInfo, TimeSig } from "./types.js";

// ── 표준 기타 튜닝 ──────────────────────────────────────────
// 각 줄의 개방현 MIDI 피치 (index 1 = 1번줄 = 고음 E4)
export const STANDARD_TUNING: readonly number[] = [0, 64, 59, 55, 50, 45, 40];

// ── MIDI pitch ↔ 기타 프렛/줄 ────────────────────────────────

/**
 * MIDI 피치를 표준 튜닝 기준으로 기타 프렛+줄로 변환.
 * 가능한 한 낮은 줄(굵은 줄)에 배치해 연주 가능성을 높인다.
 */
export function pitchToFs(
    pitch: number,
    tuning: readonly number[] = STANDARD_TUNING
): { f: number; s: number } {
    // 줄 6→1 순서로 탐색 (낮은 줄 우선)
    for (let s = 6; s >= 1; s--) {
        const open = tuning[s]!;
        const fret  = pitch - open;
        if (fret >= 0 && fret <= 24) return { f: fret, s };
    }
    // 범위 초과 — 1번줄에 클램프
    return { f: Math.max(0, pitch - tuning[1]!), s: 1 };
}

/**
 * 프렛+줄 → MIDI 피치 역산
 */
export function fsToMidiPitch(
    fret: number,
    string: number,
    tuning: readonly number[] = STANDARD_TUNING
): number {
    return tuning[string]! + fret;
}

// ── 퀀타이즈 ────────────────────────────────────────────────

/**
 * 박자값을 지정한 그리드에 맞게 반올림.
 * @param beat   절대 박자 (소수 가능)
 * @param grid   QuantizeGrid (4 | 8 | 16 | 32)
 */
export function quantizeBeat(beat: number, grid: QuantizeGrid = 16): number {
    const step = 4 / grid; // beats per grid step (16분음표 → 0.25 beats)
    const result = Math.round(beat / step) * step;
    return isFinite(result) ? result : 0;
}

/**
 * Note[] 배열의 인접 노트 간격을 분석해 최적 퀀타이즈 그리드를 자동 감지.
 *
 * 알고리즘:
 *   1. 인접 노트 간격(interval) 배열을 구한다.
 *   2. 최솟값 기반으로 "이 곡이 몇 분음표 그리드인가"를 추정한다.
 *
 * madisonrickert 방식을 참고한 단순화 버전.
 */
export function detectQuantizeGrid(notes: Note[]): QuantizeGrid {
    if (notes.length < 2) return 16;

    const sorted  = notes.slice().sort((a, b) => a.b - b.b);
    const gaps: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
        const g = sorted[i]!.b - sorted[i - 1]!.b;
        if (g > 0.01) gaps.push(g); // 0.01 미만 간격(화음 구성음)은 무시
    }

    if (!gaps.length) return 16;

    const minGap = Math.min(...gaps);

    // 최소 간격이 어느 그리드에 가장 가까운지 판별
    // 32분음표 = 0.125beats, 16분 = 0.25, 8분 = 0.5, 4분 = 1.0
    if (minGap < 0.19) return 32;
    if (minGap < 0.38) return 16;
    if (minGap < 0.75) return 8;
    return 4;
}

// ── 조표 감지 (Krumhansl–Schmuckler 간소화) ─────────────────

/** 장조/단조 키 프로필 (Krumhansl & Kessler 1982) */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Note[] 에서 가장 가능성 높은 조표를 추정.
 * 각 피치 클래스의 사용 빈도(velocity 가중)를 프로필과 비교.
 */
export function detectKey(notes: Note[]): KeyInfo {
    if (!notes.length) return { fifths: 0, mode: "major" };

    // 피치 클래스별 가중 빈도
    const weights = new Array<number>(12).fill(0);
    for (const n of notes) {
        weights[n.p % 12]! += n.v; // velocity 가중
    }

    let bestScore = -Infinity;
    let bestFifths = 0;
    let bestMode: "major" | "minor" = "major";

    // 12개 장조 + 12개 단조 비교
    for (let root = 0; root < 12; root++) {
        for (const [mode, profile] of [["major", MAJOR_PROFILE], ["minor", MINOR_PROFILE]] as const) {
            let score = 0;
            for (let pc = 0; pc < 12; pc++) {
                score += weights[pc]! * profile[(pc - root + 12) % 12]!;
            }
            if (score > bestScore) {
                bestScore  = score;
                bestMode   = mode;
                // root를 fifths(조표 샵/플랫 수)로 변환
                // C=0, G=1, D=2, A=3, E=4, B=5, F#=6, F=-1, Bb=-2, Eb=-3, Ab=-4, Db=-5, Gb=-6
                const ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // root → fifths
                bestFifths = ORDER[root]! > 6 ? ORDER[root]! - 12 : ORDER[root]!;
            }
        }
    }

    return { fifths: bestFifths, mode: bestMode };
}

// ── 음표값 계산 ──────────────────────────────────────────────

/**
 * 박자 길이를 가장 가까운 표준 음표값으로 변환.
 * 퀀타이즈 이후에 호출하면 정확한 값을 반환한다.
 * @returns AlphaTex/MusicXML 음표 분모 (1=온음표, 2=반음표, 4=4분음표 …)
 */
export function beatToNoteVal(beats: number): number {
    const TABLE: [number, number][] = [
        [4.0, 1], [2.0, 2], [1.0, 4], [0.5, 8], [0.25, 16], [0.125, 32],
    ];
    let best = 32, minDiff = Infinity;
    for (const [bv, nv] of TABLE) {
        const d = Math.abs(bv - beats);
        if (d < minDiff) { minDiff = d; best = nv; }
    }
    return best;
}

/** MusicXML 음표 타입 문자열 (duration type) */
export function noteValToType(noteVal: number): string {
    const MAP: Record<number, string> = {
        1: "whole", 2: "half", 4: "quarter",
        8: "eighth", 16: "16th", 32: "32nd",
    };
    return MAP[noteVal] ?? "16th";
}

// ── 표시용 유틸리티 ──────────────────────────────────────────

const NOTE_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"] as const;

/** MIDI 피치 → 음이름+옥타브 (e.g. 79 → "G5") */
export function pitchToName(pitch: number): string {
    return NOTE_NAMES[pitch % 12]! + (Math.floor(pitch / 12) - 1);
}

/** 절대 박자 → "B9:1.0" 표기 (Bar:Beat) */
export function beatToBarBeat(beat: number, timeSig: TimeSig = { beats: 4, type: 4 }): string {
    const bpb = timeSig.beats;
    const bar  = Math.floor(beat / bpb) + 1;
    const b    = (beat % bpb) + 1;
    return `B${bar}:${b.toFixed(1)}`;
}

/** 박자 길이 → 리듬 이름 표기 (e.g. 0.5 → "♪ 8th") */
export function durToLabel(beats: number): string {
    const t = 0.02;
    if (Math.abs(beats - 4)     < t) return "♩♩♩♩ Whole";
    if (Math.abs(beats - 3)     < t) return "𝅗𝅥.  Dotted Half";
    if (Math.abs(beats - 2)     < t) return "𝅗𝅥   Half";
    if (Math.abs(beats - 1.5)   < t) return "♩.  Dotted Qtr";
    if (Math.abs(beats - 1)     < t) return "♩   Quarter";
    if (Math.abs(beats - 0.75)  < t) return "♪.  Dotted 8th";
    if (Math.abs(beats - 0.5)   < t) return "♪   8th";
    if (Math.abs(beats - 0.375) < t) return "♫.  Dotted 16th";
    if (Math.abs(beats - 0.25)  < t) return "♫   16th";
    if (Math.abs(beats - 0.125) < t) return "   32nd";
    return `${beats.toFixed(3)} b`;
}

/** velocity → 다이나믹 기호 (e.g. 80 → "80 mf") */
export function velToDynamic(v: number): string {
    if (v <=  15) return `${v} ppp`;
    if (v <=  31) return `${v} pp`;
    if (v <=  47) return `${v} p`;
    if (v <=  63) return `${v} mp`;
    if (v <=  79) return `${v} mf`;
    if (v <=  95) return `${v} f`;
    if (v <= 111) return `${v} ff`;
    return `${v} fff`;
}

// ── 안전 파싱 헬퍼 ───────────────────────────────────────────

export function safeNum(v: unknown, def: number): number {
    const n = Number(v);
    return (isFinite(n) && !isNaN(n)) ? n : def;
}

export function safeStr(v: unknown, def: string): string {
    return (typeof v === "string" && v.length > 0) ? v : def;
}
