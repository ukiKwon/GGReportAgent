# 요구사항 파악 자료 만들기 (req-review)

현업과 기획안을 함께 보는 단일 HTML(`docs/요구사항 파악/index_YYYY-MM-DD.html`)을 만든다.
결과물 폴더에는 HTML만 두고, 만드는 도구는 이 폴더에 둔다.

## 언제

- **매주 금요일** PM 주간 보고와 함께 새 날짜 파일을 하나 만든다(CLAUDE.md 4절).
- 화면이 크게 바뀌었거나 현업 미팅 전에도 만든다. 지난 날짜 파일은 고치지 않는다.

## 역할

- `pm`: 이번 주 바뀐 기능·화면·규칙을 정리해 **문안**을 돌려준다 — `template.html`의 `STEPS`·`SCREEN_INFO`·`RULES`·`DECISIONS`(06 의사결정안 — 데이터·업무 판정 질문과 정한 답, 누가·언제·예, 사용자 요청 2026-11-13), `stories.json`의 단계 설명. 현업에게서 받은 의견 표(복사본)가 있으면 반영할 항목으로 정리한다.
- 메인: 문안을 적용하고 아래 순서로 캡처·빌드·커밋한다.

## 만드는 순서 (8080 서버·로컬 MySQL이 떠 있어야 한다)

```bash
export PATH="$PATH:/c/dev/node/node-v22.23.4-win-x64"
W=<임시 작업 폴더>; T=C:/github/GGReportAgent/tools/req-review; cd "$W"
node "$T/capture.mjs" "$W/p1"                     # 역할 5개 × 열린 메뉴 화면 → cap/
node "$T/stories.mjs" "$W/p2" "C:\github\GGReportAgent\docs\samples\수익성분석표_샘플_가짜값.xlsx"   # 사용 단계 → story/
REVIEW_DATE=$(date +%F) node "$T/build.mjs" "C:/github/GGReportAgent/docs/요구사항 파악/index_$(date +%F).html"
```

- 크롬을 헤드리스로 따로 띄운다(Playwright MCP 브라우저와 겹치지 않음). 프로필 폴더는 매번 새 경로를 준다.
- 캡처 뒤 `cap/`·`story/`의 이미지를 눈으로 확인한다(팝업이 덮였는지, 빈 화면인지).
- 이사회 단계는 로컬 DB에 이미 있는 시험 자료(`BOARD_ORG`, 기본 노원구 2026)를 연다. 그 건에 배정된 계정이 `BOARD_WRITER`(기본 `sales.member` 김영업)이고, 영업부장 읽기 전용 장은 `sales.head`로 찍는다.
- 서버에 쓰는 버튼(버전 저장·만들기·초안 내려받기)은 누르지 않는다(`stories.mjs`의 `NEVER`가 막는다). 엑셀은 `docs/samples`의 가짜값 파일만 쓴다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `cdp.mjs` | 크롬 DevTools 프로토콜 최소 도우미(외부 패키지 없음, Node 22 내장 WebSocket) |
| `capture.mjs` | 계정별 로그인 → 사이드바 메뉴 목록·화면 캡처 → `cap/index.json` |
| `stories.mjs` | 전국 지도 4단계 · 이사회 자료 작성 7단계 캡처 → `story/` (못 찾은 요소는 끝에 목록으로 출력, 종료 코드 2) |
| `stories.json` | 사용 단계 제목·설명·강조점 좌표(%) |
| `template.html` | 화면 틀과 문구(업무 흐름·화면 설명·규칙). 데이터는 `/*DATA*/null` 자리에 들어간다 |
| `build.mjs` | 이미지를 base64로 넣어 단일 HTML을 쓴다 |

## 현업 의견

의견은 보는 사람 브라우저(localStorage `gg-review-YYYY-MM-DD`, 빌드 날짜별)에만 저장된다. 날짜가 다르면 키가 달라 지난 파일의 의견이 섞이지 않는다. 현업에게 맨 아래 **표로 복사** 결과를 받아 다음 주 `pm` 정리의 입력으로 쓴다.
