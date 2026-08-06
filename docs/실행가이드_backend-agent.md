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
| `LLM_MODEL` | `gpt-oss-120b` | 1순위. **`auto`를 넣으면** 하드웨어(RAM·vCPU)와 `ollama list`를 보고 3종(`llama3.1:8b`/`llama3.2:3b`/`llama3.2:1b`) 중 고른다 |
| `LLM_FALLBACK_MODEL` | `llama-4-scout-17b-16e-instruct` | 1순위가 실패하면 자동으로 재시도 |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | 로컬 Ollama. 폐쇄망 LAN 주소로 교체 |
| `LLM_API_KEY` | `not-needed` | 자체호스팅은 대개 키를 안 본다 |

> **모델이 없으면 화면이 이유를 알려준다(2026-08-04).** 기본값 `gpt-oss-120b`가 없는
> 환경에서 대화 탭을 쓰면 답변 자리에 `[답변 실패] 모델 '…'을(를) 찾을 수 없습니다`가
> 뜨고, 무엇을 바꾸면 되는지(`LLM_MODEL`, `ollama list`)까지 적혀 나온다. 예전에는
> "엔드포인트가 켜져 있는지 확인하세요"라는 **엉뚱한 안내**만 떴다 — 엔드포인트는
> 멀쩡했고 모델만 없었기 때문이다.

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
- **기록에 남는 모델명은 "쓰기로 한 1순위"가 아니라 실제로 답을 만든 모델이다.**
  폴백이 돌면 둘이 다른데, 예전에는 늘 1순위를 적어서 화면의 🧠 표시가 실제와
  어긋났다(폴백이 흔한 상황 — 엔드포인트에 모델이 안 올라와 있거나 컨텍스트 초과).
  - `agent/llm.py`의 `_ModelTracker`가 `on_llm_end`(= **성공한** 호출)에서 그 모델
    이름을 **스레드 로컬**에 적는다. `on_llm_start`가 아닌 이유: 폴백이 돌면 1순위도
    start는 찍고 실패한다.
  - 기록하는 쪽은 작업 시작에 `reset_last_model()`을 부르고, 끝날 때
    `last_used_model() or current_model()`을 쓴다. **reset을 빠뜨리면 앞 노드가 남긴
    모델명이 다음 기록에 붙는다.**
  - 스레드 로컬인 이유: 그래프는 기관당 스레드 하나로 돌고(`OrchestratorService._spawn`),
    한 노드 안에서 invoke와 기록이 같은 스레드에서 순서대로 일어난다. 노드 시그니처에
    컨텍스트를 실어 나르는 배선이 필요 없다. ⚠️ 스트리밍 응답처럼 **다른 스레드에서
    도는 경로는 그 스레드 안에서** reset을 불러야 한다(`event_stream` 참고).
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
- `corpus/` 내용을 바꿨으면 **`reindex`로 변경분만** 갱신한다(→ §13). 전체 `build`는
  임베딩까지 포함하면 CPU에서 1시간쯤 걸린다.
- trigram 특성상 질의 3자 미만은 FTS로는 항상 0건이다. **의미 검색이 켜져 있으면
  짧은 질의도 답한다**(→ §13).

> **이 절은 계획 F 이후 §13으로 확장됐다.** 검색은 이제 FTS 단독이 아니라
> **FTS + 임베딩 하이브리드**다. 임베딩 설정·재색인·아카이브 색인은 §13을 볼 것.

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
  gap_note가 남고, 다른 팀이 쓴 항목은 덮지 않는다.
- **개인정보(PII)는 항목이 아니라 팀 단위 값**이다 — 업로드 본문을 한 번 스캔한
  결과라 항목별로 분해할 수 없다. 그래서 파일 안에서도 `teams`에 팀당 한 번만
  적는다(v2 형식: `{"version":2, "items":{…}, "teams":{"전산":{"pii_count":3}}}`).
  - 예전 v1은 팀 값을 그 팀의 **모든 항목에 복제**해 넣었다. 그 탓에 ⓐ화면이 항목
    수만큼 부풀려 세고(3건·12항목 → 36건) ⓑ배점표를 다시 뽑아 어떤 항목이 그 팀
    배정에서 빠지면 옛 값이 stale로 남아 같은 팀 항목끼리 값이 갈렸다.
  - **옛 파일은 고쳐 쓰지 않고 읽을 때 v2로 올린다**(`upload_check.load_coverage_map`)
    — 이미 만들어진 산출물과 아카이브에 복사된 사본이 그대로 열려야 하기 때문이다.
  - `GET /institutions/{id}/coverage-map`은 `teams: [{team, pii_count}]` 와
    `pii_total`을 따로 준다. `criteria[]`에는 PII가 실리지 않는다 — 실으면 읽는 쪽이
    또 합산한다. 화면(배점표 매핑 탭)도 열이 아니라 **요약줄에 팀별로** 보여준다.

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
(`영업팀`·`디자이너`·`영업부장` — `agent/orchestrator/graph.py`의 `notify()` 참조).
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

