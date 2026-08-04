# NEXT — 미해결 과제 추적

이 파일은 `handoff/YYYY-MM-DD_summary.md` 파일들(세션 섹션 단위로 append-only, 기존 세션
섹션은 절대 수정하지 않음)에 흩어진 "다음 세션에서 할 일" 항목 중 **아직 해소되지 않은 것만**
모아두는 상시 갱신 파일이다.

## 사용 규칙

- **handoff summary는 세션 섹션 단위 append-only.** 하루에 한 파일
  `handoff/YYYY-MM-DD_summary.md`을 쓰고, 같은 날 여러 세션이면 그 파일 안에
  `## Session HH:mm` 섹션을 시간순으로 이어붙인다. 기존에 적힌 세션 섹션은 절대 고치거나
  지우지 않는다.
- **관련성 우선 원칙 (A안).** SessionStart 훅이 자동 주입하는 "최신 summary"는 파일명
  정렬로 고른 *최근 활동 참고*일 뿐, 다음 세션이 실제로 다룰 일(거의 항상 이 NEXT.md의
  열린 항목이며, 그 항목의 출처는 훨씬 과거 summary일 수 있음)과는 무관하다. 따라서
  **이 파일이 진짜 이월 기억장치**이고, 열린 항목은 각자 자기완결적이어야 한다. 각 열린
  항목은 반드시 **(1) 출처 summary 참조**(`YYYY-MM-DD_summary.md`의 `## Session HH:mm`
  섹션까지)와 **(2) 그 summary를 열지 않아도 재개 가능한 완결 정보**(워크트리/브랜치/
  어디까지/다음 단계)를 담는다. (1)은 (2)를 다 담기 어려울 때의 폴백이지, 아는 정보를
  생략하는 핑계가 아니다.
- 세션이 시작되면 이 파일을 읽고, 여기 열려 있는 항목 중 이번 세션에서 다룰 것을 확인한다.
- 세션이 어떤 항목을 **완전히 해소**하면:
  1. 이 파일(NEXT.md)에서 그 항목을 제거(또는 "해소됨" 섹션으로 이동 후 다음 정리 때 삭제)한다.
  2. 그 사실을 **이번 세션의 handoff summary 파일에도 명시적으로 기록**한다
     (예: "NEXT.md의 'Minor 리뷰 사항 반영' 항목 해소함 — 커밋 abcd123").
- 항목이 **진행 중이지만 아직 안 끝났으면** 지우지 않고 남겨둔다 — 상태만 갱신
  (예: 담당 워크트리/브랜치, 어디까지 했는지)해서 다음 세션이 이어받게 한다.
- 새로 발생한 미해결 항목은 이 파일에 바로 추가한다(출처 handoff 파일명과 함께).

---

## 새 PC에서 이어받을 때 (2026-08-03 기준)

`data/`는 통째로 `.gitignore` 대상이라 **DB·인덱스·산출물은 git에 없다.** 코드만 받고
아래로 다시 만든다(전부 재생성 가능한 것들이라 잃는 정보는 없다).

```bash
git pull
py -3 -m pip install -r requirements.txt   # langgraph 등 포함

py -3 -m backend.seed                      # 기관 25건 → data/registry.db

ollama pull bge-m3                         # 의미 검색용 임베딩 모델(약 1.2GB)
py -3 -m agent.retrieval build             # 지식 탭 검색용 → data/corpus_index.db
                                           #   (없으면 지식 탭이 503 빌드 안내를 띄운다)
                                           #   ⚠️ 임베딩 포함이라 CPU에서 약 1시간.
                                           #   급하면 --no-embed로 FTS만(수 초),
                                           #   나중에 reindex로 벡터를 채우면 된다.
py -3 -m backend.demo                      # 데모 환경 + 서버 (data/demo.db, 운영과 별개)
#   → http://localhost:8000/
```

- ⚠️ **파이썬이 여러 개면 `py -3`가 패키지 없는 버전을 가리킬 수 있다.** 2026-08-03을
  돌린 PC는 `py -3`=3.15에 의존성이 없어 **`py -3.14`** 를 썼다. `py -0`로 목록을 보고,
  `backend.demo`는 이 경우 traceback 대신 해결 방법을 안내하고 멈춘다.
- 화면 사용법은 실행가이드 `docs/실행가이드_backend-agent.md` §9(워크플로)·§10(대화·쪽지함·
  지식)·§11(입찰상황판·참여 결정)·§12(정합성)에 있다.
- 병합되지 않은 채 남아 있는 원격 브랜치가 4개 있다(`agent-retrieval-fts`·
  `dmz-collector-service`·`local-2026-07-30`·`worktree-corpus-validation`). 전부 과거
  작업분이고 main에 반영된 것으로 보이나 **확인 전 삭제하지 말 것** — 정리는 별도 건.

---

## 열린 항목

### 1. E2E 입찰워크플로 — 1~4 완료, 남은 것은 5뿐
- **출처**: `2026-07-30_summary.md` `## Session 20:13`(최신 갱신),
  `2026-07-29_summary.md` `## Session 18:14`(원 기록).
