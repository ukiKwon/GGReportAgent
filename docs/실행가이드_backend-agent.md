# backend / agent 실행 가이드

- **작성일**: 2026-07-27
- **대상**: `backend/`(레지스트리 API, sub-project 0)와 `agent/`(RFP 자동화 파이프라인, 부분 구현)를
  로컬에서 기동/시험해보려는 사람.
- **범위 밖**: `corpus/reports/`(정적 오프라인 HTML)는 서버 기동이 필요 없음 — 브라우저에서 파일을 직접 열면 됨.

---

## 1. 레지스트리 API (`backend/`) — 바로 기동 가능

5개 Task 모두 구현·리뷰·병합 완료(commit `d3533cb`), 테스트 20개 통과 상태.

```bash
# 저장소 루트에서
py -3 -m pip install -r requirements.txt

# 1회성: corpus/institutions/ 의 각 구청 폴더를 data/registry.db에 시딩
py -3 -m backend.seed
# 기대 출력: seeded <N> institutions: [...]

# 서버 기동 (기본 포트 8000)
py -3 -m uvicorn backend.main:app --reload

# 다른 터미널에서 동작 확인
curl http://127.0.0.1:8000/institutions
curl http://127.0.0.1:8000/institutions/dobong
```

- `REGISTRY_DB_PATH` 환경변수로 DB 파일 위치를 바꿀 수 있음(기본값:
  `data/registry.db` — 재구성 스펙 §⑦-2에 따라 시스템 생성물은 `data/`에 모이며,
  `data/`는 통째로 `.gitignore`에 등록됨).
- 엔드포인트 4개: `GET /institutions`, `GET /institutions/{id}`,
  `POST /institutions/import` (CSV 업로드), `GET /institutions/{id}/artifacts`.
- 테스트만 먼저 확인하고 싶다면: `py -3 -m pytest backend/tests -v`

## 2. 에이전트 파이프라인 (`agent/`) — 완성 전, 함수 호출로만 시험 가능

`agent/pipeline.py`에 `run_pipeline()` 함수는 있지만 **CLI 진입점이 없어서**, "서비스 기동"이
아니라 Python 함수 호출/테스트로만 검증한다. 의존성은 `requirements.txt`에 다 들어 있다.

```bash
py -3.14 -m pip install -r requirements.txt
py -3.14 -m pytest agent/tests -v
```

파이프라인 자체를 끝까지 돌리려면 Python에서 직접 호출한다:

```python
from agent.pipeline import run_pipeline
result = run_pipeline(institution_name="수원시",
                      rfp_path="corpus/rfp/수원시 금고 지정 계획 공고문.pdf")
```

### LLM 백엔드 — 환경변수 4개가 전부

이 시스템은 폐쇄망용이라 코드에 사업자를 박아두지 않는다. OpenAI-호환 엔드포인트
(vLLM·Ollama·TGI 등)면 `LLM_BASE_URL` 교체만으로 붙는다.

| 환경변수 | 기본값 | 비고 |
|---|---|---|
| `LLM_MODEL` | `gpt-oss-120b` | 1순위 |
| `LLM_FALLBACK_MODEL` | `llama-4-scout-17b-16e-instruct` | 1순위가 실패하면 자동으로 재시도 |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | 로컬 Ollama. 폐쇄망 LAN 주소로 교체 |
| `LLM_API_KEY` | `not-needed` | 자체호스팅은 대개 키를 안 본다 |

```bash
# 로컬 Ollama로 돌려보려면 모델을 먼저 받아야 한다
ollama pull gpt-oss:120b
ollama serve                       # 11434 포트

# 다른 엔드포인트를 쓸 때
export LLM_BASE_URL=http://lan-gpu:8000/v1
export LLM_MODEL=gemma-3-27b-it
```

- 폴백은 **구조화 출력 단계 뒤에** 걸려 있다. 스키마 강제 방식이 모델마다 달라서
  (툴콜/json_schema) 1순위가 거기서 실패하는 경우까지 받아내야 하기 때문이다.
- 1·2순위가 같은 모델이면 폴백을 걸지 않는다(같은 모델 두 번은 낭비).
- **`OPENAI_API_KEY`와 `getpass()` 프롬프트는 없어졌다** — 예전엔 키가 없으면 실행이
  멈춰서 비대화식 실행이 불가능했다.

### 3단계(RFI 공시) — 공고문 PDF에서 본문·배점표 뽑기

`rfp_path`를 주면 `rfp_extract_node`가 `data/report_new/{기관}/`에 `rfp_text.txt`와
`rfp_scoring.json`을 만들고, 그 다음 `rfp_analysis_node`가 그것을 읽는다.

- **산출물이 이미 있으면 추출을 건너뛴다.** 사람이 `rfp-locate` 스킬로 만들어 둔 것을
  덮지 않기 위해서다.
- **이상 PDF는 멈춘다.** CID폰트·이미지 PDF(텍스트 레이어가 없거나 `�`가 1% 넘는 경우)는
  `RfpExtractError`를 올리고 진행하지 않는다. 비전으로 읽어야 하는데 그건 노드 범위 밖이므로,
  이때는 **`.claude/skills/rfp-locate` 스킬로 사람이** 페이지를 이미지로 렌더링해 처리한다.
  조용히 빈 텍스트로 진행하면 이후 모든 단계가 근거 없는 문서를 만든다.
- 배점표 구조화는 **LLM이** 한다(`OPENAI_API_KEY` 필요). 추출된 텍스트는 표의 컬럼 경계가
  무너져 있어 기계적 파싱이 불가능하다 — 수원시 공고문 실물에서
  `"…안정성소   계 25가.외부기관의…"`처럼 나오고 배점은 `817`로 붙는다.
- 텍스트 추출만 따로 보려면:
  `py -3.14 .claude/skills/rfp-locate/scripts/extract_text.py "<PDF 경로>"`
  (스킬과 파이프라인이 `agent/rfp_text.py`의 **같은 함수**를 쓴다.)

단, `institution_match_node` 이후 흐름은 `corpus/institutions/`에 이미 있는 기관 이름으로만
의미 있게 동작한다. 6단계 3팀 분화(`role_router_node`)는 아직 미구현이다.

## 3. 코퍼스 검색 인덱스 (`agent/retrieval/`) — 빌드 후 사용

`corpus/`의 .txt를 SQLite FTS5(trigram) 인덱스로 만들어 팀 채팅과 `GET /search`가
검색한다. 설계: `docs/superpowers/specs/2026-07-29-agent-retrieval-fts-design.md`.

