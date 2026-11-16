// ============================================================
// src/notation/toMusicXml.ts  —  Note[] → MusicXML 4.0  (v2)
//
// ★ 1-staff + TAB technical 단일 구조 (베타 아키텍처 유지) ★
//   뷰 전환은 main.ts 의 staff.showStandardNotation/showTablature 토글.
//
// ★ v2 신규: Slot 기반 타임라인 엔진 (레퍼런스 SHEET Extension 패턴) ★
//   1. 모든 시간을 "grid 정수 단위(units)"로 양자화 → 누적 오차 원천 차단
//   2. 노트는 실제 MIDI duration 으로 배치 (마디 경계를 넘을 수 있음)
//   3. 마디 경계/비표준 길이에서 분할 → <tie>/<tied> 로 연결  ← 붙임줄!
//   4. Auto-Legato: 다음 노트와의 갭이 16분음표 미만이면 노트를 연장해
//      흡수 → humanized MIDI 의 "1/32 쉼표 난무" 제거
//   5. Transpose(반음)/Capo 지원 — transpose 시 자동 재보이싱
// ============================================================

import type { Note, MusicXmlOptions, TimeSig, KeyInfo } from "./types.js";
import { detectQuantizeGrid, detectKey } from "./music.js";
import type { InstrumentConfig } from "./instruments.js";
import { DEFAULT_INSTRUMENT }    from "./instruments.js";
import { applyGuitarVoicing }    from "./voicing.js";

// ── 음이름 스펠링 (조표 기준 # / b 선택) ─────────────────────────────────────
const SHARP_SPELL: ReadonlyArray<readonly [string, number]> = [
    ["C",0],["C",1],["D",0],["D",1],["E",0],["F",0],
    ["F",1],["G",0],["G",1],["A",0],["A",1],["B",0],
];
const FLAT_SPELL: ReadonlyArray<readonly [string, number]> = [
    ["C",0],["D",-1],["D",0],["E",-1],["E",0],["F",0],
    ["G",-1],["G",0],["A",-1],["A",0],["B",-1],["B",0],
];

function spellPitch(midi: number, keyFifths: number) {
    const [step, alter] = (keyFifths >= 0 ? SHARP_SPELL : FLAT_SPELL)[((midi % 12) + 12) % 12]!;
    // MusicXML 표준: MIDI 60 = C4 (옥타브 표기는 표준 유지,
    // 기타 이조는 clef-octave-change -1 이 처리)
    return { step, alter, octave: Math.floor(midi / 12) - 1 };
}

// ── 음표값 테이블 & greedy 분해 ──────────────────────────────────────────────
interface NoteValue { type: string; dots: 0 | 1; units: number; }

const BASE_VALUES: ReadonlyArray<{ type: string; quarters: number }> = [
    { type: "whole",   quarters: 4 },
    { type: "half",    quarters: 2 },
    { type: "quarter", quarters: 1 },
    { type: "eighth",  quarters: 0.5 },
    { type: "16th",    quarters: 0.25 },
    { type: "32nd",    quarters: 0.125 },
];

/** 현재 grid(divisions)에서 정수 units 로 표현 가능한 음표값 목록 (긴 것부터) */
function buildNoteValueTable(divisions: number): NoteValue[] {
    const table: NoteValue[] = [];
    for (const b of BASE_VALUES) {
        for (const dots of [1, 0] as const) {            // 점음표 우선 시도
            const units = b.quarters * (dots ? 1.5 : 1) * divisions;
            if (Number.isInteger(units) && units >= 1) table.push({ type: b.type, dots, units });
        }
    }
    return table.sort((a, b) => b.units - a.units);
}

/** units 를 표준 음표값들로 greedy 분해 (예: 1.25박 → 4분음표 + 16분음표) */
function decomposeDuration(units: number, table: NoteValue[]): NoteValue[] {
    const out: NoteValue[] = [];
    let rem = units;
    for (const v of table) {
        while (rem >= v.units) { out.push(v); rem -= v.units; }
        if (rem === 0) break;
    }
    return out;
}

