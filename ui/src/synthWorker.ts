// ui/src/synthWorker.ts — give alphaTab's synthesizer a worker it can start.
//
// alphaTab starts the alphaSynth worker from "./alphaTab.worker.mjs" next to
// the page. Our page is one inlined file in Live's modal, so that file does not
// exist and the player never became ready (no sound, Play did nothing).
// Fix: inline alphaTab's UMD build as text and start a classic worker from a
// Blob URL; the UMD build initializes itself as the worker when loaded there.
// Must run before the first AlphaTabApi is created.
import * as alphaTab from "@coderline/alphatab";
import umdSource from "../../node_modules/@coderline/alphatab/dist/alphaTab.min.js?raw";

let workerUrl: string | null = null;

export function installInlineWorker(): void {
  try {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([umdSource], { type: "application/javascript" }));
    const url = workerUrl;
    (alphaTab.Environment as any).initializeMain(
      (_settings: any, name?: string) => new Worker(url, { name }),
      () => { throw new Error("AudioWorklet output is not used (ScriptProcessor output)"); },
    );
  } catch (e) {
    console.warn("[TAB] inline synth worker setup failed:", e);
  }
}