- **스펙**: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md` §⑧.
- **완료 (main `5fba9f0`, push됨)**: **sub-project 1(DMZ 수집 서비스)**.
  설계 `docs/superpowers/specs/2026-07-29-dmz-collector-service-design.md` +
  플랜 `docs/superpowers/plans/2026-07-29-dmz-collector-service.md` → `collector/` 구현.
  - `sources/`(어댑터 인터페이스 + `fixture` 기본 어댑터), `batch.py`(SCHEMA v1 배치 생성,
    자기검사 실패 시 배치 미생성), `schema.py`(배치 검증), `app.py`(FastAPI :8001,
    collect/batches/archive), `bridge.py`(반입 대행 CLI).
  - **망 경계 유지 방식**: 두 서비스는 서로의 주소를 모르고, 배치를 옮기는 것은
    운영=사람(USB) / 테스트=브리지 CLI. `test_boundary.py`가 collector 런타임의
    `backend`/`agent` import를 **테스트로 금지**한다.
  - E2E 실측: DMZ(8001) `POST /collect` → 브리지 → 망 안(8000) 기관 2건 upsert 확인
    (한글 정상, DB 직접 조회로 검증). 테스트 **233 passed**, dashboard 36/36.
- **남은 sub-project**:
  - ~~**2 폐쇄망 백엔드 코어**~~ — **완료**(2026-07-30, 브랜치 `local-2026-07-30`
    커밋 `0f2a067`~`53c72e0`). 출처: `2026-07-30_summary.md` `## Session 11:03`.
    스펙 `2026-07-30-inbox-batch-import-design.md` 그대로 구현 —
    `contract/batch_schema.py`(git mv), `bid_cases` 4컬럼+유니크 인덱스+멱등
    마이그레이션, `backend/inbox_import.py`, `POST /inbox/{id}/{validate,import}`,
    브리지 교체. E2E 실측으로 기관 upsert·bid_case·PDF 이동·배치 보관·재수집 갱신
    전부 확인.
  - ~~**3 agent 신규 노드**~~ — **완료**(2026-07-30, 브랜치 `local-2026-07-30`).
    재정의 결과: 신규 노드 3개 중 실제로 만들어진 것은 **`rfp_extract_node` 하나**다.
    `rfp_locate_node`는 "찾아온다"는 절반을 sub-project 2가 가져가(첨부 PDF가
    `corpus/rfp/` + `institutions.rfp_path`) 실사이트 크롤링이 범위 밖인 이상 남은
    일이 "PDF → `rfp_text.txt` + `rfp_scoring.json`"뿐이라 그것으로 재정의했다.
    `spec_research_node`는 이미 폐기, `plan_writer_node`는 `content_writer_node`에
    흡수. 상위 스펙 §④에 재정의 표로 기록했다.
  - ~~**4 6단계 3팀 분화**~~ — **완료**(2026-07-30 Session 20:13, main `dac803f`,
    push됨). 계획 `docs/superpowers/plans/2026-07-30-role-router-team-split.md` →
    `agent/nodes/role_router.py`(키워드 규칙 라우팅 + 애매할 때만 LLM 폴백) +
    `content_writer_node(state, role=...)` 역할별 코퍼스 + 파이프라인 배선
    (3팀 순차 실행 → 배점표 원순서 병합 → verification 1회). 스펙 §⑤의 LangGraph
    reducer 대신 순수 Python 병합으로 구현 — 편차와 이유는 스펙 §⑤에 기록됨.
    테스트 284 passed(+11), dashboard 36/36.
  - **5 통합 프런트 → "기관인텔리" 멀티에이전트 협업 시스템으로 재정의**(2026-07-31,
    사용자 확정). 스펙 `docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md`
    (시나리오 19항 체크리스트 — 구현 완료 시 재대조 필수). 계획 분할: A1→A2→B→C.
    - ~~**A1 오케스트레이터 그래프 코어**~~ — **완료**(2026-07-31 Session 02:51,
      main `ac4fc90`, push됨). LangGraph supervisor(3팀 Send 팬아웃·결재 3게이트
      interrupt·반려 경로)+Recorder/DbRecorder+PII 스캐너+run/checkpoint/status API.
      313+36 테스트. **Ollama 실측만 미수행**(이 PC 미기동) — 실행가이드 §6 절차로
      재시도(항목 5와 연동).
    - ~~**A2 대화 코어·업로드 검사·아카이브**~~ — **완료**(2026-07-31 Session 10:01,
      main `b9094e9`, push됨). chat(참여검토 3관점 스트리밍+이력)·upload 즉시검사
      +coverage_map·complete 아카이브·A1 이월픽스(F4~F10)·쪽지함 **비활성 스텁**.
      **쪽지 기능(읽기 라우터·발송 UI)은 사용자 지시로 연기** — notifications 행은
      쌓이는 중, C에서 쪽지함 구현 시 바로 읽으면 된다. 339+36 테스트.
    - ~~**B store→API 전환**~~ — **완료**(2026-07-31 Session 10:50, main `7bcafba`,
      push됨). `PUT /institutions/{id}`·정적 마운트(`create_app(static_dir=…)`,
      `STATIC_DIR`)·`dashboard/js/serverdata.js`(name 기준 union 병합)·부트스트랩/
      편집 PUT/CSV 서버 반입·file:// 폴백 불변·실행가이드 §8. 346+40 테스트.
    - ~~**C1 워크플로 현황판·배점표 매핑·overlay 재설계**~~ — **완료**(2026-08-03,
      main `5e58712`·`6d6279f`, push됨). 출처: `2026-08-03_summary.md`.
      계획 `docs/superpowers/plans/2026-07-31-collab-ui-c1.md` 6 태스크 + 사용자가
      실화면을 보고 낸 수정 5건 + 카드 재설계.
      - 신규 **워크플로 탭**(`dashboard/js/workflow.js`, index.html은 추가만 — 지도·
        기존 탭 무수정): 9단계 스테퍼(단계 클릭 → 그 단계 수행 내용)·**단계별 참여자
        카드**·지시/보고 로그·배점표 매핑 표·실행/결재·2초 폴링. 서버 모드 전용.
      - 신규 API: `GET /institutions/{id}/coverage-map`, `GET …/timeline`,
        `GET …/status`에 `task_id` 추가.
      - DB: `messages.author`·`messages.stage`·`notifications.stage` 신설,
        `_migrate()`를 테이블별 `MIGRATIONS` 딕셔너리로 일반화(기존 DB에 멱등 적용).
        DbRecorder가 stage를 추적해 기록에 함께 남긴다.
      - **F4 해소**: overlay를 `store.LOCAL_ONLY_FIELDS` 6개로 한정(서버 모드에서만).
      - **B 이월 2건 해소**: `backend/main.py` static_dir 부재 시 경고 후 마운트 생략,
        `store.clearServerData()`로 테스트 격리.
      - `backend/demo.py`·`demo_paths.py`·`demo_seed.py` — 데모 환경을 운영 자료와
        **파일 단위로 분리**(demo.db/demo_report_new/…)하고 `py -3 -m backend.demo`
        한 줄로 시딩→서버 기동. 정리는 `--reset`.
      - 테스트 346 → **368 passed**, dashboard 40 → **64**. 실행가이드 §9 신설.
    - ~~**C2 협업 UI 나머지**~~ — **완료**(2026-08-03, main `91d1bf1`, push됨).
      출처: `2026-08-03_summary.md` `## Session 14:20`.
      **이걸로 스펙 §⑦ 화면 6종이 모두 붙었다.**
      - **대화 탭**(`dashboard/js/chat.js`) — 기관 단위 상시 채팅. fetch 스트림 증분
        렌더(`TextDecoder`에 `stream:true` 필수 — 없으면 청크 경계에서 한글이 깨진다),
        `AbortController` 중단, `chat_messages.author`로 여러 사람 대화.
      - **쪽지함**(`notify.js`) — `GET/POST /notifications`·`POST /{id}/read` 신설
        (`notifications.sender` 컬럼). 종류별 색, 30초 배지 폴링, 발송 폼.
      - **지식 탭**(`knowledge.js`) — `GET /search` UI. 강조는 **이스케이프된 문자열에만**
        적용하고 엔티티 안쪽은 건드리지 않는다(순서를 뒤집으면 XSS).
      - **내 프로필(이름·소속)** + **계정 전환기(데모 전용, `GET /accounts`)** —
        목록을 실데이터에서 뽑고, 사람의 소속은 *실제로 쪽지를 받는 이름*으로 맞춘다
        (`tasks.team`='영업'인데 알림은 '영업팀' 앞으로 오기 때문).
      - **이월 5건 해소**: M-2(중단 시 반쪽 이력)·M-3(SSE 프레이밍 — `EventSource`는
        GET만 되는데 chat은 POST라 애초에 못 쓴다 → `text/plain`으로 정정)·
        M-4(아카이브 `rmtree` 경로 위생)·M-5(대문자 `.PPTX`)·notifications_unread 단조 증가.
      - 테스트 368 → **382 passed**, dashboard 64 → **86**. 실행가이드 §10 신설.
    - ~~**화면 ① 입찰상황판 확장**~~ — **완료**(2026-08-03, 계획 D).
      계획 `docs/superpowers/plans/2026-08-03-bid-status-board.md`.
      **이걸로 스펙 §⑦ 화면 6종이 전부 붙었고 §⑩ 재대조의 ❌가 사라졌다(✅17/⚠️2/❌0).**
      - **§② 1번**: `GET /bidcases/latest` + `serverdata.applyBidCases`
        (확정일 > 예상일 > CSV). `store.applyEdits`는 공고가 있는 행의 로컬 `confirmed`
        편집을 무시한다(공고가 이긴다).
      - **§② 5번**: 워크플로 탭 참여 결정 카드 — **tier 1·2·3 순차 결재**다("확정 버튼"
        하나가 아니다). 데모의 계정 전환기로 혼자 3차까지 재현할 수 있다(가이드 §11).
      - **§② 6번**: 참여확정 시 서버가 오케스트레이터를 시작하고, **못 시작하면 사유를
        쪽지로 남긴다**(결재는 항상 200 — 자동 실행 실패가 결재를 되돌리면 안 된다).
      - ⚠️ **이전 기록 정정**: 여기에 "지도를 건드려야 하는 유일한 작업이라 '지도 무수정'
        제약이 처음 풀린다"고 적혀 있었는데 **틀렸다**. 임박도 색은 이미 `contractEnd`로
        그려지고 있었고, 진짜 결함은 **입찰일의 진실이 두 곳**이라는 것이었다.
        병합 계층에서 값을 갈아끼워 **`render.js` 무수정**으로 끝냈다.
        → **"지도 무수정" 제약은 아직 한 번도 깨지지 않았다.**
      - ⚠️ **또 하나 정정 — "추측이면 지도 면에 빗금"은 사실이 아니다.** 빗금(`#hatch`)은
        ⓐ전국 뷰의 *준비중 지역*(`render.js:151`, 범례도 '준비중')과 ⓑ*마커*의 추측
        (`render.js:340`) 두 곳뿐이고, **지자체는 `logic.js:146`에서 마커에서 제외**된다.
        구는 면으로 그려지고 `subUrgencyColor`는 색만 돌려준다.
        확정/추측이 보이는 곳은 **랭킹 카드 텍스트**(`2026-05-20(추측)`)와 워크플로 탭이다.
        **면에 표시하지 않기로 사용자가 결정(2026-08-03)** — 근거와 결정은 실행가이드
        §11에도 적어뒀다. "구가 빗금이 안 된다"는 이야기가 다시 나오면 그 문단을 볼 것.
    - ~~**워크플로/참여 결정 정합성**~~ — **완료**(2026-08-03, 계획 E). 사용자가
      "9단계까지 갔는데 참여 결정이 대기인 건 말이 안 된다"고 지적한 데서 출발했다.
      - **`POST /run`이 참여확정을 요구한다(400).** 판단이 아니라 선후 규칙이라
        에이전트가 아니라 가드로 막기로 사용자가 확정했다(에이전트는 막지 못하고 이미
        생긴 뒤에 지적만 한다).
      - `backend/consistency.py` + `GET /consistency` — 규칙 4개로 **이미 어긋난** 데이터를
        찾는다. 워크플로 탭이 선택 기관의 경고를 맨 위에 띄운다.
      - **오탐 금지 원칙**: `research_status='대기'`인 채 참여확정은 정상이다(코퍼스 반입 시
        `activate_pending_bid_cases`가 Task를 만든다). 조사 완료인데 Task가 없을 때만 잡는다.
        경고가 한 번이라도 틀리면 그 다음부터 아무도 안 읽는다.
    - ~~**F 하이브리드 검색 + 아카이브 자동 재색인**~~ — **완료**(2026-08-04).
      출처: `2026-08-04_summary.md`. 계획
      `docs/superpowers/plans/2026-08-04-hybrid-search-reindex.md`.
      **§② 17번이 채워져 스펙 §⑩ 집계가 ✅18 / ⚠️1 / ❌0이 됐다.**
      - **검색이 FTS 단독 → FTS + 임베딩 하이브리드(RRF)** 로 바뀌었다. 사용자 결정으로
        스위치 없이 **항상** 켠다("1.2초 늘어나도 결과가 안 나오는 것보다 낫다").
        `search()` 시그니처는 스펙 §⑤ 약속대로 유지 — 호출부 무수정.
      - **RRF를 쓴 이유**: bm25(낮을수록 좋음·상한 없음)와 코사인(0~1)은 척도가 달라
        더할 수 없고 정규화는 질의마다 불안정하다. 순위만 쓰면 그 문제가 사라진다.
      - **§② 17번의 원인 진단이 틀려 있었다** — "재색인을 안 돌려서"가 아니라
        산출물이 `data/report_archive/`에 있는데 색인기는 `corpus/`만 훑어서
        **돌려도 안 잡혔다.** 색인 루트를 둘로 늘려 해결(ⓐ안, 승격 복사 아님).
      - `.pptx` 파서 신설 — 파서가 `.txt`뿐이라 아카이브에서 색인되는 게
        `rfp_text.txt` 하나였다(진짜 산출물인 제안서가 빠져 있었다).
      - **환경 실측(이 PC, CPU·GPU 없음)**: `bge-m3` 1024차원, 질의 1건 **약 1.2초**,
        전체 빌드 2,763청크 **약 57분**. 배치는 8이 최적(32는 오히려 느리다).
        GPU 엔드포인트가 생기면 이 부담은 사라진다.
      - numpy를 `requirements.txt`에 추가(사용자 승인).
      - 테스트 408 → **478 passed**, dashboard 100 → **107**. 실행가이드 §13 신설.
      - **후속 G1·G2 (같은 날, main `a7c14a9`)**: 대화 탭이 LLM 호출 실패 사유를 화면에
        보여주도록 수정(`failure_notice`) + 지식 탭 '원문 열기'(`GET /documents`)와
        esc 폴백의 XSS 구멍 수정.
        ⚠️ 여기서의 **G1·G2는 계획 F 리뷰 지적사항 번호**이지, 아래 **항목 6의
        "계획 G"(EC2 배포)와 무관하다.** 이름이 겹쳐 헷갈리기 쉽다.
      - ⚠️ **계획 F 본체를 수행한 세션은 handoff summary 섹션을 남기지 않았다.** 위 출처가
        가리키는 `2026-08-04_summary.md`는 **15:00 세션이 나중에 만든 파일**이라 계획 F
        본체(Task 1~6) 내용이 들어 있지 않다(그 파일 맨 위에 사실을 적어뒀다).
        본체의 실질 기록은 **이 블록 + 커밋 메시지 +
        `docs/superpowers/plans/2026-08-04-hybrid-search-reindex.md`** 다.
        (바로 위의 **후속 G1·G2는 그 세션이 `## Session 21:30`에 직접 기록**했으므로
        그쪽은 summary를 보면 된다.)
    - **스펙 §⑩의 나머지 미충족 1건 (다음 1순위, 비차단)**:
      - **§② 14번** 디자이너 전용 뷰 — 이관 패키지 열람 화면이 없어 쪽지 통지에 머문다.
        7단계 이관결재 후 `packager`가 패키지를 만들고 `이관` 알림을 보내지만, 디자이너가
        **무엇을 받았는지 화면에서 열어볼 수단이 없다**. 화면 신설이라 계획부터 필요하다.
    - **A2·C1 이월 잔여**:
      - **M-1** archive_dir 값 통일 + `find_archive_pptx` 재귀화.
        **불일치의 실물(2026-08-04 계획 F에서 확인)**: `backend/main.py:28`은
        `data/report_archive`, `backend/orchestrator_service.py:75`는 접두사 없는
        `report_archive`다. 계획 F가 `agent/retrieval/indexer.py`에
        `DEFAULT_ARCHIVE_ROOT = "data/report_archive"`를 추가했고 backend는
        `app.state.archive_root`(=main.py 값)를 넘기므로 **색인 경로는 지금 맞다**.
        다만 값이 두 벌인 상태는 그대로라, orchestrator 쪽 기본값을 쓰는 경로가
        생기는 순간 색인기가 빈 폴더를 보게 된다. 여전히 무동작·무해지만
        **이제는 조용히 틀릴 여지가 생겼다** — 값 통일을 먼저 하는 편이 낫다.
      - **M-6** 업로드의 동기 LLM 지연·배정 비결정 — 업로드 API를 비동기로 돌릴지의
        설계 결정.
      - **M-7은 두기로 확정** — `TaskUploadIn(TaskMessageIn)`은 "의미가 달라 별명으로
        둔다"는 주석이 붙은 의도적 별칭이다. 지우면 엔드포인트 시그니처의 의미 구분만
        잃는다. 다시 "중복 모델"로 올리지 말 것.
      - C1 이월: 그래프가 `orchestrator` role 메시지를 아직 쓰지 않는다(데모에만 존재 —
        실행 중 총괄 지시를 남기려면 `graph.py`에 `recorder.message(team, "orchestrator", …)`
        추가 + 문구 설계 필요) · `timeline`에 페이징 없음.
      - B 이월 잔여: term 클리어 불가·빈문자열 비대칭, 기관 추가의 서버 경로
        (POST 생성 API 부재로 현재 가드만 있음).
      - 쪽지함 30초 폴링은 멈추는 경로가 없다(상시 버튼이라 탭 개념이 없음). 30초에
        1건이라 방치했다.
    - 재구성 ⑦(개명)은 이번 범위에서 **제외 확정** — B·C 완성 후 별도 스펙(항목 2 참조).
    규모 실측(Session 01:00): `dashboard/js/` 1,104줄(render.js 613줄 포함) 이식 +
    9단계 워크플로 UI 신규. **하루짜리가 아니므로 별도 일정을 잡아야 한다.**