1. `bid_cases.confirmed_date` → **확정**
2. `bid_cases.expected_date` → **추측**
3. 둘 다 없으면 `institutions.contract_end`(CSV 반입) — 지금까지의 동작 그대로

공고가 반입되지 않은 기관은 아무것도 달라지지 않는다. 데이터원은
`GET /bidcases/latest`(기관별 최신 1건)이고, `app.bootstrapServer`가 `/institutions`와
함께 받아 병합한다.

> 지도 코드(`dashboard/js/render.js`)는 **한 줄도 고치지 않았다.** 임박도 색이 원래
> `contractEnd`로 그려지고 있었기 때문에, 병합 계층에서 값을 갈아끼우는 것으로 충분했다.
>
> **확정/추측이 어디에 보이는가** — 지자체는 지도에 *면*으로 그려지고 면에는 **임박도
> 색만** 칠해진다. 확정/추측 구분은 **랭킹 카드 텍스트**(`2026-05-20(추측)`)와 워크플로
> 탭에서 본다. 지도의 빗금은 ⓐ전국 뷰의 *준비중 지역*(`render.js:151`)과 ⓑ*마커*의 추측
> (`render.js:340`) 두 곳뿐인데, 지자체는 `logic.visibleMarkers`가 마커에서 제외하므로
> (`logic.js:146`) 어느 쪽에도 해당하지 않는다.
> **면에 확정/추측을 표시하지 않기로 사용자가 결정했다(2026-08-03)** — `render.js`
> 무수정을 유지하기 위해서다. 다시 "구가 빗금이 안 된다"는 이야기가 나오면 이 문단을 볼 것.

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
| 도봉구 | 확정 `2026-09-30` | 임박도 색 + 랭킹 카드 `2026-09-30(확정)` |
| 노원구 | 예상 `2026-05-20` | 임박도 색 + 랭킹 카드 `2026-05-20(추측)` |

둘을 나란히 두어 일정 우선순위가 눈으로 확인되게 했다.
**면 자체에는 확정/추측 차이가 없다**(위 참고) — 날짜가 다르니 임박도 색만 갈린다.

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
| `confirmed_without_tasks` | 참여확정 **+ 조사 완료**인데 팀 Task가 없다 |
| `scoring_sum_mismatch` | 배점표 **항목 합계가 총점과 다르다**(LLM이 배점을 지어낸 신호) |

- **1·2단계는 참여 결정 이전이라 정상**으로 본다(3단계부터 검사).
- 응답에는 규칙 이름과 함께 **"무엇이 왜 문제인지"** 가 붙는다 — 사람이 고칠 수 있어야 하므로.
- 워크플로 탭은 선택한 기관에 어긋난 것이 있으면 **맨 위에 빨간 경고**를 띄운다.
  정상이면 아무것도 그리지 않는다.

> **오탐을 내지 않는다는 원칙**: `research_status`가 `대기`인 채 참여확정된 것은 정상이다
> — 코퍼스가 반입되면 `activate_pending_bid_cases`가 그때 Task를 만든다. 그래서
> `confirmed_without_tasks`는 **조사까지 완료됐는데도** Task가 없을 때만 잡는다.
> 경고가 한 번이라도 틀리면 그 다음부터 아무도 읽지 않는다.

### 배점표 합계 검증 — 모델 성능에 기대지 않는 방어

`scoring_sum_mismatch`는 `data/report_new/{기관}/rfp_scoring.json`의 항목 배점을 더해
`total_score`와 맞는지만 본다. **LLM을 쓰지 않는 산수 한 줄**이다.

왜 넣었는지는 2026-08-04 실측이 전부다. 수원시 공고문(정답 6항목·합 100)으로:

| | 항목 수 | 배점 합 | 소요(CPU) |
|---|---|---|---|
| 정답 | **6** | **100** | — |
| `llama3.1:8b` | 16 | 96 | 441초 |
| `qwen3:14b` | 15 | **108** | 611초 |

**모델 크기의 문제가 아니었다.** 둘 다 같은 구조적 오류를 낸다 — 공고문은 배점을
*분류 단위*로 주는데 추출 텍스트의 표 경계가 무너져 있어, 모델이 세부 항목으로 쪼갠 뒤
개별 배점을 지어낸다. 14B는 더 자신 있게 지어낼 뿐이다(합이 총점을 넘겼다). 분류 자체는
둘 다 맞췄고 **틀리는 건 언제나 숫자**다. 그래서 모델을 바꾸는 대신 규칙으로 잡는다.

