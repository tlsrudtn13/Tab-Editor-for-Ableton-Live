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
   node scripts/dev-cmd.mjs openTrack "TAB-TEST"      # "Open (Track) - Edit" on one track; openAll = all tracks
   node scripts/dev-cmd.mjs openScene 2               # "Open (Scene) - View" on scene 2 (every MIDI clip of that row)
   node scripts/dev-cmd.mjs openClips 1               # "Open (Selected Clips) - View" with every slot of row 1 selected
   node scripts/dev-cmd.mjs report                    # editor state: log, errors, TAB numbers drawn
   node scripts/dev-cmd.mjs ui "setMode('tab'); return __tabState.dispMode"
   node scripts/dev-cmd.mjs close
   node scripts/dev-cmd.mjs bigFixture 2000           # track "TAB-TEST-BIG" with a 2000-note clip (performance)
   node scripts/dev-cmd.mjs drumFixture               # "TAB-TEST-DRUMS" (Drum Rack inside an Instrument Rack; clips rock / shuffle / human) + "TAB-TEST Drums" (no rack)
   node scripts/dev-cmd.mjs drumInfo                  # Drum Rack detection for every track (pads, pad labels)
   node scripts/dev-cmd.mjs payload "TT drums rock" --full   # drum payload: pieces + AlphaTex
   node scripts/dev-cmd.mjs rawNotes "TT drums human"        # the clip's notes exactly as Live holds them (write-back checks)
   node scripts/dev-cmd.mjs cleanup                   # deletes the TAB-TEST* test tracks
   ```
   Files land in `.devstore/**/dev/`. `ui-score-latest.html` holds the rendered score SVG
   and can be opened in a browser to look at it.

Drum edit check (docs/DRUMS.md §5): `drumFixture`, save `rawNotes "TT drums human"`,
`open "TT drums human"`, then in `ui`: `__editKeys.setCursor(beat, lane)` (lane = 1-based index in
`__tabState.drumLanes`) and key events (`Enter`, `Alt+ArrowDown`, `a`), click `#btn-apply`, and
compare `rawNotes` again: only the edited hits may differ, every other hit keeps its exact
start and velocity. `openTrack "TAB-TEST-DRUMS"` does the same through Apply to Clips.
The harness `close` does not close the editor; click `#btn-cancel` through `ui` instead.

How it works: `dev-cmd.mjs` writes `trigger-<id>.json`; the harness polls for it, runs
the action in Live, and writes `result-<id>.json`. In dev builds the editor modal loads
from `http://localhost:5179` (the SDK allows localhost URLs), and the editor posts its
state to that server and runs queued JS.

Not covered: right-click menus themselves (the harness calls the same commands the
menus call) and anything outside the editor window. Use screenshots for those.
