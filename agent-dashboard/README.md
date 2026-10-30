# 에이전트 대시보드 (agent-dashboard)

에이전트=선수, 메인=코치. 2D canvas 웹, 외부 라이브러리 없음.

- **보기**: `node agent-dashboard/serve.js`(또는 `python agent-dashboard/serve.py`) → http://localhost:8090 (서버 없이 `index.html`만 열면 데모 모드 — 버튼으로 조작)
- **상태 넣기**: `curl -X POST http://localhost:8090/api/state -H "Content-Type: application/json" -d '{"agents":{"qa":{"active":true,"task":"회귀 검증"}},"coach":{"task":"NEXT 31"}}'` — 2초 안에 반영
- **자동 연동**: `.claude/settings.json`의 훅(PreToolUse Agent·SubagentStart/Stop·UserPromptSubmit·Stop)이 `hook.js`로 `state.json`을 갱신한다. 사용자가 조작하지 않아도 에이전트가 호출되면 선수가 뛰고, 끝나면 쉰다. 같은 역할이 병렬·여러 세션에서 동시에 돌면 인스턴스마다 선수가 추가로 나타나고(`QA#2` 등, 역할당 최대 2명까지 표시) 현황판에는 `QA ×2`로 합쳐진다. 정지 이벤트가 유실돼도 15분 뒤 자동 정리. `state.json` 쓰기는 `statefile.js`(잠금+원자적 쓰기)가 맡는다. 훅 변경은 창을 다시 불러온 뒤 적용.
- **id**: designer(design-reviewer) · qa(qa-verifier) · frontend(frontend-dev) · backend(backend-dev) · security · planner · pm

| 바퀴 | 연출 |
|---|---|
| 5+ | 땀 + "헉헉"(말풍선, 소리 켜면 호흡음) |
| 10+ | 기어가기 |
| 15+ | 트랙 밖으로 나가 휠체어로 재진입, 치어리더 "화이팅!" 파도타기, 쉬는 곳에서 누워 쉼 |
| 25 | 구급차 출동 → 들것으로 싣고 트랙 1바퀴 → 이송, 4초 뒤 벤치로 복귀(바퀴 0) |

시험용: 칩의 `+5바퀴`, 상단 속도 8x.