```bash
# 인덱스 전체 재빌드 → data/corpus_index.db (gitignored, 언제든 재생성 가능)
py -3.14 -m agent.retrieval build

# CLI 검색 (스모크 확인용)
py -3.14 -m agent.retrieval search "청년 창업 지원" --limit 5
py -3.14 -m agent.retrieval search "소상공인 금융" --institution dobong --doctype bank_ideas

# API 검색 (서버 기동 후)
curl "http://127.0.0.1:8000/search?q=전통시장%20지원&limit=3"
```

- 인덱스가 없으면: 팀 채팅은 기존 "팀 파일 통째 읽기"로 **폴백**하고(기능 정지 없음),
  `/search`는 503과 빌드 안내를 돌려준다.
- `corpus/` 내용을 바꿨으면 build를 다시 실행한다(증분 갱신 없음, 전체 재빌드가 원자 교체).
- trigram 특성상 질의 3자 미만은 항상 0건이다.

## 4. DMZ 수집 서비스 (`collector/`) — 망 밖, 포트 8001

망 밖에서 공고를 수집해 **배치 폴더**(`manifest.json` + `institutions.csv` + `files/`)를
만든다. 계약은 `collector/SCHEMA.md`, 설계는
`docs/superpowers/specs/2026-07-29-dmz-collector-service-design.md`.

**두 서비스는 서로의 주소를 모른다.** 배치를 옮기는 것은 운영에서는 사람(USB),
테스트에서는 브리지 CLI다 — 그 차이 하나로 운영/테스트가 갈린다.

```bash
# 터미널 1 — 망 안 backend (8000)
py -3.14 -m uvicorn backend.main:app --port 8000

# 터미널 2 — DMZ 수집 서비스 (8001)
py -3.14 -m uvicorn collector.app:app --port 8001

# 터미널 3 — 수집 1회 실행 → batch_id 확인
curl -X POST http://127.0.0.1:8001/collect -H "Content-Type: application/json" \
     -d '{"source":"fixture"}'
curl http://127.0.0.1:8001/batches

# 브리지: DMZ에서 받아 corpus/inbox/에 놓고 망 안에 반입
py -3.14 -m collector.bridge --batch 2026-07-29_0930_fixture
# → inbox에 놓음: corpus/inbox/...
#    망 안 반입 완료: 기관 2건 ['new-...', 'new-...']
#      공고: 신규 2건 / 갱신 0건, 첨부 1건
#      배치 보관: data/batches/2026-07-29_0930_fixture

py -3.14 -m collector.bridge --batch <id> --no-import   # inbox까지만
```

- 소스는 어댑터로 갈아끼운다. v1 기본값은 `fixture`(로컬 JSON, 네트워크 불필요) 하나이고
  **실사이트 크롤러는 범위 밖**(설계 §⑨). 등록 목록은 `GET /sources`.
- 배치는 **불변**이다. `batch_id`가 분 단위(`YYYY-MM-DD_HHmm_<source>`)라 같은 분에
  두 번 수집하면 422로 거부한다 — 조용히 덮지 않는다.
- 검증 실패한 배치는 inbox에 남지 않는다(생성 시 자기검사 + 브리지에서 재검사).
- DMZ 출력 위치는 `COLLECTOR_OUT_ROOT`(기본 `data/collector/`, gitignored).
- 브리지의 `--inbox`는 **망 안 서버가 보는 inbox와 같은 자리**여야 한다. 반입 API에는
  `batch_id`만 넘기고 파일을 다시 올리지 않기 때문이다(아래 §5).

## 5. 배치 반입 (`/inbox`) — 망 안, 포트 8000

배치가 `corpus/inbox/`에 도착한 뒤 망 안에서 벌어지는 일. 설계는
`docs/superpowers/specs/2026-07-30-inbox-batch-import-design.md`,
계약은 `collector/SCHEMA.md` §⑥.

```bash
# 검사만 — DB·파일 무변경
curl -X POST http://127.0.0.1:8000/inbox/2026-07-29_0930_fixture/validate
# → {"ok":true,"errors":[],"batch_id":"..."}

# 반입 — 기관 upsert + 공고 일정 + 첨부 이동 + 배치 보관
curl -X POST http://127.0.0.1:8000/inbox/2026-07-29_0930_fixture/import
```

반입이 하는 일(이 순서를 지킨다):

1. `batch_id` **형식** 검사(허용 목록) → 실재 확인 → 배치 검증 (400 / 404 / 422)
2. `institutions.csv` → 기관 upsert, 레코드별 `bid_cases` upsert → **여기서 DB 커밋**
3. 첨부 → `corpus/rfp/`, `institutions.rfp_path` 기록
4. 배치 폴더 → `data/batches/{batch_id}`

- **DB를 먼저 커밋하고 파일을 나중에 옮긴다.** 파일 이동은 롤백이 없어서, 순서를
  뒤집으면 DB 실패 시 배치가 이미 사라져 재시도할 수 없다.
- 422는 **아무것도 바꾸지 않는다.** 배치가 inbox에 남으므로 원인을 고쳐 다시 부르면 되고,
  기관·공고는 upsert라 재실행이 안전하다.
- 공고 유일키는 `(source_slug, notice_id)`다. 같은 공고를 다시 수집하면 **새 bid_case가
  생기지 않고 일정만 갱신**된다(나중 배치가 이긴다).
- 날짜는 `deadline_at` 우선, 없으면 `contract_end` 폴백. `확정`이면 `confirmed_date`,
  `예상`이면 `expected_date`에 넣고 반대쪽은 건드리지 않는다(예상 이력 보존).
- 성공하면 배치가 inbox에서 치워지므로 **같은 `batch_id` 재호출은 404**다.
- 처리된 배치를 지우지 않고 `data/batches/`(gitignored)에 두는 이유는 `evidence.url`과
  수집 시각이 반입 근거라 감사에 필요하기 때문이다.
- 반입이 읽고 쓰는 세 곳은 `create_app(inbox_root=, rfp_root=, batches_root=)`로 바꿀 수
  있다(기본값 `corpus/inbox`·`corpus/rfp`·`data/batches`). 테스트는 이걸로 격리한다.

## 6. 오케스트레이터 워크플로 (`/institutions/{id}/run` 등) — 배선 완료

