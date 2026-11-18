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
import { notesFromClip, clipRegion } from "../notation/collectNotes.js";
import { buildPayload } from "../notation/payload.js";
import { FIXTURES, DRUM_FIXTURES } from "./fixtures.js";
import { drumRackInfo } from "../drumDetect.js";
import { buildDrumPayload } from "../notation/drumPayload.js";

type Ctx = ReturnType<typeof initialize>;
type Cmd = { action: string; clip?: string; js?: string; full?: boolean };

export const DEV_PORT = 5179;
const TEST_TRACK = "TAB-TEST";
/** Second track with one arrangement clip, to tell "this track" from "all tracks". */
const TEST_TRACK_2 = "TAB-TEST-BASS";
const TEST_TRACK_BIG = "TAB-TEST-BIG";
/** Drum Rack track (docs/DRUMS.md), and a plain MIDI track named "Drums" for the name heuristic. */
const TEST_TRACK_DRUMS = "TAB-TEST-DRUMS";
const TEST_TRACK_DRUMS_NORACK = "TAB-TEST Drums";
const isTestTrack = (t: any) => [TEST_TRACK, TEST_TRACK_2, TEST_TRACK_BIG, TEST_TRACK_DRUMS, TEST_TRACK_DRUMS_NORACK].includes(t?.name);

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
    for (const t of [...song.tracks]) if (t?.name === TEST_TRACK || t?.name === TEST_TRACK_2) await song.deleteTrack(t);

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

/** Large arrangement clip for performance checks: 16th-note line plus a chord every 2 beats. */
async function createBigFixture(ctx: Ctx, count: number) {
    const song: any = ctx.application.song;
    for (const t of [...song.tracks]) if (t?.name === TEST_TRACK_BIG) await song.deleteTrack(t);
    const n = Math.max(16, Math.min(20000, Math.floor(count) || 2000));
    const notes: { pitch: number; startTime: number; duration: number; velocity: number }[] = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const scale = [40, 42, 43, 45, 47, 48, 50, 52, 54, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72];
    let k = 8;
    for (let i = 0; i < n; i++) {
        k = Math.max(0, Math.min(scale.length - 1, k + Math.round((rnd() - 0.5) * 4)));
        notes.push({ pitch: scale[k]!, startTime: i * 0.25, duration: 0.25, velocity: 90 + Math.floor(rnd() * 30) });
        if (i % 8 === 0) for (const p of [40, 47, 52]) notes.push({ pitch: p, startTime: i * 0.25, duration: 2, velocity: 80 });
    }
    const length = Math.ceil(n / 16) * 4;
    const track: any = await song.createMidiTrack();
    track.name = TEST_TRACK_BIG;
    const clip: any = await track.createMidiClip(0, length);
    clip.name = `TT big ${notes.length}`;
    clip.notes = notes;
    return { track: TEST_TRACK_BIG, clip: clip.name, notes: clip.notes.length, bars: length / 4 };
}

/** Drum fixtures: a track with a Drum Rack nested in an Instrument Rack (recursive search), pads 36/38/42/44/46/49/50/48/45/43, and the GM fixture clips. */
async function createDrumFixture(ctx: Ctx) {
    const song: any = ctx.application.song;
    for (const t of [...song.tracks]) if (t?.name === TEST_TRACK_DRUMS || t?.name === TEST_TRACK_DRUMS_NORACK) await song.deleteTrack(t);
    const steps: string[] = [];
    const track: any = await song.createMidiTrack();
    track.name = TEST_TRACK_DRUMS;
    const step = async <T>(label: string, f: () => Promise<T>): Promise<T> => {
        try { return await f(); } catch (e) { throw new Error(`${label}: ${e} | steps: ${steps.join("; ")}`); }
    };
    // nested on purpose (recursive detection); the default Instrument Rack preset may
    // already hold an instrument, so the Drum Rack goes into a fresh, empty chain
    // the owner's default MIDI track template already holds an instrument: start from an empty chain
    const clearDevices = async (t: any) => { for (const d of [...t.devices]) { try { await t.deleteDevice(d); } catch (_) {} } };
    await clearDevices(track);
    let rack: any;
    try {
        const outer: any = await step("insert Instrument Rack", () => track.insertDevice("Instrument Rack", 0));
        steps.push(`outer: ${outer?.constructor?.name} chains=${outer?.chains?.length}`);
        const chain: any = await step("insert chain", () => outer.insertChain(outer.chains?.length ?? 0));
        steps.push(`chain devices=${chain?.devices?.length}`);
        rack = await step("insert Drum Rack in chain", () => chain.insertDevice("Drum Rack", 0));
    } catch (e) {
        steps.push(`nested failed (${e}); Drum Rack on the track instead`);
        await clearDevices(track);
        rack = await step("insert Drum Rack on track", () => track.insertDevice("Drum Rack", track.devices.length));
    }
    steps.push(`rack: ${rack?.constructor?.name}`);
    const pads = [36, 38, 42, 44, 46, 49, 50, 48, 45, 43];
    for (let i = 0; i < pads.length; i++) {
        const dc: any = await rack.insertChain(i);
        dc.receivingNote = pads[i];
        if (i < 2) { try { const d: any = await dc.insertDevice("Simpler", 0); steps.push(`pad ${pads[i]}: ${d?.constructor?.name} sample=${d?.sample?.filePath ?? "none"}`); } catch (e) { steps.push(`simpler failed: ${e}`); } }
    }
    const created: string[] = [];
    for (let i = 0; i < DRUM_FIXTURES.length; i++) {
        const fx = DRUM_FIXTURES[i]!;
        const clip: any = await track.clipSlots[i].createMidiClip(fx.length);
        clip.name = fx.name; clip.notes = fx.notes;
        created.push(`slot ${i + 1}: ${fx.name} (${clip.notes.length} notes)`);
    }
    const arr: any = await track.createMidiClip(0, DRUM_FIXTURES[0]!.length);
    arr.name = DRUM_FIXTURES[0]!.name + " (arr)"; arr.notes = DRUM_FIXTURES[0]!.notes;
    created.push(`arrangement @0: ${arr.name}`);
    const plain: any = await song.createMidiTrack();
    plain.name = TEST_TRACK_DRUMS_NORACK;
    await clearDevices(plain);                 // name heuristic only: no rack at all
    const pc: any = await plain.createMidiClip(0, DRUM_FIXTURES[1]!.length);
    pc.name = DRUM_FIXTURES[1]!.name + " (no rack)"; pc.notes = DRUM_FIXTURES[1]!.notes;
    created.push(`${TEST_TRACK_DRUMS_NORACK} arrangement @0: ${pc.name}`);
    return { track: TEST_TRACK_DRUMS, steps, detected: drumRackInfo(track), plainDetected: drumRackInfo(plain), created };
}

