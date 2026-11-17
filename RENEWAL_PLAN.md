# Tab Editor for Ableton Live — 리뉴얼 계획 (2026-11-16)

기준 코드: `ableton-tab-editor V3.1` (v0.9.0, SDK 1.0.0-beta.0, alphaTab 1.8.x)

---

## 1. 지금 상태 요약

**잘 된 점**
- 진입점 3종(클립 / 어레인지 선택 / 트랙)과 우클릭 메뉴가 이미 동작한다.
- MusicXML·AlphaTex 생성, 6~12현 기타와 4~6현 베이스, 카포, 트랜스포즈, 코드 감지, 프렛보드 스케일 오버레이, PDF 출력까지 있다.
- 음역 밖 음(oor)을 괄호와 노란색으로 따로 표시한다.

**문제점 (코드에서 확인한 것)**
| # | 문제 | 위치 |
|---|---|---|
| 1 | 버전 관리 없이 폴더 복사로 관리 (V2 / V3 / V3.1 / old). V3에는 `.txt` 사본이 섞여 있다. | 상위 폴더 |
| 2 | 보이싱이 화음 하나 단위의 탐욕 알고리즘이다. 앞뒤 음을 보지 않아서 포지션이 자주 튄다 (0~5프렛 우선 규칙 하나뿐). | `src/notation/voicing.ts` |
| 3 | 사용자가 TAB에서 줄을 옮겨도(▲/▼) 저장되지 않는다. 다시 열면 처음 상태로 돌아간다. | `ui/src/main.ts` |
| 4 | 편집 결과를 Live 클립에 되돌려 쓰는 기능이 없다 (보기 전용). | `src/extension.ts` |
| 5 | 클립 모드에서 루프 구간과 start marker를 무시하고 노트 전체를 0박부터 읽는다. | `notesFromClip` |
| 6 | "Open (Track)"이 우클릭한 트랙이 아니라 곡의 모든 트랙을 연다. | `tabeditor.open` |
| 7 | 셋잇단은 근사, 겹치는 음은 단일 성부로 처리한다. | README 알려진 제한 |
| 8 | 재생 버튼은 있지만 사운드폰트를 지정하지 않아서 사실상 소리가 안 난다. | `createApi()` |
| 9 | 열 때마다 2.7MB HTML 파일을 임시 폴더에 새로 쓴다. | `showEditor` |
| 10 | `main.ts` 1,216줄 단일 파일에 `@ts-nocheck`. 테스트가 없다. | `ui/src/main.ts` |

---

## 2. 바깥 상황 (웹 조사)

**Ableton Extensions SDK**
- 2026-06-02 Live 12.4.5 Suite 베타와 함께 공개됐다. 이후 베타 노트에 나온 변경은 작다: Node.js 24.22.1 (12.4.25b1), `fetch` 계열 전역 객체 추가, `showModalDialog`가 호출 사이에 데이터를 유지하지 않음, `renderPreFxAudio` 정규화 제거.
- 패널이나 비모달 창, 트랜스포트·재생 위치 API는 여전히 보이지 않는다. **UI는 모달 하나뿐이라고 보고 설계해야 한다** (모달이 열려 있는 동안 Live 조작 불가).
- 로컬 SDK 문서 기준으로 쓸 수 있는데 아직 안 쓰는 것:
  - `Song.rootNote / scaleIntervals / scaleName` → Live의 Scale 설정을 스케일 오버레이 기본값으로 사용
  - `Song.cuePoints` → 로케이터 이름을 악보 섹션 표시(리허설 마크)로 사용
  - `Song.gridQuantization / gridIsTriplet` → 퀀타이즈 기본값, 셋잇단 힌트
  - `Clip.loopStart / loopEnd / startMarker / endMarker`, `NoteDescription.muted / probability`
  - `showModalDialog`는 결과를 돌려받을 수 있다 (HTML에서 메시지 post) → 편집 결과 반환에 사용
- ~~Live용 TAB/악보 익스텐션이 따로 보이지 않았다~~ → **틀렸다 (11-16 재조사).** 이미 경쟁작이 있다:

| 익스텐션 | 내용 | 한계 |
|---|---|---|
| **AbleTab** (madisonrickert, MIT, ★19, 2026-07) | MIDI 클립 → TAB. 운지는 **HMM/Viterbi 엔진 `tutts`**(tuttut 포트)로 클립 전체에서 쉬운 경로 선택. 프리셋 7종(Drop D, DADGAD, Open G, 7현, 베이스, 우쿨렐레) + 4~8현 커스텀 튜닝, 퀀타이즈, 음역 밖이면 옥타브 이동 제안. PDF / ASCII 출력. | 고정폭 텍스트 TAB(오선 없음). **읽기 전용**. 박자는 첫 씬 기준. |
| **Ableton Sheet Music Extension** (같은 개발자, ★47) | OSMD로 오선보. 이조 악기(B♭/E♭/F) 프리셋, 음자리표 자동, 퀀타이즈 자동 검출. PDF/PNG/MusicXML. vitest 단위 테스트. | TAB 없음. 읽기 전용. 박자 4/4 기본. |
| **Notation** (Adam Murray, 무료, 다운로드 1,226) | 클립/슬롯/씬/트랙/선택영역 → 악보. 여러 클립은 각자 보표. 퀀타이즈·박자·레가토 조절. PNG/SVG/MusicXML. (상위 폴더의 `Notation-1.0.0.ablx`가 이것으로 보인다) | TAB 없음, 편집 없음. |

- 같은 저장소의 **Mutate** 익스텐션은 결과를 **새 테이크 레인에 써 넣는다** → SDK로 노트 쓰기가 실제로 가능하다는 증거. P2 위험이 줄었다.
- 결론: "Live 안에서 MIDI를 TAB으로 본다"는 것 자체로는 차별화가 안 된다. 세 경쟁작 모두 **읽기 전용**이고, TAB 경쟁작(AbleTab)은 **텍스트 TAB에 오선·기법 표기가 없다.** 우리의 자리는 여기다.

**다른 TAB 도구**
| 도구 | 강점 | 약점 (우리 기회) |
|---|---|---|
| Guitar Pro 8 | 편집·기법 표기·사운드 최상급. MIDI 0/1 임포트, 퀀타이즈, 오디오 임포트. | DAW 밖 별도 프로그램. MIDI 임포트 후 운지는 손으로 다시 잡아야 한다. 한 방향(가져오기만). |
| Songsterr | 웹 재생, 리비전 비교, 플레이리스트, AI 오디오→탭(미확인 보도). | 감상·연습용. 작곡 중인 내 MIDI와 연결이 없다. |
| MuseScore 4 / TuxGuitar | 무료, TAB 보표 지원. | MIDI→TAB 운지 품질이 낮고 DAW 연동 없음. |
| Logic Pro Score Editor | DAW 안에서 MIDI 리전을 TAB으로 볼 수 있다. | Logic 전용, 기타 기법 표기와 운지 최적화가 약하다. |
| guitar2tabs·Klangio 류 AI | 오디오에서 바로 탭. | 결과 수정이 불편하고 월 사용량 제한. |

정리하면, 경쟁 도구는 "악보 프로그램"이고 우리는 "Live 안에서 작곡하는 사람이 기타/베이스 파트를 연주 가능한 TAB으로 확인·다듬는 도구"다. 악보 편집 기능으로 Guitar Pro를 따라가면 진다. Live 연동과 운지 품질로 이겨야 한다.

---

## 3. 차별화 포인트 (우선순위 순, 11-16 경쟁작 반영해 수정)

