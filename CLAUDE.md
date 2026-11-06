# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 일할 때의 지침이다. **1~6절은 매 세션 먼저 따르는 운영 규칙, 7~8절은 참고 정보**다.

## 1. 대화 스타일 (사용자 요청)

- 답변은 **10줄 이내**로, 사용자가 보기 쉽게 정리해서 제시한다.
- 확인·선택을 물어야 할 때만 본문 아래에 질문 블록을 따로 둔다 (본문은 짧게 유지). **질문 블록은 본문과 시각적으로 확실히 떼어 놓는다**(사용자가 "겹쳐 보인다"고 두 번 지적). 형식 고정:
  1. 본문이 끝나면 `---` 구분선을 넣는다.
  2. `🙋 **물어볼게:**` 를 **한 줄로 단독** 배치한다 (같은 줄에 질문 내용을 붙이지 않는다).
  3. 질문이 둘 이상이거나 한 줄을 넘으면 **각각 `-` 목록 항목으로 개행**한다. 한 문단으로 이어 쓰지 않는다.
- **작업 착수 전 승인 질문은 하지 않는다** (2026-11-05 사용자 결정이 2026-08-06의 "착수 전 의도 설명 후 확인" 규칙을 대체). 되돌리기 어렵거나 바깥으로 나가는 일·자격증명·업무 의미·모르는 용어만 묻는다 — 2절 참조.
- 사용자가 **"이전으로 돌려줘"** 라고 하면 이 스타일을 해제하고 기본 방식으로 돌아간다.

## 2. 운영 원칙 (사용자 결정 2026-11-03~05)

- **PM 주도**: **다음에 무엇을 할지는 PM이 정한다.** 사용자는 만들어진 결과를 확인하는 자리에 있다. 메인은 PM 보고(순서·역할 배분)를 그대로 실행하고 끝난 결과를 보고한다. 되돌리기 어려운 일·바깥으로 나가는 일(푸시 제외 — 마무리 규칙대로)·자격증명은 예외로 계속 확인한다. 작업 항목은 먼저 `pm`을 불러 순서·배분을 받는다.
- **목적이 분명하면 팀이 결정한다**: 되돌리기 쉬운 선택(샘플 파일 보관 여부·위치, 구현 방식, 문구 후보 등)은 PM·기획자·디자이너·프런트·백엔드가 사용자의 목적에 맞춰 근거와 함께 정하고, 사용자에게는 결과로만 보고한다. 사용자에게 묻는 것은 ⓐ업무 의미·모르는 용어 ⓑ메인이 가질 수 없는 실제 값·파일 ⓒ되돌리기 어렵거나 바깥으로 나가는 일뿐이다.
- **인터뷰 원칙**: PM·planner도 모르는 내용, 요건 추가, **모르는 단어·업무 판정은 무조건 사용자를 인터뷰한다**(추측 금지). 질문은 **정확하게** 쓴다 — 코드 용어(예: 'key')를 그대로 던지지 말고 ⓐ그게 무엇의 이름표인지 ⓑ화면·업무에서 어디에 쓰이는지 ⓒ어느 쪽을 고르면 무엇이 달라지는지를 업무 언어로 먼저 설명한 뒤 선택지를 준다. 사용자가 용어를 몰라 답할 수 없는 질문은 질문한 쪽의 책임이다.
- **사용자에게 묻는 경로**: 사용자는 최고 결정권자이자 고객이다. 질문할 수 있는 것은 **PM 또는 Main뿐**이다. 에이전트가 올린 질문·결정 요청은 그대로 전달하지 않고 **planner(분석·권장안) → pm(확인·정리) → Main(사용자에게 질문)** 순서로 거친다. 기획 선에서 정해도 되는 것은 묻지 않고 근거와 함께 보고만 한다.
- **에이전트 모델 명시**: 역할 에이전트를 부를 때마다 Agent 도구의 `model`을 역할 정의(frontmatter `model:`)에 맞춰 **반드시 명시**한다. 설계·판단·검증 = Opus(`planner`·`design-reviewer`·`security`·`qa-verifier`·`pm`), 구현·실행 = Sonnet(`frontend-dev`·`backend-dev`·`-write` 2개·`cleaner`·`data-auditor`). 메인 세션 모델은 사용자가 `/model`로 고른다.

## 3. 세션 시작 시

