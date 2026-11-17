/** true only in dev builds (`vite build --mode dev`); see vite.config.ts. */
declare const __TAB_DEV__: boolean;

interface Window {
  tracks?: any;
  tabMessage?: string;
  chrome?: any;
  applyClipEdits?: () => void;
  __tabState?: any;
  __editKeys?: any;
  toggleTheme?: () => void;
  fretClick?: (s: number, f: number) => void;
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