1. **편집 가능한 TAB + 양방향 왕복** — 경쟁작 3개 모두 읽기 전용이다. 모달이 닫힐 때 결과 JSON을 돌려받아 (a) TAB 레이어(줄 선택, 기법, 고정 표시)를 저장하고 (b) 옵션으로 노트 변경을 클립(또는 Mutate처럼 새 테이크 레인)에 쓴다. 다시 열면 사용자가 잡은 운지가 그대로 있어야 한다. **가장 큰 무기.**
2. **Guitar Pro급 렌더링** — 오선 + TAB 동시 표시, 기법 기호, 프렛보드, 코드 이름. AbleTab은 고정폭 텍스트 TAB이다. 이미 alphaTab으로 갖고 있는 강점이니 유지·강화한다.
3. **기법 표기 + MIDI 기반 기법 추정 (힌트로만)** — 겹치는 레가토 → 해머온/풀오프 후보, 짧고 약한 음 → 고스트/팜뮤트 후보, `muted` 노트 → 데드 노트. "제안"으로 띄우고 클릭으로 받아들인다. 경쟁작에는 기법 개념이 없다.
4. **Live 정보를 쓰는 악보 + 밴드 스코어** — 로케이터 이름은 섹션 마크, Live Scale은 스케일 오버레이, 그리드 설정은 퀀타이즈 기본값. 트랙/선택영역 모드로 기타·베이스를 한 화면에서 본다 (AbleTab은 클립 하나).
5. **`.gp` / MusicXML 내보내기** — GP·Songsterr·MuseScore로 넘기는 앞단 도구. AbleTab은 PDF/ASCII뿐.
6. **운지 최적화 (따라잡기 항목)** — AbleTab이 이미 Viterbi(`tutts`)를 쓴다. 차별화가 아니라 **최소한 같은 수준**이어야 하는 항목. 직접 만들기 전에 `tutts` / `tuttut` 라이선스(MIT 여부)를 확인해서 가져다 쓰는 쪽을 먼저 검토하고, 그 위에 "사용자 고정 음"과 스타일 프리셋을 얹는다. 튜닝 프리셋(Drop D, DADGAD, Open G, 우쿨렐레)도 맞춘다.

하지 않을 것: 오디오→탭 AI 변환, Live 재생과의 실시간 동기화(API 없음), GP 수준의 전체 악보 편집기.

---

## 4. 단계별 계획

### P0. 정리 (1~2일)
1. `V3.1`을 단일 소스로 정하고 `git init`. V2/V3/old는 태그나 `archive/`로 보관.
2. 최신 Live 베타에 맞는 SDK 패키지로 교체하고 빌드 확인 (Node 24).
3. `ui/src/main.ts`를 모듈로 분리: `render/`, `fretboard/`, `inspector/`, `export/`, `state/`. `@ts-nocheck` 제거.
4. `src/notation/`에 vitest 단위 테스트 추가 (보이싱, 퀀타이즈, MusicXML 스냅샷). 테스트용 MIDI 픽스처 10개 정도(아르페지오, 파워코드, 베이스 라인, 셋잇단, 레가토).

**P0 결과 (2026-11-16 완료)**: git 저장소 생성(`.env`, SDK `.tgz` 제외), 구버전 폴더는 `../_archive/`로 이동, vitest 29개, `main.ts` → 모듈 11개 분리(동작 변경 없음, 미리보기로 확인), 미리보기 도구 `scripts/preview.ts` + `scripts/serve.mjs`, Auto 길이 버튼 버그 수정.
남은 P0 항목: 최신 SDK 교체(베타 프로그램 로그인이 필요해서 직접 받아야 함), `@ts-nocheck` 제거(모듈별로 P1 진행하면서).

### P1. 정확도 (1~2주)
0. **P0에서 찾은 버그 먼저** (테스트에 `it.fails`로 고정해 둠):
   - 베이스 프리셋이 한 옥타브 높게 잡혀 있다. 실제 음역(E1=28)으로 쓴 베이스 라인이 전부 "음역 밖"으로 접혀 노란 괄호로 나온다. → 수정됨 (2026-11-17): 4·5·6현 베이스 프리셋을 실제 음높이(E1=28)로 내림. Live 에디터에서 4현 베이스로 확인.
   - 퀀타이즈 자동 감지가 점8분 간격(0.75박)에서 4분음표 격자를 고른다. 멜로디 음이 서로 겹쳐 화음으로 합쳐진다. → 수정됨 (2026-11-17): 음 시작점이 실제로 놓이는 가장 굵은 격자를 고르도록 바꿈. 실제 Live 클립으로 확인.
1. 운지 최적화 엔진 `src/notation/fingering/` — `tutts` 채택 검토 먼저, 안 맞으면 직접 Viterbi(비용 함수 + 프리셋 + 사용자 고정 음). 기존 `applyGuitarVoicing`은 폴백으로 남긴다. AbleTab과 같은 픽스처로 결과 비교.
1-b. 튜닝 프리셋 추가 (Drop D, DADGAD, Open G, 우쿨렐레, 커스텀).
2. 클립 루프/마커 반영, "Open (Track)"은 우클릭한 트랙만 열고 "Open (All Tracks)" 메뉴를 따로 둔다.
3. 셋잇단 검출 (그리드 오차 비교로 1/8T·1/16T 판정), `gridIsTriplet` 힌트 사용.
4. 겹치는 음 처리: let-ring 표기 또는 2성부 분리 옵션.
5. Live Scale / 로케이터 / 그리드 값을 페이로드에 실어 UI 기본값으로 사용.