- **실사이트 크롤러는 여전히 범위 밖** — 어댑터 인터페이스만 열려 있고 기본값은
  로컬 픽스처 하나다. 실제 나라장터/지자체 파싱은 별도 스펙이 필요하다.

### 2. 리포지토리 재구성 — ①~⑥단계 완료, 남은 것은 ⑦뿐 (조건부 보류)
- **출처**: `2026-07-29_summary.md` `## Session 11:14`(①~③)·`## Session 13:38`(④)·
  `## Session 15:25`(⑤)·`## Session 15:51`(⑥).
- **스펙**: `docs/superpowers/specs/2026-07-29-repo-restructure-design.md`. 실행 계획:
  `docs/superpowers/plans/2026-07-29-repo-restructure-stage1-3.md`.
- **완료 (전부 main에 병합됨)**: ①`archive/` 신설(`7b9d7be`에 포함) ②`data/` 분리
  ③`corpus/` 신설(rfp·reports·inbox) + `architecture/`→`docs/architecture/`(`d5010d9`)
  ④**giganlist→`corpus/institutions/` 이동 완료** — 사용자가 `data/` 제안을 철회하고
  스펙 §⑥대로 `corpus/institutions/` 승인. 25개 폴더 git mv + seed 경로·저장값 접두사
  +검증기 docstring+테스트 경로+agent 기본값+살아있는 문서를 한 커밋으로(§⑥ 요구),
  traversal 테스트는 접두사가 2단계 깊어져 `..` 하나 추가. `data/registry.db`는 비어
  있던 것을 확인하고 재시딩(25개 기관, 새 접두사 검증). 테스트 148 passed.
  `giganlist_dir` 같은 식별자명은 의도적으로 유지(컬럼 개명은 범위 밖).
