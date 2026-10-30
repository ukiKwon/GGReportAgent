# 에이전트 작업 기록 — 소통 규칙

에이전트별 작업 기록을 `handoff/agents/<에이전트 이름>/`에 둔다. 에이전트 정의는 `.claude/agents/`.
(여러 **세션**이 동시에 돌 때의 기록은 `handoff/sessions/`와 `CLAUDE.md` "여러 세션 동시 작업"을 따른다 —
이 폴더는 **에이전트** 단위다.)

## 모든 에이전트는 읽기 전용이다

에이전트 정의 안의 훅(쓰기 경로 차단)은 이 환경에서 **한 번도 실행되지 않았다**(NEXT.md 31번 시험). 그래서 훅에 기대지 않고
**도구 목록에서 `Write`·`Edit`·`Bash`·`Agent`를 빼는 방식**으로 막는다. Playwright를 쓰는 에이전트는
`browser_run_code_unsafe`(임의 코드 실행 → 파일 쓰기 우회 가능성)도 막는다. 정의 안의 `disallowedTools`가 정본이다.

- 구현 담당(`frontend-dev`, `backend-dev`)도 **파일을 고치지 못한다.** 적용 가능한 **패치(`old → new`)를 보고서로 돌려주고**,
  메인 세션이 사용자 승인 뒤에 적용하고 테스트를 실행한다.
- `qa-verifier`는 Bash가 없어 테스트를 직접 못 돌린다. 메인이 돌린 출력을 지시문에 담아 주면 그것을 해석한다.
- `agent-guard.ps1`(쓰기 경로 차단 스크립트)은 만들어 두었지만 **연결하지 않았다.** 쓰기 가능한 에이전트가 정말 필요해지면
  `.claude/settings.json`(또는 `settings.local.json`)의 프로젝트 PreToolUse 훅으로 옮겨 `agent_type`으로 분기하는 방식을 먼저 시험한다.
- 알려진 잔여 쓰기 통로: Playwright `browser_take_screenshot`의 파일 저장(저장소 루트 또는 `.playwright-mcp/`로 제한, 후자는 gitignore).

## 소통 방식 — 메인 세션이 허브, 파일이 우편함

에이전트끼리 직접 대화하지 않는다. 서브에이전트는 사용자에게 질문할 수도 없다.

1. **지시**: 메인 세션이 에이전트를 부르며 대상·맥락·확정된 결정을 지시문에 담는다. (에이전트는 대화 내용을 모른다.)
2. **결과**: 에이전트가 보고서를 메인에 돌려준다. 메인이 `handoff/agents/<에이전트>/YYYY-MM-DD_<주제>.md`에 **저장**한다.
3. **이관**: 에이전트가 자기 역할 밖의 문제를 만나면 해결하지 않고 보고서의 "이관 메모"에 적는다.
4. **결정**: 메인이 이관 메모를 읽고 **사용자에게 묻는다.** 결정이 나오면 `handoff/NEXT.md`에 항목으로 기록한다 (NEXT.md는 메인만 고친다).
5. **다음 에이전트**: 메인이 NEXT.md 항목 번호 + 앞 보고서의 경로를 지시서로 넘긴다.

사용자 승인은 항상 메인 단계에서 받는다 (`CLAUDE.md` "작업 착수 전 승인").

### 한 작업이 흐르는 예

`planner`(무엇을·왜, 선택지) → 사용자 결정 → `design-reviewer`(규격) → `frontend-dev`/`backend-dev`(패치안)
→ 사용자 승인 → 메인이 적용·테스트 실행 → `qa-verifier`(독립 검토) → 메인이 사용자에게 보고.
`data-auditor`는 레코드 값이 걸린 작업 앞에서 사실 확인을 맡는다.

## 작업 파일

- 위치·이름: `handoff/agents/<에이전트>/YYYY-MM-DD_<주제>.md` — 작업 1건당 파일 1개.
- 권장 구성: `## 지시` (메인이 준 요청·확정 결정) → `## 결과`(에이전트 보고서) → `## 이관 메모` → `## 열린 질문`.
- 이관 메모 한 줄: `[이관: 기획|디자인|프런트|백엔드|데이터] 무엇을 결정/확인해야 하나 — 기다리는 것 — 근거`.
- 이 폴더는 SessionStart 훅이 읽지 않는다. **새 작업 파일을 만들면 `handoff/NEXT.md`의 관련 항목에 한 줄 포인터**를 남긴다.

## 에이전트

| 에이전트 | 역할 | 도구 | 비고 |
|---|---|---|---|
| `design-reviewer` | 디자인 진단·규격·문구·접근성 | Read, Glob, Grep, Playwright | 소스·데이터·서버는 이관 |
| `frontend-dev` | `frontend/` 구현안(퍼블리셔 포함)을 패치로 | Read, Glob, Grep, Playwright | `frontend/data/`는 데이터 쪽. 313건 테스트·DOM id 결합 주의 |
| `backend-dev` | `kgi-ggreport-web`·`db/` 구현안을 패치로 | Read, Glob, Grep | 골든 04·05, 380건 테스트, 자기신고 인증 한계 |
| `qa-verifier` | 변경의 독립 검토·테스트 공백·재현 절차 | Read, Glob, Grep, Playwright | 테스트 출력은 메인이 실행해서 전달 |
| `data-auditor` | 기관 레코드 값을 원문 출처와 대조 | Read, Glob, Grep, WebFetch, WebSearch | 값을 고치지 않음. 우선 점검: `contractEnd`에 공고일이 든 레코드 |
| `planner` | 요구 정리·용어 정의 후보·선택지 비교·결정 질문 | Read, Glob, Grep | 결정은 사용자가. 구현 방법은 이관 |
| `security` | 권한·인증·입력검증·비밀값·반입물 위험 점검 | Read, Glob, Grep | 수정은 패치 후보로 이관. 자기신고 인증 한계 전제 |
| `pm` | NEXT 항목 지도·우선순위 후보·배분/지시서 초안 | Read, Glob, Grep | 우선순위는 사용자가 정함 |

새 에이전트를 추가할 때: ① `.claude/agents/<이름>.md` (도구에서 쓰기·실행류를 뺀다) ② 이 표 갱신 ③ `handoff/agents/<이름>/` 폴더 생성.
④ **정의 파일의 수정·추가는 실행 중인 세션에 반영되지 않는다** — 창을 다시 불러온 뒤 `Agent`로 도구 목록을 물어 확인한다.

## 주의

- `agent-guard.ps1`을 다시 쓸 때는 **ASCII만** 쓴다 (Windows PowerShell 5.1이 BOM 없는 UTF-8을 ANSI로 읽는다 — NEXT.md 23번).
- 서브에이전트에게 도구 목록을 물어 확인할 때, 쓰기 시험 경로는 **저장소 밖**(scratchpad)으로 한다. 막히지 않아도 저장소가 더러워지지 않는다.
- Bash에서 JSON·정규식을 넘길 때 역슬래시가 줄어든다(`\\`→`\`). 검사 스크립트는 파일로 만들어 실행한다.
- 서버(`localhost:8080`)·로컬 DB는 한 번에 한 세션/에이전트만 쓴다.
