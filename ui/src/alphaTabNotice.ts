// ============================================================
// ui/src/alphaTabNotice.ts — no "rendered by alphaTab" line under the score.
// alphaTab 1.8 always draws it (ScoreLayout._layoutAndRenderAnnotation) and has no
// setting for it. Its licence (MPL-2.0) asks for no notice in the output; the credit
// stays in the README and the About text. Every layout alphaTab creates gets an own
// method that skips the line; alphaTab's files are not changed.
// If a later alphaTab renames the method, the line simply shows again (alphaTabNotice.test.ts
// fails first, so the rename is noticed).
// ============================================================
import * as alphaTab from "@coderline/alphatab";

export const NOTICE_METHOD = "_layoutAndRenderAnnotation";
let done = false;

/** Wraps every layout factory so new layouts skip the notice (y is returned unchanged). Idempotent. */
export function hideAlphaTabNotice(env: any = (alphaTab as any).Environment): boolean {
  if (done) return true;
  const engines: Map<any, any> | undefined = env && env.layoutEngines;
  if (!engines || typeof engines.forEach !== "function") return false;
  engines.forEach((factory: any) => {
    if (!factory || typeof factory.createLayout !== "function" || factory.__noNotice) return;
    const create = factory.createLayout;
    factory.createLayout = function(renderer: any) {
      const layout = create.call(this, renderer);
      if (layout && typeof layout[NOTICE_METHOD] === "function") layout[NOTICE_METHOD] = (y: number) => y;
      return layout;
    };
    factory.__noNotice = true;
  });
  done = true;
  return true;
}