- **사용자 결정 (2026-07-29)**: `dashboard/`→`frontend/`는 **최종형 개명 스펙(§⑤·⑦-7)
  때 함께** 하기로 확정 — 그 전까지 이동 금지.
- **⑤ 완료 (main 병합 `0af3f55`, push됨)**: 스펙
  `docs/superpowers/specs/2026-07-29-agent-retrieval-fts-design.md` + 플랜
  `docs/superpowers/plans/2026-07-29-agent-retrieval-fts.md` → 구현 완료.
  `agent/retrieval/`(파서·청커·trigram FTS5 인덱서·`search()` 단일 시그니처·CLI),
  `GET /search`(인덱스 없으면 503), agent_adapter 검색 통합(등록 코퍼스+인덱스
  존재 시만 검색, 그 외/0건/인덱스 부재는 legacy 통째-읽기 폴백 — 기존 테스트
  무수정 통과). 테스트 **178 passed**(기준선 148+30), dashboard 36/36.
  인덱스는 `data/corpus_index.db`(gitignored) — `py -3.14 -m agent.retrieval build`로
  재생성. 사용법: `docs/실행가이드_backend-agent.md` §3.
- **⑥ 완료 (main `5cfc4e6`, push됨)**: `collector/SCHEMA.md` v1 작성 — 망 밖 수집기와
  망 안의 **유일한 접점을 파일 형식으로 고정**. 배치 폴더 1개 = `manifest.json`(권위)
  + `institutions.csv`(파생) + `files/`, dedup 키 `(source.slug, notice_id)`,
  배치 불변·나중 배치 우선, `schema_version` 정책. CSV는 `backend/csv_import.py`(6열)와
  `dashboard/js/logic.js`(12열)가 **둘 다 읽는 12열 상위집합**으로 정하고 두 파서에
  실제 통과시켜 검증(SCHEMA.md §⑦). `institution_id`는 망 밖에서 발급 금지(슬러그
  발급은 망 안 권한). 코드는 없음 — 스펙 §⑦-6대로 문서까지만.
- **남은 단계 ⑦ (조건부 보류, 착수 금지)**: 최종형 개명(`backend`→`server`,
  `dashboard`→`web/` 흡수). 착수 조건 두 가지가 **아직 미충족**이다 —
  ⓐ 사용자 결정 "최종형 됐을 때" ⓑ 스펙 §⑤ "backend 작업이 잠잠해진 뒤".
  실제로 backend는 계속 커지는 중(2026-07-29에만 `routers/search.py` 신설,
  `create_app` 시그니처 변경). 착수하려면 **별도 스펙부터** 쓰고, import 경로
  전면 수정이 따르므로 다른 세션 동시작업이 없는 시점을 골라야 한다.

### 3. 로컬 DB 파일 2건 — 사용자 판단 대기 (비차단, **PC 종속**)

- **출처**: `2026-07-30_summary.md` `## Session 01:00`(sub-project 2 설계 중 발견).
- ⚠️ **먼저 읽을 것**: 아래 둘은 **git에 없는(untracked) 로컬 파일**이라 발견된
  PC(2026-07-30 세션을 돌린 Windows 머신)에만 존재한다. **다른 PC에서는 파일이
  아예 없는 것이 정상**이며, 그 경우 ①은 해당 없음으로 넘기고 ②만 확인하면 된다
  (②는 어느 PC에서든 서버를 처음 띄울 때 똑같이 필요하다). 이 항목을 "파일이 없으니
  해소됨"으로 지우지 말 것 — 원래 PC에서는 아직 남아 있다.
