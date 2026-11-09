# handoff/ 폴더 안내

세션이 바뀌어도 "어디까지 했고 다음에 뭘 할지"가 사라지지 않게 하는 기록 폴더입니다. 규칙 본문은 [`CLAUDE.md`](../CLAUDE.md) 4절이며, 이 문서는 어디에 무엇이 있는지만 안내합니다.

## 읽는 순서
1. **`START.md`** — 다음 세션 시작점(항상 최신 1개, 마무리 때 덮어씀). 오늘 끝난 것, 다음 할 일, 사용자 답 대기 질문, 정례 작업이 있습니다. SessionStart 훅이 맨 먼저 주입합니다.
2. **`NEXT.md`** — 열린 항목만 모은 이월 목록(항목당 현재·다음 한 걸음·자세히 3줄). 해소한 항목은 `done.md`로 옮깁니다.
3. 최근 `YYYY-MM-DD_summary.md` — 그날 한 일·결정·남은 것(하루 1파일, 같은 날은 `## Session HH:mm`으로 이어 붙임, 기존 섹션은 고치지 않음).

## 폴더 구성
| 위치 | 내용 |
|---|---|
| `START.md` / `NEXT.md` / `done.md` | 시작점 / 열린 항목 / 끝난 항목 |
| `YYYY-MM-DD_summary.md` | 날짜별 작업 기록(append-only) |
| `agents/` | 역할 에이전트 정의 해설·보고서. 보고서는 SubagentStop 훅(`.claude/hooks/save-report.js`)이 `agents/<역할>/`에 자동 저장 — [`agents/README.md`](agents/README.md) |
| `sessions/` | 여러 세션이 동시에 일할 때의 세션별 기록 — [`sessions/README.md`](sessions/README.md) |
| `archive/` | 슬림화 전 NEXT 전체본, 문의서 원문 등 보관본 |

## 사람이 보는 이력
- **PM 주간 이력** — [`docs/pm_history/index.html`](../docs/pm_history/index.html) 한 파일. 매주 금요일 PM이 그 주의 한 일·결정·요건 변경·숫자·열린 항목을 정리해 맨 위에 추가합니다. 브라우저로 열어 봅니다.

## 옛 체크포인트(2026-07)
이 폴더에는 원래 대시보드(`report/5-report.html`) 구현용 체크포인트(`작업일자일시.md`)만 있었습니다. 지금은 위 구조로 바뀌었고 옛 파일은 날짜별 summary와 함께 이력으로 남아 있습니다. 상세 사실 기록이 필요하면 [`data/`](../data/README.md) 폴더를 참고하세요.
