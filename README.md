# Tab Editor for Ableton Live

A guitar/bass tablature and standard-notation editor that runs inside Ableton Live 12.
Opens a MIDI clip or track as staff + TAB, lets you fix the part, and writes the changes back to the clip.
Score rendering by [alphaTab](https://alphatab.net).

> Beta (v0.17.0). Needs Ableton Live 12 with Extensions (beta) enabled.

## Features

**Viewer**
- Staff + TAB, TAB only or staff only. Dark and light themes.
- Fingering that follows the hand position across a phrase, so runs and solos stay in one position.
- Bass clips open as 4-string bass automatically. Other instruments: 7/8/12-string guitar, 5/6-string bass.
- Tunings: Standard, Drop D, Eb, D Standard, Drop C, DADGAD, Open G, Open D; bass Drop D and Eb. Capo.
- Rhythm: automatic grid (1/8, 1/16, 1/32) including 8th and 16th triplets.
- Key signature from Live's Scale Mode; no guessed sharps on short riffs. Or fix a key per clip (toolbar **Key**).
- Time signatures 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8 (Session clips use their scene's signature).
- Shows only the clip's loop region. Live locators appear as rehearsal marks.
- Fretboard with scale overlay, chord names, note table, playback, PDF and AlphaTex export.

**Editing (Open (Clip) - Edit and Open (Track) - Edit)**

| Key | Action |
|---|---|
| ← / → | Previous / next beat slot |
| Ctrl + ← / → | First slot of previous / next bar |
| Home / End | First / last slot of the bar |
| Ctrl + Home / End | First / last slot of the score |
| ↑ / ↓ | String up / down |
| 0–9 | Set fret on the note at cursor, or insert a note at the slot (two digits within 0.4 s) |
| Ctrl + 1..6 | Set note value to 1/1..1/32 |
| Shift + . | Toggle dot |
| Shift + / | Toggle triplet |
| L | Tie note to the next matching note or rest |
| R | Turn cursor slot into a rest |
| Ctrl + Insert | Insert a beat at the cursor slot |
| Shift + Delete | Delete the cursor beat |
| Ctrl + C / X / V | Copy / cut / paste selection |
| Alt + ↑ / ↓ | Move the note to the adjacent string with the same pitch |
| Alt + Shift + ↑ / ↓ | Pitch ±1 semitone on the same string (if the fret stays 0–24) |
| Shift + ← / → | Extend selection by beat (all strings in range) |
| Drag on score | Drag to select a range of notes (Shift+drag adds) |
| Shift + ↑ / ↓ | Select all notes of the cursor slot |
| Ctrl + A | Select all notes |
| `+` / `-` | Shorter / longer duration (halve / double) |
| Alt + ← / → | Move note one grid step earlier / later |
| Ctrl + Alt + ← / → | Move note one beat earlier / later |
| Delete / Backspace | Delete the selected notes or the note at the cursor |
| Ctrl + D | Duplicate the note |
| Ctrl + Z | Undo |
| Ctrl + Y / Ctrl + Shift + Z | Redo |
| I / P / H / S / X / V | Let ring, palm mute, hammer-on/pull-off, slide, dead note, vibrato (toggle) |
| B | Bend: ½ → full → 1½ → off |
| Ctrl + Enter | Apply to Clip |
| Esc | Clear the selection |

A cyan cursor box shows the current beat slot and string on the TAB. Click a note, rest or string
position to place the cursor, or drag to select a range of notes (Shift+drag adds). Clicking a fret
on the fretboard sets or inserts the note at the cursor's slot on that string; Shift + click adds a
chord tone. Use the **Keys** button for a quick reference.
**Techniques** are shown on the score, saved with the clip's TAB layout, and do not change the MIDI.
With a range selected, a technique key or palette button applies to the whole selection.
Overlapping arpeggio notes are marked let ring automatically.
**Apply to Clip** writes only the notes you changed. Notes whose pitch you changed keep their original
(unquantized) timing. The whole apply is one step in Live's Undo. If the clip changed in Live while the
editor was open, nothing is written and Live shows a message.

String choices, tuning, capo and time signature are saved per clip and restored when you open it again.
Edited fingering is kept per clip, also after renaming or moving the clip; Re-finger clears it.

**Drums.** A track with a Drum Rack (or a drum-named track playing GM drum keys) opens as a drum staff
with a pad legend underneath. In Open (Clip) - Edit and Open (Track) - Edit the cursor moves over beats
(Left/Right) and drum pieces (Up/Down, top of the staff first; the dashed **+ piece** chips in the legend
are pieces the clip does not use yet). **Enter** adds or removes a hit, **Delete** removes it,
**Alt+Up/Down** changes its piece (closed to open hi-hat, snare to side stick ...), **G / A / N** set
ghost (velocity 35), accent (127) or normal (100). The Value buttons, dot, triplet and Ins/Del beat work
as on guitar. Apply writes only new and changed hits; untouched hits keep their exact timing and velocity.

## Install

1. Download the `.ablx` file from [Releases](../../releases).
2. In Live, open Settings → Extensions and drop the `.ablx` file on the page.

> While Live's Developer Mode is on, Live does not load installed extensions (the right-click menu entries disappear). Turn Developer Mode off to use the installed `.ablx`.

## Use

| Right-click | Menu item | Opens |
|---|---|---|
| A MIDI clip | Open (Clip) - Edit | That clip's loop region, editable (guitar/bass as TAB, drums as drum notation) |
| An arrangement selection on a MIDI track | Open (Selection) - Edit | The selected range, one tab per track, editable |
| A MIDI track | Open (Track) - Edit | All arrangement clips on that track, editable (Apply to Clips writes each clip) |
| An audio track | Open (All Tracks) - Edit | Every MIDI track's Arrangement clips, one tab per track, editable |
| A scene (Session View) | Open (Scene) - Edit | Every MIDI clip in that scene, guitar/bass as TAB and drums as drum notation, one tab each, editable |
| Several selected Session clips | Open (Selected Clips) - Edit | Those clips, one tab each, editable |

Click inside the editor once before pressing Play: the browser engine starts audio only after a click.

**Chord names, lyrics, key, title (for print).** Press **K** (or **Chord**) on a beat or a selected range: the editor suggests up to four chord names from the notes there (1–4 picks one, or type your own, Backspace removes it). **Auto chords** fills the half bars it is sure about and never replaces a chord you typed (Shift+click removes the auto ones). **Key** fixes the key signature for this clip (default: follow Live's scale). **Title** prints above the score and in the PDF (empty = the tab name). **Lyrics** (Ctrl+L or **Lyrics**): type one syllable per note, Space / Tab goes to the next note, Shift+Tab back, **-** adds a hyphen and moves on, Enter finishes. Drum tabs take chord names (typed, no suggestions), key and title too, so every part of a song prints with the same headings. Bar numbers show on bars 1, 5, 9, … These are saved next to the clip on Close, whether or not you apply note edits; the MIDI itself is not changed.

**Several tabs.** Live writes back only when the editor closes, so each tab keeps its own edits while you switch tabs. A tab with edits gets an **Apply** button in the track list: click it (it turns orange, ✓ Apply) to have that tab written to its clip(s). **Close & Apply** then writes every marked tab in one Live undo step; edits in unmarked tabs are discarded after a confirm. Use the editor's Close button: closing the window with its own × applies nothing.

## Known limitations (beta)

- While Live's Developer Mode is on, Live does not load installed extensions (the right-click menu entries disappear). Turn Developer Mode off to use the installed `.ablx`.
- Overlapping notes are written as one voice (with a let-ring mark).
- New notes go only into rests; use Shift + fret click for chord tones.
- In track and selection views a note cannot move from one clip into another; a new note outside every clip is dropped. Applying a selection keeps the clips' saved fingering for the notes outside the selection.
- Very long tracks (thousands of notes) take a few seconds to render.

## Development

```bash
# Put the Ableton Extensions SDK 1.0.0-beta.1 .tgz files (sdk, cli) in vendor/ first
npm install
npm test           # unit tests
npm run build      # production build
npm run dev        # build with the dev harness and attach to Live (see docs/TESTING.md)
npm run package    # create the .ablx package
```

How the work is split between people and agents is in [AGENTS.md](AGENTS.md).

## License

MIT, see [LICENSE](LICENSE).

## Credits

- Score rendering and playback: [alphaTab](https://alphatab.net) (MPL-2.0)
- Sound: Sonivox soundfont bundled with alphaTab, Copyright (c) 2004-2006 Sonic Network Inc. (Apache-2.0)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT)

---

# Tab Editor for Ableton Live (한국어)

Ableton Live 12 안에서 동작하는 기타/베이스 타브·오선보 편집기입니다.
MIDI 클립이나 트랙을 오선보와 TAB으로 열어 고치고, 바꾼 내용을 클립에 다시 씁니다.

> 베타 (v0.17.0). Extensions(베타)가 켜진 Ableton Live 12가 필요합니다.

## 기능

**보기**
- 오선보+TAB, TAB만, 오선보만. 다크/라이트 테마.
- 손 위치를 따라가는 운지 계산. 런과 솔로가 한 포지션 안에 머뭅니다.
- 베이스 클립은 자동으로 4현 베이스로 열립니다. 7/8/12현 기타, 5/6현 베이스도 고를 수 있습니다.
- 튜닝: 스탠더드, Drop D, Eb, D 스탠더드, Drop C, DADGAD, Open G, Open D, 베이스 Drop D·Eb. 카포.
- 리듬: 자동 그리드(1/8, 1/16, 1/32), 8분·16분 셋잇단 포함.
- 조표는 Live의 Scale Mode를 따릅니다. 짧은 리프에 엉뚱한 샵을 붙이지 않습니다.
- 박자표 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8 (세션 클립은 씬의 박자를 따름).
- 클립의 루프 구간만 보여 주고, Live 로케이터는 리허설 마크로 표시합니다.
- 프렛보드 스케일 표시, 코드 이름, 노트 표, 재생, PDF·AlphaTex 내보내기.
- 악보용 코드 이름·조성·제목 편집 (코드 이름은 노트를 보고 후보를 제안합니다).

**편집 (Open (Clip) - Edit과 Open (Track) - Edit)**

| 키 | 동작 |
|---|---|
| ← / → | 이전 / 다음 비트 슬롯 |
| Ctrl + ← / → | 이전 / 다음 마디의 첫 슬롯 |
| Home / End | 마디의 첫 / 마지막 슬롯 |
| Ctrl + Home / End | 악보의 첫 / 마지막 슬롯 |
| ↑ / ↓ | 줄 위 / 아래로 이동 |
| 0–9 | 커서 위치 노트의 프렛 설정 또는 슬롯에 노트 입력 (0.4초 안에 두 자리) |
| Ctrl + 1..6 | 음표 길이 1/1..1/32 설정 |
| Shift + . | 점음표 토글 |
| Shift + / | 셋잇단음표 토글 |
| L | 커서 음표를 다음 같은 음/쉼표와 타이 |
| R | 커서 슬롯을 쉼표로 |
| Ctrl + Insert | 커서 위치에 박 삽입 |
| Shift + Delete | 커서 박 삭제 |
| Ctrl + C / X / V | 선택 복사 / 잘라내기 / 붙여넣기 |
| Alt + ↑ / ↓ | 같은 음높이로 인접 줄로 이동 |
| Alt + Shift + ↑ / ↓ | 같은 줄에서 반음 ±1 (프렛 0–24 범위 내) |
| Shift + ← / → | 비트 범위 선택 확장 (범위 내 모든 줄) |
| 악보에서 드래그 | 드래그로 음 범위 선택 (Shift+드래그로 추가) |
| Shift + ↑ / ↓ | 커서 슬롯의 모든 노트 선택 |
| Ctrl + A | 모든 노트 선택 |
| `+` / `-` | 길이 절반 / 두 배 |
| Alt + ← / → | 노트를 그리드 한 칸 이동 |
| Ctrl + Alt + ← / → | 노트를 한 박 이동 |
| Delete / Backspace | 선택 또는 커서 위치 노트 삭제 |
| Ctrl + D | 노트 복제 |
| Ctrl + Z | 실행 취소 |
| Ctrl + Y / Ctrl + Shift + Z | 다시 실행 |
| I / P / H / S / X / V | let ring, 브리지 뮤트, 해머링·풀링, 슬라이드, 데드 노트, 비브라토 (켜고 끄기) |
| B | 벤드: ½ → 온음 → 1½ → 끄기 |
| Ctrl + Enter | 클립에 반영 (Apply to Clip) |
| Esc | 선택 해제 |

TAB 위의 청록색 커서 박스가 현재 비트 슬롯과 줄을 보여 줍니다. 노트, 쉼표, 줄 위치를 클릭해 커서를
놓거나, 드래그해 음 범위를 선택할 수 있습니다(Shift+드래그로 추가). 프렛보드 칸을 누르면 커서 슬롯의
해당 줄에 노트를 넣거나 바꾸고, Shift를 누른 채 누르면 화음 음을 추가합니다. **Keys** 버튼으로 단축키를
빠르게 볼 수 있습니다.
**기법 표기**는 악보에 그려지고 클립의 TAB 설정과 함께 저장되며, MIDI는 바꾸지 않습니다. 범위를 선택한
상태에서는 기법 키나 팔레트 버튼이 선택 전체에 적용됩니다.
겹쳐 울리는 아르페지오에는 let ring이 자동으로 붙습니다.
**Apply to Clip**은 바꾼 노트만 클립에 씁니다. 음높이만 바꾼 노트는 원래(퀀타이즈 전) 타이밍을 유지합니다.
한 번의 반영은 Live 실행 취소 한 단계입니다. 에디터가 열려 있는 동안 Live에서 클립이 바뀌었다면
아무것도 쓰지 않고 안내 메시지를 띄웁니다.

고른 줄, 튜닝, 카포, 박자표는 클립마다 저장되어 다시 열 때 복원됩니다.
편집한 운지는 클립 이름을 바꾸거나 옮긴 뒤에도 클립별로 유지되며, Re-finger는 이를 지웁니다.

**드럼.** Drum Rack이 있는 트랙(또는 이름이 드럼이고 GM 드럼 키를 쓰는 트랙)은 드럼 악보와 그 아래 패드
목록으로 열립니다. Open (Clip) - Edit과 Open (Track) - Edit에서는 커서가 박(←/→)과 드럼 악기(↑/↓, 오선
위쪽부터)를 오갑니다. 목록의 점선 **+ 악기** 칩은 클립에 아직 없는 악기입니다. **Enter**는 타격을 넣거나
빼고, **Delete**는 지우며, **Alt+↑/↓**는 악기를 바꿉니다(클로즈드→오픈 하이햇, 스네어→사이드 스틱 등).
**G / A / N**은 고스트(벨로시티 35), 액센트(127), 보통(100)입니다. 음가 버튼, 점, 셋잇단, 박 넣기/지우기는
기타와 같습니다. Apply는 새로 넣거나 바꾼 타격만 쓰며, 손대지 않은 타격은 원래 타이밍과 벨로시티를 그대로 둡니다.

## 설치

1. [Releases](../../releases)에서 `.ablx` 파일을 받습니다.
2. Live 설정 → Extensions 페이지에 `.ablx` 파일을 끌어다 놓습니다.

> Live의 Developer Mode가 켜져 있으면 Live가 설치된 익스텐션을 불러오지 않습니다(우클릭 메뉴 항목이 사라집니다). 설치한 `.ablx`를 쓰려면 Developer Mode를 끄세요.

## 사용

| 우클릭 위치 | 메뉴 | 열리는 범위 |
|---|---|---|
| MIDI 클립 | Open (Clip) - Edit | 그 클립의 루프 구간, 편집 가능 (기타·베이스는 TAB, 드럼은 드럼 악보) |
| MIDI 트랙의 어레인지 선택 구간 | Open (Selection) - Edit | 선택 구간, 트랙마다 탭 하나, 편집 가능 |
| MIDI 트랙 | Open (Track) - Edit | 그 트랙의 모든 어레인지 클립, 편집 가능 (Apply to Clips가 클립마다 반영) |
| 오디오 트랙 | Open (All Tracks) - Edit | 모든 MIDI 트랙의 어레인지 클립, 트랙마다 탭 하나, 편집 가능 |
| 씬 (세션 뷰) | Open (Scene) - Edit | 그 씬의 모든 MIDI 클립. 기타·베이스는 TAB, 드럼은 드럼 악보로 클립마다 탭 하나, 편집 가능 |
| 세션 클립 여러 개 선택 | Open (Selected Clips) - Edit | 선택한 클립들, 클립마다 탭 하나, 편집 가능 |

재생하기 전에 에디터 안을 한 번 클릭하세요. 브라우저 엔진은 클릭이 있어야 소리를 냅니다.

**코드 이름·가사·조성·제목 (인쇄용).** 박이나 선택 구간에서 **K**(또는 **Chord**)를 누르면 그 자리의 노트를 보고 코드 이름 후보를 최대 4개 보여 줍니다. 1–4로 고르거나 직접 입력하고, Backspace로 지웁니다. **Auto chords**는 확실한 곳만 반 마디 단위로 채우고, 직접 넣은 코드는 바꾸지 않습니다(Shift+클릭이면 자동 코드만 지움). **Key**로 이 클립의 조표를 고정할 수 있습니다(기본은 Live 스케일을 따름). **Title**은 악보 위와 PDF에 찍힙니다(비우면 탭 이름). **가사**(Ctrl+L 또는 **Lyrics**)는 음마다 한 음절씩 입력하고, 스페이스·Tab은 다음 음, Shift+Tab은 이전 음, **-**는 하이픈을 붙이고 다음 음, Enter는 끝입니다. 드럼 탭에도 코드 이름(직접 입력, 후보 없음)·조성·제목을 넣을 수 있어서 한 곡의 모든 파트를 같은 머리말로 뽑을 수 있습니다. 마디 번호는 1, 5, 9…마디에만 표시됩니다. 이 정보는 노트 편집을 Apply하든 안 하든 닫을 때 클립 옆에 저장되고, MIDI 자체는 바뀌지 않습니다.

**탭이 여러 개일 때.** Live에는 에디터를 닫을 때만 반영되므로, 탭을 옮겨 다녀도 탭마다 편집 내용이 남아 있습니다. 편집한 탭은 왼쪽 트랙 목록에 **Apply** 버튼이 켜집니다. 눌러 두면(주황색 ✓ Apply) 그 탭이 클립에 반영 대상이 됩니다. **Close & Apply**를 누르면 표시한 탭이 모두 Live 실행 취소 한 번으로 묶여 반영되고, 표시하지 않은 탭의 편집은 확인 후 버려집니다. 창의 × 버튼으로 닫으면 아무것도 반영되지 않으니 에디터의 Close 버튼을 쓰세요.

## 알려진 제한 (베타)

- Live의 Developer Mode가 켜져 있으면 Live가 설치된 익스텐션을 불러오지 않습니다(우클릭 메뉴 항목이 사라집니다). 설치한 `.ablx`를 쓰려면 Developer Mode를 끄세요.
- 겹쳐 울리는 음은 한 성부로 표기됩니다 (let ring 표시와 함께).
- 새 노트는 쉼표 자리에만 넣을 수 있습니다. 화음 음은 Shift + 프렛 클릭을 쓰세요.
- 트랙 보기와 선택 구간 보기에서 노트를 다른 클립으로 옮길 수는 없고, 어느 클립에도 속하지 않는 새 노트는 버려집니다. 선택 구간을 반영해도 선택 밖 노트의 저장된 운지는 그대로 둡니다.
- 노트가 수천 개인 긴 트랙은 그리는 데 몇 초가 걸립니다.

## 크레딧

- 악보 렌더링·재생: [alphaTab](https://alphatab.net) (MPL-2.0)
- 소리: alphaTab에 포함된 Sonivox 사운드폰트, Copyright (c) 2004-2006 Sonic Network Inc. (Apache-2.0)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT)