- **무엇인가**: 둘 다 커밋 대상이 아니고 아무것도 막지 않지만, 방치하면 사고가 난다.
  1. **리포 루트의 stale `registry.db`** (7/28 22:20자, 40KB, 기관 25·bid_case 1·
     task 3건). 재구성으로 `data/registry.db`가 표준이 되기 전의 잔해다. 현재 코드는
     전부 `data/registry.db`를 보고(`backend/main.py`·`seed.py`), 테스트는 `tmp_path`를
     쓰므로 **아무도 이 파일을 읽지 않는다**. 문제는 **`.gitignore`에 안 걸린다**는
     것 — 이 리포는 세션끼리 서로의 untracked 파일을 커밋에 쓸어담은 이력이 실제로
     있어서(2026-07-29 `cd06db9`), 40KB 바이너리 DB가 실수로 커밋될 여지가 있다.
     → 선택지: 삭제 / `.gitignore`에 `/registry.db` 추가 / 그대로 두기.
  2. ~~**`data/registry.db`가 비어 있다**~~ — 2026-08-03 확인 시 **기관 25건이 들어
     있다**(그 사이 누군가 `py -3 -m backend.seed`를 돌린 것). 새로 clone하면 이
     파일이 없으므로 **처음 실행 전 시딩이 필요하다는 사실 자체는 그대로**다.
  3. ~~**(2026-08-03) `data/registry.db`의 데모 잔해 30건**~~ — **같은 날 사용자 승인
     후 정리 완료.** C1 화면 확인용 `demo-` 행(tasks 6·messages 23·notifications 6·
     bid_cases 1)을 `demo_seed.clear()`로 지우고 `dobong.stage`를 9 → **1**(seed 기본값)로
     되돌렸으며, `data/report_new/도봉구/`의 JSON 2개도 삭제했다. 정리 후 확인:
     기관 25건 유지, tasks·messages 0건, `data/report_new/` 빈 디렉터리.
     데모는 이제 `data/demo.db`에만 있다(`py -3 -m backend.demo`).
- **상태**: 비차단. ①(리포 루트 stale `registry.db`)만 남았고, 실행에는 지장이 없다.

### 4. `institutions.scoring_table`이 아무도 안 쓰는 빈 슬롯 (비차단)

- **출처**: `2026-07-30_summary.md`(sub-project 3 재정의 세션). 사용자가 이번 범위에서
  **빼기로 결정**해서 이월한 것이지, 발견만 하고 미룬 것이 아니다.
- **무엇인가**: `backend/db.py`의 `institutions.scoring_table` 컬럼과
  `backend/models.py`의 `Institution.scoring_table: list[dict] | None`이 **둘 다 있는데
  값을 쓰는 코드가 하나도 없다.** `backend/repository.py:39`가 읽을 때 JSON 역직렬화만
  하고, 아무도 채우지 않으므로 항상 `None`이다.
  `GET /institutions/{id}/artifacts`도 `giganlist_dir`·`rfp_path`·`pptx_path` 3개만
  돌려주고 이 필드는 노출하지 않는다.
- **왜 지금 걸리는가**: 2026-07-30에 만든 `agent/nodes/rfp_extract.py`가 배점표를
  구조화해 `data/report_new/{기관}/rfp_scoring.json`에 쓴다. 그 결과를 DB에도 넣으면
  대시보드·API가 배점표를 조회할 수 있는데, 지금은 파일로만 존재한다.
- **하려면**: `rfp_extract_node`(또는 그것을 부르는 backend 쪽)가
  `UPDATE institutions SET scoring_table = ?`를 하고, `artifacts` 응답에 필드를 추가한다.
  노드는 현재 backend를 import하지 않으므로(agent/backend 분리) **어느 층이 쓸지부터**
  정해야 한다 — 그게 이 항목이 자명하지 않은 이유다.

### 5. `gpt-oss-120b` 실호출이 아직 검증되지 않았다 (비차단, **하드웨어 종속**)

- **출처**: `2026-07-30_summary.md` `## Session 11:03` §4.
- **무엇이 검증됐나**: `agent/llm.py`가 스펙 §⑥ 어댑터로 교체돼 있고(1순위
  `gpt-oss-120b`, 폴백 `llama-4-scout-17b-16e-instruct`, 엔드포인트
  `LLM_BASE_URL`), **배선은 로컬 Ollama + `llama3.1:8b`로 실호출 검증 완료**다 —
  ⓐ`json_schema` 구조화 출력 동작 ⓑ1순위 부재 시 폴백 동작 ⓒ둘 다 부재 시 404로
  정직하게 실패. 코드만 봐서는 알 수 없던 위험은 이것으로 해소됐다.
- **무엇이 안 됐나**: **실제 운영 모델(`gpt-oss-120b`)로는 한 번도 못 돌렸다.**
  2026-07-30 세션을 돌린 PC는 RAM 15.7GB / Intel Iris Xe 내장 GPU라 65GB 모델을
  올릴 수 없다. dGPU 서버나 폐쇄망 엔드포인트가 있어야 한다.
- **왜 중요한가**: `llama3.1:8b`로 수원시 공고문 배점표를 뽑아 보니 **분류 5개는
  정확히 맞췄지만 개별 배점을 지어냈다**(정답 `8/17/21/22/25/7` 6항목 → 산출
  `4/6/0/5/…` 16항목, 주석을 평가항목으로 오인). 프롬프트에 "원문에 없는 배점을
  만들지 마라"고 명시했는데도 그랬다. 즉 **배점표 구조화가 모델 성능에 크게 의존**하며,
  120b가 이걸 해내는지가 sub-project 3 산출물의 실사용 가능 여부를 가른다.
- **하려면**: 엔드포인트가 생기면 `LLM_BASE_URL`·`LLM_MODEL`만 설정하고
  `agent/nodes/rfp_extract.py`를 수원시 PDF로 1회 호출해
  `.claude/skills/rfp-locate/references/scoring_schema.json`(총점 100, criteria 6건 —
  **바로 그 PDF의 정답지**)과 대조하면 된다. 코드 변경은 필요 없다.
- **부수 확인 사항**: 5·8단계의 🛑 사람 승인 체크포인트가 장식이 아니라 필수임이
  이 실측으로 확인됐다 — 결과가 좋아도 사람 검수는 유지할 것.
- ⚠️ **2026-08-04 추가 실측 — "더 큰 모델이면 될 것"이라는 기대의 근거가 약해졌다.**
  출처: `2026-08-04_summary.md` `## Session 21:30`. 사용자 요청으로 `qwen3:14b`를
  받아 같은 PDF·같은 프롬프트로 대조했다.

  | | 정답 | llama3.1:8b | qwen3:14b |
  |---|---|---|---|
  | 항목 수 | **6** | 16 | 15 |
  | 배점 합 | **100** | 96 | **108** |
  | 소요(CPU) | — | 441초 | 611초 |

  **둘 다 같은 구조적 오류를 낸다** — 공고문은 배점을 *분류 단위*로 주는데 추출
  텍스트의 표 경계가 무너져 있어, 모델이 세부 항목으로 쪼갠 뒤 **개별 배점을
  지어낸다.** 14B는 더 자신 있게 지어낼 뿐이다(합계가 총점을 넘는다). 분류 자체는
  둘 다 맞췄고 **틀리는 건 언제나 숫자**다. 크기와 무관하게 같은 양상이 반복됐으므로,
  120b 실측은 여전히 해볼 값어치가 있으나 **그것으로 해결된다고 전제하면 안 된다.**