// ── 타임라인 엔진 ────────────────────────────────────────────────────────────
interface Elem {
    start: number;          // units (절대 위치)
    units: number;          // 길이
    kind:  "note" | "rest";
    notes: Note[];          // chord 구성 노트들 (rest 면 빈 배열)
}

interface Token {
    kind:    "note" | "rest";
    notes:   Note[];
    value:   NoteValue;
    tieStart: boolean;      // 다음 조각으로 이어짐
    tieStop:  boolean;      // 이전 조각에서 이어짐
}

/**
 * ★ 같은 onset(화음) 그룹 내 "같은 줄 충돌" 해소
 * Quantize 병합으로 서로 다른 시점의 노트가 한 박자로 합쳐질 때,
 * 보이싱이 같은 줄에 두 fret 을 배정한 채 남는 문제를 여기서 정리합니다.
 *  - 완전히 같은 피치 → 하나만 남김 (중복 제거)
 *  - 줄 충돌 + 다른 피치 → 인접한 빈 줄로 재배치 (피치 유지, fret 재계산)
 *  - 어떤 줄로도 불가능 → 드롭 (겹쳐 그리는 것보다 깔끔)
 */
function resolveStringCollisions(notes: Note[], instr: InstrumentConfig): Note[] {
    if (notes.length <= 1) return notes;
    const out: Note[] = [];
    const usedStrings = new Set<number>();
    const seenPitch   = new Set<number>();
    // 높은 피치부터 배치 (높은 음이 얇은 줄을 차지 → 낮은 음이 굵은 쪽으로
    // 밀려나며 재배치 — 고음역 충돌에서도 음 손실 없이 풀림)
    const sorted = [...notes].sort((a, b) => b.p - a.p);
    for (const n of sorted) {
        if (seenPitch.has(n.p)) continue;              // 동일 피치 중복 제거
        // ★ 음역 밖 마킹 노트(s<1)는 충돌 검사 없이 그대로 통과
        if (n.s < 1) { seenPitch.add(n.p); out.push(n); continue; }
        if (!usedStrings.has(n.s)) {
            usedStrings.add(n.s); seenPitch.add(n.p);
            out.push(n); continue;
        }
        // 충돌 → 현재 줄에서 가까운 순으로 빈 줄 탐색
        let placed = false;
        for (let off = 1; off < instr.stringCount && !placed; off++) {
            for (const cand of [n.s + off, n.s - off]) {   // 굵은 쪽 우선
                if (cand < 1 || cand > instr.stringCount) continue;
                if (usedStrings.has(cand)) continue;
                const open = instr.open[cand];
                if (typeof open !== "number") continue;
                const f = n.p - open;
                if (f < 0 || f > 24) continue;
                out.push({ ...n, s: cand, f });
                usedStrings.add(cand); seenPitch.add(n.p);
                placed = true; break;
            }
        }
        // placed=false 면 드롭
    }
    return out.sort((a, b) => a.p - b.p);
}

/**
 * Note[] → 절대 슬롯 타임라인.
 * - 모든 onset/duration 을 정수 units 로 양자화 (누적 오차 0)
 * - 같은 onset 노트는 chord 그룹화
 * - 다음 onset 과 겹치면 컷, 갭이 legatoUnits 이하면 연장(Auto-Legato)
 */
