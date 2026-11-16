// ============================================================
// src/notation/voicing.ts
//
// 기타/베이스 코드 보이싱 알고리즘.
// InstrumentConfig 를 받아 어떤 줄 수의 악기에도 동작합니다.
// ============================================================

import type { Note }             from "./types.js";
import type { InstrumentConfig } from "./instruments.js";
import { DEFAULT_INSTRUMENT }    from "./instruments.js";

/** 특정 피치를 해당 줄에서 연주할 때의 프렛 번호. 불가능하면 null */
function fretOn(pitch: number, stringIdx: number, open: number[]): number | null {
    const openPitch = open[stringIdx];
    if (openPitch === undefined) return null;
    const f = pitch - openPitch;
    return (f >= 0 && f <= 24) ? f : null;
}

/**
 * 단일 피치에 대해 연주 가능한 모든 (줄, 프렛) 조합 반환.
 * 줄 번호 오름차순(1번줄 = 가장 높은 줄 우선)으로 정렬됩니다.
 */
function getPositions(
    pitch:      number,
    instrument: InstrumentConfig
): Array<{ s: number; f: number }> {
    const result: Array<{ s: number; f: number }> = [];
    for (let s = 1; s <= instrument.stringCount; s++) {
        const f = fretOn(pitch, s, instrument.open);
        if (f !== null) result.push({ s, f });
    }
    return result;
}

/**
 * 코드(동시 발음 음표 묶음)에 기타 줄/프렛을 배정합니다.
 *
 * 전략:
 *  1. 피치 내림차순 정렬 (가장 높은 음 → 1번줄 우선 배정)
 *  2. 이미 사용된 줄은 건너뛰고 다음 사용 가능한 줄에 배정
 *  3. 가능한 포지션 중 가장 낮은 프렛 선택 (자연스러운 포지션)
 *  4. 모든 줄이 점유됐으면 가장 낮은 프렛으로 중복 배정
 *
 * @param notes      보이싱을 적용할 음표 배열
 * @param instrument 악기 설정 (기본값: 6현 기타)
 */
export function applyGuitarVoicing(
    notes:      Note[],
    instrument: InstrumentConfig = DEFAULT_INSTRUMENT
): Note[] {
    if (notes.length === 0) return notes;

    // ── 1. 박자 기준 정렬 ────────────────────────────────────────────
    const sorted = [...notes].sort((a, b) => a.b !== b.b ? a.b - b.b : b.p - a.p);

    // ── 2. 코드 그룹 묶기 (동일 박자 ±1/32박자 허용) ─────────────────
    const CHORD_TOL = 0.0625; // 1/32 박자
    const groups:   number[][] = [];
    let gi = 0;

    while (gi < sorted.length) {
        const group    = [gi];
        const refBeat  = sorted[gi]!.b;
        let   gj       = gi + 1;
        while (gj < sorted.length && (sorted[gj]!.b - refBeat) <= CHORD_TOL) {
            group.push(gj);
            gj++;
        }
        groups.push(group);
        gi = gj;
    }

    // ── 3. 그룹별 보이싱 배정 ────────────────────────────────────────
    const result: Note[] = [...sorted];

    for (const group of groups) {
        // 피치 내림차순 (높은 음 → 낮은 줄번호 우선)
        const byPitch = [...group].sort(
            (a, b) => sorted[b]!.p - sorted[a]!.p
        );

        const usedStrings = new Set<number>();

        for (const idx of byPitch) {
            const pitch     = sorted[idx]!.p;
            const positions = getPositions(pitch, instrument);

            // 연주 불가능한 음: 가장 높은 줄의 가상 프렛(1번줄 25프렛 이상) 또는 가장 낮은 줄의 가상 프렛(음역 외 저음)
            if (positions.length === 0) {
                const pitch  = sorted[idx]!.p;
                const hiOpen = instrument.open[1] ?? 64;                      // 최고음 줄 개방
                const loOpen = instrument.open[instrument.stringCount] ?? 40; // 최저음 줄 개방

                if (pitch > hiOpen + 24) {
                    // ★ 고음 초과: 1번 줄 "가상 프렛"(>24)으로 표기.
                    //   AlphaTab 은 open+fret 으로 피치를 재계산하므로 오선/TAB 모두 정확.
                    //   oor=1 → toMusicXml 이 괄호 notehead 로 구별 표시.
                    result[idx] = { ...sorted[idx]!, s: 1, f: pitch - hiOpen, oor: 1 } as Note;
                } else {
                    // ★ 저음 미달: 음수 프렛 불가 → +12씩 옥타브 폴딩해 음역 진입.
                    //   원본 피치(p)는 데이터로 보존, 표기만 폴딩 위치(괄호 구별).
                    let p2 = pitch;
                    while (p2 < loOpen) p2 += 12;
                    const pos2 = getPositions(p2, instrument).filter(pp => !usedStrings.has(pp.s));
                    const pool = pos2.length > 0 ? pos2 : getPositions(p2, instrument);
                    const ch   = pool.reduce((b2, c) => (c.f < b2.f ? c : b2));
                    usedStrings.add(ch.s);
                    result[idx] = { ...sorted[idx]!, s: ch.s, f: ch.f, oor: 2 } as Note;
                }
                continue;
            }

            // 미사용 줄 중에서 가장 낮은 프렛 선택
            const unused = positions.filter(p => !usedStrings.has(p.s));

            let chosen: { s: number; f: number };

            if (unused.length > 0) {
            // 미사용 줄 중에서:
            // 1. 프렛 0~5 (개방 ~ 로우 포지션) 우선
            // 2. 그 다음 낮은 프렛 순
            const lowPos = unused.filter(p => p.f <= 5);
            const pool   = lowPos.length > 0 ? lowPos : unused;
            chosen = pool.reduce((best, cur) => cur.f < best.f ? cur : best);
            } else {
            // 모든 줄 점유 → 이미 사용 중인 줄 중 가장 낮은 프렛
            // (같은 줄에 두 음이 오면 AlphaTab은 숫자를 겹쳐 표시)
            // → 대신 가장 높은 프렛 줄을 재사용해서 숫자 간격을 최대화
            const byFret = positions.slice().sort((a, b) => a.f - b.f);
            chosen = byFret[0]!;
            }

            usedStrings.add(chosen.s);
            result[idx] = { ...sorted[idx]!, s: chosen.s, f: chosen.f, oor: undefined } as Note;
                    }
    }

    return result;
}