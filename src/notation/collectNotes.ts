// ============================================================
// src/notation/collectNotes.ts
//
// 에이블톤 클립/슬롯에서 Note[] 를 수집하는 함수.
// MidiClip 타입 체크는 외부에서 주입받아 SDK 의존을 최소화.
// ============================================================

import type { Note } from "./types.js";
import { pitchToFs, safeNum, safeStr } from "./music.js";

/** 양자화 단위 (1/96 박자 그리드 = 에이블톤 기본 해상도) */
function q(v: number): number {
    const n = Math.round(v * 96) / 96;
    return (isFinite(n) && !isNaN(n)) ? n : 0;
}

/**
 * 단일 클립에서 Note[] 를 추출.
 *
 * @param clip              에이블톤 MidiClip 객체 (any — SDK 임포트 없이 동작)
 * @param arrangementOffset 어레인지먼트 내 클립 시작 박자 (세션 슬롯이면 0)
 * @param src               "arr" | "ses"
 * @param clipName          클립 이름
 */
export function notesFromClip(
    clip: unknown,
    arrangementOffset: number,
    src: "arr" | "ses",
    clipName: string
): Note[] {
    const raw: unknown[] = Array.isArray((clip as any)?.notes) ? (clip as any).notes : [];
    const out: Note[] = [];

    for (const n of raw) {
        if (!n) continue;
        const localStart = safeNum((n as any).startTime ?? (n as any).time, 0);
        const dur        = Math.max(safeNum((n as any).duration ?? (n as any).length, 0.25), 0.0625);
        const pitch      = Math.min(127, Math.max(0, Math.round(safeNum((n as any).pitch, 60))));
        const vel        = Math.min(127, Math.max(1,  Math.round(safeNum((n as any).velocity, 100))));
        const { f, s }   = pitchToFs(pitch);

        out.push({
            b:    q(arrangementOffset + localStart),
            d:    q(dur),
            p:    pitch,
            v:    vel,
            f,
            s,
            src,
            clip: clipName,
        });
    }

    return out;
}

/**
 * 하나의 트랙에서 어레인지먼트 노트(arr)와 세션 노트(ses)를 분리 수집.
 *
 * @param track         에이블톤 MidiTrack 객체 (any)
 * @param isMidiClip    `(clip) => boolean` — SDK 없이 타입 체크 가능하게 주입
 */
export function collectNotes(
    track: unknown,
    isMidiClip: (clip: unknown) => boolean = () => true
): { arr: Note[]; ses: Note[] } {
    const arr: Note[] = [];
    const ses: Note[] = [];

    // ── 어레인지먼트 클립 ─────────────────────────────────
    const arrClips: unknown[] = Array.isArray((track as any)?.arrangementClips)
        ? (track as any).arrangementClips
        : [];

    for (let ci = 0; ci < arrClips.length; ci++) {
        const clip = arrClips[ci];
        if (!clip) continue;
        if (!isMidiClip(clip) && !Array.isArray((clip as any)?.notes)) continue;

        const offset   = safeNum(
            (clip as any).startTime ?? (clip as any).clipStartTime ?? (clip as any).position ?? (clip as any).time,
            0
        );
        const clipName = safeStr((clip as any).name, `Clip${ci + 1}`);
        const notes    = notesFromClip(clip, offset, "arr", clipName);

        arr.push(...notes);
    }

    // ── 세션 슬롯 ─────────────────────────────────────────
    const slots: unknown[] = Array.isArray((track as any)?.clipSlots)
        ? (track as any).clipSlots
        : [];

    for (let si = 0; si < slots.length; si++) {
        const clip = (slots[si] as any)?.clip;
        if (!clip) continue;
        if (!isMidiClip(clip) && !Array.isArray((clip as any)?.notes)) continue;

        const clipName = safeStr((clip as any).name, `Slot${si + 1}`);
        const notes    = notesFromClip(clip, 0, "ses", clipName);

        ses.push(...notes);
    }

    return { arr, ses };
}