function buildTimeline(
    notes: Note[], divisions: number, legatoUnits: number,
    instr: InstrumentConfig, upm: number
): { elems: Elem[]; cursor: number } {
    // 1. onset 별 chord 그룹화 (units 정수 양자화)
    const byStart = new Map<number, { start: number; dur: number; notes: Note[] }>();
    for (const n of notes) {
        let start = Math.round(n.b * divisions);
        if (start < 0) continue;
        // ★ 마디 경계 클램프: 반올림이 노트를 다음 마디로 보내면
        //   원래 마디의 마지막 슬롯에 고정 (예: B10:4.9 가 B11:1 로 새던 문제)
        const origBar = Math.floor((n.b * divisions + 1e-6) / upm);
        if (Math.floor(start / upm) > origBar) {
            start = (origBar + 1) * upm - 1;
        }
        const dur = Math.max(1, Math.round(n.d * divisions)); // 최소 1 unit 보장
        const g = byStart.get(start);
        if (g) { g.notes.push(n); g.dur = Math.max(g.dur, dur); }
        else byStart.set(start, { start, dur, notes: [n] });
    }
    const groups = [...byStart.values()].sort((a, b) => a.start - b.start);

    // 2. 클램프 + Auto-Legato + 갭 → rest
    const elems: Elem[] = [];
    let cursor = 0;
    for (let i = 0; i < groups.length; i++) {
        const g    = groups[i]!;
        const next = i + 1 < groups.length ? groups[i + 1]!.start : Infinity;

        // 앞쪽 갭 → 쉼표
        if (g.start > cursor) {
            elems.push({ start: cursor, units: g.start - cursor, kind: "rest", notes: [] });
        }

        let dur = Math.min(g.dur, next - g.start);  // 다음 onset 침범 컷
        // ★ Auto-Legato: 남는 미세 갭(≤ legatoUnits)은 노트를 늘려 흡수
        const gap = next === Infinity ? 0 : next - (g.start + dur);
        if (gap > 0 && gap <= legatoUnits) dur += gap;

        dur = Math.max(1, dur);
        elems.push({
            start: g.start, units: dur, kind: "note",
            // ★ 같은 줄 충돌 해소 (quantize 병합으로 생긴 겹침 정리)
            notes: resolveStringCollisions(g.notes, instr),
        });
        cursor = g.start + dur;
    }
    return { elems, cursor };
}

/**
 * 타임라인 → 마디별 토큰.
 * 각 elem 을 마디 경계에서 분할하고, 분할 조각들을 tie 로 연결. ← 붙임줄 핵심!
 */
function timelineToMeasures(
    elems: Elem[], cursor: number,
    table: NoteValue[], upm: number, totalMeasures: number
): Token[][] {
    const totalUnits = totalMeasures * upm;
    const padded = cursor < totalUnits
        ? [...elems, { start: cursor, units: totalUnits - cursor, kind: "rest" as const, notes: [] }]
        : elems;

    const measures: Token[][] = Array.from({ length: totalMeasures }, () => []);

    for (const el of padded) {
        // 마디 경계 분할 → 각 조각을 표준 음표값으로 분해
        const pieces: { mi: number; value: NoteValue }[] = [];
        let pos = el.start, rem = el.units;
        while (rem > 0) {
            const mi  = Math.floor(pos / upm);
            if (mi >= totalMeasures) break;
            const seg = Math.min(rem, (mi + 1) * upm - pos);   // 마디 끝까지
            for (const v of decomposeDuration(seg, table)) pieces.push({ mi, value: v });
            pos += seg; rem -= seg;
        }
        // 조각이 2개 이상인 노트 = tie 로 연결
        pieces.forEach((p, i) => {
            measures[p.mi]!.push({
                kind:     el.kind,
                notes:    el.notes,
                value:    p.value,
                tieStart: el.kind === "note" && i < pieces.length - 1,
                tieStop:  el.kind === "note" && i > 0,
            });
        });
    }
    return measures;
}

// ── 메인 함수 ────────────────────────────────────────────────────────────────

