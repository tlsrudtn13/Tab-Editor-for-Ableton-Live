# Tab Editor for Ableton Live

A guitar/bass tablature and standard-notation editor that runs inside Ableton Live 12.
Opens a MIDI clip or track as staff + TAB, lets you fix the part, and writes the changes back to the clip.
Score rendering by [alphaTab](https://alphatab.net).

> Beta (v0.11.0). Needs Ableton Live 12 with Extensions (beta) enabled.

## Features

**Viewer**
- Staff + TAB, TAB only or staff only. Dark and light themes.
- Fingering that follows the hand position across a phrase, so runs and solos stay in one position.
- Bass clips open as 4-string bass automatically. Other instruments: 7/8/12-string guitar, 5/6-string bass.
- Tunings: Standard, Drop D, Eb, D Standard, Drop C, DADGAD, Open G, Open D; bass Drop D and Eb. Capo.
- Rhythm: automatic grid (1/8, 1/16, 1/32) including 8th and 16th triplets.
- Key signature from Live's Scale Mode; no guessed sharps on short riffs.
- Time signatures 4/4, 3/4, 2/4, 5/4, 6/8, 7/8, 9/8, 12/8 (Session clips use their scene's signature).
- Shows only the clip's loop region. Live locators appear as rehearsal marks.
- Fretboard with scale overlay, chord names, note table, playback, PDF and AlphaTex export.

**Editing (Open (Clip) and Open (Track))**

| Key | Action |
|---|---|
| ← / → | Select previous / next note |
| Shift + ← / → | Move the note one grid step earlier / later (Ctrl + Shift: one beat) |
| ↑ / ↓ | Pitch up / down a semitone (Shift: an octave) |
| Alt + ↑ / ↓ | Move the note to another string (kept the next time you open the clip) |
| 0–9 | Type a fret on the current string (two digits within 0.4 s) |
| `[` / `]` | Shorter / longer by one grid step; `D` extends to the next note |
| Delete | Delete the note |
| Ctrl + D | Duplicate the note |
| Ctrl + Z | Undo the last edit in the editor |
| Ctrl + Enter | Apply to Clip |
| L / P / H / S / X / V | Let ring, palm mute, hammer-on/pull-off, slide, dead note, vibrato (toggle) |
| B | Bend: ½ → full → 1½ → off |
| Esc | Clear the selection |

Clicking a fret on the fretboard moves the selected note there.
**Adding notes:** click a rest in the score (a dashed box marks the spot), then click a fret on the
fretboard or type a fret number; Alt + ↑ / ↓ picks the string first. Shift + click a fret adds a chord
tone to the selected note.
**Techniques** are shown on the score, saved with the clip's TAB layout, and do not change the MIDI.
Overlapping arpeggio notes are marked let ring automatically.
**Apply to Clip** writes only the notes you changed. Notes whose pitch you changed keep their original
(unquantized) timing. The whole apply is one step in Live's Undo. If the clip changed in Live while the
editor was open, nothing is written and Live shows a message.

String choices, tuning, capo and time signature are saved per clip and restored when you open it again.

## Install

1. Download the `.ablx` file from [Releases](../../releases).
2. In Live, open Settings → Extensions and drop the `.ablx` file on the page.

## Use

| Right-click | Menu item | Opens |
|---|---|---|
| A MIDI clip | Open (Clip) | That clip's loop region, editable |
| An arrangement selection on a MIDI track | Open (Selection) | The selected range (view only) |
| A MIDI track | Open (Track) | All arrangement clips on that track, editable (Apply to Clips writes each clip) |
| An audio track or a scene | Open (All Tracks) | Every MIDI track (view only) |

Click inside the editor once before pressing Play: the browser engine starts audio only after a click.

## Known limitations (beta)

- Overlapping notes are written as one voice (with a let-ring mark).
- New notes go only into rests; use Shift + fret click for chord tones.
- Selection view and Open (All Tracks) cannot write back. In track view a note cannot move from one clip into another.
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

> 베타 (v0.11.0). Extensions(베타)가 켜진 Ableton Live 12가 필요합니다.

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

**편집 (Open (Clip)과 Open (Track))**

| 키 | 동작 |
|---|---|
| ← / → | 이전/다음 노트 선택 |
| Shift + ← / → | 노트를 그리드 한 칸 앞/뒤로 이동 (Ctrl + Shift: 한 박) |
| ↑ / ↓ | 반음 올림/내림 (Shift: 한 옥타브) |
| Alt + ↑ / ↓ | 다른 줄로 이동 (다음에 열 때도 유지) |
| 0–9 | 현재 줄의 프렛 입력 (0.4초 안에 두 자리) |
| `[` / `]` | 그리드 한 칸 짧게/길게, `D`는 다음 노트까지 늘림 |
| Delete | 노트 삭제 |
| Ctrl + D | 노트 복제 |
| Ctrl + Z | 에디터 안에서 마지막 편집 되돌리기 |
| Ctrl + Enter | 클립에 반영 (Apply to Clip) |
| L / P / H / S / X / V | let ring, 브리지 뮤트, 해머링·풀링, 슬라이드, 데드 노트, 비브라토 (켜고 끄기) |
| B | 벤드: ½ → 온음 → 1½ → 끄기 |
| Esc | 선택 해제 |

프렛보드의 칸을 누르면 선택한 노트가 그 자리로 옮겨집니다.
**노트 추가:** 악보의 쉼표를 누르면 점선 상자로 자리가 표시됩니다. 프렛보드의 칸을 누르거나 프렛 번호를
치면 그 자리에 노트가 들어갑니다. 줄은 Alt + ↑ / ↓로 먼저 고릅니다. 노트를 고른 상태에서 Shift를 누른 채
프렛을 누르면 같은 박에 화음 음이 추가됩니다.
**기법 표기**는 악보에 그려지고 클립의 TAB 설정과 함께 저장되며, MIDI는 바꾸지 않습니다.
겹쳐 울리는 아르페지오에는 let ring이 자동으로 붙습니다.
**Apply to Clip**은 바꾼 노트만 클립에 씁니다. 음높이만 바꾼 노트는 원래(퀀타이즈 전) 타이밍을 유지합니다.
한 번의 반영은 Live 실행 취소 한 단계입니다. 에디터가 열려 있는 동안 Live에서 클립이 바뀌었다면
아무것도 쓰지 않고 안내 메시지를 띄웁니다.

고른 줄, 튜닝, 카포, 박자표는 클립마다 저장되어 다시 열 때 복원됩니다.

## 설치

1. [Releases](../../releases)에서 `.ablx` 파일을 받습니다.
2. Live 설정 → Extensions 페이지에 `.ablx` 파일을 끌어다 놓습니다.

## 사용

| 우클릭 위치 | 메뉴 | 열리는 범위 |
|---|---|---|
| MIDI 클립 | Open (Clip) | 그 클립의 루프 구간, 편집 가능 |
| MIDI 트랙의 어레인지 선택 구간 | Open (Selection) | 선택 구간 (보기 전용) |
| MIDI 트랙 | Open (Track) | 그 트랙의 모든 어레인지 클립, 편집 가능 (Apply to Clips가 클립마다 반영) |
| 오디오 트랙 또는 씬 | Open (All Tracks) | 모든 MIDI 트랙 (보기 전용) |

재생하기 전에 에디터 안을 한 번 클릭하세요. 브라우저 엔진은 클릭이 있어야 소리를 냅니다.

## 알려진 제한 (베타)

- 겹쳐 울리는 음은 한 성부로 표기됩니다 (let ring 표시와 함께).
- 새 노트는 쉼표 자리에만 넣을 수 있습니다. 화음 음은 Shift + 프렛 클릭을 쓰세요.
- 선택 구간 보기와 Open (All Tracks)에서는 클립에 반영할 수 없습니다. 트랙 보기에서 노트를 다른 클립으로 옮길 수는 없습니다.
- 노트가 수천 개인 긴 트랙은 그리는 데 몇 초가 걸립니다.

## 크레딧

- 악보 렌더링·재생: [alphaTab](https://alphatab.net) (MPL-2.0)
- 소리: alphaTab에 포함된 Sonivox 사운드폰트, Copyright (c) 2004-2006 Sonic Network Inc. (Apache-2.0)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT)
