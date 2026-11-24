# Changelog

## 2.0.0 (unreleased, branch feature/v2-insert-engine)

**Insert** (right-side panel, `+ Insert` in the edit toolbar)
- Chords, bass, a riff or drums into the open clip at the cursor, the selected bars or the whole clip, from feel
  presets; Replace or add; Vary for a new variation (riffs, busy drums, strummed or arpeggiated chords); Undo.
- Chord source: a progression preset in the clip's key, another track's chords, or your own progression. Click a
  chord card to swap it for a chord of the key or a common borrowed chord, or remove it (mouse or keyboard).
- Bass can lock to the kick of a drum track; a looping drum or chord clip repeats under the whole range.

**Analyse**
- One key for the whole editor: a fixed clip key, else Live's scale, else the notes ("sure / likely / est.").
- Analysis toggle: roman numerals over the score coloured by function, cadence marks (PAC, PC, HC, DC, ii–V–I),
  and an Analysis tab next to the fretboard with bar, chord, numeral, what the chord does and the scale that fits.
  It can be added to the PDF.
- Chord diagrams above the chord names, drawn from the frets in the TAB.

**Practice**
- Practice strip: loop the selected bars or the whole clip, speed 50–100 %, 1-bar count-in, metronome.

**Fixes**
- Selection tabs edit only the selected part of each clip (Insert beat, Paste and Move can no longer reach the
  clip's unshown notes).
- The drum kit map is saved per track in every view.
- Apply names the reason when it skips an edit (before the clip start, or pitch / length out of range).

## 1.0.0 (2026-11-18)

First public release.

**Open**
- Right-click a MIDI clip, an arrangement selection, a MIDI track, an audio track (all tracks), a scene or
  several Session clips and pick **Open (…) - Edit**. Several clips or tracks open as tabs.
- Guitar and bass open as staff + TAB, Drum Rack tracks as drum notation with a drum map table.
- Uses the clip's loop region, Live's Scale Mode for the key signature, Live's locators as rehearsal marks
  and the scene's time signature for Session clips.

**Read**
- Fingering that follows the hand position across a phrase (bass detected automatically).
- 6/7/8/12-string guitar, 4/5/6-string bass, 8 guitar and 2 bass tunings, capo, transpose.
- Automatic rhythm grid with 8th and 16th triplets; time signatures 2/4 to 12/8.
- Fretboard with scale overlay, note table, playback with a General MIDI soundfont.
- Chord names (suggested from the notes), lyrics, key and title for print; bar numbers every four bars.
- PDF and AlphaTex export. Dark and light themes, zoom 80–200 %, resizable fretboard and drum map.

**Edit**
- Cursor and keyboard editing: frets, note values, dot, triplet, tie, rest, insert/delete beat,
  copy/paste, string moves, techniques (let ring, palm mute, hammer-on/pull-off, slide, dead note,
  vibrato, bends), range selection by drag.
- Drum editing: add/remove hits, change the piece, ghost/accent/normal velocity.
- **Apply** writes only the changed notes back to the clip in one Live undo step; untouched notes keep
  their exact timing and velocity. Fingering, techniques, chords, lyrics and title are saved per clip.

**Fretboard** (works like Guitar Pro's)
- Hover a fret to see its note name; the header shows string, fret and note with octave.
- Click an empty fret to add a note (a chord tone when other strings sound), click the note again to
  remove it, click another fret on the same string to move it. Same rules as typed frets: not below the
  capo, not while Trans is set.
- Scale tones are shown with their names, the root as a gold square.
- **Bar** checkbox: also shows the other notes of the current bar.

**Release preparation** (designer and Fable review)
- Toolbar rows wrap at large zoom instead of hiding Close; clearer labels (Grid, Key, AlphaTex, Refinger,
  + Beat / − Beat, Ring); Data and Log are quieter.
- About section in the Keys panel with version, credits and trademark note; licence texts ship in the package.
- The temporary editor page is deleted when the editor closes; the package no longer carries the page twice.

**Bug fixes and Live look** (Fable bug review, designer D016)
- Saved fingering no longer shows wrong frets after a change of instrument, tuning or Transpose.
- Typed frets count from the capo, as the TAB shows them.
- Track view keeps each clip's own title and key; chords and lyrics outside the shown part are kept.
- Clips with the same name no longer share chords, lyrics and title (layers are matched by the notes).
- In track and selection views a note can move into the next clip (Apply moves it there).
- On an 8th-note grid a real 8th rest is no longer drawn as part of the note before it.
- Undo after an instrument change; names with `$` or `<`; Ctrl+D past the clip end; lyrics entry when switching tabs.
- Active buttons in Live's solid orange, flat scrollbars, monochrome theme icon, cleaner fretboard string names.

Built on the Ableton Extensions SDK 1.0.0-beta.1. Development history before 1.0 (0.9–0.17) is in the git log.
