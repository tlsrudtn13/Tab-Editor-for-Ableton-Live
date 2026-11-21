# AGENTS.md — Tab Editor for Ableton Live

Rules for every agent (Claude orchestrator, OpenCode workers, Codex, Antigravity designer,
local orchestrator) working in this repo.

## Product goal (order matters)
1. **Viewer**: a MIDI clip/track in Live opens as a correct, readable
   staff + TAB (fingering, rhythm, bass/guitar, Live scale/cue points).
2. **MIDI editing**: change notes in the editor and write them back to the Live clip
   (one undo step), keeping string choices.

## Roles
| Who | Does | Never |
|---|---|---|
| Claude Code (orchestrator) | plans, writes work orders, reviews every diff, runs Live tests, commits | bulk implementation it can delegate |
| OpenCode worker (`run-worker.ps1`, free → paid) | bounded implementation work orders `T…` | commit, push, edit outside scope |
| Codex `-Work` (`ask-codex.ps1`, gpt-6-luna) | bounded algorithmic / cross-cutting orders `C…` | commit, push |
| Codex adviser (read-only) | design questions, diff cross-checks; Astra only for final review | write files |
| Antigravity designer (`run-designer.ps1`, Flash) | UI/UX review from screenshots, layout/colour specs `D…`; Argon only for final review | code |
| Local orchestrator (`run-orchestrator.ps1`, Haiku API) | fallback Claude-class worker when OpenCode and Codex are blocked | push |

Escalation for a failed order: OpenCode free → OpenCode paid → Codex `-Work` → local
orchestrator → Claude subagent (owner OK).
**Paused (owner, 2026-11-17):** no Codex work or advice until the owner lifts it; skip that step.
Designer final review: Argon; when Argon's quota is out, `gemini-4-hydrogen-medium` instead of Flash. Work orders live in `.orchestration/` (git-ignored).

## Layout
- `src/notation/` — pure engine (no SDK, no DOM): quantize, fingering/voicing, MusicXML, AlphaTex.
  Shared by the extension and the UI (`ui/src/score.ts` imports it).
- `src/extension.ts` — Live entry points (context menus → commands → modal editor).
- `src/dev/` — dev-only test harness (excluded from release builds by `__TAB_DEV__`).
- `ui/src/` — editor web page (alphaTab), built to a single `dist-ui/index.html`.

## Validation gate (every order)
```bash
npx tsc --noEmit
npm test
npm run build:ui
```
Live check (orchestrator only, Live must be running with Developer Mode): see `docs/TESTING.md`
(`npm run dev`, then `node scripts/dev-cmd.mjs …`).

## Rules
- Live MIDI is sounding pitch. Instrument presets use sounding pitch (guitar low E = 40, bass low E = 28).
- `src/notation` stays pure and covered by vitest. New behaviour needs a test.
- Snapshots change only when the order says so; say why in the report.
- Never read, print or commit `.env`. SDK `.tgz` files stay out of git.
- No new runtime dependencies without the orchestrator's OK.
- Workers: finish the listed items, stop and report; start nothing that is not listed.
- Other agents may be editing the same work tree at the same time. **Never** run `git stash`,
  `git checkout -- <file>`, `git restore`, `git reset`, `git clean`, or delete/revert files you did not
  create in this order. If tests outside your scope fail, report them; do not "restore a clean baseline".
