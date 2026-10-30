# 에이전트 대시보드 (agent-dashboard)

에이전트=선수, 메인=코치. 2D canvas 웹, 외부 라이브러리 없음.

- **보기**: `node agent-dashboard/serve.js`(또는 `python agent-dashboard/serve.py`) → http://localhost:8090 (서버 없이 `index.html`만 열면 데모 모드 — 버튼으로 조작)
- **상태 넣기**: `curl -X POST http://localhost:8090/api/state -H "Content-Type: application/json" -d '{"agents":{"qa":{"active":true,"task":"회귀 검증"}},"coach":{"task":"NEXT 31"}}'` — 2초 안에 반영
- **자동 연동**: `.claude/settings.json`의 훅(PreToolUse Agent·SubagentStart/Stop·UserPromptSubmit·Stop)이 `hook.js`로 `state.json`을 갱신한다. 사용자가 조작하지 않아도 에이전트가 호출되면 선수가 뛰고, 끝나면 쉰다. 같은 역할이 병렬·여러 세션에서 동시에 돌면 인스턴스마다 선수가 추가로 나타나고(`QA#2` 등, 역할당 최대 2명까지 표시) 현황판에는 `QA ×2`로 합쳐진다. 정지 이벤트가 유실돼도 15분 뒤 자동 정리. `state.json` 쓰기는 `statefile.js`(잠금+원자적 쓰기)가 맡는다. 훅 변경은 창을 다시 불러온 뒤 적용.
- **세션 시작 자동 실행**: SessionStart 훅이 `start.js`를 돌려, 서버(8090)가 안 떠 있으면 백그라운드로 띄우고 브라우저를 한 번 연다. 이미 떠 있으면(다른 세션) 아무것도 하지 않는다. 브라우저를 열지 않으려면 `AGENT_DASH_NO_OPEN=1`, 포트는 `AGENT_DASH_PORT`. 서버는 세션이 끝나도 계속 떠 있다(끄려면 8090 프로세스 종료).
- **청소부**: `cleaner` 에이전트가 일하는 동안 청소부 캐릭터가 출근해 생수 채우기(병 잔량이 보임, 선수가 마시면 줄어듦) → 벤치 닦기 → 트랙 걸레질을 반복하고, 일이 끝나면 퇴근한다.
- **누적 바퀴(전광판)**: 새 Claude 세션(startup·clear)에서 0으로 리셋되고, 대시보드 탭이 열려 있는 동안 선수들의 자연 완주를 센다(탭이 없거나 숨겨지면 세지 않음 — 2026-10-30 사용자 확정). 10,000 미만은 전체 숫자, 이후 `12.3천`·`1백만`·`1십억`. 값은 `state.json`의 `stats`에 저장돼 새로고침 후에도 유지된다.
- **serve.py의 한계**: Node 서버(`serve.js`)가 표준이다. `serve.py`는 python만 있는 PC용 보조로, ① `/api/version`이 없어 코드가 바뀌어도 열린 탭이 자동 새로고침되지 않고 ② `state.json` 쓰기에 파일 잠금이 없어 훅과 동시에 쓰면 갱신이 유실될 수 있으며 ③ 이 저장소 PC에는 python이 없어 실행 시험을 하지 못했다(코드 읽기로만 검토).
- **id**: designer(design-reviewer) · qa(qa-verifier) · frontend(frontend-dev) · backend(backend-dev) · security · planner · pm · cleaner(청소부)

| 바퀴 | 연출 |
|---|---|
| 5+ | 땀 + "헉헉"(말풍선, 소리 켜면 호흡음) |
| 10+ | 기어가기 |
| 15+ | 트랙 밖으로 나가 휠체어로 재진입, 치어리더 "화이팅!" 파도타기, 쉬는 곳에서 누워 쉼 |
| 25 | 구급차 출동 → 들것으로 싣고 트랙 1바퀴 → 이송, 4초 뒤 벤치로 복귀(바퀴 0) |

시험용: 칩의 `+5바퀴`, 상단 속도 8x.
