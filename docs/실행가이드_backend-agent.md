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

## 확인 방법

- `backend/`: 위 curl 두 개가 200과 JSON을 반환하면 정상.
- `agent/`: `pytest agent/tests -v` 통과 여부로 개별 노드 건전성만 확인 가능;
  end-to-end 실행은 위 제약 때문에 완전한 검증이 아님.
