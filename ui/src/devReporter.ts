// ============================================================
// ui/src/devReporter.ts — DEV BUILDS ONLY (vite build --mode dev).
// Reports the editor's state to the extension's dev harness
// (src/dev/harness.ts) and runs JS the harness queues, so an agent can
// test the real editor inside Live without clicking.
// ============================================================
import { state } from "./state";

const BASE = location.protocol === "http:" ? location.origin : "http://127.0.0.1:5179";
const MAX_SVG = 3_000_000;

const errors: string[] = [];

function snapshot(reason: string) {
    const host = document.getElementById("alphaTab");
    const svgs = host ? Array.from(host.querySelectorAll("svg")) : [];
    const texts = svgs.flatMap(s => Array.from(s.querySelectorAll("text")).map(t => t.textContent ?? ""));
    let svgMarkup = svgs.map(s => s.outerHTML).join("\n");
    if (svgMarkup.length > MAX_SVG) svgMarkup = svgMarkup.slice(0, MAX_SVG);
    const t = state.curTrack as any;
    return {
        reason,
        time: new Date().toISOString(),
        url: location.href,
        viewport: { w: innerWidth, h: innerHeight },
        status: document.getElementById("status")?.textContent ?? "",
        log: document.getElementById("log")?.textContent ?? "",
        errors: errors.slice(),
        state: {
            track: t ? { id: t.id, name: t.name, noteCount: t.noteCount } : null,
            dispMode: state.dispMode, transpose: state.uiTranspose, capo: state.uiCapo,
            quantize: state.uiQuantize, selected: state.selectedNoteIndices,
        },
        tracks: Array.from(document.querySelectorAll(".ti")).map(e => e.textContent?.trim()),
        inspectorRows: document.querySelectorAll("#note-tbody tr").length,
        svgCount: svgs.length,
        svgTextCount: texts.length,
        svgTexts: texts.slice(0, 600),
        svgMarkup,
    };
}

async function post(p: string, body: unknown) {
    try {
        await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch { /* harness not running */ }
}

function safe(v: unknown) {
    try { return JSON.parse(JSON.stringify(v ?? null)); } catch { return String(v); }
}

export function startDevReporter(): void {
    if (!__TAB_DEV__) return;
    window.addEventListener("error", e => errors.push(`error: ${e.message} @${e.filename}:${e.lineno}`));
    window.addEventListener("unhandledrejection", e => errors.push(`rejection: ${String((e as PromiseRejectionEvent).reason)}`));
    const origError = console.error.bind(console);
    console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); origError(...a); };

    // Push a report whenever something visible changes.
    let lastKey = "";
    setInterval(() => {
        const s = snapshot("change");
        const key = `${s.log.length}|${s.svgCount}|${s.svgTextCount}|${s.errors.length}|${s.status}`;
        if (key !== lastKey) { lastKey = key; void post("/report", s); }
    }, 1000);

    // Run JS queued by the harness ("ui" action), then report its result.
    setInterval(async () => {
        let cmds: Array<{ id: string; js: string }> = [];
        try { cmds = await (await fetch(BASE + "/ui-cmd?page=" + encodeURIComponent(decodeURIComponent(location.pathname.split("/").pop() || "")))).json(); } catch { return; }
        for (const c of cmds) {
            let result: unknown = null, error: string | null = null;
            try {
                // eslint-disable-next-line @typescript-eslint/no-implied-eval
                result = await new Function(`return (async () => { ${c.js} })()`)();
            } catch (e) { error = String((e as Error)?.stack ?? e); }
            await new Promise(r => setTimeout(r, 300)); // let re-render start
            const snap = snapshot(`ui:${c.id}`);
            delete (snap as any).svgMarkup;
            await post("/ui-result", { id: c.id, result: safe(result), error, snapshot: snap });
        }
    }, 500);
}
