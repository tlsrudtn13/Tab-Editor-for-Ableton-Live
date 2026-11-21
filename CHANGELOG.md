# Changelog

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
- Undo after an instrument change; names with `$` or `<`; Ctrl+D past the clip end; lyrics entry when switching tabs.
- Active buttons in Live's solid orange, flat scrollbars, monochrome theme icon, cleaner fretboard string names.

Built on the Ableton Extensions SDK 1.0.0-beta.1. Development history before 1.0 (0.9–0.17) is in the git log.
