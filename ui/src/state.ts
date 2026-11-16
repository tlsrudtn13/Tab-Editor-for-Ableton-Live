export const state: {
  api: any;
  curTrack: any;
  dispMode: string;
  playing: boolean;
  pdfBusy: boolean;
  uiTranspose: number;
  uiCapo: number;
  uiQuantize: number | "auto";
  selectedNoteIndices: number[];
  uiScaleRoot: number;
  uiScaleKey: string;
  isLight: boolean;
  tracks: any[] | null;
  rebuildTimer: ReturnType<typeof setTimeout> | null;
  logEl: HTMLElement | null;
  listEl: HTMLElement | null;
} = {
  api: null,
  curTrack: null,
  dispMode: "both",
  playing: false,
  pdfBusy: false,
  uiTranspose: 0,
  uiCapo: 0,
  uiQuantize: 16,
  selectedNoteIndices: [],
  uiScaleRoot: 0,
  uiScaleKey: "off",
  isLight: !!(typeof window !== "undefined" && window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches),
  tracks: null,
  rebuildTimer: null,
  logEl: null,
  listEl: null,
};
