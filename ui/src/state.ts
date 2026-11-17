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
  digitBuffer: string;
  digitTimer: ReturnType<typeof setTimeout> | null;
  /** Insert cursor on a rest: where a new note goes (beats from the score start, string). */
  restCursor: { b: number; d: number; s: number } | null;
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
  digitBuffer: "",
  digitTimer: null,
  restCursor: null,
};