- **함께 나온 제안(미착수, 사용자 판단 대기)**: `sum(criteria.score) != total_score`면
  잡아내는 **결정적 검증 규칙**. 이번 두 모델 모두(96·108) 이 한 줄에 걸린다. 모델
  품질에 기대지 않는 방어이고 `backend/consistency.py`의 철학과 같다.
- **환경 사실(2026-08-04)**: `qwen3:14b`(9.3GB)는 이 PC(RAM 15.7GB·GPU 없음)에서
  **돈다**(10GB 점유, 100% CPU). 30b/32b(19~20GB)·235b(142GB)는 불가.
  단 **qwen3는 thinking 때문에 langchain 경로에서 14분 넘게 응답이 없었다** —
  `think=False`로 꺼야 실용적인데 `agent/llm.py`(OpenAI 호환 경로)에는 그 스위치가
  없다. 또 Ollama 기본 컨텍스트는 **4096**이다(모델 최대 40960).

### 6. AWS EC2 데모 배포 (계획 G) — 문서 2건 완료, **실제 구축은 미수행**

- **출처**: `2026-08-04_summary.md` `## Session 15:00`.
- **계획서**: `docs/superpowers/plans/2026-08-04-aws-ec2-demo-deploy.md`
- **설치 매뉴얼**: 리포 루트 **`INSTALL.md`** — *이것만 보고 빈 AWS 계정에서 기동할 수
  있게* 쓴 자기완결 문서다(인스턴스 생성 → 접속 URL → 시연 절차 → 문제해결). 실제
  구축을 이어받는 세션은 **이 파일 하나만 따라가면 된다.**
- ⚠️ **이름 주의**: 항목 1의 계획 F 블록에 나오는 **G1·G2는 계획 F 리뷰 지적사항 번호**이고,
  이 항목의 **"계획 G"는 EC2 배포**다. 서로 무관하다.
- **무엇이 끝났나**: 문서만. **앱 코드는 0줄 변경**(`git diff`가 문서만 보여준다).
  커밋 `42623d9`(계획서+초판)·`5416485`(INSTALL 재작성), 둘 다 push됨.
- **확정된 구성** (사용자 결정 7건, 근거는 계획서 §①):
  데모 목적 / **nginx Basic Auth + 보안그룹 IP 제한**(앱 로그인은 구현 안 함) /
  폐쇄망 가정 유지(외부 API 금지, EC2 안 Ollama) / 대화 탭 시연 O /
  **CPU `c7i.2xlarge`**(t3는 크레딧 스로틀로 시연 중 느려져 금지) / 시연 때만 기동 /
  Amazon Linux 2023.
- **다음 단계**: `INSTALL.md` 1~7단계를 실제 인스턴스에서 수행하고, §9 체크리스트 8개
  화면을 확인한다. 그 과정에서 문서와 실제가 어긋나면 **문서를 고쳐 커밋**한다
  (아직 한 번도 실기동으로 검증되지 않은 문서다 — 오탈자·패키지명 차이가 나올 수 있다).
- **실기동 시 특히 확인할 것 4가지** (계획서·INSTALL에 근거와 함께 적혀 있음):
  ① `backend/demo.py`가 `127.0.0.1` 고정이라 **nginx 없이는 밖에서 안 보인다**(의도된 구성).
  ② nginx `proxy_buffering off` + `proxy_read_timeout 300s` 없으면 **대화 탭 스트리밍이
  깨지거나 60초에 504로 잘린다.**
  ③ `agent.retrieval build --no-embed`를 빠뜨리면 지식 탭 503뿐 아니라 **대화 탭이
  수 분씩 걸린다**(`_load_consult_corpus`가 코퍼스를 통째로 넣는다).
  ④ `LLM_FALLBACK_MODEL`을 **1순위와 같은 값**으로 둔다(비우면 `agent/llm.py`의 `_env()`가
  설치되지 않은 기본 폴백을 되살린다).
- **이 항목이 해소해도 남는 것**: **NEXT.md 항목 5(`gpt-oss-120b` 실검증)는 그대로다.**
  120b는 65GB급이라 이 CPU 구성에 올라가지 않는다 — 데모는 `llama3.1:8b`로 돈다.

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

- ~~corpus-validation 브랜치·워크트리 잔여 정리~~ — `2026-07-30_summary.md`
  `## Session 01:00`에서 종결. 세션 시작 시 "최종 리뷰가 남아 있다"는 인식이
  **틀렸음을 확인**했다: 이전 세션이 이미 최종 리뷰까지 마치고 `--no-ff`로 main에
  병합(`c7ba0c7`)했으며, 리뷰에서 나온 fix 커밋 `a8e14fd`(비UTF-8 파일 크래시 +
  규칙 9 중복 보고)도 포함돼 있었다. `git merge-base --is-ancestor
  origin/worktree-corpus-validation main` → fully merged. 그 위로 재구성 ①~⑥과
  sub-project 1까지 쌓여 있어 PR은 불필요했다. `finishing-a-development-branch`의
  정리 단계만 수행 — main 178 passed 확인 후 워크트리 제거 + `git worktree prune`
  + 로컬 브랜치 `git branch -d` + 원격 `git push origin --delete`.
  **교훈**: 여러 PC·세션이 같은 브랜치를 미는 리포이므로, 착수 전 `git pull` +
  실제 git 상태 조사를 먼저 할 것(이번엔 그 덕에 불필요한 리뷰·PR을 피했다).

- ~~빈 워크트리 디렉터리 `.claude/worktrees/institution-intelligence-agent/` 정리~~
  (구 항목 2) — `2026-07-29_summary.md` `## Session 15:51`에서 **확인 결과 이미
  존재하지 않아 종결**. 이 PC에서 `.claude/worktrees` 디렉터리 자체가 없고
  (`ls` 실패), `git worktree list`도 메인 리포 하나만 반환한다. 과거
  `skill-essential` 잔해와 같은 경로(Windows 파일 잠금이 풀리며 자연 정리)로
  보인다. 별도 조치 불필요.

- ~~main 미push 커밋 — GitHub 인증이 세션에 없어 push 차단~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 13:38` 직후 해소. **사용자가 세션 안에서
  `! git push origin main worktree-corpus-validation`을 직접 실행**해 인증과 함께
  push 완료(`b91b081..8c5225f main`, `8d94f88..a8e14fd worktree-corpus-validation`).
  `git rev-list --left-right --count origin/main...main` = `0 0` 검증됨.

- ~~corpus-validation 워크트리 — main 병합만 남음 (최우선)~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 11:14`에서 해소. 전체 브랜치 최종 리뷰 수행 →
  Minor 2건 발견(비UTF-8 파일이 plan/01 등 특정 위치에 있으면 규칙9 보고 대신 크래시,
  규칙9 중복 보고) → fix 커밋 `a8e14fd`를 브랜치에 얹고(148 passed 재확인)
  `--no-ff`로 main 병합(`c7ba0c7`). 병합 후 main에서 **148 passed**.
  이 병합으로 재구성 §⑦ ④단계(giganlist 이동)의 게이트가 풀림.
  워크트리는 다른 PC에 있어 이 PC에서는 원격 브랜치 기준으로 작업했다
  (`git branch worktree-corpus-validation origin/...`으로 로컬 브랜치 생성).
  **주의: fix 커밋 `a8e14fd`와 main 병합은 아직 미push**(현 항목 1 참조) — 다른 PC
  워크트리에서 이어 작업하기 전에 push·fetch 동기화 필요.

