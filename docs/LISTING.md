# Release listing: draft (Tab Editor 1.0.0)

Drafts for the GitHub release, liveextensions.co and community posts. Media are in `docs/media/`.
Conventions follow the comparable extensions (AbleTab, Sheet Music, Notation; checked 2026-11-21): one hero
screenshot, a social preview, a ~100-character tagline, 5–6 feature bullets with bold lead-ins, a bold
requirements line, 3 install steps. None of them has a video; ours is an extra.

## Media

| File | Use |
|---|---|
| `docs/media/hero-edit-dark.png` (1400×900) | README hero, first gallery image, Discord post |
| `docs/media/drums-dark.png` | gallery 2: drum notation + drum map |
| `docs/media/chords-light.png` | gallery 3: chord names, scale on the fretboard, light theme |
| `docs/media/melody-dark.png` | gallery 4: melody with chord names |
| `docs/media/tab-light-zoom.png` | gallery 5: TAB only at 125 % |
| `docs/media/social-preview-1280x640.png` | GitHub social preview (Settings → General → Social preview) |
| `docs/media/thumbnail-1280x800.png` | liveextensions.co image (16:10) |
| `docs/media/demo.gif` (700 px, 29 s) | README, under the hero |
| `tab-editor-demo.mp4` (1400×900, 29 s, not in git) | GitHub release asset, YouTube / Discord |

The current video is a draft made from the editor page itself, with title and end cards. For the final version,
record one take inside Live (see "Final video" below): the first seconds should show the right-click on a clip.

## GitHub

**Repository name:** `tab-editor` (or `tab-editor-live`; avoid "ableton" in the name)

**About (description):**
View and edit any MIDI clip as staff, TAB and drum notation inside Ableton Live, then write it back.

**Topics:** `ableton`, `ableton-live`, `ableton-extensions`, `guitar-tablature`, `tablature`, `drum-notation`,
`music-notation`, `midi`, `alphatab`, `typescript`

**Release title:** Tab Editor 1.0.0

**Release notes:**

> First public release. Open a MIDI clip, a track, a scene or an arrangement selection in Live as staff + TAB
> (guitar, bass) or drum notation, fix it with Guitar Pro style keys, and apply the changes back to the clip in one
> Live undo step.
>
> **Requires Ableton Live 12 Suite 12.4.5 or newer with Extensions (currently in public beta).**
> Tested on Windows 11 with Live 12.4.25 beta. macOS is not tested yet.
>
> Install: download `Tab-Editor-1.0.0.ablx`, drop it on Live's Settings → Extensions page (Developer Mode off),
> then right-click a MIDI clip → Open (Clip) - Edit.
>
> Assets: `Tab-Editor-1.0.0.ablx`, `tab-editor-demo.mp4`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, SHA-256 of the .ablx.

## Feature list (README, listing)

- **Staff, TAB and drum notation:** any MIDI clip, track, scene or arrangement selection opens as staff + TAB
  (6/7/8/12-string guitar, 4/5/6-string bass, 10 tunings, capo) or as drum notation with your Drum Rack's pads.
- **Fingering that makes sense:** follows the hand position across a phrase, so runs stay in one position. Move
  notes between strings without changing the pitch.
- **Guitar Pro style editing:** type frets, set note values, ties, triplets, rests; palm mute, let ring,
  hammer-on/pull-off, slide, bends, vibrato, dead notes; drag to select a range.
- **Back into Live:** Apply writes only the notes you changed, in one Live undo step. Untouched notes keep their
  exact timing and velocity.
- **Knows your Live Set:** uses the clip's loop region, Live's Scale Mode for the key signature, locators as
  rehearsal marks, and Live's light or dark theme.
- **Ready to print:** chord names suggested from the notes, lyrics, title, scale shapes on the fretboard, PDF and
  AlphaTex export, playback.

## liveextensions.co submission (form fields)

| Field | Value |
|---|---|
| Author name | (your public handle, the same as the manifest author `Mockin_I`) |
| Your email | (yours; not shown publicly) |
| Title | Tab Editor |
| Extension page URL | the GitHub repository URL |
| Pricing | Free |
| Description | the paragraph below |
| Image | `docs/media/thumbnail-1280x800.png` |

Description:

> View and edit any MIDI clip as staff, TAB and drum notation inside Live, then write it back to the clip.
> Guitar (6–12 strings) and bass (4–6), drums with your Drum Rack's pads, Guitar Pro style keyboard editing,
> techniques, chord names, lyrics, PDF export. Apply is one Live undo step. Free and open source (MIT).
> *requires Live 12.4.5 Suite, currently in public beta

## Ableton Discord post

> **Tab Editor 1.0: staff + TAB and drum notation editor for MIDI clips (free, open source)**
> Right-click a MIDI clip → Open (Clip) - Edit. It opens as staff + TAB (guitar/bass) or drum notation; edit with
> Guitar Pro style keys, add palm mutes, bends, chord names and lyrics, print to PDF, and Apply writes the changes
> back to the clip in one undo step.
> Download (.ablx) and source: <GitHub link> · Requires Live 12.4.5 Suite beta with Extensions. Windows tested,
> macOS feedback welcome.
> (attach `hero-edit-dark.png` and the mp4)

## Korean community post (draft)

> **[무료] Ableton Live 12용 TAB 악보 편집 익스텐션 "Tab Editor" 1.0을 공개합니다**
> MIDI 클립을 우클릭해 열면 기타·베이스는 오선보와 TAB으로, 드럼은 드럼 악보로 보여 줍니다.
> 가이드 프로처럼 키보드로 프렛과 음표 길이를 고치고, 팜 뮤트·벤딩·코드 이름·가사를 넣어 PDF로 뽑을 수 있습니다.
> Apply를 누르면 바꾼 노트만 클립에 다시 쓰고, Live에서 실행 취소 한 번으로 되돌릴 수 있습니다.
> 필요: Ableton Live 12 Suite 12.4.5 이상 베타(Extensions 포함). Windows 11에서 테스트했습니다.
> 다운로드와 소스: <GitHub 링크> (MIT, 무료)
> 직접 만든 도구라 피드백 주시면 반영하겠습니다.

## Final video (record inside Live, 25–35 s)

Storyboard from designer D017, adjusted to what the editor does:

| # | Time | On screen | Caption |
|---|---|---|---|
| 1 | 0–4 s | Live Set, right-click a guitar MIDI clip → Open (Clip) - Edit; the editor opens | Open any MIDI clip |
| 2 | 4–9 s | Drag over the first bar's notes, press P (palm mute), then B on one note (bend) | Techniques on a selection |
| 3 | 9–13 s | Cursor on a note, type 5 then 7; Alt+↓ moves a note to the next string | Type frets like Guitar Pro |
| 4 | 13–17 s | Auto chords; Scale menu → Major on the fretboard | Chord names and scales |
| 5 | 17–22 s | Switch to a drum tab, Enter adds a hit, G makes it a ghost note | Drums with your Drum Rack |
| 6 | 22–26 s | PDF button, the PDF opens | Print-ready PDF |
| 7 | 26–30 s | Apply to Clip; the clip in Live shows the new notes; Ctrl+Z in Live undoes it | Back into Live, one undo |

Record at 1920×1080 (Live full screen) or crop to the 1400×900 editor; captions bottom centre, white on
#121212 with a 1 px #ff764d border. No Ableton logo or Live icon in titles or thumbnails (trademark rules).