### P2. 양방향 (1주)
1. **먼저 실험**: `showModalDialog` 반환값으로 JSON을 받는지, `MidiClip.notes` 쓰기가 되는지 작은 테스트 익스텐션으로 확인.
2. TAB 레이어 저장: `storageDirectory`에 클립별 JSON (키 = 트랙 이름 + 클립 이름 + 노트 해시). 노트가 바뀌면 일치하는 음만 복원.
3. "Apply to Clip" 버튼: 트랜스포즈·퀀타이즈·노트 수정 결과를 클립에 반영 (되돌리기 가능한 범위에서만, 덮어쓰기 전 확인).

### P3. 표현과 내보내기 (1~2주)
1. 기법 팔레트: H/P, 슬라이드, 벤드, PM, let ring, 비브라토, 데드 노트. TAB 레이어에 저장하고 MusicXML·AlphaTex에 반영.
2. 기법 추정 제안 (차별화 4번).
3. `.gp` 내보내기, MusicXML 내보내기 정리.
4. 재생: 작은 사운드폰트를 넣어 alphaTab 플레이어를 실제로 동작시키고, 구간 반복·속도 조절 추가. (모달 안에서만 재생)

### P4. 출시 준비 (3~5일)
1. UI HTML을 버전 해시 이름으로 한 번만 쓰고 데이터만 따로 주입해서 열기 속도 개선.
2. 1,000노트 이상 트랙 성능 측정, 큰 곡은 구간 단위 렌더.
3. README·데모 GIF 갱신, 0.9 → 1.0 릴리스, 베타 테스터(기타/베이스 작곡자) 피드백.

---

## 5. 먼저 확인할 것 (위험 요소)
- `MidiClip.notes` 쓰기와 모달 반환값이 실제로 되는지. 안 되면 P2는 TAB 레이어 저장만 하고 클립 반영은 뺀다.
- 최신 베타 SDK에서 API 이름이 바뀌었는지 (`initialize(activation, "1.0.0")` 버전 문자열 포함).
- alphaTab `.gp` 익스포터가 현재 버전에서 기법 표기를 어디까지 보존하는지.
- 웹 조사는 일부 검색이 실패해서 Guitar Pro 8.x 최신 변경과 Songsterr AI 기능은 공식 자료로 다시 확인하지 못했다.

## 출처
- [madisonrickert/abletab](https://github.com/madisonrickert/abletab)
- [madisonrickert/ableton-sheet-music-extension](https://github.com/madisonrickert/ableton-sheet-music-extension)
- [adamjmurray/ableton-extensions-experiments](https://github.com/adamjmurray/ableton-extensions-experiments)
- [liveextensions.co — Notation](https://liveextensions.co/extensions/notation)
- [GitHub topic: ableton](https://github.com/topics/ableton?l=typescript&o=desc&s=stars)
- [Live 12 Beta Release Notes](https://www.ableton.com/en/release-notes/live-12-beta/)
- [Ableton Extensions SDK — Public Beta](https://ableton.github.io/extensions-sdk/)
- [Sonic State: Ableton Opens Up Live Extensions With SDK](https://sonicstate.com/news/2026/06/02/ableton-opens-up-java-extensions-sdk-/)
- [KVR: Ableton announces Extensions SDK](https://www.kvraudio.com/news/ableton-announces-extensions-sdk---an-experimental-playground-inside-live-suite-67183)
- [federico-pepe/ableton-live-extensions](https://github.com/federico-pepe/ableton-live-extensions)
- [Guitar Pro 8: Importing MIDI](https://www.guitar-pro.com/docs/gp8/import-export/import/import-midi)
- [Guitar Pro 8.1 update](https://guitar-pro.com/blog/p/38236-new-free-updade-guitar-pro-8-1-is-available)
- [Songsterr 6.5.7 (APKMirror)](https://www.apkmirror.com/apk/songsterr/songsterr-guitar-tabs-chords/songsterr-guitar-tabs-chords-6-5-7-release/)
- [iTechGuides: Best Guitar Tab Software 2026](https://www.itechguides.com/best/guitar-tab-software/)
- [Logic Pro Score Editor features](https://logicstudiotraining.com/logic-pro-score-editor-features/)
