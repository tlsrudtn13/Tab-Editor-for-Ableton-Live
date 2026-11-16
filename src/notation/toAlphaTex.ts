// ============================================================
// src/notation/toAlphaTex.ts
//
// Note[] → AlphaTex 문자열 변환.
// Phase 1 현재 방식 — Phase 2에서 toMusicXml.ts 로 교체 예정.
//
// 알려진 한계:
//   - r:N (쉼표) 이 AlphaTex guitar TAB 파서에서 파싱 오류 발생
//   - → 빈 마디는 | 로만 채워 bar 번호를 보존
// ============================================================

import type { Note } from "./types.js";
import { quantizeBeat, beatToNoteVal, detectQuantizeGrid } from "./music.js";

export interface AlphaTexOptions {
    bpm:      number;
    /** 퀀타이즈 그리드. 미지정 시 detectQuantizeGrid() 로 자동 감지 */
    quantize?: 4 | 8 | 16 | 32;
}

/**
 * Note[] → AlphaTex 문자열.
 *
 * 스트럼 감지:
 *   퀀타이즈 후 동일 박자 위치의 노트들 → 화음 `(f1.s1 f2.s2):dur`
 *
 * 간격 기반 음표값:
 *   각 노트의 길이 = 다음 노트까지의 간격 (또는 마디 끝까지)
 *   → 연속 노트의 합이 4박자에 근사
 */
export function toAlphaTex(notes: Note[], opts: AlphaTexOptions): string {
    const { bpm } = opts;

    if (!notes || notes.length === 0) {
        return `\\tempo ${Math.round(bpm)}\n.\n`;
    }

    // 퀀타이즈 그리드 결정
    const grid = opts.quantize ?? detectQuantizeGrid(notes);

    // 퀀타이즈 → 정렬
    const sorted = notes
        .map(n => ({ ...n, b: quantizeBeat(n.b, grid) }))
        .sort((a, b) => a.b !== b.b ? a.b - b.b : a.p - b.p);

    const BEATS_PER_BAR = 4.0;
    const CHORD_TOL     = 0.001; // 퀀타이즈 후 동일 박자 = 화음

    let tex          = `\\tempo ${Math.round(bpm)}\n.\n`;
    let lastBarIndex = -1;
    let i            = 0;

    while (i < sorted.length) {
        const cur      = sorted[i]!;
        const barIndex = Math.floor(cur.b / BEATS_PER_BAR);

        // ── 마디 경계 처리 ───────────────────────────────
        if (barIndex > lastBarIndex && lastBarIndex >= 0) {
            tex += "| "; // 이전 마디 닫기
            const gapBars = barIndex - (lastBarIndex + 1);
            for (let g = 0; g < gapBars; g++) {
                tex += "| "; // 빈 마디 (r:N 불가 — bar 카운터만 진행)
            }
        }
        lastBarIndex = barIndex;

        // ── 화음 그룹화 ──────────────────────────────────
        let j = i + 1;
        while (j < sorted.length && (sorted[j]!.b - cur.b) <= CHORD_TOL) j++;

        // ── 간격 기반 음표값 계산 ────────────────────────
        const barEndBeat = (barIndex + 1) * BEATS_PER_BAR;
        let nextBeat: number;

        if (j < sorted.length) {
            const nextBarIdx = Math.floor(sorted[j]!.b / BEATS_PER_BAR);
            nextBeat = nextBarIdx === barIndex ? sorted[j]!.b : barEndBeat;
        } else {
            nextBeat = barEndBeat;
        }

        const intervalBeats = Math.max(nextBeat - cur.b, 0.125);
        const noteVal       = beatToNoteVal(intervalBeats);
        const count         = j - i;

        if (count === 1) {
            tex += `${cur.f}.${cur.s}:${noteVal} `;
        } else {
            // 화음
            let chord = "(";
            for (let k = i; k < j; k++) {
                const n = sorted[k]!;
                if (k > i) chord += " ";
                chord += `${n.f}.${n.s}`;
            }
            tex += `${chord}):${noteVal} `;
        }

        i = j;
    }

    tex += "|\n";
    return tex;
}
