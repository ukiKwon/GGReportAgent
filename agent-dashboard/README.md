# 에이전트 운동장 (agent-dashboard)

에이전트=선수, 메인=코치. 2D canvas 웹, 외부 라이브러리 없음.

- **보기**: `python agent-dashboard/serve.py` → http://localhost:8090 (서버 없이 `index.html`만 열면 데모 모드 — 버튼으로 조작)
- **상태 넣기**: `curl -X POST http://localhost:8090/api/state -H "Content-Type: application/json" -d '{"agents":{"qa":{"active":true,"task":"회귀 검증"}},"coach":{"task":"NEXT 31"}}'` — 2초 안에 반영
- **자동 연동**: `.claude/settings.json`의 SubagentStart/Stop·UserPromptSubmit·Stop 훅이 `hook.js`로 `state.json`을 갱신 — 서브에이전트가 돌면 해당 선수가 "기동", 끝나면 정지, 메인의 최근 요청은 전광판에 표시 (훅 변경은 창 다시 불러오기 후 적용)
- **id**: designer(design-reviewer) · qa(qa-verifier) · frontend(frontend-dev) · backend(backend-dev) · security · planner · pm

| 바퀴 | 연출 |
|---|---|
| 5+ | 땀 + "헉헉"(말풍선, 소리 켜면 호흡음) |
| 10+ | 기어가기 |
| 15+ | 트랙 밖으로 나가 휠체어로 재진입, 치어리더 "화이팅!" 파도타기, 쉬는 곳에서 누워 쉼 |
| 25 | 구급차 출동 → 들것으로 싣고 트랙 1바퀴 → 이송, 4초 뒤 벤치로 복귀(바퀴 0) |

시험용: 칩의 `+5바퀴`, 상단 속도 8x.
