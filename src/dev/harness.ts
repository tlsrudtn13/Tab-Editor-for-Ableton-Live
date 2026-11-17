// ============================================================
// src/dev/harness.ts — DEV BUILDS ONLY (npm run dev). Never shipped:
// extension.ts calls it behind the __TAB_DEV__ constant, which the
// production build sets to false so esbuild drops this module.
//
// Lets an agent test the extension inside Live without clicking:
//   1. Trigger files: <storage>/dev/trigger-<id>.json  {"action": ..., ...}
//      -> result in   <storage>/dev/result-<id>.json
//   2. Local HTTP server (127.0.0.1 and ::1, port 5179):
//      GET  /file/<name>  serves editor HTML from the temp dir, so the modal
//                         loads from http://localhost (allowed by the SDK)
//      POST /report       editor state from ui/src/devReporter.ts
//      GET  /ui-cmd       queued JS for the editor to run
//      POST /ui-result    result of that JS
// scripts/dev-cmd.mjs writes the triggers and waits for the results.
// ============================================================
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { MidiClip, MidiTrack, type initialize } from "@ableton-extensions/sdk";
import { notesFromClip } from "../notation/collectNotes.js";
import { buildPayload } from "../notation/payload.js";
import { FIXTURES } from "./fixtures.js";

type Ctx = ReturnType<typeof initialize>;
type Cmd = { action: string; clip?: string; js?: string; full?: boolean };

export const DEV_PORT = 5179;
const TEST_TRACK = "TAB-TEST";
/** Second track with one arrangement clip, to tell "this track" from "all tracks". */
const TEST_TRACK_2 = "TAB-TEST-BASS";
const isTestTrack = (t: any) => t?.name === TEST_TRACK || t?.name === TEST_TRACK_2;

let devDir = "";
let tempDir = "";
let uiSeq = 0;
const uiQueue: Array<{ id: string; js: string }> = [];

/** URL the modal should load instead of file:// (null when the harness is off). */
export function devEditorUrl(htmlPath: string): string | null {
    if (!devDir) return null;
    tempDir = path.dirname(htmlPath);
    return `http://localhost:${DEV_PORT}/file/${encodeURIComponent(path.basename(htmlPath))}`;
}

function writeJson(name: string, data: unknown) {
    fs.writeFileSync(path.join(devDir, name), JSON.stringify(data, null, 2), "utf-8");
}

function tempo(ctx: Ctx): number {
    const t = (ctx.application.song as any).tempo;
    return typeof t === "number" ? t : 120;
}

// ── Live data helpers ──────────────────────────────────────────────────────
type Found = { clip: any; track: any; where: string; offset: number };

function findClip(ctx: Ctx, name: string): Found | null {
    for (const track of ctx.application.song.tracks as any[]) {
        for (let i = 0; i < (track.clipSlots ?? []).length; i++) {
            const c = track.clipSlots[i]?.clip;
            if (c instanceof MidiClip && c.name === name) return { clip: c, track, where: `session slot ${i + 1}`, offset: 0 };
        }
        for (const c of track.arrangementClips ?? []) {
            if (c instanceof MidiClip && c.name === name) return { clip: c, track, where: `arrangement @${c.startTime}`, offset: c.startTime };
        }
    }
    return null;
}

function summarize(ctx: Ctx) {
    const song: any = ctx.application.song;
    return {
        tempo: tempo(ctx),
        scale: { root: song.rootNote, name: song.scaleName, intervals: song.scaleIntervals },
        grid: { quantization: song.gridQuantization, triplet: song.gridIsTriplet },
        cuePoints: (song.cuePoints ?? []).map((c: any) => ({ name: c.name, time: c.time })),
        scenes: (song.scenes ?? []).length,
        tracks: (song.tracks as any[]).map(t => ({
            name: t.name,
            type: t instanceof MidiTrack ? "midi" : "other",
            session: (t.clipSlots ?? []).map((s: any, i: number) => s?.clip
                ? { slot: i + 1, name: s.clip.name, notes: s.clip instanceof MidiClip ? s.clip.notes.length : null }
                : null).filter(Boolean),
            arrangement: (t.arrangementClips ?? []).map((c: any) => ({
                name: c.name, start: c.startTime, end: c.endTime,
                notes: c instanceof MidiClip ? c.notes.length : null,
            })),
        })),
    };
}