- ~~병합 완료된 브랜치 2개 삭제 여부~~ (구 항목 1) — `2026-07-29_summary.md`
  `## Session 08:05`에서 **사용자 승인 후 둘 다 삭제 완료**.
  로컬 `feat/stage7-assembler`(`784b496`) → `git branch -d`로 삭제(완전 병합 확인됨).
  원격 `origin/feature/treasury-bid-dashboard`(`464f906`) → `464f906`이 `origin/main`의
  조상임을 `git merge-base --is-ancestor`로 검증한 뒤 `git push origin --delete`.
  삭제 후 `git ls-remote --heads origin`에 남은 원격 브랜치는 `main`과
  `subagent-init-archi` 2개뿐이며, 후자는 새 항목 1로 이월했다.

- ~~`main`의 미push 커밋 5개 — 다른 세션 작업 종료 후 push~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 07:59`에서 해소. **다른 세션이 push를 완료**해
  `git rev-list --left-right --count origin/main...main` = `0 0`(완전 동기화)이 됐다.
  이 세션이 만든 커밋 `1f9bcfe`(7단계 취합)·`5b45ac7`(handoff)가 `origin/main`에
  포함됨을 `git merge-base --is-ancestor`로 개별 검증했다. 함께 적혀 있던 로컬 브랜치
  `feat/stage7-assembler` 삭제 건은 미결이라 **현 항목 1로 이관**해 원격 브랜치 삭제
  건과 합쳤다.

- ~~`agent/` RFP 팀 확장 구현 — Task 3(`spec_research_node`)부터 재개~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 00:29`에서 **"폐기"로 종결**. 두 가지 이유:
  ① 같은 날 main에 들어온
  `docs/superpowers/specs/2026-07-29-institution-corpus-validation-design.md`가
  `spec_research_node` 구상을 **명시적으로 폐기**했다 — 조사는 DMZ에서 사람이 수행하고,
  시스템은 `backend/corpus_validator.py`의 기계 검증 + 반입 API 2개 +
  `research_status` Task 게이트만 담당하는 것으로 방향이 확정됐다(자동 조사 노드를
  만들지 않는다). ② 이어받을 워크트리 브랜치 `worktree-rfp-agent-team`과 커밋
  `1504d8e`(`run_subagent`)·`0e759e7`(`rfp_locate_node`)가 **로컬·원격 어디에도 없다**
  (2026-07-29 확인: 브랜치 없음, dangling 커밋 79개 전수 조회에도 없음). 재개할 실물이
  없으므로 "진행 중"으로 남길 수 없다.
  **남는 필요**: ③단계 `rfp_locate_node`(공고문 자동 탐색) 자체는 여전히 미구현이지만,
  이제 이 항목이 아니라 상위 E2E 스펙 sub-project 3의 몫이다. 현재는
  `.claude/skills/rfp-locate`로 사람이 수행한다.


- ~~`dashboard/` 금고은행 입찰 히트맵 — 애니메이션 체감 육안 확인~~ (구 항목 2) —
  `2026-07-28_summary.md` `## Session 23:52`에서 해소. 사용자가 포그라운드 탭에서 체감을
  확인했고("0.4초는 마음에 든다"), 그 과정에서 나온 UI 피드백을 3라운드로 반영해 **main에
  커밋·push 완료**: `c5b03d6`(파스텔 팔레트·구 단위 지자체 색칠·지자체 외곽선 깜빡임·
  랭킹 카드 흰 테두리 누적 버그 수정·`🎨 지도 색상` 설정), `be194ee`(라벨 헤일로·라벨
  겹침 해소·범례를 지도 우하단으로+테마 연동·드릴인 0.4초 멈춤), `4909a11`(지도를 덮는
  큰 지역명 오버레이 제거). 테스트 `node --test dashboard/test/*.test.js` **36/36 통과**,
  콘솔 오류 0건. 원격 브랜치 삭제 건만 위 항목 2로 분리해 이월함.

- ~~`finalize` 엔드포인트에 호출자 신원(`X-User-Id`) 미수집~~ (구 항목 3) —
  같은 날 `2026-07-28_summary.md` `## Session 21:30` 후반부에서 **사용자가 선택지 ①을
  승인해 즉시 해소**(커밋 `189bee0`, main push 완료). `bid_cases`에 `finalized_by`/
  `finalized_at` 컬럼 추가, `BidCase` 모델·`record_finalization()` 리포지토리 함수 추가,
  finalize가 `x_user_id: str = Header(...)`를 요구하도록 변경(승인·반려 양쪽 다 기록).
  기존 `registry.db`는 `CREATE TABLE IF NOT EXISTS`라 컬럼이 자동으로 안 붙어
  **사용자 승인 하에 삭제 후 재시드**함(gitignored라 리포지토리 영향 없음). 신규 테스트
  4건 + 기존 finalize 테스트 3건에 헤더 추가 → **66/66 통과**. 스펙 §③ 데이터모델 표에도
  두 컬럼과 "왜 이력 배열이 아니라 단일 컬럼인지"의 근거를 반영함.

- ~~E2E 입찰워크플로우 시스템 — sub-project 0(레지스트리 & 기관 API) 구현~~ (구 항목 3) —
  `2026-07-27_summary.md` `## Session 22:33`에서 해소: `superpowers:subagent-driven-development`로
  `docs/superpowers/plans/2026-07-26-registry-institutions-api.md`의 5개 Task를 전부
  구현·개별 리뷰(clean, Task 4 fix 1건 사용자 승인 후 반영)·최종 전체 브랜치 리뷰(opus,
  Important 4건+테스트 공백 1건+gitignore 발견 → 1개 fix wave로 전부 수정·재리뷰 clean)까지
  마치고 `main`에 로컬 병합(`d3533cb`, 20/20 테스트 통과). 계획서의
  `GIGANLIST_DISTRICT_NAMES`가 23개구로 stale했던 것을 사용자 승인받아 송파+강동 2건
  추가(25개)하는 편차를 뒀는데, 이 결정이 세션 도중 발견된 동시성 이슈(다른 세션이
  강동구 배치를 같은 시간대에 완결시킴, 커밋 `bce1a09`)를 데이터 유실 없이 흡수함 —
  병합 후 `giganlist/` 25개 폴더·`GIGANLIST_DISTRICT_NAMES` 25개 항목 모두 확인됨.
  워크트리(`registry-institutions-api`)·브랜치 정리 완료. sub-project 1(DMZ FastAPI)부터는
  스펙(`docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`) §⑧
  로드맵대로 별도 세션에서 계획부터 새로 시작해야 함(아직 계획 없음).
