// ============================================================
// src/notation/index.ts
//
// 모든 notation 모듈을 한 곳에서 re-export.
// 외부에서는  import { toMusicXml, detectKey } from "./notation/index.ts"  한 줄로 끝.
// ============================================================

export * from "./types.js";
export * from "./music.js";
export * from "./collectNotes.js";
export * from "./toAlphaTex.js";
export * from "./toMusicXml.js";