async function createFixtures(ctx: Ctx) {
    const song: any = ctx.application.song;
    for (const t of [...song.tracks]) if (isTestTrack(t)) await song.deleteTrack(t);

    const track: any = await song.createMidiTrack();
    track.name = TEST_TRACK;
    while (song.scenes.length < FIXTURES.length) await song.createScene(song.scenes.length);

    const created: string[] = [];
    for (let i = 0; i < FIXTURES.length; i++) {
        const fx = FIXTURES[i]!;
        const clip: any = await track.clipSlots[i].createMidiClip(fx.length);
        clip.name = fx.name;
        clip.notes = fx.notes;
        created.push(`slot ${i + 1}: ${fx.name} (${clip.notes.length} notes)`);
    }
    // Two arrangement clips (riff at bar 1, dotted melody at bar 5) for the
    // Track / Selection entry points.
    for (const [fx, start] of [[FIXTURES[0]!, 0], [FIXTURES[2]!, 16]] as const) {
        const clip: any = await track.createMidiClip(start, fx.length);
        clip.name = fx.name + " (arr)";
        clip.notes = fx.notes;
        created.push(`arrangement @${start}: ${clip.name}`);
    }
    const bassFx = FIXTURES.find(f => f.name === "TT bass real pitch")!;
    const bass: any = await song.createMidiTrack();
    bass.name = TEST_TRACK_2;
    const bClip: any = await bass.createMidiClip(0, bassFx.length);
    bClip.name = bassFx.name + " (arr)";
    bClip.notes = bassFx.notes;
    created.push(`${TEST_TRACK_2} arrangement @0: ${bClip.name}`);
    return { track: TEST_TRACK, created };
}

async function cleanup(ctx: Ctx) {
    const song: any = ctx.application.song;
    let removed = 0;
    for (const t of [...song.tracks]) if (isTestTrack(t)) { await song.deleteTrack(t); removed++; }
    return { removed };
}

function payloadFor(ctx: Ctx, name: string, full: boolean) {
    const f = findClip(ctx, name);
    if (!f) throw new Error(`clip not found: ${name}`);
    const raw = f.clip.notes;
    const notes = notesFromClip(f.clip, 0, "ses", name);
    const p = buildPayload("dev", name, notes, tempo(ctx));
    return {
        clip: name, where: f.where, track: f.track.name,
        clipInfo: {
            looping: f.clip.looping, loopStart: f.clip.loopStart, loopEnd: f.clip.loopEnd,
            startMarker: f.clip.startMarker, endMarker: f.clip.endMarker,
        },
        rawNotes: raw,
        tabNotes: p?.notes.map(n => ({ b: n.b, d: n.d, p: n.p, s: n.s, f: n.f, oor: n.oor })),
        musicXml: full ? p?.musicXml : undefined,
        musicXmlLength: p?.musicXml?.length,
    };
}

