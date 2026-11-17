# Testing

## 1. Unit tests (no Live)
```bash
npm test
```
Notation engine (`src/notation`) and pure UI helpers (`ui/src/musicUi.ts`).
Tests named `known bug:` use `it.fails` and document bugs that are not fixed yet.

## 2. Editor in a browser (no Live)
```bash
npm run build:ui
npx tsx scripts/preview.ts
node scripts/serve.mjs        # http://127.0.0.1:5178/
```
Loads the built editor with sample tracks injected the same way the extension does.
alphaTab only renders while the page is visible.

## 3. Inside Live (dev harness)
Dev builds add a test harness (`src/dev/harness.ts`, `ui/src/devReporter.ts`).
Release builds (`npm run build`, `npm run package`) contain none of it.

1. Start Live 12 Suite (beta with Extensions). `.env` must set `EXTENSION_HOST_PATH`.
2. In the project folder:
   ```bash
   npm run dev
   ```
   This builds with `--dev` and runs the extension with storage in `.devstore/`.
   The log line `[TAB-DEV] harness ready` means it is up.
   Live needs Settings → Extensions → Developer Mode on.
   Do not add `--verbose`: CLI 1.0.0-beta.1 then never sees the "connected" line and
   kills the host after 10 s ("Failed to connect to Live within 10s").
3. Drive it from another terminal:
   ```bash
   node scripts/dev-cmd.mjs ping
   node scripts/dev-cmd.mjs fixtures                 # tracks "TAB-TEST" (test clips, src/dev/fixtures.ts) and "TAB-TEST-BASS"
   node scripts/dev-cmd.mjs list
   node scripts/dev-cmd.mjs payload "TT open chords"  # notes, string/fret result (add --full for MusicXML)
   node scripts/dev-cmd.mjs open "TT open chords"     # opens the real editor through the registered command
   node scripts/dev-cmd.mjs openTrack "TAB-TEST"      # "Open (Track)" on one track; openAll = all tracks
   node scripts/dev-cmd.mjs report                    # editor state: log, errors, TAB numbers drawn
   node scripts/dev-cmd.mjs ui "setMode('tab'); return __tabState.dispMode"
   node scripts/dev-cmd.mjs close
   node scripts/dev-cmd.mjs cleanup                   # deletes tracks "TAB-TEST" and "TAB-TEST-BASS"
   ```
   Files land in `.devstore/**/dev/`. `ui-score-latest.html` holds the rendered score SVG
   and can be opened in a browser to look at it.

How it works: `dev-cmd.mjs` writes `trigger-<id>.json`; the harness polls for it, runs
the action in Live, and writes `result-<id>.json`. In dev builds the editor modal loads
from `http://localhost:5179` (the SDK allows localhost URLs), and the editor posts its
state to that server and runs queued JS.

Not covered: right-click menus themselves (the harness calls the same commands the
menus call) and anything outside the editor window. Use screenshots for those.
