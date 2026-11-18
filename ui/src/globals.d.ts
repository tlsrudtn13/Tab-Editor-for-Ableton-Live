/** true only in dev builds (`vite build --mode dev`); see vite.config.ts. */
declare const __TAB_DEV__: boolean;
/** package.json version, set at build time (vite.config.ts). */
declare const __APP_VERSION__: string;

interface Window {
  tracks?: any;
  tabMessage?: string;
  chrome?: any;
  applyClipEdits?: () => void;
  __tabState?: any;
  __editKeys?: any;
  refingerNotes?: () => void;
  toggleTheme?: () => void;
  fretClick?: (s: number, f: number, ev?: MouseEvent) => void;
  toggleTech?: (t: string) => void;
  setInstrument?: (key: string) => void;
  adjustDuration?: (mode: string) => void;
  moveString?: (dir: number) => void;
  togglePanel?: (id: string, btnId: string) => void;
  toggleSidebar?: () => void;
  setMode?: (mode: string) => void;
  inspectorRowClick?: (str: number, fret: number, idx: number, pitch: number) => void;
  exportPDF?: () => void;
  exportAlphaTex?: () => void;
  togglePlay?: () => void;
  stopPlay?: () => void;
  loadTrack?: (id: string | number) => void;
}

declare module "@coderline/alphatab";
declare module "@alphatab-font/Bravura.otf?inline" {
  const url: string;
  export default url;
}