- ~~**25개 자치구 배치 프로젝트 (20/20 완결)**~~ (구 항목 1) — `2026-07-27_summary.md`
  `## Session 01:39`(송파) + `## Session 07:27`(강동)에서 마지막 2건을 1건씩 순차
  디스패치해 **완결**. `giganlist/` 폴더 **25개 도달**(원본 5개구 + 배치 20개구).
  최종 신뢰도: 종로78 중구77 용산76 성동76 중랑81 성북76 은평74 강북72 서대문73 마포80
  양천84 강서80 구로84 금천84 영등포81 관악81 서초84 강남79 **송파69 강동71**.
  (원본 5개구는 도봉74 노원88 광진88 동대문82 동작84.)
  **배치 전체 최저는 송파 69** — 인용 오류 0건인데도 낮은 이유는 조사 부실이 아니라
  송파구 공개 범위의 한계이며, 문장 수정으로는 올릴 수 없다고 plan/05에 명시돼 있으니
  **재작업을 지시하지 말 것**(새 조사만이 답).
  **후속 세션이 알아야 할 축적된 교훈**: ①1건씩 순차 디스패치가 안정적(4-parallel/
  20-parallel 전체 동시 디스패치는 세션 한도 초과로 전멸한 이력 2건) ②프롬프트에 "파일
  하나 완성할 때마다 즉시 디스크에 쓰라"를 넣으면 중단 복구 비용이 크게 준다 ③중단 시엔
  새 에이전트를 띄우지 말고 `SendMessage`로 transcript 재개 + 디스크 실제 상태(이미 생성된
  파일 목록) 명시 ④**"경쟁 금융기관 기존 진입 여부 확인" 지시가 가장 값진 발견을 만든다**
  (송파·강동 모두 경쟁사 기진입을 찾아내 제안 프레임을 바꿈) ⑤다른 지자체(서울시 등) 수치를
  구 값으로 전용하는 실수가 반복되므로 프롬프트에 금지를 명시할 것 ⑥에이전트 최종 보고
  수치가 파일과 다를 수 있으니(송파: 아이디어 11건을 9건으로 오보고) **컨트롤러가 직접
  grep 대조 검증할 것**. 규격은 `institution-corpus-format` 스킬 참고.
- ~~산출물 본문 내 `bank_idea_draft.txt`(단수형) 자기참조 3곳~~ (구 항목 3) —
  `2026-07-27_summary.md` `## Session 07:27`에서 해소. 이 항목의 재개 조건이 "25개구 배치
  완료 후"였는데 같은 세션에서 배치가 완결되어 조건이 충족됨. `giganlist/gangbuk/plan/00`
  (91줄), `giganlist/gangbuk/plan/04`(92줄), `giganlist/yongsan/spec/05`(93줄) 3곳을
  복수형으로 정정하고 `grep -rn "bank_idea_draft\.txt" giganlist/` **0건**으로 검증 완료.

- ~~`main`의 미push 커밋 5개 — push 여부 사용자 판단 대기~~ (구 항목 5) —
  `2026-07-27_summary.md`에서 해소 확인: `git rev-list --left-right --count
  origin/main...main` = `0 0`(완전 동기화), `git merge-base --is-ancestor`로 강남 커밋
  `a6d2896`·dashboard 커밋 `0450831` 둘 다 `origin/main`에 포함됨을 검증.
  **다른 세션이 이미 push를 완료**한 것으로 보임(당시 origin/main HEAD = `f1e8cf8`).
  이 항목에 함께 적혀 있던 "커밋 전 `git branch --show-current` 확인" 주의사항은 여전히
  유효하므로 **항목 1로 이관해 보존**함. 이 해소로 이후 항목 번호가 하나씩 당겨짐
  (구 6 → 현 5).
- ~~브레인스토밍 재진입해 agent/ 패키지 스펙 확정~~ — `2026-07-20_1620_summary.md`에서
  스펙 작성 및 계획(`2026-07-20-rfp-proposal-agent.md`) 완료로 해소.
- ~~최종 리뷰 Minor 사항 2건 (rfp-locate 스킬)~~ — `2026-07-21_summary.md`에서 해소:
  `extract_text.py`에 `sys.stdout.buffer.write(UTF-8)` 사용 이유 주석 추가,
  `render_pages.py`의 `fitz.open()`을 `with` 문으로 감쌈.
- ~~`.claude/worktrees/skill-essential` 물리 디렉토리 잔여~~ — `2026-07-21` 세션에서
  확인 결과 `.claude/worktrees/` 디렉토리 자체가 더 이상 존재하지 않음(Windows 파일
  잠금이 풀리며 자연히 정리된 것으로 보임). 별도 조치 불필요.
- ~~Task 5(pptx_builder) 리뷰의 미반영 Minor 사항~~ — `2026-07-21` 오후 세션에서 해소:
  `_add_scoring_table_slide`에 빈 `scoring_table` 가드 추가(`IndexError` 방지),
  섹션 슬라이드의 "근거자료: ..." 인용 렌더링을 검증하는 테스트와 빈 배점표 테스트
  2건 추가. 워크트리 `rfp-proposal-agent`(브랜치 `subagent-init-archi`)에서 커밋
  `8876889`, `origin/subagent-init-archi`에 push 완료.
- ~~`agent/` 오케스트레이션 패키지 구현 (Task 1~8) 및 main 병합~~ — `2026-07-21`
  저녁~밤 세션에서 완전히 해소: Task 6(content_writer)~8(pipeline) 구현, 24개
  테스트 전부 통과, PR #1을 squash merge로 main에 병합(`5bafdfa`), 이후 병합 후
  발견된 구조 불일치(25개구 배치로 완료된 12개구가 `giganlist/`로 안 옮겨짐)까지
  해소 — 12개구 전체를 `giganlist/`로 이동(`e1335d0`), build 스크립트는 이미
  `giganlist/{district}/...` 경로를 참조하고 있어 별도 수정 불필요, 두 build
  스크립트 재실행 확인. 후속 작업(구로부터 재개할 25개구 배치)은 위 "25개 자치구
  배치 프로젝트" 항목에 흡수됨(경로를 `giganlist/{구}/`로 바로 생성하도록 갱신).
- ~~CLAUDE.md/`institution-corpus-format` 스킬의 giganlist 경로 미반영 + bank_idea(s)_draft
  명명 불일치~~ — `2026-07-21` 밤 세션에서 해소: 3개 병렬 조사로 `CLAUDE.md` Layout
  섹션 5곳과 스킬(`SKILL.md` + `dobong_*_sample.txt` 3개)의 `{district}/`,
  `{institution}/` 패턴에 `giganlist/` 접두사가 전혀 반영 안 돼 있음을 확인, 전부
  수정. 명명 조사 중 예상과 반대되는 사실 발견 — 원래 5개구/스킬 예시(dobong)는
  전부 **복수형**(`bank_ideas_draft.txt`)인데 25개구 배치의 12개구는 전부
  **단수형**(`bank_idea_draft.txt`)이었음. 사용자 결정으로 복수형(원래 규격)을
  기준으로 통일, 12개구 파일명을 전부 rename. 커밋 `274eb7f`. 산출물 본문 내 3곳의
  단수형 자기참조는 의도적으로 보류(위 "2. 산출물 본문 내 ... 자기참조" 항목 참고).