- **막지는 않는다.** 본문(`rfp_text.txt`)은 그대로 쓸모가 있고 5·8단계에 사람 승인이 있다.
  추출 시점에는 stderr 경고, 그 뒤로는 `GET /consistency`와 워크플로 탭 경고로 남는다.
- **오탐 금지**: 배점표가 없는 공고문(criteria 빈 목록)은 정당한 결과이고, 산출물이 아직
  없으면(3단계 전) 아무 말도 하지 않는다. 안 그러면 25개 기관이 전부 빨개진다.
- `rfp_scoring.json` **파일에는 검사 결과를 쓰지 않는다** — 이 파일은
  `.claude/skills/rfp-locate`가 사람 손으로도 만드는 규격이라, 자동 경로만 필드를 늘리면
  두 경로의 모양이 갈린다. 합계는 `criteria`만 있으면 언제든 다시 계산된다.

## 13. 하이브리드 검색 — 글자 + 뜻 (계획 F)

`agent/retrieval`이 두 갈래로 찾아 하나로 합친다. §3의 FTS 설명은 그대로 유효하고,
여기서 **의미 검색이 얹힌다**.

| | FTS(trigram) | 임베딩(벡터) |
|---|---|---|
| 기준 | **글자가 겹치는가** | **뜻이 가까운가** |
| 강한 곳 | `제12조`·`1,250억`처럼 원문 그대로인 용어 | 표현이 다른 같은 뜻 |
| 약한 곳 | `"청년 자립 지원"`으로 `"청년 창업 자금"`을 못 찾음 | 숫자·고유명사를 뭉갬 |

합성은 **RRF**(`Σ 1/(60+순위)`)다. bm25(낮을수록 좋음·상한 없음)와 코사인(0~1)은
**척도가 달라 그냥 더할 수 없어서**, 점수가 아니라 **순위**만 쓴다.

### 13-1. 준비 — 임베딩 모델

```bash
ollama pull bge-m3            # 약 1.2GB, 한국어 강함, 1024차원
```

환경변수(둘 다 선택, 빈 문자열은 미설정으로 본다):

| 변수 | 기본값 | 비고 |
|---|---|---|
| `EMBED_MODEL` | `bge-m3` | |
| `EMBED_BASE_URL` | `http://localhost:11434` | 폐쇄망 LAN 주소로 바꾸면 그대로 붙는다 |

### 13-2. 색인

```bash
# 전체 재빌드 — corpus/ + 아카이브를 함께 넣는다
py -3.14 -m agent.retrieval build

# 임베딩 없이 FTS만 빠르게 (수 초)
py -3.14 -m agent.retrieval build --no-embed

# 변경분만 (평소엔 이걸 쓴다 — 수 초)
py -3.14 -m agent.retrieval reindex
py -3.14 -m agent.retrieval reindex --force     # 대장을 무시하고 전부 다시
```

⚠️ **전체 빌드는 CPU에서 약 1시간**이다(실측: 2,763청크 × 1.24초). 진행률과 남은
시간이 표시되고, 중간에 끊겨도 **거기까지 만든 벡터는 남는다** — 나머지는 `reindex`가
채운다. GPU 엔드포인트가 있으면 이 부담은 사라진다(질의 1건 기준 1.2초 → 20ms급).

변경 판정은 **mtime+size**다. 수천 개 파일을 매번 해시하는 것은 그 자체로 느리고,
여기서 잡으려는 것은 "산출물이 새로 떨어졌다"이지 위변조가 아니다. 미심쩍으면 `--force`.

### 13-3. 완료 산출물 자동 색인 (스펙 §② 17)

`POST /institutions/{id}/complete`가 끝나면 서버가 **백그라운드로** 아카이브를 증분
색인한다. 별도 조작이 필요 없다.

- 아카이브는 `data/report_archive/{기관명}/{날짜}/`에 쌓이는데 **`corpus/` 밖**이다.
  계획 F 이전에는 색인기가 `corpus/`만 훑어서, 재색인을 돌려도 아카이브물은 영영
  안 잡혔다. 지금은 색인 루트가 둘이다.
- 색인 대상은 **허용목록**뿐이다: `rfp_text.txt`·`rfp_scoring.json`·
  `coverage_map.json`·`*.pptx`. `tasks_dump.json`(대화 원문 전체)은 **일부러 뺐다** —
  넣으면 산출물 검색이 잡담에 묻힌다.
- 재색인이 실패해도 **완료 처리는 200**이고, 실패 사유가 **쪽지로** 온다. 부수 작업의
  실패가 결재를 되돌리면 안 된다(계획 D와 같은 원칙). 쪽지를 받으면 위 `reindex`를
  수동으로 한 번 돌리면 된다.

### 13-4. 화면에서 확인 (지식 탭)

