#!/usr/bin/env node
// Drive the dev harness (src/dev/harness.ts) running inside Live.
// Start Live's extension host first:  npm run dev
//
//   node scripts/dev-cmd.mjs ping
//   node scripts/dev-cmd.mjs list
//   node scripts/dev-cmd.mjs fixtures            create track "TAB-TEST" with test clips
//   node scripts/dev-cmd.mjs payload "TT open chords" [--full]
//   node scripts/dev-cmd.mjs open "TT open chords"   open the editor (modal) on that clip
//   node scripts/dev-cmd.mjs openTrack "TAB-TEST"  "Open (Track)" on that track
//   node scripts/dev-cmd.mjs openAll             "Open (All Tracks)"
//   node scripts/dev-cmd.mjs ui "return document.title"   run JS in the open editor
//   node scripts/dev-cmd.mjs report              print the editor's latest report (no Live call)
//   node scripts/dev-cmd.mjs close               close the editor
//   node scripts/dev-cmd.mjs cleanup             delete track "TAB-TEST"
// Results are printed as JSON and saved in .devstore/**/dev/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".devstore");

function findDevDir(dir, depth = 0) {
    if (!fs.existsSync(dir) || depth > 4) return null;
    if (fs.existsSync(path.join(dir, "dev", "ready.json"))) return path.join(dir, "dev");
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { const f = findDevDir(path.join(dir, e.name), depth + 1); if (f) return f; }
    }
    return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(file, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (fs.existsSync(file)) {
            await sleep(100);
            try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { /* partial write */ }
        }
        await sleep(200);
    }
    return null;
}

const [action, arg, ...rest] = process.argv.slice(2);
if (!action) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf-8").split("\n").slice(1, 18).join("\n")); process.exit(1); }

const devDir = findDevDir(root);
if (!devDir) { console.error(`harness not found under ${root} (is "npm run dev" running in Live?)`); process.exit(2); }

if (action === "report") {
    const f = path.join(devDir, "ui-report-latest.json");
    if (!fs.existsSync(f)) { console.error("no report yet"); process.exit(3); }
    const r = JSON.parse(fs.readFileSync(f, "utf-8"));
    delete r.svgMarkup;
    console.log(JSON.stringify(r, null, 2));
    console.log(`\nscore markup: ${path.join(devDir, "ui-score-latest.html")}`);
    process.exit(0);
}

const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cmd = { action };
if (action === "ui") cmd.js = arg;
else if (arg) cmd.clip = arg;
if (rest.includes("--full")) cmd.full = true;

fs.writeFileSync(path.join(devDir, `trigger-${id}.json`), JSON.stringify(cmd));
const result = await waitFor(path.join(devDir, `result-${id}.json`), 30_000);
if (!result) { console.error("timeout: harness did not answer in 30 s"); process.exit(4); }
if (action !== "ui") { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 5); }

const ui = await waitFor(path.join(devDir, `ui-result-${id}.json`), 30_000);
if (!ui) { console.error("timeout: editor did not answer (is it open?)"); process.exit(6); }
console.log(JSON.stringify(ui, null, 2));
process.exit(ui.error ? 7 : 0);