1. **로드 확인 한 줄**: 첫 답변에서 `handoff/START.md`·`NEXT.md`·날짜별 summary 중 무엇이 주입됐는지(파일명 포함) 한 줄로 말한다. 훅은 사용자에게 보이는 알림 채널이 없다. 아무것도 주입되지 않았으면 그 사실도 말한다.
2. **환경 점검** (사용자 요청 2026-11-03), 결과를 한 줄로 보고:
   - ⓐ `claude plugin list`로 7절 설치 현황과 대조(빠진 것은 재설치 안내).
   - ⓑ `node -v` 확인 + `agent-dashboard/state.json`의 `stats.since`가 이번 세션 시각인지 확인(훅이 죽으면 에이전트가 켜지지 않는다 — 2026-11-04 PATH 원인) 및 8090 대시보드 기동 여부(`lsof -iTCP:8090`). `start.js`는 서버가 이미 떠 있으면 브라우저를 열지 않는 것이 정상이다.
   - ⓒ `AGENT_DASH_NO_OPEN`·`ENABLE_STOP_REVIEW` 환경변수 값.
   - ⓓ **로컬 설정 키 대조** (사용자 승인 2026-11-04): `kgi-ggreport-web/config/application.properties`(git 미추적, PC마다 다름)에 `kgi-ggreport-web/config-envs/out-local/application.properties`의 키가 빠졌는지 **키 이름만** 비교한다(`=` 앞부분, 주석 제외). **값은 읽거나 출력하지 않는다** — 비밀번호가 들어 있고 `config/` 읽기는 권한 설정으로 막혀 있을 수 있다. 막히면 우회하지 말고 사용자가 터미널에서 돌릴 명령을 안내한다: `diff <(grep -v '^#' config/application.properties | cut -d= -f1 | sort) <(grep -v '^#' config-envs/out-local/application.properties | cut -d= -f1 | sort)`. 빠진 키는 이름과 out-local 값(비밀 아닌 것)만 알린다. 근거: 2026-11-03에 7개 누락이 업로드 500·1MB 한도로 늦게 드러났다.

## 4. 작업 기록 (handoff/)

**읽는 순서**: 작업을 시작하거나 "무엇이 남았나"를 확인할 때 `handoff/START.md`(다음 세션 시작점) → `handoff/NEXT.md`(열린 항목 전체) 순서로 본다. 완료된 항목은 `handoff/done.md`로 옮겨 NEXT.md에는 열린 것만 남긴다.

- **`handoff/START.md`** — 항상 최신 1개, 덮어쓴다. 작업 한 바퀴를 끝내며 사용자에게 다음 작업 순서·남은 질문·권장안을 말했다면 **같은 내용을 여기에 기록한다**(사용자 지적 2026-11-05: 대화에만 두면 세션이 끝날 때 사라진다). SessionStart 훅(`.claude/hooks/start-note.js`)이 NEXT.md보다 앞서 별도로 주입한다. 사용자가 "어디에도 기록하지 마"라고 한 내용은 기록하지 않는다.
- **`handoff/NEXT.md`** — 열린 항목만 모은 **진짜 이월 기억장치**. 제자리에서 편집하며, 각 항목은 자기완결적이어야 한다(최신 summary 자동 주입은 파일명 정렬로 고른 '최근 활동 참고'일 뿐 다음 작업과 무관할 수 있다). 규칙:
  - 항목마다 **(1) 출처 summary 참조**(`YYYY-MM-DD_summary.md`의 `## Session HH:mm`)와 **(2) 그것을 열지 않아도 재개 가능한 정보**(브랜치·어디까지·다음 한 걸음)를 담는다. 긴 이력·시험 과정은 `handoff/agents/<이름>/` 보고서나 `handoff/archive/`로 옮기고 NEXT에는 현재 상태·다음 한 걸음·포인터만 둔다.
  - 해소한 항목은 NEXT에서 지워 `done.md` 맨 아래로 옮기고, **그 세션의 summary에도 어떤 항목을 어떻게(커밋 해시 등) 해소했는지 기록**한다. 해소 전에는 지우지 않는다. 진행 중인 항목은 상태만 갱신하고 출처 summary 참조를 최신 세션으로 고친다.
  - 새 미해결 항목은 바로 추가한다(출처 summary 파일명과 함께). 에이전트가 맡을 항목에는 `[담당: <agent>]` 태그를 붙인다(에이전트는 자기 태그 항목과 지정된 번호만 읽는다).
  - NEXT.md는 **항목 단위로 부분 수정(Edit)** 한다 — 통째로 다시 쓰지 않는다.
