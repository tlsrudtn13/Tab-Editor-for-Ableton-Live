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
    quantize?: 4 | 8 | 12 | 16 | 24 | 32;
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

    // First pass: build beat groups to compute intervals and triplet flags.
    interface BeatGroup { start: number; end: number; count: number; interval: number; }
    const groups: BeatGroup[] = [];
    let gi = 0;
    while (gi < sorted.length) {
        const cur = sorted[gi]!;
        let gj = gi + 1;
        while (gj < sorted.length && (sorted[gj]!.b - cur.b) <= CHORD_TOL) gj++;
        const barIndex = Math.floor(cur.b / BEATS_PER_BAR);
        const barEndBeat = (barIndex + 1) * BEATS_PER_BAR;
        let nextBeat: number;
        if (gj < sorted.length) {
            const nextBarIdx = Math.floor(sorted[gj]!.b / BEATS_PER_BAR);
            nextBeat = nextBarIdx === barIndex ? sorted[gj]!.b : barEndBeat;
        } else {
            nextBeat = barEndBeat;
        }
        const intervalBeats = Math.max(nextBeat - cur.b, 0.125);
        groups.push({ start: gi, end: gj, count: gj - gi, interval: intervalBeats });
        gi = gj;
    }

    // Triplet detection: runs of >=3 equal intervals that are triplet units.
    const isTripletInterval = (iv: number) =>
        [2 / 3, 1 / 3, 1 / 6].some(t => Math.abs(t - iv) < 0.01);
    const tripletFlag = new Array<boolean>(groups.length).fill(false);
    let k = 0;
    while (k < groups.length) {
        if (!isTripletInterval(groups[k]!.interval)) { k++; continue; }
        let l = k;
        while (l < groups.length && Math.abs(groups[l]!.interval - groups[k]!.interval) < 0.01) l++;
        const run = l - k;
        const complete = Math.floor(run / 3) * 3;
        for (let m = 0; m < complete; m++) tripletFlag[k + m] = true;
        k = l;
    }

    // Second pass: render.
    let tex          = `\\tempo ${Math.round(bpm)}\n.\n`;
    let lastBarIndex = -1;
    let groupIdx     = 0;
    gi = 0;
    while (gi < sorted.length) {
        const cur      = sorted[gi]!;
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

        // find group (already computed)
        const g = groups[groupIdx]!;
        const j = g.end;
        const intervalBeats = g.interval;
        const noteVal       = beatToNoteVal(intervalBeats);
        const count         = g.count;
        const isTrip        = tripletFlag[groupIdx]!;

        if (count === 1) {
            tex += `${cur.f}.${cur.s}:${noteVal}${isTrip ? "{tu 3}" : ""} `;
        } else {
            // 화음
            let chord = "(";
            for (let kk = gi; kk < j; kk++) {
                const n = sorted[kk]!;
                if (kk > gi) chord += " ";
                chord += `${n.f}.${n.s}`;
            }
            tex += `${chord}):${noteVal}${isTrip ? "{tu 3}" : ""} `;
        }

        gi = j;
        groupIdx++;
    }

    tex += "|\n";
    return tex;
}
