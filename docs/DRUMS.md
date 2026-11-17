# Drum notation (view only)

Drum MIDI opens as a standard **drum staff** (no TAB: there is no drum tablature
standard worth following, and alphaTab disables tablature for percussion).
Drum editing is a later round; this mode only reads.

## 1. Standard we follow

| Layer | Standard | Why |
|---|---|---|
| Live pitch → drum | **General MIDI Level 1 percussion key map** (35–81), plus the GM2 keys 27–34 and 82–87 | Live's Drum Rack lays its default pads out from C1 = MIDI 36 = *Bass Drum 1*, and stock Live kits (and most drum plug-ins and MIDI files) follow GM. |
| Drum → staff position, notehead | **Guitar Pro 7 drum map**, as built into alphaTab 1.8.3 (`PercussionMapper`) | The product goal is a Guitar Pro–style viewer; alphaTab renders and plays these articulations natively (GM channel 10). Its positions agree with the PAS / Weinberg drum key below. |
| Layout rules | **PAS / Norman Weinberg, *Guide to Standardized Drumset Notation*** | The common engraving reference: 5-line staff, neutral (percussion) clef, cymbals with x noteheads above the staff, drums with normal noteheads, hands stems up / feet stems down. |

Staff positions (treble-staff names, line 0 = top line F5):

| Instrument | GM key (Live name) | Position | Notehead | Voice |
|---|---|---|---|---|
| Crash | 49 (C#2), 57 | A5 ledger / G5 | heavy x | hands |
| China / Splash | 52 / 55 | B5 / A5 | x | hands |
| Hi-hat closed / open / half | 42 (F#1) / 46 (A#1) / – | G5 space above | x / circled x / circle-slash | hands |
| Ride / ride bell | 51 (D#2) / 53 | F5 top line | x / diamond | hands |
| Tom 1 / Tom 2 | 50 (D2) / 48 (C2) | E5 / D5 | normal | hands |
| Snare / side stick / rim shot | 38 (D1), 40 / 37 / – | C5 | normal / x / diamond | hands |
| Tom 3 / Tom 4 | 47 / 45 (A1) | B4 / A4 | normal | hands |
| Floor tom | 43 (G1), 41 | G4 / A4 | normal | hands |
| Kick | 36 (C1) | F4 bottom space | normal | feet |
| Kick 2 (acoustic) | 35 | E4 bottom line | normal | feet |
| Hi-hat pedal | 44 (G#1) | D4 below the staff | x | feet |

Latin and other GM percussion (60–87) use alphaTab's GP7 positions (many above or
below the staff, as in Guitar Pro). GM2 keys without a GP7 articulation are drawn as a
look-alike (High Q / Square Click → metronome click, Slap → clap, scratches → sticks).
Pitches outside GM (0–26, 88–127) are drawn as a **slashed notehead on the snare line**
and marked `?` in the legend until the user maps them.

Rhythm rules (drum-chart practice):
- A hit has no sustain: it lasts until the next hit in its voice, cut at the end of its
  beat, so beats stay visible; gaps are rests split per beat. No ties.
- Beat = quarter in x/4 and x/2; dotted quarter in 6/8, 9/8, 12/8; eighth in other x/8.
- Same drum twice at one instant (two pads mapped to one drum) = one notehead.
- Rests in the feet voice are not drawn (they keep their time). alphaTab lifts colliding
  second-voice rests above the staff, and many drum charts omit lower-voice rests anyway.
- Velocity → ghost note (snare, velocity ≤ 45) and accent (velocity ≥ 115) only when the
  clip's velocities vary (median < 100 for accents, > 60 for ghosts), so programmed
  flat-velocity MIDI stays clean.
- Grid and triplets: same auto grid as the guitar view (Quantize menu works).

## 2. Mapping (bridge) — `src/notation/drumMap.ts`

`resolveDrumPiece(pitch, override, hints)`:
1. the track's **kit map** (pitch → articulation id), if set;
2. else the **GM default**;
3. else the unmapped fallback.

Drum Rack information is used only as **labels** (`hints`): pad sample names never
change the mapping (a pad named "Snare" on C1 is still drawn as a kick until the user
maps it). The kit map is saved per track/clip next to the TAB layers
(`<storage>/tablayers/<sha256("drum\0" + layerKey)>.json`, `{ v:1, kind:"drum", map }`).
The user changes it from the legend under the score; it is sent back on Close.

## 3. Detection — `src/drumDetect.ts`

A track is a drum track when its device chain contains a **Drum Rack**
(`DrumRack`, className `DrumRackDevice`), searched depth-first through nested
racks (`RackDevice.chains[].devices`, max depth 6). The rack's `DrumChain.receivingNote`
gives the pads; a chain's first `Simpler` sample file name (`sample.filePath`)
labels the pad, else the first device's name unless it is a stock device name
(Simpler, Ext. Instrument, …); chains have no names in SDK 1.0.0-beta.1.

Live check (Live 12 Beta, 2026-11-18): a Drum Rack nested in an Instrument Rack is found
at depth 1 with its 16 pads and sample labels; a rack-less track named "TAB-TEST Drums"
switches by the name rule; both open as a percussion staff with the legend, and a pad
change saved on Close is applied on reopen. Playback could not be checked in the dev
harness (the player does not get ready there, for guitar clips too).

Fallback, deliberately narrow: no Drum Rack, but the **track name** says drums
(`drum(s)`, `kit`, `beat`, `perc`, `808`, `909`, `드럼`) **and** ≥ 80 % of notes sit on core
GM kit keys (35–53, 55, 57, 59). Guitar/bass tracks never switch by accident.

## 4. Rendering — `src/notation/toDrumAlphaTex.ts`, `ui/src/drums.ts`

AlphaTex percussion (`\instrument percussion`, one `\articulation (kNN NN)` per drum,
`\clef neutral`), voice 1 = hands, voice 2 = feet. MusicXML percussion was tested in
alphaTab's importer too, but it takes noteheads only from `<notehead>` and staff lines
from display pitches, so AlphaTex gives the GP7 noteheads, positions and playback keys
in one step. Playback uses alphaTab's percussion channel (MIDI channel 10).

In drum mode the editor hides the fretboard, Staff/TAB buttons, instrument menu,
transpose/capo, the selection/technique bar and Apply; it shows the pad legend.
Guitar tracks are unchanged.

## Sources
- General MIDI Level 1 (MMA0007 / RP003, 1991), percussion key map: <https://en.wikipedia.org/wiki/General_MIDI#Percussion>,
  key-map chart: <https://musescore.org/sites/musescore.org/files/2024-10/General%20MIDI%20Standard%20Percussion%20Set%20Key%20Map.pdf>
- Norman Weinberg, *Guide to Standardized Drumset Notation*, Percussive Arts Society, 2002 (Hal Leonard 06620063):
  <https://www.halleonard.com/product/6620063/guide-to-standardized-drumset-notation>
- Percussion notation overview (cites Weinberg; Sibelius follows the PAS recommendations): <https://en.wikipedia.org/wiki/Percussion_notation>
- Guitar Pro 7 articulations as implemented in alphaTab 1.8.3: `node_modules/@coderline/alphatab/dist/alphaTab.core.mjs`,
  `class PercussionMapper` (`instrumentArticulations`) and the AlphaTex `\articulation` handler.
- Ableton Live Drum Rack: 16-pad view starts at C1 (MIDI 36) by default (Live 12 manual, "Drum Racks").