1. `청년 자립 지원`으로 검색 — **FTS만으로는 0건**인 질의인데 청년 창업 관련 문서가
   나온다. 결과 머리에 **`의미 검색 포함`** 배지가 붙는다.
2. `제안서 평가 배점`처럼 원문 그대로인 용어는 여전히 정확히 잡힌다(하이브리드가
   FTS의 강점을 깨지 않았는지 보는 회귀 확인).
3. 검색 중에는 버튼이 잠기고 `검색 중…`이 뜬다 — **의미 검색이 켜져 있으면 1초 남짓**
   걸린다(질의를 임베딩하는 시간).
4. Ollama를 끄고 검색하면 503으로 죽지 않고 **FTS 결과가 나오며 배지가 `FTS 단독`으로
   바뀐다.** 조용히 나빠지지 않는다는 것이 요점이다.
5. 문서 필터에 `archive(완료 산출물)`가 있다 — 완료된 기관의 산출물만 볼 때 쓴다.
6. **결과 행을 클릭하면 원문 전체가 열린다**(`원문 열기 ↗`). 검색에 걸린 그 청크가
   테두리로 표시되고 거기로 스크롤되며, 검색어는 노랑으로 강조된다. 배경 클릭·Esc로 닫는다.

### 13-4-1. 원문 열기 (`GET /documents?path=…`)

검색은 200자 스니펫만 준다. 그런데 지식 탭의 목적은 *"제안서에 인용할 근거를 눈으로
확인하는 것"* 이라, 출처 경로만 알고 열 수 없으면 반쪽이다.

- 열 수 있는 곳은 **`corpus/`와 아카이브 뿌리 두 곳뿐**이다. 첫 조각이 그 폴더명이어야
  하고(①), 최종 절대경로가 그 뿌리 안쪽이어야 한다(②). `corpus/../data/registry.db`
  같은 시도는 400이다 — 클라이언트가 준 문자열로 파일을 읽는 자리라 가드가 두 겹이다.
- 본문은 색인기와 **같은 파서**로 뽑는다. 그래서 검색에 걸린 그 텍스트를 그대로 보게 되고,
  `.pptx`·`.json` 산출물도 열린다. 읽을 수 없는 형식(예: PDF)은 415와 이유를 준다.
- 20만 자를 넘으면 잘라 보내고 `truncated: true`로 알린다(브라우저가 멈추지 않게).

### 13-5. 데모는 인덱스도 따로 쓴다

`py -3.14 -m backend.demo`는 기동할 때 운영 인덱스를 **`data/demo_corpus_index.db`로
복사**해서 쓴다(원본이 더 새로우면 다시 복사).

데모에서 완료 처리를 하면 서버가 아카이브를 자동 색인하는데, 인덱스를 공유하면
**데모 산출물이 운영 검색 결과에 섞인다.** `--reset`이 이 파일도 함께 지우므로
데모는 여전히 "파일 삭제 한 번"으로 정리된다.

- 새로 빌드하지 않고 복사하는 이유: 내용이 같은 `corpus/`에서 나오는데 새로 만들면
  임베딩 때문에 1시간이 걸린다.
- 운영 인덱스가 아직 없으면 데모는 그대로 뜨고, 지식 탭이 빌드 안내를 띄운다.

### 13-6. 자주 헷갈리는 것

- **"3자 이상" 제한은 이제 조건부다.** trigram의 한계이지 의미 검색의 한계가 아니라,
  벡터가 있으면 `청년` 두 글자로도 답한다. 벡터가 없을 때만 0건이 된다.
- **인덱스와 벡터는 같은 파일**(`data/corpus_index.db`)에 있다. 원자 교체 한 번으로
  둘이 함께 넘어가므로 서로 어긋난 상태가 존재할 수 없다.
- **모델을 바꾸면 차원이 달라진다.** 옛 벡터와 섞이면 유사도가 무의미해지는데 이건
  눈에 안 보이므로, 차원이 다르면 즉시 실패하게 해뒀다. 모델 교체 시에는
  `build`로 전체 재빌드가 필요하다.
- 벡터 자료구조는 전수 비교다. 2,763청크에서는 밀리초급이라 근사 인덱스(HNSW 등)를
  붙일 이유가 없다 — 병목은 질의 임베딩 1.2초 쪽이다. 수만 건이 되면 그때 검토한다.

---

## 14. 화면에서 사용 모델 확인하는 법 (모델 자동선택+가시화 Task 6)

지금 어떤 LLM/임베딩 모델이 쓰이고 있는지 화면 세 곳에서 확인할 수 있다.

