export const state: {
  api: any;
  curTrack: any;
  dispMode: string;
  playing: boolean;
  pdfBusy: boolean;
  uiTranspose: number;
  uiCapo: number;
  uiTimeSig: { beats: number; type: number } | null;
  uiQuantize: number | "auto";
  selectedNoteIndices: number[];
  uiScaleRoot: number;
  uiScaleKey: string;
  isLight: boolean;
  tracks: any[] | null;
  rebuildTimer: ReturnType<typeof setTimeout> | null;
  logEl: HTMLElement | null;
  listEl: HTMLElement | null;
  deletedOids: number[];
  editHistory: any[];
  redoHistory: any[];
  digitBuffer: string;
  digitTimer: ReturnType<typeof setTimeout> | null;
  /** Edit cursor on the TAB: beat slot and string. */
  cursor: { b: number; s: number } | null;
  /** Beat slots of the shown track's first staff, first voice. */
  slots: { b: number; d: number; bar: number; isRest: boolean }[];
  /** Range-selection anchor slot beat. */
  selectionAnchor: number | null;
  /** Any note/fingering change in this editor session (drives v2 snapshot save). */
  sessionChanged: boolean;
  /** Default duration (beats) for next inserted note on an empty slot. */
  defaultInsertDur: number;
  /** Copied notes (relative to earliest b). */
  clipboard: { notes: any[] } | null;
} = {
  api: null,
  curTrack: null,
  dispMode: "both",
  playing: false,
  pdfBusy: false,
  uiTranspose: 0,
  uiCapo: 0,
  uiTimeSig: null,
  uiQuantize: "auto",   // follow the grid detected from the notes (straight or triplet)
  selectedNoteIndices: [],
  uiScaleRoot: 0,
  uiScaleKey: "off",
  isLight: !!(typeof window !== "undefined" && window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches),
  tracks: null,
  rebuildTimer: null,
  logEl: null,
  listEl: null,
  deletedOids: [],
  editHistory: [],
  redoHistory: [],
  digitBuffer: "",
  digitTimer: null,
  cursor: null,
  slots: [],
  selectionAnchor: null,
  sessionChanged: false,
  defaultInsertDur: 0.25,
  clipboard: null,
};