`agent/orchestrator/graph.py`의 langgraph 그래프를 `backend/`에서 백그라운드로
실행·결재하는 API. 설계는 `docs/superpowers/specs/2026-07-31-orchestrator-graph-core/`
(Task 4~6).

```bash
# ① 의존성 — langgraph, langgraph-checkpoint-sqlite 신규
py -3 -m pip install -r requirements.txt
```

경로: `rfi`(3·4단계 공시분석) → `draft` 3팀 팬아웃(5단계, 영업/기획/IT) →
🛑`기획승인` → `이관`(6단계는 그래프 밖, 사람 작업) → 🛑`이관결재` →
`packager`(7) → `verifier`(8) → 🛑`최종결재` → `finish`(9단계, 제출 대기).

```bash
# ② 서버 기동 (기관에 rfp_path가 반입돼 있어야 run이 됨 — 없으면 400)
py -3 -m uvicorn backend.main:app --port 8000

# 실행 시작 (202: 그래프가 백그라운드 스레드에서 rfi→draft를 돌고 기획승인에서 멈춘다)
curl -X POST http://127.0.0.1:8000/institutions/nowon/run

# 상태 폴링 — running=false && pending_gate="기획승인"이 될 때까지
curl http://127.0.0.1:8000/institutions/nowon/status
# → {"stage":5,"running":false,"pending_gate":"기획승인","failed":false,"tasks":[...],"notifications_unread":0}
# failed=true면 직전 실행이 예외로 죽은 것 — pending_gate도 null이므로 그대로 폴링만
# 계속하면 영원히 대기한다; run을 다시 호출해 재시작해야 한다(재시작 시 failed는 초기화됨).

# 승인 3회 — 매번 X-User-Id 헤더 필요(ASCII만; 한글 결재자명은 실무에서
# "sales-team"/"final-approver" 같은 영문 id로 대체)
curl -X POST http://127.0.0.1:8000/institutions/nowon/checkpoint \
     -H "X-User-Id: sales-team" -H "Content-Type: application/json" \
     -d '{"approved": true, "comment": null}'
# → status 폴링, pending_gate가 "이관결재"로 바뀔 때까지 대기

curl -X POST http://127.0.0.1:8000/institutions/nowon/checkpoint \
     -H "X-User-Id: sales-team" -H "Content-Type: application/json" \
     -d '{"approved": true, "comment": null}'
# → pending_gate가 "최종결재"로 바뀔 때까지 대기

curl -X POST http://127.0.0.1:8000/institutions/nowon/checkpoint \
     -H "X-User-Id: final-approver" -H "Content-Type: application/json" \
     -d '{"approved": true, "comment": null}'
# → stage=9, running=false, pending_gate=null 이면 완료(제출 대기)
```

### ③ 게이트 계약 — 반려 시 재작성

세 결재 지점은 순서대로 `기획승인`(5단계 직후) → `이관결재`(6단계 직후) →
`최종결재`(8단계 직후)다. `checkpoint`의 `{"approved": false, "comment": "..."}`는
게이트마다 다르게 되돌린다:

| 게이트 | 반려 시 이동 | 비고 |
|---|---|---|
| 기획승인 | `draft` 3팀 재팬아웃 | `sections`가 리셋되고 `revision_note`에 반려 사유가 실려 재작성됨(구본 누적 안 함) |
| 이관결재 | `기획승인`으로 되돌아감 | 재승인부터 다시 |
| 최종결재 | `packager`부터 재실행 | `verifier` 검증도 다시 돈다 |

승인 시 `X-User-Id`와 결재 시각이 `messages`에 기록되고, 9단계 도달 시
`notifications`에 "제출 대기" 알림이 쌓인다(`GET /status`의
`notifications_unread`로 확인).

### ④ 주의 — `data/graph_checkpoints.db` 삭제

이 파일이 langgraph `SqliteSaver`의 체크포인터다(gitignored, `graph_db_path=`로
경로 교체 가능). **삭제하면 진행 중이던 모든 기관의 그래프 상태가 초기화**된다
— `thread_id`가 `institution_id`라서, 파일을 지운 뒤 `run`을 다시 호출하면
게이트에서 멈춘 지점이 아니라 처음(`rfi`)부터 다시 돈다. `registry.db`의
`stage` 컬럼은 별도로 남아있어 겉보기 진행도는 유지되는 것처럼 보이지만,
그래프 자체의 인터럽트 위치·`sections` 등 중간 산출물은 이 파일에만 있으므로
운영 중에는 지우지 않는다.

### 로컬 Ollama 실측 절차 (스펙 검증 1회 — 배선만, 품질은 평가하지 않음)

```bash
# Ollama가 떠 있고 llama3.1:8b가 받아져 있는 상태에서
$env:LLM_MODEL='llama3.1:8b'; $env:LLM_FALLBACK_MODEL='llama3.1:8b'
py -3 -m uvicorn backend.main:app --port 8000

# 별도 셸: rfp_path가 반입된 기관(예: 노원, 또는 수원시 PDF를 UPDATE로 지정)으로
#   POST /institutions/{id}/run → status 폴링 → 게이트 3회 승인(X-User-Id는 ASCII)
#   → stage=9 확인. 반려 1회도 시험(재작성이 도는지).
```

확인 항목: 게이트 3회에서 실제로 멈추는지, `tasks`/`messages`/`notifications`
테이블에 기록이 쌓이는지(`sqlite3 data/registry.db "SELECT * FROM messages"` 등),
반려 1회 시 재작성이 도는지. 8B 모델의 산출물 품질은 평가 대상이 아니다.

## 7. 팀 대화·업로드·완료 API (`/tasks`, `/institutions/{id}/complete`)

6단계(3팀 세부기획)는 그래프 밖 사람 작업이라, 팀별 진행은 `tasks` 테이블 기반
API로 오간다. 설계는 Task 3~5(sub-project 4). **쪽지함(알림 읽기 화면)은
연기됐다**(사용자 결정 2026-07-31, `dashboard/index.html`에 비활성 버튼만
자리 표시) — `notifications` 행(결재요청·되물음·이관) 자체는 이미 쌓이고
있으므로, 필요하면 `GET /institutions/{id}/status`의 `notifications_unread`나
DB를 직접 조회한다:

```bash
sqlite3 data/registry.db "SELECT recipient, kind, content FROM notifications ORDER BY created_at DESC LIMIT 5"
```

### ① 기관 대화(참여검토) — `/institutions/{id}/chat` — POST 스트리밍 / GET 이력