1. **대화 탭 배지** (`#chat-model-badge`, §10) — **대화 탭에 들어갈 때 1회** 조회해
   입력창 위에 `🧠 <model>` 배지를 붙인다(기관 선택과는 무관하다 — 모델은 기관별로
   다르지 않고, `GET /llm/status`가 Ollama를 찌르므로 폴링에 넣지 않았다).
   데이터원은 `GET /llm/status`이고 문구는
   `chat.js`의 `chat.modelBadgeText`가 만든다: `LLM_MODEL`이 구체 모델명이면
   `🧠 llama3.2:3b`처럼 모델명만, `LLM_MODEL=auto`면
   `🧠 llama3.2:3b (자동 선택 · RAM 8GB / 2 vCPU)`처럼 하드웨어 근거까지 붙는다.
   조회 실패 시(엔드포인트가 죽어 있는 등) 배지는 **자리까지 통째로** 사라진다
   (`#chat-model-badge:empty { display:none }`) — 부가 정보라 대화 자체를 막지 않고,
   테두리만 남은 빈 알약이 "로딩 중"처럼 보이지도 않는다.
   - **엔드포인트에 닿는지까지 보고 싶으면** `GET /llm/status?probe=1`을 쓴다.
     `reachable` 필드가 붙는다. **기본 응답에는 없다** — 화면이 안 쓰는 값 때문에
     탭을 열 때마다 Ollama 왕복이 하나 더 붙던 것을 떼어냈다. 값을 `false`로
     채워두지 않고 아예 생략하는 이유는, **조회하지 않은 것과 조회해서 못 닿은 것이
     다르기 때문**이다(전자를 후자로 표시하면 멀쩡한 엔드포인트가 죽어 보인다).
2. **지식 탭 검색 모드·임베딩 모델** (§13-4) — 검색 결과 머리글에 두 표시가 나란히
   붙는다. `.kn-mode` 배지(`knowledge.modeBadge` — 결과 첫 행의 `score_kind`만
   보고 `의미 검색 포함`/`FTS 단독`을 정한다)와, 그 옆의 `.kn-mode-text`
   (`knowledge.searchModeText` — 서버가 응답 헤더 `X-Search-Mode`/`X-Embed-Model`로
   알려준 값을 그대로 `의미검색 사용 · <임베딩 모델명>` 또는 `키워드 검색(FTS)`로
   보여준다). 둘은 겹치는 정보지만 후자가 서버가 검색 전체를 보고 정한 값이라 더
   정확하고 모델명까지 준다.
   - `EMBED_MODEL`에 한글 등 latin-1 밖 문자를 넣으면 그 부분은 헤더에서 걸러진다.
     HTTP 헤더가 실을 수 없는 값이라 그대로 두면 **검색 응답 자체가 500으로 죽는다** —
     모델명 표시를 포기할지언정 검색을 막지 않는다.
3. **워크플로 로그의 🧠 표시** (§9) — LLM을 호출해 남긴 기록에는 시각 뒤에
   `· 🧠 <model>`이 붙는다(`messages.model` 컬럼 → 렌더). 사람 발화나 게이트
   통과 알림처럼 LLM을 안 쓴 기록에는 **아무것도 안 붙는다** — 값이 없을 때만
   생략되므로 비LLM 기록이 지저분해지지 않는다.
   - **팀별 작업 로그**(참여자 카드 클릭, `GET /tasks/{id}`)와 **단계 전체 로그**
     (스테퍼 칸 클릭, `GET /institutions/{id}/timeline`) **둘 다** 표시된다.
     단계 로그는 예전에 `timeline` 응답에 `model` 필드가 없어 빠져 있었다.
   - **무엇에 붙고 무엇에 안 붙는지가 규칙이다.** 6단계 업로드 즉시검사와 작업
     대화 응답도 LLM을 쓰므로 모델명이 남는다. 반대로 ⓐ배점표가 없거나 그 팀에
     배정된 항목이 없어 **생략된** 즉시검사(PII 스캔만 돌았다), ⓑ배점표는 있는데
     매칭되는 섹션이 없어 커버리지 판정이 LLM을 한 번도 안 탄 8단계 검증,
     ⓒ한 글자도 못 받고 실패한 대화 응답에는 붙지 않는다.
     판단 근거는 호출부의 추측이 아니라 `verification_node`가 돌려주는
     `llm_used`다 — 바깥에서 조건을 복제하면 규칙이 바뀔 때 조용히 어긋난다.

---

## 15. 디자이너 작업함 (계획 H, 스펙 §② 14)

7단계 이관 결재가 끝나면 `packager`가 제안서 패키지를 만들고 **디자이너 앞으로
`이관` 알림**을 보낸다. 그 알림을 받은 사람이 실제로 일하는 화면이 이 탭이다.

### 15-1. 탭이 안 보인다면

