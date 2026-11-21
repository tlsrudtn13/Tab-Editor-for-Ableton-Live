# Roadmap

## 1.x (fixes and small additions)

- Fixes from user reports; a rebuild for each Live / Extensions SDK beta update.
- macOS test pass.
- From the 1.0 bug review, not fixed yet: in a selection tab, Insert beat / paste near the selection end can
  shift notes onto unshown notes of the same clip; a drum pad remap is stored per clip in clip view but per
  track in track / scene views; notes moved before a clip's region start (negative clip time) are skipped.
- Playback with your own SoundFont (.sf2) instead of the built-in General MIDI one.

**Playback through Live's own instruments** (asked 2026-11-21, blocked by the SDK). The Extensions API
(1.0.0-beta.1) has no transport control (play, stop, position, loop) and renders audio only from audio
tracks, before effects (`renderPreFxAudio`), so a MIDI track cannot be played or rendered through its
instrument, and the editor is a modal dialog while Live plays. Until the SDK adds this, the editor plays
with alphaTab's General MIDI sounds. Revisit with each SDK release.

## 2.0: guides, presets and learning material for players

Ideas from the owner (2026-11-19). Goal: the editor not only shows a part, it helps guitarists,
bassists and drummers write and learn one inside Live.

**Insert**
- Basic drum beats to insert at the cursor or into an empty clip: rock, pop, funk, shuffle, half-time,
  hip-hop, house, bossa, 6/8, fills. Written as real MIDI notes on the Drum Rack's pads.
- Chord presets: pick a progression (I–V–vi–IV, ii–V–I, 12-bar blues, …) in the clip's key and insert it
  as chords with a chosen voicing (open, power chord, barre, triad, bass root/fifth).
- Bass lines from the chord track: root, root–fifth, walking, octave patterns.

**Analyse**
- Chord progression analysis of the current clip or song: chord names per half bar (the Auto chords
  engine exists), roman numerals in the key, cadences, borrowed chords, the scale that fits each part.
- Show the analysis over the score and as a list that can be exported with the PDF.

**Learn**
- Learning samples: short example clips per technique and style (palm-mute riff, slide, bend, ghost
  notes, drum rudiments) that open as tabs with notes on what to practise.
- Practice mode: loop a range, slow it down (50–100 %), count-in.
- Chord diagrams over the score; scale and arpeggio shapes on the fretboard.

**Edit**
- Customisable shortcuts (owner 2026-11-21). The default stays Guitar Pro-style, since the editor is mostly
  for tab players. A "Live MIDI editor" preset remaps the keys that mean something else in Live's piano roll
  (↑/↓ transpose, Shift+←/→ note length, Ctrl+1..6 grid, ←/→ move notes). Any command can be rebound, with a
  warning when two commands share a key and a "reset to defaults" button. Help and tooltips show the
  current bindings. Needs the key handling (`keys.ts` `onKey`, `techUi.ts` `TECH_KEY`, `drums.ts`) moved
  into one command list plus a keymap first.

**Also considered** (from the v1 reviews)
- Guitar Pro (.gp) / MusicXML import and export.
- Multi-voice notation.
- Technique suggestions from MIDI (overlap → hammer-on, short soft notes → palm mute / ghost).
- Ukulele and custom tunings; localised UI (English / Korean).