```bash
# 대화 이력 조회
curl http://127.0.0.1:8000/institutions/nowon/chat

# 메시지 전송 — 응답이 text/event-stream으로 청크 단위 스트리밍된다
curl -N -X POST http://127.0.0.1:8000/institutions/nowon/chat \
     -H "Content-Type: application/json" \
     -d '{"content": "이 공고 참여할 만한가요?"}'
```

- `-N`(no-buffer)을 빼면 curl이 스트림을 한꺼번에 모아서 보여준다 — 실제
  청크 단위 도착을 보려면 필요.
- 응답이 끝나면 서버가 전체 답변을 합쳐 `agent` 메시지 1건으로 DB에 저장한다
  (다음 `GET`에 바로 반영).

### ② 팀 작성물 업로드 — `/tasks/{task_id}/upload` — 즉시검사 응답

```bash
curl -X POST http://127.0.0.1:8000/tasks/task-1/upload \
     -H "X-User-Id: it-user" -H "Content-Type: application/json" \
     -d '{"content": "IT 시스템 구축 방안 초안..."}'
# → {"coverage":[{"scoring_item":"전산 시스템 구축","covered":true,"gap_note":null}],
#    "pii_count":0,"skipped":null}
```

- 담당자(`assignee`)만 올릴 수 있다 — 아니면 403, `task_id` 없으면 404.
- 미배정 task(assignee가 NULL, 오케스트레이터가 만든 직후)는 첫 업로드가 담당을 선점한다.
- `rfp_scoring.json`이 아직 없으면(공고문 미추출) `coverage`는 빈 배열이고
  `skipped`에 사유가 담긴다("배점표 미추출…" 또는 "{팀}팀 배정 항목 없음…").
- 업로드마다 `coverage_map.json`이 **누적 갱신**된다(파일 위치는
  `{output_root}/{기관명}/coverage_map.json` — 기본
  `data/report_new/{기관명}/coverage_map.json`). 항목별 최신 팀·covered·
  gap_note·pii_count만 남고, 다른 팀이 쓴 항목은 덮지 않는다.

### ③ 완료 처리 — `/institutions/{id}/complete` — stage 9 전용, 아카이브

```bash
curl -X POST http://127.0.0.1:8000/institutions/nowon/complete \
     -H "X-User-Id: sales-team"
# → {"archive_dir":"data/report_archive/노원구/2026-07-31","completed_by":"sales-team"}
```

- **stage 9(제출 대기)가 아니면 409** — 최종결재까지 끝나야 호출 가능.
- 아카이브 경로는 `{archive_root}/{기관명}/{YYYY-MM-DD}`(기본 `data/report_archive/`,
  `create_app(archive_root=...)`로 교체 가능) — 같은 날 재호출하면 이전 내용을
  지우고 다시 쓴다(`shutil.rmtree` 후 재생성).
- 복사되는 산출물: `rfp_text.txt`·`rfp_scoring.json`·`coverage_map.json`·`*.pptx`
  + 전 태스크의 메시지 이력(`tasks_dump.json`) + `manifest.json`.
- 성공 시 `bid_cases.participation_status`가 `제출완료`로 바뀐다.

## 확인 방법

- `backend/`: 위 curl 두 개가 200과 JSON을 반환하면 정상.
- `agent/`: `pytest agent/tests -v` 통과 여부로 개별 노드 건전성만 확인 가능;
  end-to-end 실행은 위 제약 때문에 완전한 검증이 아님.
- 오케스트레이터: `pytest backend/tests/test_api_workflow.py -v` — subagent만
  목(mock)하고 그래프·게이트·체크포인터는 실물로 돌려 승인 3회→stage 9,
  실패 시 running=false 유지를 검증한다. 로컬 Ollama 실측은 위 §6 절차로
  별도 수행(모델 배선 확인용, CI 대상 아님).
- §7(대화·업로드·완료): `pytest backend/tests/test_api_chat.py backend/tests/test_api_upload.py backend/tests/test_api_complete.py -v`.
- 실물 subagent 통합(F4): `pytest agent/tests/test_orchestrator_integration.py -v` —
  rfi만 목, `draft_team`(`content_writer_node` 포함)은 실물로 돌려 그래프 채널에
  섹션이 실제로 실리는지 확인한다.

## 8. 대시보드 (`dashboard/`) — 서버 모드 (정적 자산 마운트)

### 실행 방법 — 브라우저에서 대화형 편집

기본 동작은 file:// 더블클릭(오프라인, 로컬 파일만 읽음)이지만, **서버 모드에서 기동**하면
기관 데이터를 API로 가져오고 PUT으로 저장할 수 있다.

```bash
# 터미널 1 — backend 서버 (정적 자산 마운트)
py -3 -m uvicorn backend.main:app --reload
# → http://localhost:8000/ 에서 대시보드 접속 가능
#   (환경변수 STATIC_DIR로 경로 교체 가능, 기본값: dashboard/)

# 또는 명시적으로 STATIC_DIR 지정
export STATIC_DIR=path/to/your/dashboard
py -3 -m uvicorn backend.main:app --reload
```

### 대시보드 정상 작동 확인

서버가 뜬 뒤 브라우저에서:

1. **http://localhost:8000/** 열기
   - 정적 index.html(대시보드 UI)이 로드됨
   - 개발자도구 콘솔에서 네트워크 오류가 없어야 함

2. **우측 탭 "지역구 상세" 클릭**
   - 기관 카드가 드러남
   - 각 카드의 "편집" 버튼을 통해 기관 정보(기간·type 등)를 수정 가능

### 서버 모드 vs file:// 차이

| 기능 | file:// | 서버 모드 |
|---|---|---|
| 정적 페이지 로드 | ✓ | ✓ |
| API `/institutions` 읽기 | ✗ (CORS/로컬 불가) | ✓ |
| 편집 저장 (PUT) | ✗ | ✓ (institutionId 있는 행만) |
| CSV 업로드 | ✗ | ✓ (서버로 반입) |

### 데이터 병합 규칙

병합은 **서버가 아니라 클라이언트(`dashboard/js/serverdata.js`)에서** 일어난다. 페이지가
항상 로드하는 정적 스크립트 `dashboard/data/institutions.js`(`window.institutions`)와
`GET /institutions` 응답을 `app.bootstrapServer()`가 `serverdata.mergeUnion(window.institutions,
rows)`로 합친다:

1. **정적 번들** (`window.institutions` — 좌표·출처·신뢰도 등 서버에 없는 필드 포함)
2. **API 응답** (DB의 기관 목록 — `institution_id`/`name_ko`/`region_code`/`type`/
   `contract_end`/`last_bid`/`term`/`stage`만 있음)
3. **병합 키는 `institutionId`가 아니라 이름 매칭**: 서버 행의 `name_ko` ↔ 번들 행의 `name`이
   같으면 그 번들 레코드에 서버 필드를 덮어쓴다(부분 갱신, 나머지 필드는 보존). 이름이
   매칭되지 않는 서버 행은 새 레코드로 추가되고, 매칭되지 않는 번들 레코드는 그대로 남는다.
4. **로컬 편집 overlay(`localStorage`)는 서버 모드에서 서버 필드를 덮지 않는다.**
   덮는 것은 서버에 대응 필드가 아예 없는 6개뿐이다 —
   `구시군코드·확정여부·경도·위도·출처·수정일`(`store.LOCAL_ONLY_FIELDS`).
   서버 필드를 덮으면 한 번 편집한 행이 타 사용자의 서버 변경을 영영 못 받으므로
   그렇게 하지 않는다(계획 C1). `file://` 폴백에서는 overlay가 유일한 저장소라
   기존대로 전체가 적용된다.

### 편집 저장 조건

화면에서 기관 정보를 수정하고 "저장" 클릭 → PUT `/institutions/{institutionId}`

**저장이 서버에 반영되는 조건:**
- institutionId가 있어야 함 (누락 시 로컬 임시 저장만, 서버 반영 안 됨 — 이 경우 화면이
  "서버 필드는 저장되지 않는다"고 알린다)
- 로그인 헤더는 필요 없음 — PUT `/institutions/{id}`는 X-User-Id를 요구하지 않는다
- 404 응답: 기관이 존재하지 않음 → 먼저 반입으로 기관 생성 필요

### CSV 업로드 — 서버 반입 전환

기본값은 클라이언트(대시보드)에서 `institutions.js` 갱신이었으나,
**서버 모드에서는 `/institutions/import` (POST CSV)로 통일**:

```bash
# 기관 CSV → 서버로 반입 → DB에 저장 → API `/institutions` 응답에 포함
curl -X POST http://127.0.0.1:8000/institutions/import \
     -F "file=@institutions.csv"
```

CSV 헤더(한글, `backend/csv_import.py`의 `HEADER_MAP` 실물): `기관명`, `기관구분`,
`지역코드`, `입찰주기`, `지난입찰일`, `입찰예상일`.