- **`handoff/YYYY-MM-DD_summary.md`** — 하루 1파일, 작업 5개를 끝낼 때마다·마무리 때 무엇을 했는지·결정·남은 것을 쓴다. 같은 날이면 아래에 `## Session HH:mm` 섹션을 이어 붙인다. **세션 섹션 단위 append-only** — 기존 섹션은 절대 고치거나 지우지 않는다. SessionStart 훅은 NEXT.md와 파일명 정렬상 가장 최근 summary(`^\d{4}-\d{2}-\d{2}_summary\.md$`)를 주입한다.
- **에이전트 보고서**는 SubagentStop 훅(`.claude/hooks/save-report.js`)이 `handoff/agents/<역할>/YYYY-MM-DD_HHmm_<agentId>.md`로 자동 저장한다(읽기 전용 에이전트는 파일을 못 쓰고 "메인이 저장"은 자주 빠졌다 — 10-30 이후 PM·보안·QA 보고서가 비었다). 자동본은 지시·주제가 없는 참고용이므로, 메인은 주제가 있는 설계·결정 요약만 따로 `날짜_주제.md`로 정리하고 NEXT 항목에 포인터 한 줄을 남긴다.

**"마무리"(finalize)** = 그날의 summary 작성/갱신 + (열린 항목 상태가 바뀌었으면) NEXT.md 갱신 + `git commit` + `git push` **세 가지 모두**. 사용자가 범위를 좁힌 경우만 예외. 마무리 전에는 `START.md`도 갱신한다.

## 5. 에이전트 팀 (사용자 요청 2026-10-30~11-02)

사용자는 에이전트를 직접 조작하지 않는다. **메인이 알아서 역할 에이전트(`.claude/agents/`)를 투입한다.** 대시보드(`agent-dashboard/`)는 세션 시작 때 자동으로 뜨고(SessionStart 훅 `start.js`, 끄려면 `AGENT_DASH_NO_OPEN=1`) 에이전트 작업 상태는 훅(`hook.js`)으로 자동 표시된다. 구성과 설명: `handoff/agents/README.md`, `agent-dashboard/README.md`.