export function toMusicXml(
    notes: Note[],
    bpm:   number,
    opts:  MusicXmlOptions & { transpose?: number } = {}
): string {
    const timeSig: TimeSig          = opts.timeSig ?? { beats: 4, type: 4 };
    const capo:    number           = opts.capo ?? 0;
    const transpose: number         = (opts as any).transpose ?? 0;
    const instr:   InstrumentConfig = opts.instrument ?? DEFAULT_INSTRUMENT;
    const nStrings = instr.stringCount;
    const isBass   = instr.name.toLowerCase().includes("bass");

    // ── 1. Transpose (반음 이동) → 피치가 바뀌므로 반드시 재보이싱 ─────────
    let src: Note[] = transpose !== 0
        ? notes.map(n => ({ ...n, p: Math.min(127, Math.max(0, n.p + transpose)) }))
        : notes;

    // ── 2. 보이싱 (transpose 가 있으면 skipVoicing 무시하고 강제 재계산) ───
    const needVoicing = transpose !== 0 || !(opts.skipVoicing ?? false);
    const voiced: Note[] = needVoicing ? applyGuitarVoicing(src, instr) : src;

    // ── 3. Grid / Key ─────────────────────────────────────────────────────
    const grid = opts.quantize ?? detectQuantizeGrid(voiced);   // 4|8|16|32 (분모)
    const divisions = Math.max(1, Math.round(grid / 4));        // units per quarter
    const key: KeyInfo = opts.key ??
        (voiced.length ? detectKey(voiced) : { fifths: 0, mode: "major" });

    // Auto-Legato 임계: 16분음표(0.25박) 이하의 미세 갭은 직전 노트를 늘려 흡수
    // 32-grid: 1/32·1/16 쉼표 제거 / 16-grid: 1/16 쉼표 제거 → 깔끔한 악보
    // (의도적인 8분음표 이상 쉼표는 그대로 유지)
    const legatoUnits = Math.round(0.25 * divisions);

    // ── 4. 타임라인 → 마디 토큰 ───────────────────────────────────────────
    const BPB = timeSig.beats;
    const upm = Math.round(BPB * (4 / timeSig.type) * divisions); // units per measure
    const { elems, cursor } = buildTimeline(voiced, divisions, legatoUnits, instr, upm);
    const totalMeasures = Math.max(1, Math.ceil(cursor / upm));
    const table = buildNoteValueTable(divisions);
    const measures = timelineToMeasures(elems, cursor, table, upm, totalMeasures);

    // ── 5. XML 헤더 ───────────────────────────────────────────────────────
    const L: string[] = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`,
        `<score-partwise version="4.0">`,
        `  <part-list>`,
        `    <score-part id="P1">`,
        `      <part-name>${isBass ? "Bass" : "Guitar"}</part-name>`,
        `      <score-instrument id="P1-I1">`,
        `        <instrument-name>${instr.name}</instrument-name>`,
        `      </score-instrument>`,
        `      <midi-instrument id="P1-I1">`,
        `        <midi-channel>1</midi-channel>`,
        `        <midi-program>${isBass ? 33 : 26}</midi-program>`,
        `      </midi-instrument>`,
        `    </score-part>`,
        `  </part-list>`,
        `  <part id="P1">`,
    ];

    for (let mi = 0; mi < totalMeasures; mi++) {
        L.push(`    <measure number="${mi + 1}">`);

        if (mi === 0) {
            L.push(`      <attributes>`);
            L.push(`        <divisions>${divisions}</divisions>`);
            L.push(`        <key>`);
            L.push(`          <fifths>${key.fifths}</fifths>`);
            L.push(`          <mode>${key.mode}</mode>`);
            L.push(`        </key>`);
            L.push(`        <time>`);
            L.push(`          <beats>${timeSig.beats}</beats>`);
            L.push(`          <beat-type>${timeSig.type}</beat-type>`);
            L.push(`        </time>`);
            // 음자리표: 기타 = G(8vb), 베이스 = F(8vb)
            L.push(`        <clef>`);
            L.push(`          <sign>${isBass ? "F" : "G"}</sign>`);
            L.push(`          <line>${isBass ? 4 : 2}</line>`);
            L.push(`          <clef-octave-change>-1</clef-octave-change>`);
            L.push(`        </clef>`);
            // TAB 줄 튜닝: line 1 = low E (우리 s=nStrings), line n = high e (우리 s=1)
            L.push(`        <staff-details>`);
            L.push(`          <staff-lines>${nStrings}</staff-lines>`);
            for (let s = 1; s <= nStrings; s++) {
                const line = (nStrings + 1) - s;
                const midi = instr.open[s] ?? 40;
                const sp   = spellPitch(midi, 1);
                L.push(`          <staff-tuning line="${line}">`);
                L.push(`            <tuning-step>${sp.step}</tuning-step>`);
                if (sp.alter !== 0) L.push(`            <tuning-alter>${sp.alter}</tuning-alter>`);
                L.push(`            <tuning-octave>${sp.octave}</tuning-octave>`);
                L.push(`          </staff-tuning>`);
            }
            if (capo > 0) L.push(`          <capo>${capo}</capo>`);
            L.push(`        </staff-details>`);
            L.push(`      </attributes>`);
            // 템포
            L.push(`      <direction placement="above">`);
            L.push(`        <direction-type>`);
            L.push(`          <metronome parentheses="no">`);
            L.push(`            <beat-unit>quarter</beat-unit>`);
            L.push(`            <per-minute>${Math.round(bpm)}</per-minute>`);
            L.push(`          </metronome>`);
            L.push(`        </direction-type>`);
            L.push(`        <sound tempo="${Math.round(bpm)}"/>`);
            L.push(`      </direction>`);
        }

        // ── 마디 토큰 출력 ────────────────────────────────────────────────
        const tokens = measures[mi]!;
        const allRest = tokens.length === 0 || tokens.every(t => t.kind === "rest");

        if (allRest) {
            // 완전히 빈 마디 = 온쉼표 1개 (마디 중앙 배치)
            L.push(`      <note>`);
            L.push(`        <rest measure="yes"/>`);
            L.push(`        <duration>${upm}</duration>`);
            L.push(`        <voice>1</voice>`);
            L.push(`      </note>`);
        } else {
            for (const t of tokens) {
                if (t.kind === "rest") {
                    L.push(`      <note>`);
                    L.push(`        <rest/>`);
                    L.push(`        <duration>${t.value.units}</duration>`);
                    L.push(`        <voice>1</voice>`);
                    L.push(`        <type>${t.value.type}</type>`);
                    if (t.value.dots) L.push(`        <dot/>`);
                    L.push(`      </note>`);
                } else {
                    // chord 구성 노트들 출력 (두 번째부터 <chord/>)
                    for (let pi = 0; pi < t.notes.length; pi++) {
                        const n  = t.notes[pi]!;
                        const sp = spellPitch(n.p, key.fifths);
                        const displayFret = Math.max(0, n.f - capo); // 카포 차감 표기
                        
                        L.push(`      <note>`);
                        if (pi > 0) L.push(`        <chord/>`);
                        L.push(`        <pitch>`);
                        L.push(`          <step>${sp.step}</step>`);
                        if (sp.alter !== 0) L.push(`          <alter>${sp.alter}</alter>`);
                        L.push(`          <octave>${sp.octave}</octave>`);
                        L.push(`        </pitch>`);
                        L.push(`        <duration>${t.value.units}</duration>`);
                        // <tie> = 소리 연결 (duration 뒤, voice 앞 순서 중요)
                        if (t.tieStop)  L.push(`        <tie type="stop"/>`);
                        if (t.tieStart) L.push(`        <tie type="start"/>`);
                        L.push(`        <voice>1</voice>`);
                        L.push(`        <type>${t.value.type}</type>`);
                        if (t.value.dots) L.push(`        <dot/>`);
                        if ((n as any).oor) {
                            L.push(`        <notehead parentheses="yes">normal</notehead>`);
                        }
                        const hasTab = n.s >= 1 && n.f >= 0;
                        const hasNotations = hasTab || t.tieStart || t.tieStop;
                        if (hasNotations) {
                            L.push(`        <notations>`);
                            if (t.tieStop)  L.push(`          <tied type="stop"/>`);
                            if (t.tieStart) L.push(`          <tied type="start"/>`);
                            if (hasTab) {
                                L.push(`          <technical>`);
                                L.push(`            <fret>${displayFret}</fret>`);
                                L.push(`            <string>${n.s}</string>`);
                                L.push(`          </technical>`);
                            }
                            L.push(`        </notations>`);
                        }
                        L.push(`      </note>`);
                    }
                }
            }
        }

        L.push(`    </measure>`);
    }

    L.push(`  </part>`);
    L.push(`</score-partwise>`);
    return L.join("\n");
}