대시보드가 다루는 12열(`logic.ALL_FIELDS`) 중 이 6개만 서버가 받는다 — **확정여부·경도·위도·
출처·구시군코드는 서버 반입 시 소실된다**(file:// 폴백 모드에서는 로컬에 그대로 보존됨).

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `REGISTRY_DB_PATH` | `data/registry.db` | 기관 데이터 DB 경로 |
| `STATIC_DIR` | `dashboard/` | 정적 자산(index.html, js/, 등) 마운트 경로 |

```bash
# 예: 다른 위치의 대시보드 마운트
export STATIC_DIR=/custom/path/to/dashboard
py -3 -m uvicorn backend.main:app --port 8000
```

STATIC_DIR 기본값(`dashboard`)은 **저장소 루트에서 기동**하는 것을 전제한다. 다른 위치에서
실행하거나 STATIC_DIR을 존재하지 않는 경로로 지정하면 경고 한 줄
(`[warn] 정적 디렉터리를 찾지 못해 마운트를 건너뜁니다: …`)만 남기고 **정적 마운트를
건너뛴다** — API는 정상 작동하고 GET `/`만 404가 된다. 대시보드 화면이 필요하면 저장소
루트에서 기동하거나 STATIC_DIR을 실존하는 경로로 지정할 것. 정적 마운트 없이 API만 쓰려면
`STATIC_DIR=""`(빈 문자열)로 지정해도 된다.

> 계획 C1 이전에는 이 경우 `StaticFiles`가 `RuntimeError`를 던져 **모듈 임포트 자체가
> 실패**했다(API까지 함께 죽었다). 지금은 위와 같이 경고 후 건너뛴다.

### 스모크 테스트 (자동화 확인)

단순히 정적·API·PUT이 한 앱에서 함께 동작하는지 확인:

```bash
py -3 -m pytest backend/tests/test_static_e2e.py -v
```

테스트 항목:
- 실제 dashboard/index.html 로드 (GET / → \<title> 포함 확인)
- JavaScript 파일 서빙 (GET /js/serverdata.js → 200)
- API 응답 (GET /institutions → JSON 반환)
- PUT 저장 (PUT /institutions/{id} → 필드 갱신 확인)

---

## 9. 워크플로 탭 (대시보드) — 오케스트레이터를 화면에서 운전한다

§6의 run·checkpoint·status를 curl 대신 화면에서 쓰는 뷰다(계획 C1). **서버 모드 전용** —
`file://`로 `dashboard/index.html`을 직접 열면 오케스트레이터 API가 없으므로 탭 버튼 자체가
보이지 않는다. §8대로 서버를 띄우고 `http://localhost:8000/` 로 접속해야 나타난다.

```bash
py -3 -m uvicorn backend.main:app --port 8000   # 저장소 루트에서
# 브라우저: http://localhost:8000/ → 헤더 오른쪽 [워크플로] 탭
```

### 사용 순서

1. **기관 선택** — 드롭다운에는 **서버에 등록된 기관만** 나온다(`institution_id`가 있는 행).
   비어 있으면 CSV 반입(§8) 또는 배치 반입(§5)이 먼저다.
2. **▶ 실행** — `POST /institutions/{id}/run`. 이미 돌고 있거나 결재 대기 중이거나
   9단계(제출)까지 끝났으면 버튼이 비활성이다.
3. **🛑 결재 3회** — 5단계 `기획승인` → 7단계 `이관결재` → 8단계 `최종결재`.
   결재 대기가 되면 [승인]·[반려]가 활성화된다. **결재자 이름은 한글도 된다** — 화면이
   body의 `by` 필드로 보내기 때문이다(`X-User-Id` 헤더는 ASCII만 허용하므로 쓰지 않는다).
   반려하면 의견(comment)이 재작성 프롬프트로 전달된다.
4. **제출** — 9단계 도달 후 완료 아카이브는 §7의 `POST /institutions/{id}/complete`
   (화면 버튼은 C2 범위).

### 화면 읽는 법

- **스테퍼(9칸)** — 지난 단계는 파란 테두리, 현재 단계는 강조색, 결재 대기 단계는 주황.
  칸 안의 `🛑 기획승인` 같은 표시는 그 단계에 결재 게이트가 있다는 뜻이고, 오른쪽 작은
  숫자는 그 단계에 남은 기록 건수다. **칸을 누르면** 그 단계에서 실제로 오간 지시·보고·
  결재·알림이 아래 로그 영역에 펼쳐진다(데이터원은 `GET /institutions/{id}/timeline`).
- **상태 줄** — `⏳ 실행 중` / `🛑 … 대기` / `⚠️ 실패 — 실행을 다시 시도하세요` / `대기`.
- **참여자 카드** — 전체 팀 목록이 아니라 **선택한 단계에 실제로 기록을 남긴 팀**만 나온다.
  아무 단계도 안 고르면 현재 단계 기준이고, 스테퍼에서 다른 칸을 누르면 카드도 함께
  갈아끼워진다. 한 장에 담기는 것:
  - **팀 + 사람 이름** — `예산 · 정 대리`. 그 단계에 사람 기록이 없고 에이전트만 돌았으면
    `영업 agent`. (사람으로 치는 것은 `human`·`user` 역할의 작성자뿐 — `agent` 메시지의
    작성자는 이름 자리에 올리지 않는다.)
  - **그 단계에서 한 일 요약** — 그 팀의 마지막 기록 한 줄(길면 말줄임, 전체는 툴팁).
  - **기록 건수 · 진행률·상태** — `기록 3건 · 작성중 · 65%`. 진행률은 팀 작업 기준이라
    단계가 바뀌어도 같은 값이다.
  - **카드를 누르면** 그 팀 작업의 전체 지시·보고 로그(`GET /tasks/{id}`)로 바뀐다.
    단계 상세와 **같은 자리를 나눠 쓰므로** 제목(`■ 5단계 「제안서 기획」 수행 내용` /
    `■ 예산 작업 로그`)으로 지금 무엇을 보고 있는지 구분한다.
- **로그의 역할 표기** — 영문 role 옆에 한글 부제가 붙는다.
  `orchestrator 총괄 agent` / `agent 영업 agent` / `human 김 차장`(사람은 실명).
  알림(`결재요청`·`되물음`·`이관`·`쪽지`)은 그 자체가 설명이라 부제가 없다.
  실명은 `messages.author`에 남는다 — 결재는 `checkpoint` body의 `by`, 팀 대화는
  `X-User-Id`가 그 값이 된다.
- **배점표 매핑 표** — 평가항목별로 어느 팀이 맡아 어디까지 썼는지.
  - `작성됨`(파란 줄) — 그 항목을 담당팀이 채웠다.
  - `미충족`(주황 줄) — 담당팀은 정해졌는데 내용이 배점 요건을 못 채웠다(비고에 사유).
  - `미배정`(빨간 줄) — 아무 팀도 안 맡았다. **제출 전에 반드시 없애야 하는 상태다.**
  - `개인정보` 열의 `⚠️ n` — 업로드 즉시검사(§7)가 잡은 PII 건수.
  - 배점표가 아직 없으면(3단계 이전) 표 대신 안내 문구가 나온다 — 오류가 아니다.
  - 데이터원은 `GET /institutions/{id}/coverage-map`
    (`rfp_scoring.json` + `coverage_map.json` 병합).

### 폴링

현황은 **2초 주기**로 갱신되며, **실행 중일 때만** 돈다 — 멈춰 있거나 다른 탭으로 나가면
폴링도 멈춘다(불필요한 요청 없음). 실행·결재 버튼을 누른 직후에는 자동으로 다시 붙는다.

### 데모 데이터로 화면 확인하기 — 명령 하나

실제로 그래프를 끝까지 돌리지 않고도 9단계 전 구간이 채워진 화면을 보려면:

```bash
py -3 -m backend.demo          # 시딩 + 데모 투입 + 서버 기동까지 한 번에
# → http://localhost:8000/  에서 [워크플로] 탭
```

```bash
py -3 -m backend.demo --port 8123
py -3 -m backend.demo --institution nowon --stage 6
py -3 -m backend.demo --reset               # 데모 자료를 통째로 지우고 새로 만든다
py -3 -m backend.demo --reset --no-serve    # 지우기만
```

**데모는 개발/운영 자료와 파일이 갈려 있다**(`backend/demo_paths.py`). 데모가 운영
자료를 건드릴 수 있는 경로 자체가 없고, 정리는 파일 삭제 한 번이면 끝난다.

| | 개발/운영 | 데모 |
|---|---|---|
| DB | `data/registry.db` | `data/demo.db` |
| 산출물 | `data/report_new/` | `data/demo_report_new/` |
| 그래프 체크포인트 | `data/graph_checkpoints.db` | `data/demo_graph.db` |
| 아카이브 | `data/report_archive/` | `data/demo_report_archive/` |
| 실행 | `py -3 -m uvicorn backend.main:app` | `py -3 -m backend.demo` |

경로는 `create_app`에 직접 넘기므로 **운영용 `REGISTRY_DB_PATH`가 설정돼 있어도 데모에
영향이 없다.** `data/`는 통째로 gitignore 대상이라 어느 쪽도 커밋되지 않는다.

들어가는 것: 팀 작업 6건(`RFI분석`·`영업`·`전산`·`예산`·`취합`·`검증`, 담당자 김 차장·
권 차장·정 대리·박 수석) + 1~9단계 지시·보고·결재 메시지 23건 + 알림 6건 +
배점표 6항목(작성됨 3·미충족 2·미배정 1, 개인정보 1건). 배지 3색과 단계별 로그를
한 화면에서 다 볼 수 있게 짠 조합이다. 문구를 바꾸려면 `backend/demo_seed.py` 상단의
`TEAMS`·`MESSAGES`·`NOTIFICATIONS`·`SCORING`·`COVERAGE`를 고치고 다시 실행하면 된다.

- 같은 명령을 여러 번 돌려도 중복이 쌓이지 않는다(넣기 전에 스스로 지운다).
- 데이터만 다시 깔고 서버는 그대로 두려면 `py -3 -m backend.demo_seed`
  (기본 대상이 `data/demo.db`다 — 운영 DB로 가지 않는다).
- **`rfp_text.txt`는 일부러 만들지 않는다.** `agent/pipeline.py`의 `RFP_ARTIFACTS`가
  둘 다 있어야 참이라, 없으면 `POST /run`이 400으로 막혀 실수로 LLM 실행이 시작되지
  않는다. 즉 데모 상태에서 [▶ 실행]을 눌러도 안전하다.
- **파이썬이 여러 개 깔린 PC**에서는 `py -3`가 패키지 없는 버전을 가리킬 수 있다.
  그럴 때 `backend.demo`는 traceback 대신 무엇을 하면 되는지(설치 명령 / 다른 런처로
  재실행 / `py -0`로 목록 확인) 알려주고 멈춘다.

---

## 10. 대화 탭·쪽지함·지식 탭 (대시보드) — 협업 화면

§9의 워크플로 탭과 같이 **서버 모드 전용**이다. `file://`로 열면 탭 버튼과 쪽지함
버튼이 아예 보이지 않는다.

### 먼저: 상단바의 "나" (이름 + 소속)

```
나: [김 차장] [영업팀 ▾]     ✉ 쪽지함(3)
```

한 번 입력하면 브라우저에 저장된다(개인 설정이라 localStorage). 이 값이 세 곳을 좌우한다.

**계정 전환(데모 전용)** — `backend.demo`로 띄우면 옆에 `계정 전환…` 드롭다운이 하나 더
생긴다. 목록은 코드에 박혀 있지 않고 **서버가 실데이터에서 뽑아준다**(`GET /accounts`):
`tasks.assignee`의 사람들 + `notifications.recipient`의 역할들. 골라 누르면 이름·소속이
한 번에 바뀌어 **그 계정으로 보이는 화면**(쪽지함·결재자·대화 글쓴이)을 바로 확인할 수 있다.

- 사람 계정의 소속은 **그 사람이 실제로 쪽지를 받는 이름**으로 맞춰 준다 —
  `tasks.team`이 `영업`이어도 알림은 `영업팀` 앞으로 오기 때문이다. 그대로 뒀다면
  계정을 바꿔도 쪽지함이 비었을 것이다.
- 운영 모드에서는 `demo` 플래그가 false라 드롭다운이 **아예 뜨지 않는다**.
- 데모 계정별 쪽지 수(실측): 김 차장(영업팀) 4 · 권 차장(전산팀) 1 · 디자이너 1 ·
  인사권자 1 · 박 수석(검증) 0 · 정 대리(예산) 0.

| 값 | 쓰이는 곳 |
|---|---|
| 이름 | 대화창 글쓴이(`chat_messages.author`), 쪽지 보낸이, 워크플로 탭 **결재자 이름 기본값** |
| 소속 | 쪽지함 조회 |

**소속이 왜 필요한가** — 시스템이 보내는 알림은 사람 이름이 아니라 **역할** 앞으로 온다
(`영업팀`·`디자이너`·`인사권자` — `agent/orchestrator/graph.py`의 `notify()` 참조).
이름만으로 조회하면 결재요청·되물음이 하나도 안 보인다. 그래서 쪽지함은
**`소속`과 `이름` 둘 다**로 조회한다(`GET /notifications?recipient=영업팀&recipient=김 차장`).

### 대화 탭 — 기관 단위 상시 채팅

기관을 고르고 질문하면 **영업/전산/예산 3관점**으로 참여검토 답변이 스트리밍된다
(`POST /institutions/{id}/chat`). 근거는 코퍼스(FTS 인덱스가 있으면 검색, 없으면 통째로
읽기 폴백)와 반입된 공고 원문(`rfp_text.txt`)이다.

- Enter 전송 / Shift+Enter 줄바꿈. 전송 중에는 기관을 바꿀 수 없다.
- **[중단]** 을 누르면 거기까지 받은 답변이 `…(응답이 중단되었습니다)` 표시와 함께
  이력에 남는다 — 질문만 남고 답이 통째로 사라지지 않는다.
- 답변이 비어 있으면 `(응답을 받지 못했습니다 — LLM 엔드포인트가 켜져 있는지 확인하세요)`
  가 뜬다. §2의 `LLM_BASE_URL`을 확인할 것.
- **SSE가 아니다.** `EventSource`는 GET만 되는데 이 엔드포인트는 POST라 쓸 수 없어,
  응답은 `text/plain` 평문 스트림이고 화면은 `fetch` + `ReadableStream`으로 읽는다.

### 쪽지함 — 결재요청·되물음·이관·쪽지

상단 **✉ 쪽지함** 버튼(미읽음 수 배지, **30초 주기** 갱신) → 가운데 오버레이.

- 종류별 색: `결재요청`(주황) · `되물음`(빨강) · `이관`(파랑) · `쪽지`(무채색).
- 보낸이가 **시스템**이면 그래프가 만든 것이고, 사람 이름이면 누가 보낸 쪽지다.
- 각 줄의 **[읽음]** 으로 처리(다시 눌러도 안전). 이걸로 미읽음 수가 줄어든다.
- 하단 폼으로 **팀 또는 사람 앞으로 쪽지 발송**. 화면에서 만들 수 있는 것은 `쪽지`뿐이고
  `결재요청`·`되물음`·`이관`은 **시스템만** 만든다 — 그래야 흐름을 신뢰할 수 있다.

```bash
# API로 확인하려면
curl "http://127.0.0.1:8000/notifications?recipient=영업팀&recipient=김%20차장"
curl -X POST http://127.0.0.1:8000/notifications -H "Content-Type: application/json" \
     --data-binary @note.json      # {"recipient":"전산팀","content":"…","sender":"김 차장"}
curl -X POST http://127.0.0.1:8000/notifications/<id>/read
```

### 지식 탭 — 코퍼스 전문검색

`GET /search`(§3의 trigram FTS5 인덱스)를 화면에서 쓴다. 파일명·문서종류·기관·경로와
스니펫이 나오고 검색어가 강조된다.

- **검색어는 3자 이상.** trigram이라 그보다 짧으면 항상 0건이며, 화면이 미리 알려준다.
- 인덱스가 없으면 **빌드 안내 문구를 그대로** 보여준다(결과 없음으로 감추지 않는다):
  `py -3.14 -m agent.retrieval build`
- 기관·문서종류(spec/plan/bank_ideas) 필터 지원.

### 화면 확인

§9의 데모를 그대로 쓰면 된다 — 쪽지 6건(결재요청·되물음·이관·쪽지)이 함께 들어간다.

```bash
py -3 -m backend.demo          # 시딩 + 데모 투입 + 서버 기동
```

---

## 11. 입찰상황판 — 공고 일정과 참여 결정 (계획 D)

### 지도의 입찰일은 어디서 오는가

**반입된 공고(`bid_cases`)가 이긴다.** 우선순위는 이렇다.

1. `bid_cases.confirmed_date` → 지도에 **확정**으로(빗금 없이)
2. `bid_cases.expected_date` → **추측**으로(빗금)
3. 둘 다 없으면 `institutions.contract_end`(CSV 반입) — 지금까지의 동작 그대로

공고가 반입되지 않은 기관은 아무것도 달라지지 않는다. 데이터원은
`GET /bidcases/latest`(기관별 최신 1건)이고, `app.bootstrapServer`가 `/institutions`와
함께 받아 병합한다.

> 지도 코드(`dashboard/js/render.js`)는 **한 줄도 고치지 않았다.** 확정/추측 빗금과
> 긴급도 색은 원래 `contractEnd`·`confirmed`로 그려지고 있었기 때문에, 병합 계층에서
> 값을 갈아끼우는 것으로 충분했다.

**로컬 편집과의 관계**: 공고가 있는 기관은 화면에서 `확정여부`를 바꿔도 지도에 반영되지
않는다(공고가 이긴다). 공고가 없는 기관은 지금처럼 로컬 편집이 그대로 쓰인다.

### 참여 결정 — 버튼 하나가 아니라 3차 결재

워크플로 탭 맨 위 **참여 결정** 카드. `POST /bidcases/{id}/participation-decisions`가
**tier 1 → 2 → 3을 순서대로** 요구하고, 3차까지 '참여'가 모여야 `참여확정`이 된다
(그때 팀 Task도 만들어진다). 결재자는 상단 프로필의 **소속이 `role`, 이름이 `by`** 로
기록된다.

**혼자서 3차 결재를 재현하려면** 데모의 계정 전환기를 쓴다(§10):

```
계정 전환 → 김 차장(영업팀)  → [참여]   … 1차
계정 전환 → 권 차장(전산팀)  → [참여]   … 2차
계정 전환 → 정 대리(예산팀)  → [참여]   … 3차 → 참여확정
```

- `미참여`를 고르면 `미참여확정`, `보류`면 `보류`로 끝나고 더 못 누른다.
- 반입된 공고가 없는 기관은 카드 대신 "반입이 먼저"라고 안내한다.

### 참여확정 → 3·4단계 자동 시작

확정되면 서버가 곧바로 오케스트레이터를 시작한다(`POST /run`과 같은 조건).

- **못 시작해도 결재는 성공(200)** 이다 — 자동 실행 실패가 결재를 되돌리면 안 된다.
- 대신 **왜 못 시작했는지 쪽지가 영업팀 앞으로 간다.** 조용히 실패하면 아무도 분석이
  안 돌고 있다는 걸 모른 채 기다리게 된다.
  ```
  참여확정됐지만 입찰 분석을 시작하지 못했습니다 — 공고문(rfp_path)이 아직
  반입되지 않았습니다. 워크플로 탭에서 [▶ 실행]으로 직접 시작하세요.
  ```
- 응답의 `run_started`로 화면이 즉시 알려준다.
- **데모에서는 일부러 실패한다** — `rfp_text.txt`를 만들지 않기 때문(§9). 3차 결재를
  마치고 쪽지함을 열면 위 쪽지가 와 있는 것을 확인할 수 있다.

### 데모에 들어 있는 공고 2건

| 기관 | 일정 | 지도 표시 |
|---|---|---|
| 도봉구 | 확정 `2026-09-30` | 확정(빗금 없음) |
| 노원구 | 예상 `2026-05-20` | 추측(빗금) |

둘을 나란히 두어 일정 우선순위가 눈으로 확인되게 했다.

---

## 12. 정합성 — 워크플로와 참여 결정의 선후 (계획 E)

### 규칙: 참여확정이 먼저다

`참여확정(3차 결재)` → `팀 Task 생성` → `5·6단계 진행` 이 순서는 코드에 박혀 있다
(`create_tasks_for_bid_case`). 그래서 **`POST /run`은 최신 공고가 `참여확정`이 아니면
400으로 막는다.**

```bash
curl -X POST http://127.0.0.1:8000/institutions/nowon/run
# → 400 참여 결정이 끝나지 않았습니다(현재: 검토중)
#      — 워크플로 탭에서 참여 결정 3차 결재가 먼저입니다
```

공고가 아예 없거나 `미참여확정`·`보류`여도 막힌다. **참여확정 시 자동 시작(§11)은 이
가드를 우회하지 않는다** — 애초에 참여확정일 때만 불리기 때문이다.

> 왜 에이전트가 아니라 가드인가: 이건 참/거짓이 분명한 **선후 규칙**이라 판단이 필요 없다.
> LLM에게 물으면 느리고 비결정적인데다, 무엇보다 **막지를 못하고** 이미 생긴 뒤에
> 지적만 한다. 판단이 필요한 것(작성물이 배점 요건을 채웠는가)은 검증가의 몫이다.

### 이미 어긋나 있는 것 찾기

가드는 앞으로를 막을 뿐이다. 가드 이전에 만들어진 상태는 `GET /consistency`로 훑는다.

```bash
curl http://127.0.0.1:8000/consistency
curl "http://127.0.0.1:8000/consistency?institution_id=dobong"
# → {"ok": true, "findings": []}
```

| 규칙 | 무엇이 문제인가 |
|---|---|
| `stage_without_bid_case` | 단계는 올라갔는데 근거가 될 공고가 없다 |
| `stage_without_confirmation` | 참여 결정 전에 워크플로가 진행됐다 |
| `declined_but_advanced` | 미참여·보류인데 진행됐다 |
| `confirmed_without_tasks` | 참여확정인데 팀 Task가 없다(확정 당시 `research_status`가 '완료'가 아니었을 수 있다) |

- **1·2단계는 참여 결정 이전이라 정상**으로 본다(3단계부터 검사).
- 응답에는 규칙 이름과 함께 **"무엇이 왜 문제인지"** 가 붙는다 — 사람이 고칠 수 있어야 하므로.
- 워크플로 탭은 선택한 기관에 어긋난 것이 있으면 **맨 위에 빨간 경고**를 띄운다.
  정상이면 아무것도 그리지 않는다.