- **이 프로젝트의 모든 작업은 최우선으로 역할 에이전트를 호출해서 한다 — 경중 무관**(한두 줄 수정·오타 포함). 어떤 역할을 부르고 언제 끝낼지는 메인이 정한다. 읽기 전용 에이전트 호출은 묻지 않는다. 서로 독립인 검토는 한 번에 병렬로 부른다. 에이전트를 건너뛰고 메인이 직접 고쳤다면 보고에서 숨기지 않는다.
- **역할 간 이동·되돌림·멈춤은 `handoff/agents/graph.md`** 를 따른다. 사용자는 그 문서의 판단 지점(G1~G6)에서만 개입한다. 작업마다 `handoff/agents/runs/`에 실행 기록을 남긴다.
- **투입 순서**(해당 역할만): `planner`(범위·선택지) → `design-reviewer`(화면 규격) → `frontend-dev`/`backend-dev`(패치안) → 메인이 적용·테스트 → `qa-verifier`(독립 검토) → `security`(권한·입력·비밀값)·`data-auditor`(레코드 값) → `pm`(여러 항목 정리). 큰 작업 묶음이 끝났거나 "마무리" 전에는 `cleaner`로 정리 후보를 점검한다. **어느 역할에도 속하지 않는 일은 모두 `cleaner`에게** 넘긴다.
- **읽기 전용이 기본**: 에이전트는 파일을 직접 고치지 않고 패치·보고서를 돌려주며, **파일 적용·테스트 실행·커밋은 메인이 한다.** **예외 — `CLAUDE.md`·역할 정의(`.claude/agents/`) 같은 규칙급 문서는 메인이 직접 고친다.** 지시서를 적용할 때는 "**<에이전트>가 작업 지시서 작성을 완료해서 main이 작업한다**"를 먼저 밝히고, 지시서에 없던 메인의 판단은 따로 밝힌다.
- **쓰기용 변형 `frontend-dev-write`·`backend-dev-write`** (사용자 결정 2026-11-02): 에이전트가 직접 써야 하는 작업이면, 메인이 `ListAgents`·실행 중 작업으로 같은 파일을 다루는 다른 에이전트가 없음을 확인한 뒤 **그 작업 하나에 한해** 부른다(절차: `handoff/agents/README.md` "예외: 작업 단위로 쓰기 권한 부여"). 경로 제한은 프롬프트가 아니라 PreToolUse 훅 `.claude/hooks/write-guard.js`가 강제한다 — 허용 경로(`frontend/index.html`·`frontend/js/*.js`·`frontend/test/*.js`, `kgi-ggreport-web/**`) 밖과 `.claude/`·`.git/`·`agent-dashboard/`·비밀번호 설정 파일은 쓸 수 없다. **훅이 실제로 막는지 확인되기 전에는 `-write`를 부르지 않는다.**
- **최초 전산환경 세팅**(IntelliJ·JDK·MySQL 설치, VSCode 설정 등 PC 환경)은 메인만 할 수 있어 메인이 직접 한다.
- **커밋·푸시** (청소부 원칙): 커밋은 **작업 한 바퀴가 끝날 때마다 무조건 1회**, 푸시는 오후 6시 자동 마무리(`agent-dashboard/closing.js`, 작업 중인 에이전트가 있으면 20분씩 미룸·그날 23:30 한도)에서 한다 — 사용자가 푸시·PR을 직접 요청하면 예외. 병합(`--merge`) 등은 사용자가 별도로 요청할 때만 하고 먼저 묻지도 않는다. **커밋은 경로를 지정한다**(`git add -A`·`git commit -a` 금지, 남의 미커밋 변경은 담지 않는다).
- **푸시 전 관문(PUSH-GATE)** (사용자 지적 2026-11-02): 커밋·푸시 전에 `security`(그 푸시 범위 diff 전체)·`pm`(항목 상태·NEXT 정리)·`cleaner`를 병렬로 부르고, 화면(마크업·CSS·문구)이 바뀌었으면 `design-reviewer`가 커밋 전에 규격과 대조한다. 보안은 설계 단계에서도 한 번 본다(업로드·권한·입력·비밀값 기능). 세부는 `handoff/agents/graph.md` "PUSH-GATE".

## 6. 여러 세션 동시 작업 (사용자 요청 2026-10-29)

세션이 하나뿐이면 이 절은 건너뛴다. 작업을 시작할 때 `ListAgents`로 다른 세션이 있는지 보고, 있으면:

1. **작업 폴더를 세션마다 분리한다** — `git worktree`(`EnterWorktree`)로 별도 폴더·브랜치에서 작업하고 끝나면 병합한다. 같은 폴더를 공유해야 하면 파일 담당을 나눈다.
2. **병렬 세션의 handoff 기록은 세션별 파일**에 쓴다 — `handoff/sessions/YYYY-MM-DD_HHmm_<세션이름>.md`. 병합·마무리하는 세션이 그 내용을 날짜별 summary의 `## Session HH:mm` 섹션으로 옮긴다(SessionStart 훅은 `sessions/`를 읽지 않는다).
3. **공통 문서**: 날짜별 summary는 이어 붙이기만(`.gitattributes`의 `merge=union`), NEXT.md는 최신 내용을 다시 읽고 항목 단위로 수정, `CLAUDE.md`·설계서는 한 번에 한 세션만 고친다. `git status`에 내가 만들지 않은 변경이 보이면 건드리지 말고 사용자에게 알린다.
4. **서버·DB·포트는 한 세션만** 쓴다(`localhost:8080`, 로컬 MySQL, `target/`). 테스트·빌드 전에 다른 세션이 쓰는 중인지 확인한다.
5. **병합은 짧고 자주** 한다. 공통 문서를 고치기 전에 `git pull`로 최신 상태를 받는다.

## 7. 코드·도구 참고

**프로젝트 코드** (지자체 금고 입찰 제안 지원 시스템): `kgi-ggreport-web/`(Java 8·Spring Boot 2.7·MyBatis, 이사회 자료·결재·권한 등 서버), `frontend/`(바닐라 JS 단일 페이지), `agent-dashboard/`(에이전트 대시보드), `uploader/`.
- 서버 테스트: `cd kgi-ggreport-web && mvn -q -o test` (8080 서버가 같은 `target/`을 쓰면 테스트 뒤 재기동 필요).
- 화면 테스트: PATH에 `/c/dev/node/node-v22.23.4-win-x64`를 더하고 `node --test "frontend/test/*.test.js"`.
- 한글이 든 소스를 PowerShell로 재작성하지 않는다(NEXT 23).