async function handle(ctx: Ctx, id: string, cmd: Cmd): Promise<unknown> {
    switch (cmd.action) {
        case "ping":     return { ok: true, tempo: tempo(ctx), tracks: ctx.application.song.tracks.length };
        case "list":     return summarize(ctx);
        case "fixtures": return createFixtures(ctx);
        case "cleanup":  return cleanup(ctx);
        case "payload":  return payloadFor(ctx, cmd.clip ?? "", !!cmd.full);
        case "open": {
            const f = findClip(ctx, cmd.clip ?? "");
            if (!f) throw new Error(`clip not found: ${cmd.clip}`);
            // Same path as the context menu: our own registered command.
            ctx.commands.executeCommand("tabeditor.openClip", f.clip.handle);
            return { opened: cmd.clip, where: f.where };
        }
        case "openTrack": {
            // Same as right-clicking the track: the track's handle is the argument.
            const name = cmd.clip ?? "";
            const t = ctx.application.song.tracks.find((tr: any) => tr?.name === name) as any;
            if (!t) throw new Error(`track not found: ${name}`);
            ctx.commands.executeCommand("tabeditor.open", t.handle);
            return { opened: name };
        }
        case "openAll":
            ctx.commands.executeCommand("tabeditor.openAll");
            return { opened: "all tracks" };
        case "ui": {
            const uiId = `${id}`;
            uiQueue.push({ id: uiId, js: cmd.js ?? "return null" });
            return { queued: uiId, note: `editor result -> ui-result-${uiId}.json` };
        }
        case "close": {
            uiQueue.push({ id, js: `window.chrome?.webview?.postMessage({ method: "close_and_send", params: ["dev-close"] }); return "closing";` });
            return { queued: "close" };
        }
        default: throw new Error(`unknown action: ${cmd.action}`);
    }
}

// ── HTTP server ────────────────────────────────────────────────────────────
function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise(resolve => {
        let s = "";
        req.on("data", c => { s += c; });
        req.on("end", () => resolve(s));
    });
}

const onRequest: http.RequestListener = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    const url = (req.url ?? "/").split("?")[0]!;
    try {
        if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
        if (req.method === "GET" && url.startsWith("/file/")) {
            const file = path.join(tempDir, path.basename(decodeURIComponent(url.slice(6))));
            if (!tempDir || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            fs.createReadStream(file).pipe(res);
            return;
        }
        if (req.method === "GET" && url === "/ui-cmd") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(uiQueue.splice(0)));
            return;
        }
        if (req.method === "POST" && (url === "/report" || url === "/ui-result")) {
            const body = JSON.parse(await readBody(req));
            if (url === "/report") {
                writeJson("ui-report-latest.json", body);
                const svg = typeof body.svgMarkup === "string" ? body.svgMarkup : "";
                if (svg) fs.writeFileSync(path.join(devDir, "ui-score-latest.html"),
                    `<!doctype html><meta charset="utf-8"><body style="background:#1e1e1e">${svg}</body>`, "utf-8");
            } else {
                writeJson(`ui-result-${String(body.id).replace(/[^\w-]/g, "_")}.json`, body);
            }
            res.writeHead(204); res.end();
            return;
        }
        res.writeHead(404); res.end();
    } catch (e) {
        res.writeHead(500); res.end(String(e));
    }
};

export function startDevHarness(ctx: Ctx): void {
    const storage = ctx.environment.storageDirectory;
    if (!storage) { console.warn("[TAB-DEV] no storage directory; harness off"); return; }
    devDir = path.join(storage, "dev");
    fs.mkdirSync(devDir, { recursive: true });

    for (const host of ["127.0.0.1", "::1"]) {
        const srv = http.createServer(onRequest);
        srv.on("error", e => console.warn(`[TAB-DEV] server ${host} failed:`, String(e)));
        srv.listen(DEV_PORT, host);
    }

    let busy = false;
    setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
            for (const f of fs.readdirSync(devDir)) {
                const m = /^trigger-([\w-]+)\.json$/.exec(f);
                if (!m) continue;
                const id = m[1]!;
                const file = path.join(devDir, f);
                let cmd: Cmd;
                try { cmd = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { continue; }
                fs.unlinkSync(file);
                const started = Date.now();
                try {
                    const result = await handle(ctx, id, cmd);
                    writeJson(`result-${id}.json`, { ok: true, action: cmd.action, ms: Date.now() - started, result });
                } catch (e) {
                    writeJson(`result-${id}.json`, { ok: false, action: cmd.action, error: String((e as Error)?.stack ?? e) });
                }
            }
        } finally { busy = false; }
    }, 300);

    writeJson("ready.json", { time: new Date().toISOString(), devDir, port: DEV_PORT, pid: process.pid });
    console.log(`[TAB-DEV] harness ready: ${devDir} (port ${DEV_PORT})`);
}