**소속이 `디자이너`일 때만 나타난다.** 상단바의 `나: [이름] [소속]`에서 소속을
`디자이너`로 바꾸면 즉시 뜨고, 다른 값으로 바꾸면 사라진다(그 탭을 보고 있었다면
지도 탭으로 되돌아간다). 데모에서는 **계정 전환기**로 `최 디자이너`를 고르면 된다.
서버 모드 전용이라 `file://`로 열면 애초에 없다.

### 15-2. 화면 구성

- **왼쪽 목록** — `요청받은 작업` / `작업 중` / `제출됨` 세 칸.
  각 줄에 **D-day 배지**와 **처리상태 태그**가 붙는다.
  - 순서는 **입찰일까지 남은 일수**다(`GET /tasks?team=디자이너`가 `bid_date`를 준다).
    `D-7` 이내는 빨강, `D-30` 이내는 주황, `D-90` 이내는 파랑, 그 밖은 회색.
    지난 것(`D+n`)은 가장 급한 것으로 친다. 날짜를 모르면 `미상`으로 **맨 뒤**에 간다.
  - 배지에 `?`가 붙으면 **예상일**이다(확정 공고가 아니다).
  - 우선순위는 **저장하지 않는다** — 사람이 따로 관리할 것이 없고 항상 최신이다.
    지도의 임박도와 구간이 다른데, 그쪽은 *계약 만료*까지의 척도라 훨씬 길다.
- **오른쪽 위: 이관 패키지** — 그 공고의 팀별 카드. 여기가 **디자이너가 받는 것**이다.
  - 카드마다 **그 팀이 올린 파일**이 `⬇ 파일명` 링크로 붙는다. 눌러 내려받아 작업하면
    된다. 아직 아무것도 안 올린 팀은 `받은 파일 없음`으로 보인다.
  - **승인 안 난 팀도 감추지 않는다.** 상태 태그(`요청받음`/`작업 중`/`제출됨`/
    `승인완료`)로 구분할 뿐이다. 감추면 "다 받은 줄" 알게 되기 때문이다.
    맨 위에 `전 팀 승인완료` 또는 `일부 팀이 아직 승인 전입니다`가 뜬다.
  - 본문은 접혀 있다 — **누르면 펴진다**.
  - 카드의 **[문의]** 를 누르면 쪽지함 발송 폼이 **수신자가 채워진 채** 열린다.
    수신자는 서버가 고른다(`영업` 팀의 쪽지는 `영업팀` 앞으로 간다 — 이 규칙은
    `backend/teams.py` 한 곳에만 있다). 보낸 쪽지에는 기관·작업 링크가 함께 실린다.
  - 에이전트 전용 단계(RFI분석·취합·검증)는 카드에 없다. 사람 작성물이 없기 때문이고,
    그 산출물은 맨 위 `📦 제안서 경로`와 배점표·커버리지로 따로 보인다.
- **오른쪽 아래: 내 작업물** — 파일 목록(이름 클릭 = 내려받기) + 올리기 + 삭제,
  메모 + [임시저장], [제출].

### 15-3. 작업물 파일

| | |
|---|---|
| 형식 | `.pptx .ppt .pdf .png .jpg .jpeg .zip` — 그 외는 400으로 거부 |
| 크기 | **50MB**까지 |
| 저장 위치 | `{output_root}/{기관명}/design/{task_id}/` |

- **같은 이름을 다시 올리면 덮어쓴다** — 수정본을 올리는 흐름이 자연스러워서다.
  다만 조용히 덮어쓰지 않고 "새 파일로 교체했습니다"라고 알린다.
- 미배정 작업은 **먼저 손댄 사람이 담당을 가져간다**(업로드와 같은 관행).
  남의 작업에 손대면 403이다.

### 15-4. 임시저장과 제출

- **[임시저장]** 은 메모만 저장하고 **작업 로그에 아무것도 남기지 않는다**
  (`PATCH /tasks/{id}/draft`). 누를 때마다 로그가 쌓이면 그 로그를 아무도 안 읽게 된다.
  파일은 올리는 즉시 보관되므로 따로 저장할 것이 없다.
