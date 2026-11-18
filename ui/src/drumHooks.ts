// Drum mode hooks for modules that must not import ui/src/drums.ts (it pulls in alphaTab via score.ts,
// which unit tests of overlay.ts / dragSelect.ts cannot load). drums.ts fills these in bindDrums().
export const drumHooks: {
  /** draws the drum cursor; true when the track is a drum track (overlay.ts then skips the TAB cursor) */
  drawCursor: () => boolean;
  /** drum track shown, and alphaTab note `an` shows editor note `tn` */
  noteMatches: ((an: any, tn: any) => boolean) | null;
} = { drawCursor: () => false, noteMatches: null };
