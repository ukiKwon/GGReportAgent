# 에이전트 대시보드 (agent-dashboard)

에이전트=선수, 메인=코치. 2D canvas 웹, 외부 라이브러리 없음.

- **보기**: `node agent-dashboard/serve.js`(또는 `python agent-dashboard/serve.py`) → http://localhost:8090 (서버 없이 `index.html`만 열면 데모 모드 — 버튼으로 조작)
- **상태 넣기**: `curl -X POST http://localhost:8090/api/state -H "Content-Type: application/json" -d '{"agents":{"qa":{"active":true,"task":"회귀 검증"}},"coach":{"task":"NEXT 31"}}'` — 2초 안에 반영
- **자동 연동**: `.claude/settings.json`의 훅(PreToolUse Agent·SubagentStart/Stop·UserPromptSubmit·Stop)이 `hook.js`로 `state.json`을 갱신한다. 사용자가 조작하지 않아도 에이전트가 호출되면 선수가 뛰고, 끝나면 쉰다. 같은 역할이 병렬·여러 세션에서 동시에 돌면 인스턴스마다 선수가 추가로 나타나고(`QA#2` 등, 역할당 최대 2명까지 표시) 현황판에는 `QA ×2`로 합쳐진다. 정지 이벤트가 유실돼도 15분 뒤 자동 정리. `state.json` 쓰기는 `statefile.js`(잠금+원자적 쓰기)가 맡는다. 훅 변경은 창을 다시 불러온 뒤 적용.
- **세션 시작 자동 실행**: SessionStart 훅이 `start.js`를 돌려, 서버(8090)가 안 떠 있으면 백그라운드로 띄우고 브라우저를 한 번 연다. 이미 떠 있으면(다른 세션) 아무것도 하지 않는다. 브라우저를 열지 않으려면 `AGENT_DASH_NO_OPEN=1`, 포트는 `AGENT_DASH_PORT`. 서버는 세션이 끝나도 계속 떠 있다(끄려면 8090 프로세스 종료).
- **청소부**: `cleaner` 에이전트가 일하는 동안 청소부 캐릭터가 출근해 생수 채우기(병 잔량이 보임, 선수가 마시면 줄어듦) → 벤치 닦기 → 트랙 걸레질을 반복하고, 일이 끝나면 퇴근한다. 누워 쉰 지 3초(배속 따름)가 지난 선수가 있으면 수도에서 물을 받아 부어 깨운다. 1분에 한 번만 돈다(배속 따름) — 한 번 돌 때 누워 있는 사람은 차례로 모두 깨우고, 다음 번은 마지막으로 실제로 깨운 붓기가 끝나고 60초 뒤다(아무도 못 깨운 회차는 쿨다운 없음)(휠체어·구급차 장면이 사라지지 않게). cleaner가 일하지 않을 때도 연출로만 오른쪽에서 나오는데, 이때 현황판·칩은 '대기'로 표시된다. 물을 맞은 선수는 바퀴 수는 그대로이고 피로가 풀려 벤치로 돌아가고, 다시 일을 받으면 정상으로 달린다(판정 = 바퀴 − 물 맞은 시점 바퀴). 구급차가 출동 중이면 기다린다. OS의 '움직임 줄이기' 설정이 켜져 있으면 이동 없이 깨운다.
- **마무리 수동 실행(`closing.js`)**: `node agent-dashboard/closing.js [--dry] [--merge] [--now]` — 18:00 스케줄러는 인자 없이 실행한다. `--now`는 사용자가 직접 지시한 수동 실행에서 '최근 10분 안 사용자 프롬프트' 대기를 건너뛰는 옵션이다(다른 에이전트가 작업 중이면 여전히 대기·건너뜀. 푸시·병합 제한은 그대로).
- **누적 바퀴(전광판)**: 새 Claude 세션(startup·clear)에서 0으로 리셋되고, 대시보드 탭이 열려 있는 동안 선수들의 자연 완주를 센다(탭이 없거나 숨겨지면 세지 않음 — 2026-10-30 사용자 확정). 10,000 미만은 전체 숫자, 이후 `12.3천`·`1백만`·`1십억`. 값은 `state.json`의 `stats`에 저장돼 새로고침 후에도 유지된다.
- **serve.py의 한계**: Node 서버(`serve.js`)가 표준이다. `serve.py`는 python만 있는 PC용 보조로, ① `/api/version`이 없어 코드가 바뀌어도 열린 탭이 자동 새로고침되지 않고 ② `state.json` 쓰기에 파일 잠금이 없어 훅과 동시에 쓰면 갱신이 유실될 수 있으며 ③ 이 저장소 PC에는 python이 없어 실행 시험을 하지 못했다(코드 읽기로만 검토).
- **사용자에게 물은 질문 장부**(2026-11-15) — **화면 패널은 같은 날 사용자 요청으로 뺐다**(답 자동 기록 오작동, 1b486a1). 아래 장부·훅·`/api/questions`는 남아 있고 패널 설명은 기록용이다. 정본은 저장소 루트 `handoff/questions.json`(git 추적)이고, 서버는 `GET /api/questions`로 그 파일 하나만 읽어 `{"questions":[...]}`로 돌려준다(읽기 전용 — POST 등은 405, 256KB 초과·파일 없음·깨진 JSON은 200 + 빈 목록 + `error`, 화면은 직전 목록 유지). 화면은 30초마다 자동 확인(사용자 11-15, 패널 머리 '↻ 새로고침'은 즉시 다시 읽고 '확인 HH:MM:SS'를 갱신)이라 파일을 고치면 새로고침 없이 반영된다. 1100px 이상은 오른쪽 고정 열, 미만은 상단 '질문 n' 버튼 서랍. 탭 [미응답 n](open·hold, 최근에 물은 순) | [응답 n](answered 최근 답한 순 + 맨 아래 '해소된 질문' 접기 = done). 항목: `id, summary, askedAt, next[], options, recommend, status(open 미답|hold 보류|answered 답함·반영 대기|done 해소), answer, answeredAt, appliedRef, source?, answerSource?`. **기록**(`.claude/hooks/capture-questions.js`): Stop 훅이 `🙋 **물어볼게:**` 블록·AskUserQuestion 질문을 open으로 추가(`source:"auto"`), UserPromptSubmit 훅(`answer` 모드)이 바로 다음 사용자 입력을 그 질문의 답으로 answered 처리(`answerSource:"auto"`, 비밀값·이메일·전화·계좌·IP·토큰 가림, 300자). 메인은 반영 커밋 뒤 done + appliedRef, 자동 답이 틀리면 정정. 훅 변경은 창을 다시 불러온 세션부터 적용.
- **id**: designer(design-reviewer) · qa(qa-verifier) · frontend(frontend-dev) · backend(backend-dev) · security · planner · pm · auditor(data-auditor) · cleaner(청소부)

| 바퀴 | 연출 |
|---|---|
| 5+ | 땀 + "헉헉"(말풍선, 소리 켜면 호흡음) |
| 10+ | 기어가기 |
| 15+ | 트랙 밖으로 나가 휠체어로 재진입, 치어리더 "화이팅!" 파도타기, 쉬는 곳에서 누워 쉼 → 3초 뒤(쿨다운 중이면 다음 회차까지 대기) 청소부가 물을 부어 깨움(피로 0, 바퀴 수 유지, 1분에 한 번) |
| 25 | 구급차 출동 → 들것으로 싣고 트랙 1바퀴 → 이송, 4초 뒤 벤치로 복귀(바퀴 수 유지, 피로만 회복) |

시험용: 칩의 `+5바퀴`, 상단 속도 8x.