**플러그인** — 작업을 보고 맞는 플러그인을 스스로 골라 쓴다. 사용자가 직접 확인하는 게 낫다면 "이 시점에 이 플러그인으로 확인해보라"고 안내한다(2절 PM 주도 원칙에 따라 사용 자체는 묻지 않는다).
- UI/디자인: `impeccable`(진단·개선) → `frontend-design`(미학 방향) → `playwright`(스크린샷 확인) → `playground`(시안 비교)
- 커밋/PR: `commit-commands` · 리뷰: `code-review`, `pr-review-toolkit`, `code-simplifier` · 보안: `security-guidance`, `claude-security`
- 기능 개발 흐름: `feature-dev` · Java 코드 이해: `jdtls-lsp`(언어 서버 별도) · CLAUDE.md 정비: `claude-md-management` · 훅/플러그인 제작: `hookify`, `plugin-dev` · 라이브러리 문서: `context7`
- **설치 현황(2026-11-03 재설치 확인, 사용자 범위)**: playwright · pr-review-toolkit · frontend-design · code-simplifier · feature-dev · security-guidance(Stop 시 diff 리뷰는 환경변수 `ENABLE_STOP_REVIEW=0`으로 끔 — 사용자 결정 2026-11-02, PUSH-GATE security와 중복·비용; 편집 시 정규식 경고·커밋 시 검토는 유지) · impeccable(제3자 `pbakaus/impeccable`, `impeccable@impeccable`, `DO_NOT_TRACK=1`). 그 밖에 superpowers·ralph-loop·context7(인증 필요)·cloudflare·swift-lsp·cloud-sql-postgresql(연결 실패, 미사용)·code-review-anthropics. 미설치: typescript-lsp·jdtls-lsp·claude-security·commit-commands·hookify·plugin-dev·context7·playground·claude-md-management. 셸 설치: `claude.exe plugin install <이름>@<마켓> --scope user`(VSCode 확장 동봉). 설치 현황이 바뀌면 이 목록도 고친다.
- **Playwright MCP(이 PC, 2026-11-05)**: 플러그인 `.mcp.json`을 node 절대경로 + `--browser chrome`으로 고쳤다(회사 인증서 때문에 Chromium 다운로드 불가, PATH에 npx 없음). 플러그인이 업데이트되면 덮어써질 수 있다.
- **역할 에이전트는 `tools`를 명시해 스킬을 못 쓴다** — playwright만 MCP로 직접(qa-verifier·design-reviewer·frontend-dev), 나머지는 main이 실행해 결과를 지시문으로 넘기거나 플러그인 에이전트(`pr-review-toolkit:*` 등)를 main이 병렬 호출. 근거 `handoff/agents/history/2026-11-02_플러그인_조사와_설치.md`.

**gstack 스킬** — `docs/gstack_구조.md`는 사용자 전역(`~/.claude/skills/gstack/`)에 설치된 gstack 스킬 54개의 구조 지도(역할 페르소나 6종 × 6단계 파이프라인)다. 코드가 아니라 **작업을 역할별로 나눠 수행하는 방식**의 참고 자료. 스킬 목록에는 라우터 `gstack` 하나만 노출된다(하위 53개는 `.agents/skills/`에 중첩). **gstack의 `/context-save`·`/context-restore`는 호출하지 않는다** — 4절의 `handoff/` 체계와 같은 일이라 둘을 같이 쓰면 이월 기억이 갈라진다.

## 8. 코퍼스·보고서 구조 (초기 연구 산출물, 참고)

이 저장소의 출발점은 서울 5개 구청의 공개 기획 문서·민원게시판 자료만으로 KB(은행)와 구청 협력 정책 과제를 찾는 일회성 조사·문서 생성 프로젝트였다(원래 큰 저장소의 `기관/` 폴더에서 분리 — 출처는 `archive/구청_log.md`). 라이브 스크래핑·API 없음. 이 부분에는 빌드·테스트 명령이 없고, 독립 실행 Python 생성기 2개(`archive/` 아래)만 있다.