- **[제출]** 은 두 조건이 다 맞아야 눌린다. 못 누를 때는 **버튼 옆에 이유가 뜬다.**
  1. 내 작업물이 **하나 이상** 있을 것 (빈손으로 내면 결재자가 볼 것이 없다).
  2. **3팀이 전부 `승인완료`일 것.** 디자이너 작업물은 팀 산출물을 *받아서* 만든
     것이라, 팀장 결재도 안 난 초안 위에서 만든 결과를 올리면 앞뒤가 맞지 않는다.
     화면뿐 아니라 **서버에서도 막는다**(409) — 화면만 막으면 API로 그대로 뚫린다
     (계획 E의 `POST /run` 가드와 같은 논리).
     - `제출됨`(1차완료)만으로는 **부족하다.** 계획 H에서는 결재할 화면이 없어
       '작업 중이 아닐 것'으로 약하게 잡았는데, 계획 I의 팀장 결재함이 생기면서
       기준을 올렸다(§16).
     - 이 규칙은 **디자이너에게만** 건다. 3팀에 걸면 서로를 기다리다 교착에 빠진다.
  누르면 상태가 `제출됨`이 되고 **영업팀장에게 결재요청**이, **각 팀에는 전달 쪽지**가
  간다(디자이너는 영업팀 소속이다 — §16).
  - 💡 **데모에서 제출까지 눌러 보려면**: 기본 시드는 영업이 결재 대기·예산이 작성
    중이라 규칙대로 막혀 있다. 결재함에서 팀장 계정으로 승인해도 되고, 지름길로
    `py -3.14 -m backend.demo_seed --teams-done` 을 돌리고 새로고침해도 된다
    (3팀이 `승인완료`가 된다). 되돌리려면 플래그 없이 다시 돌린다.
  - ⚠️ 이 알림은 **디자이너뿐 아니라 모든 팀의 제출**에 붙는다. 예전에는 제출이
    상태만 바꾸고 아무에게도 알리지 않아 **제출해도 아무 일이 안 일어났다.**
  - 9단계 그래프는 건드리지 않는다 — 디자이너 작업은 7단계 이관 **이후의 병렬 트랙**이다.
    제출이 8단계 검증을 자동으로 부르지는 않는다.

### 15-5. 한글 이름과 `X-User-Id`

브라우저는 헤더에 한글을 못 싣는다(`X-User-Id`는 ASCII만 — §6의 A1 F10). 그래서 화면은
헤더에 `web-user`를 넣고 **사람 이름은 본문의 `by`로** 보낸다(`CheckpointIn.by`와 같은
관행). 이게 없으면 담당자 이름이 한글인 작업은 API로 아무것도 못 하고 늘 403이 난다 —
데모의 `최 디자이너`가 자기 작업에 파일 하나 못 올린다.

---

## 16. 역할과 결재 라인 (계획 I)

### 16-1. 결재 라인

```
팀원 ──제출──▶ 그 팀의 팀장 ──승인──▶ (3팀 전부 승인) ──▶ 디자이너
  (작업함)         (결재함)                                (작업함)
                                                             │제출
                                                             ▼
                                       영업팀장 ──승인(=상신)──▶ 영업부장 ──승인──▶ 종료
                                        (결재함)                  (결재함)
```

- **팀 작업물은 그 팀 팀장이 결재한다.** 남의 팀을 대신 보지 않는다 — 겹치면 누가
  봤는지 알 수 없어진다.
- **디자이너 작업물도 영업팀장이 1차 결재한다.** 디자이너는 **영업팀 소속**이기
  때문이다(사용자 확정).
- **영업팀장의 승인이 곧 영업부장에게 올리는 상신이다.** 별도의 상신 버튼을 두면
  "승인해 놓고 안 올린" 상태가 생긴다. 승인 즉시 영업부장에게 결재요청이 간다.
- **영업부장의 승인이 흐름의 끝이다** — 그 작업은 `최종완료`가 된다. 영업부장은
  **8단계 최종결재 게이트**도 함께 본다. 팀 작업은 대신 결재하지 않는다.
- 결재자 칸은 **단계마다 따로**다(`approver` = 팀장, `final_approver` = 부장).
  한 칸으로 합치면 1차를 본 팀장이 최종 결재까지 잠가버려 부장이 403을 받는다.
- **반려하면 담당자에게 쪽지가 간다.** 예전에는 상태만 `작업 중`으로 되돌리고
  아무도 몰랐다. 사유 없이 반려하면 화면이 한 번 되묻는다. 두 단계 모두 반려는
  `작성중`으로 되돌린다 — 결국 담당자가 다시 손봐야 하기 때문이다.
- ⚠️ 최종 결재자 이름은 `인사권자` → (계획 I에서 잠깐) `본부장` → **`영업부장`**
  으로 바뀌었다. **본부장이라는 자리는 없다.** 개명 전에 쌓인 알림은 옛 이름으로
  남아 있는데, 조회할 때 같은 것으로 본다(`teams.recipient_aliases`).

### 16-2. 소속·직책과 기본 화면

상단바 프로필은 **소속**과 **직책** 두 칸이다. 소속은 **3그룹뿐**이고(`영업팀`·
`전산팀`·`예산팀`), 팀장·부장은 소속이 아니라 그 안의 직책이다. 예전에는 한 칸
자유 입력이라 `전산팀장`이 소속처럼 섞여 있었다 — 사용자가 잘못된 표기라고 짚은 자리다.

