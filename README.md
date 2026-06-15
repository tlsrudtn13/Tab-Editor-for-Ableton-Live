<img width="2904" height="1472" alt="Tab editor for ableton-title2" src="https://github.com/user-attachments/assets/7107e788-6803-43e3-8e26-32718d219390" />

# Tab Editor for Ableton Live

A built-in guitar/bass tablature & standard-notation editor for Ableton Live 12.
Converts MIDI clips into Guitar Pro–quality scores. (Powered by [alphaTab](https://alphatab.net))

> ⚠️ Beta (v0.9.0) — Runs in the Ableton Live 12 Extensions (beta) environment.

## Features

- MIDI clip → guitar/bass TAB + standard notation (toggle views)
- Three entry points: right-click a clip / arrangement selection / whole track
- Transpose · Capo · Instrument switching (6/7/8/12-string guitar, 4/5/6-string bass)
- Chord detection · Fretboard scale overlay · Inspector
- MusicXML 4.0–based engine · PDF export · AlphaTex export
- Dark / Light theme
  
<img width="2592" height="1664" alt="Tab editor for ableton-title" src="https://github.com/user-attachments/assets/c81eb22c-b148-4141-ba13-86b36bec207c" />

## Installation

1. Download the latest `.ablx` file from [Releases](../../releases)
2. Drag and drop the `.ablx` onto the Extensions page in Ableton Live's settings

## Usage

| Entry point | Action |
|---|---|
| Right-click a MIDI clip → Open (Clip) | Edit that clip only |
| Select an arrangement range, right-click → Open (Selection) | Edit the selected range only |
| Right-click a track name → Open (Track) | Edit the whole track |

## Development

```bash
# Place the Ableton Extensions beta SDK (.tgz) in the project root first
npm install
npm run build     # Production build
npm run start     # Launch Live Extension Host (development)
npm run package   # Create the .ablx package
```

## Known Limitations (Beta)

- Triplets/tuplets are approximated (precise notation is planned as a future editing feature)
- Overlapping notes (arpeggio let-ring) are written as a single voice
- No playback yet (score display only)

## License

MIT License — see [LICENSE](LICENSE).

## Credits

- Score rendering: [alphaTab](https://alphatab.net) (MPL-2.0)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT)

---

# Tab Editor for Ableton Live (한국어)

Ableton Live 12 내장형 기타/베이스 타브 & 표준 기보 편집기.
MIDI 클립을 Guitar Pro 수준의 악보로 변환합니다. ([alphaTab](https://alphatab.net) 기반)

> ⚠️ 베타 (v0.9.0) — Ableton Live 12 Extensions(베타) 환경에서 동작합니다.

## 주요 기능

- MIDI 클립 → 기타/베이스 TAB + 표준 오선보 (뷰 전환 지원)
- 3가지 진입점: 클립 우클릭 / 어레인지 선택영역 / 트랙 전체
- 트랜스포즈 · 카포 · 악기 전환 (6/7/8/12현 기타, 4/5/6현 베이스)
- 코드 감지 · 프렛보드 스케일 오버레이 · Inspector
- MusicXML 4.0 기반 엔진 · PDF 내보내기 · AlphaTex 내보내기
- 다크 / 라이트 테마

## 설치

1. [Releases](../../releases)에서 최신 `.ablx` 파일을 다운로드
2. Ableton Live 설정 → Extensions 페이지에 `.ablx`를 드래그 앤 드롭

## 사용법

| 진입점 | 동작 |
|---|---|
| MIDI 클립 우클릭 → Open (Clip) | 해당 클립만 편집 |
| 어레인지 범위 선택 후 우클릭 → Open (Selection) | 선택 구간만 편집 |
| 트랙 이름 우클릭 → Open (Track) | 트랙 전체 편집 |

## 개발

```bash
# Ableton Extensions 베타 SDK(.tgz)를 루트에 배치한 후
npm install
npm run build     # 프로덕션 빌드
npm run start     # Live Extension Host 실행 (개발)
npm run package   # .ablx 패키지 생성
```

## 알려진 제한 (베타)

- 셋잇단/잇단음표는 근사 표기 (정밀 표기는 추후 편집 기능으로 예정)
- 겹치는 음(아르페지오 let-ring)은 단일 성부로 표기
- 플레이백 없음 (악보 표시 전용)

## 라이선스

MIT License — [LICENSE](LICENSE) 참고.

## 크레딧

- 악보 렌더링: [alphaTab](https://alphatab.net) (MPL-2.0)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT)