모든 구청 폴더는 `corpus/institutions/{district}/`(도봉→`dobong`, 노원→`nowon`, 광진→`gwangjin`, 동대문→`dongdaemun`, 동작→`dongjak`, 이후 25개 구청 배치로 추가분) 아래에 같은 2단 구조다.

- **`spec/`** — 원자료: 다년 정책 계획(사업목록 및 예산), 홈페이지 검증(`0X_홈페이지검색확인결과.txt`), 2026 민원게시판 정리(`0X_민원게시판_2026년정리.txt`). **`00_인덱스.txt`가 나머지를 색인하고 검산한다(장별 사업 수·예산 합) — 구청 spec을 볼 때 먼저 읽는다.**
- **`plan/`** — spec에서 파생한 제안 문서: `00_제안개요_및_배경`, `01_제안사업_요약표`, `02_IT디지털기획_사업제안`(IT-n), `03_금전적지원_사업제안`(FN-n), `04_실행로드맵_및_기대효과`, `05_검증결과`(기존 사업과의 중복 점수, 계획 전체 신뢰도 /100: 도봉 74·노원 88·광진 88·동대문 82·동작 84).
- **`bank_ideas_draft.txt`** — spec+plan을 다시 읽고 은행 협력 아이디어(소상공인금융/청년금융/IT협력/복지주택금융/SOC참여)를 제안하는 **초안**(`plan/`에 병합 안 됨). 모든 아이디어는 `spec/NN`·`plan FN-1` 같은 파일 번호로 출처를 단다.
- **`corpus/`** — RAG 원천: `rfp/`(공고문 PDF), `reports/`(아래), `inbox/`(폐쇄망 밖에서 들여온 파일 투입구, 형식은 `collector/SCHEMA.md`).
- **`collector/`** — 외부 공고 수집기 자리. **현재 `SCHEMA.md`만, 코드 없음.** 수집기는 저장소 코드를 import하지 않고 배치 폴더(`manifest.json`+`institutions.csv`+`files/`)를 `corpus/inbox/`에 떨군다. 여기를 건드리기 전이나 `server/csv_import.py`의 헤더 맵을 바꾸기 전에 읽는다(CSV 계약이 그 맵이다).
- **`corpus/reports/`** — 종합 산출물: `5-report_2.0.html`(**현재 주 산출물**: 3탭 사이드바 단일 파일 오프라인 앱 — 대시보드(서울 25구 GeoJSON 지도, **명시 지시 없이 수정 금지**, 특히 지도), 지역구 상세(5개 구 카드 → 문서 뷰, 9개 서브탭), 사업별 비교 그리드), `5-report_1.0.html`(옛 정적 보고서, 2.0의 패널 출처, **변경 금지**), `서울시_5개구청_사업제안기획안.docx`.
- **`archive/`** — 1세대 산출물(`docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §⑦ 1단계): `build_report.py`(DOCX 생성), `build_html_report.py`(HTML 생성 — `district_colors`·`trust_scores`·`budget_info`·`key_problems`·`top_projects` 딕셔너리가 코드 상단에 하드코딩, 제자리 수정), `구청_log.md`(작업 로그 — spec/plan 출처나 불일치가 버그인지 알려진 이력인지 판단하기 전에 읽는다), `html_한글화_계획.md`(`spec`/`plan` 문자열 일괄 치환 전에 읽는다 — 파일 번호 참조와 자유 서술을 구분해 둠), `gigan.zip`(보관본, 압축 풀어 고치지 않는다), `log/`, `GGReportAgent_*.html`.

**주의 — 생성기 출력 경로**: `build_report.py`(`DOC_PATH`)와 `build_html_report.py`(`OUT_PATH`)는 아직 `C:\claude_workspace\서울시_5개구청_사업제안기획안.{docx,html}`(옛 상위 폴더)를 가리킨다. 현재 산출물은 이 저장소의 `corpus/reports/`에 있고, 2.0은 손/에이전트가 쓴 HTML+JS라 생성 스크립트가 없다(생성기는 1.0 모양만 만든다). 다시 돌리기 전에 경로와 `corpus/institutions/{district}/plan/*.txt` 상대 경로를 고친다. 두 스크립트는 `plan/`·`spec/` `.txt`를 읽지 않고 내용을 딕셔너리·문자열로 중복 보유하므로 연구 내용이 바뀌면 `.txt`와 별도로 스크립트 쪽도 수동 갱신한다.