async function cleanup(ctx: Ctx) {
    const song: any = ctx.application.song;
    let removed = 0;
    for (const t of [...song.tracks]) if (isTestTrack(t)) { await song.deleteTrack(t); removed++; }
    return { removed };
}

function liveFor(ctx: Ctx): any {
    const song: any = ctx.application.song;
    const live: any = {};
    try {
        live.scale = { root: song.rootNote, name: song.scaleName, intervals: song.scaleIntervals, enabled: song.scaleMode };
    } catch (e) {}
    try {
        live.cues = (Array.isArray(song.cuePoints) ? song.cuePoints : []).map((c: any) => ({ beat: c.time, name: c.name }));
    } catch (e) {}
    try {
        live.grid = { quantization: song.gridQuantization, triplet: song.gridIsTriplet };
    } catch (e) {}
    return live;
}

function payloadFor(ctx: Ctx, name: string, full: boolean) {
    const f = findClip(ctx, name);
    if (!f) throw new Error(`clip not found: ${name}`);
    const raw = f.clip.notes;
    const notes = notesFromClip(f.clip, 0, "ses", name);
    const regioned = clipRegion(notes, {
        looping: f.clip.looping,
        loopStart: f.clip.loopStart,
        loopEnd: f.clip.loopEnd,
        startMarker: f.clip.startMarker,
        endMarker: f.clip.endMarker,
    });
    const live = liveFor(ctx);
    const rack = drumRackInfo(f.track);
    if (rack) {
        const d = buildDrumPayload("dev", name, regioned, tempo(ctx), live, { hints: rack.hints });
        return { clip: name, where: f.where, track: f.track.name, drumRack: rack, pieces: d?.drum.pieces, tex: full ? d?.drum.tex : undefined, texLength: d?.drum.tex.length };
    }
    const p = buildPayload("dev", name, regioned, tempo(ctx), live);
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
        live,
    };
}

async function handle(ctx: Ctx, id: string, cmd: Cmd): Promise<unknown> {
    switch (cmd.action) {
        case "ping":     return { ok: true, tempo: tempo(ctx), tracks: ctx.application.song.tracks.length };
        case "list":     return summarize(ctx);
        case "fixtures": return createFixtures(ctx);
        case "cleanup":  return cleanup(ctx);
        case "bigFixture": return createBigFixture(ctx, Number(cmd.clip ?? 2000));
        case "drumFixture": return createDrumFixture(ctx);
        case "drumInfo": {
            // Drum detection for every track (Drum Rack search, pads, pad labels)
            return (ctx.application.song.tracks as any[]).map(t => ({ name: t.name, devices: (t.devices ?? []).map((d: any) => `${d.constructor?.name}:${d.name}`), drum: drumRackInfo(t) }));
        }
        case "payload":  return payloadFor(ctx, cmd.clip ?? "", !!cmd.full);
        case "rawNotes": {   // the clip's notes exactly as Live holds them (write-back checks)
            const f = findClip(ctx, cmd.clip ?? "");
            if (!f) throw new Error(`clip not found: ${cmd.clip}`);
            return { clip: cmd.clip, where: f.where, notes: (f.clip.notes as any[]).map(n => ({ p: n.pitch, t: n.startTime, d: n.duration, v: n.velocity })) };
        }
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
        case "openScene": {
            // Same as right-clicking scene N (1-based): the scene's handle is the argument.
            const sc = (ctx.application.song as any).scenes[Number(cmd.clip ?? 1) - 1];
            if (!sc) throw new Error(`scene not found: ${cmd.clip}`);
            ctx.commands.executeCommand("tabeditor.openScene", sc.handle);
            return { opened: `scene ${cmd.clip}` };
        }
        case "openClips": {
            // Same as selecting every clip slot of scene row N (1-based) and right-clicking the selection.
            const i = Number(cmd.clip ?? 1) - 1;
            const slots = (ctx.application.song.tracks as any[]).map(t => t?.clipSlots?.[i]).filter(Boolean);
            ctx.commands.executeCommand("tabeditor.openClips", { selected_clip_slots: slots.map((s: any) => s.handle) });
            return { opened: `${slots.length} slots of row ${cmd.clip}` };
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