- **직책 목록은 소속에 따라 달라진다.** 영업팀은 `팀원·디자이너·팀장·부장`,
  전산·예산팀은 `팀원·팀장`. 없는 자리(`전산부장`)를 고를 수 있게 두면 그 사람의
  결재가 갈 곳을 잃는다.
- 저장·전송은 여전히 **합쳐진 문자열 하나**다(`영업팀`·`영업팀장`·`영업부장`·
  `디자이너`). 프로필을 둘로 쪼개 저장하면 이미 쌓인 알림 수신자와 `role_menus`의
  키가 전부 갈라진다. 규칙은 `backend/teams.py`(`compose`/`split_role`)와
  `dashboard/js/roles.js` 두 곳에 같은 답으로 있다.
- 모르는 옛 역할(`본부장` 프로필 등)은 소속 칸에 **그 값 그대로** 남는다 — 임의로
  `영업팀/팀원`을 끼워 넣으면 사용자의 신원이 조용히 바뀐다.

| 역할 | 기본으로 보이는 탭 |
|---|---|
| `영업팀`·`전산팀`·`예산팀` (팀원) | 지도 · 지역별 · 워크플로 · 대화 · 지식 · **작업함** |
| `영업팀장`·`전산팀장`·`예산팀장` | 위 + **결재함** |
| `디자이너` | 지도 · 지역별 · 대화 · 지식 · **작업함** |
| `영업부장` | **전국 지도 · 결재함 · 대화** 셋만 (사용자가 직접 고른 조합 — 워크플로도 지역별도 없다) |
| `전산팀` | 팀원 기본 + **권한관리** (시스템 운영자를 겸한다) |

- **작업함은 디자이너 전용이 아니다.** 팀원이 열면 자기 팀 작업이 뜨고, 이관 패키지에
  **다른 팀 산출물과 디자이너 작업물**이 함께 보인다(자기 팀만 빠진다).
- `영업팀`·`영업팀장`·`영업부장`은 **같은 `tasks.team`(`영업`)** 을 본다. 접미사를
  떼는 규칙은 `backend/teams.py`의 `team_of` 한 곳에만 있다.

### 16-3. 권한 관리 (전산팀)

`권한관리` 탭에서 **역할(행) × 메뉴(열)** 를 체크박스로 켜고 끈다. [저장]은 **바뀐
것만** 보낸다 — 두 사람이 같은 화면을 열어도 나중 저장이 상대 변경을 지우지 않는다.

- 저장된 값이 없으면 **코드의 기본값**(`backend/menus.py`)이 쓰인다. 행이 없다는 것은
  '꺼짐'이 아니라 '아직 정하지 않음'이다 — 그래야 빈 운영 DB에서도 화면이 돌고,
  새 메뉴를 추가했을 때 아무도 그걸 못 보는 상태가 되지 않는다.
- `*` 표시는 **서버 모드 전용**이다. `file://`로 열면 켜져 있어도 보이지 않는다(API가 없다).
- 🔒 **자물쇠**: `권한관리`를 **모든 역할에서 끄는 저장은 거부된다**(화면·서버 양쪽).
  그러면 아무도 이 화면에 못 들어와 되돌릴 방법이 없기 때문이다. 담당자를 옮기는 것은
  정상이다 — 다른 역할에 먼저 켜 주고 끄면 된다.

> ⚠️ **권한은 화면 노출 제어이지 보안 경계가 아니다.** 프로필은 자기신고
> (localStorage)라 서버가 신원을 확인할 방법이 없고, API는 그대로 열려 있다.
> 메뉴를 껐다고 그 데이터가 보호되는 것은 아니다 — 실제 차단은 폐쇄망 + nginx
> Basic Auth가 맡는다(`INSTALL.md`).

### 16-4. 데모로 결재 라인 돌아보기

계정 전환기 하나로 전 라인을 재현할 수 있다.

1. `김 차장`(영업팀)으로 작업함 → 자기 팀 작업과 이관 패키지를 본다.
2. `영업팀장`으로 전환 → 결재함에 영업팀 제출물이 뜬다. 승인/반려해 본다.
3. `최 디자이너`로 전환 → 3팀이 전부 승인되기 전에는 **제출이 잠긴다**(사유가 뜬다).
4. `영업팀장`으로 다시 전환 → 결재함에 **디자이너 제출물**이 뜬다. 승인하면 그
   즉시 영업부장에게 상신된다.
5. `영업부장`으로 전환 → 결재함에 **최종 결재** 카드(디자이너 최종본)와 최종결재
   게이트가 뜬다. 승인하면 그 작업은 `최종완료`가 된다. **워크플로 탭이 없다.**
6. `전산팀`으로 전환 → 권한관리에서 `영업부장 × 워크플로`를 켜고 저장 → 영업부장으로
   전환하면 워크플로 탭이 생긴다.
