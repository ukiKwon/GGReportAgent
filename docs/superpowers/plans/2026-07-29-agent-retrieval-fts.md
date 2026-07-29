# agent/retrieval FTS 구현 플랜 (재구성 §⑦-5단계)

## Context

재구성 스펙 §⑦-5단계의 실행. 설계는 방금 커밋된
`docs/superpowers/specs/2026-07-29-agent-retrieval-fts-design.md`(`1e29e43`)에 확정돼
있다: 팀 채팅이 기관 코퍼스를 **통째로 프롬프트에 붓는** 현재 구조
(`backend/agent_adapter.py:20` `_load_team_corpus`)를, `corpus/` → 파서 → SQLite FTS5
(trigram) 인덱스 → `search()` 단일 시그니처로 교체한다. 표준 라이브러리만 사용,
인덱스는 `data/corpus_index.db`, 인덱스 부재 시 기존 통째-읽기 폴백 유지.

- 환경 검증 완료: `py -3.14` = SQLite 3.50.4, trigram FTS5 동작 확인.
- 테스트 기준선: `py -3.14 -m pytest backend agent -q` → **148 passed**.
- 브랜치: 신규 `agent-retrieval-fts` (이전 단계들과 같은 패턴 — 안정성).

## Global Constraints

- 항상 **`py -3.14`** (맨 python/pip은 Store 스텁, `py -3`은 3.15).
- **경로 명시 커밋만** (`git add <paths>`) — 다른 세션의 미커밋 수정
  (mapo/seocho spec .txt, `.claude/settings.json`)을 절대 스테이징하지 않는다.
- 신규 의존성 0 (표준 라이브러리만). requirements.txt 수정 없음.
- Task마다 테스트 그린 확인 후 커밋 1개.

## 플랜 차원의 설계 보완 (스펙에 없는 결정 2개)

1. **agent_adapter의 검색 사용 조건**: `giganlist_dir`가 `corpus/institutions/`
   접두사일 때만 검색 경로를 탄다. 기존 테스트들은 `tmp_path` 절대경로를 넘기므로
   자동으로 legacy 통째-읽기로 흘러 **기존 테스트가 무수정 통과**하고, 개발 머신에
   실제 인덱스가 있어도 테스트가 오염되지 않는다.
2. **검색 결과 0건이면 legacy 폴백**: 질의가 아무것도 못 찾을 때 "자료 없음"으로
   답하게 하는 것보다 기존 동작(팀 파일 전체 제공)이 안전한 상위집합.

## Tasks

### Task 1: 브랜치 + 리포 플랜 문서

- `git checkout -b agent-retrieval-fts` (main `f3f1eb7`에서)
- 이 플랜을 `docs/superpowers/plans/2026-07-29-agent-retrieval-fts.md`로 저장, 커밋.

### Task 2: `agent/retrieval/` 코어 — parsers + chunker

**Files:** `agent/retrieval/__init__.py`, `parsers.py`, `chunker.py`,
`agent/tests/test_retrieval_chunker.py`, `test_retrieval_parsers.py`

- `parsers.py`: 확장자→파서 레지스트리 `PARSERS = {".txt": _parse_txt}`.
  UTF-8 실패 시 None 반환(호출부가 건너뜀) — `corpus_validator._read_quiet` 패턴.
- `chunker.py`: `chunk_text(text) -> list[str]` — 빈 줄 기준 문단 분할 후 800자까지
  병합, 단일 문단이 800자 초과면 하드 분할. 결정적(같은 입력→같은 청크).
- 테스트: 문단 병합 경계, 초과 문단 분할, 빈 파일, 비UTF-8 건너뜀.

### Task 3: indexer + CLI

**Files:** `agent/retrieval/indexer.py`, `__main__.py`,
`agent/tests/test_retrieval_indexer.py`

- `indexer.py`: `build_index(corpus_root, db_path)` — `rglob`로 순회, 파서 레지스트리
  적용, 스펙 §④ 스키마(FTS5 `chunks` + `meta` 테이블, trigram)로
  `{db_path}.tmp`에 빌드 후 `os.replace`로 원자 교체. doctype 판정은 경로 규칙
  (spec/plan/bank_ideas/rfp/report/inbox), `institution_id`는
  `corpus/institutions/<id>/` 세그먼트에서 추출.
- `__main__.py`: `py -3.14 -m agent.retrieval build [--corpus corpus] [--db data/corpus_index.db]`
  / `py -3.14 -m agent.retrieval search "질의" [--institution …] [--doctype …]`.
- 테스트: tmp 코퍼스로 빌드 → 행 수·doctype·institution_id 검증, 재빌드 원자성
  (기존 db 존재 시 교체), 비UTF-8 파일 스킵.

### Task 4: search 인터페이스

**Files:** `agent/retrieval/search.py`, `__init__.py` 재수출,
`agent/tests/test_retrieval_search.py`

- 스펙 §⑤ 시그니처 그대로: `RetrievedChunk`(frozen dataclass),
  `search(query, *, institution_id, doctypes, filename_prefix, limit=8, db_path=…)`.
- 질의 3자 미만 → `[]`. FTS 질의는 `"…"` 문자열 리터럴로 감싸고 내부 `"`는 `""`
  이스케이프. 정렬 `ORDER BY bm25(chunks)`. 인덱스 파일 부재 → `IndexNotBuiltError`.
- 테스트: 필터 조합(기관/doctype/filename_prefix), 3자 미만, 따옴표 포함 질의,
  인덱스 부재 예외, limit.

### Task 5: 질의 API — `GET /search`

**Files:** `backend/routers/search.py`(신규), `backend/main.py`,
`backend/tests/test_api_search.py`

- `create_app(db_path, output_root, index_db_path="data/corpus_index.db")` —
  `app.state.index_db_path`로 주입(테스트는 tmp 인덱스 주입).
- `GET /search?q=…&institution_id=…&doctype=…&filename_prefix=…&limit=8` →
  `RetrievedChunk` 목록 JSON. `IndexNotBuiltError` → **503** + build 명령 안내.
- 테스트: 정상 검색, 필터, 503, 빈 결과.

### Task 6: agent_adapter 통합 (폴백 유지)

**Files:** `backend/agent_adapter.py`, `backend/routers/tasks.py`,
`backend/tests/test_agent_adapter.py`(추가만)

- `stream_chat_reply(..., index_db_path="data/corpus_index.db")` 파라미터 추가,
  `tasks.py:106`에서 `request.app.state.index_db_path` 전달.
- `_load_team_corpus` 앞단에 검색 경로: `giganlist_dir`가 `corpus/institutions/`
  접두사이고 인덱스가 있으면 팀→필터 매핑(스펙 §⑥ 표: 영업=spec+bank_ideas,
  IT=plan+`02_`, 그 외=plan+`03_`)으로 `search(user_message, …)` 호출, 결과를
  `[경로#청크번호]\n본문` 형식으로 조립. `IndexNotBuiltError`·결과 0건 → legacy.
- 기존 어댑터 테스트 3개는 무수정 통과(절대경로 → legacy). 신규: tmp 인덱스로
  검색 경로 프롬프트 검증, 결과 0건 폴백, 인덱스 부재 폴백.

### Task 7: 실코퍼스 스모크 + 문서 + 마무리

- `py -3.14 -m agent.retrieval build` → 25개 구 인덱스 빌드,
  `search "청년 창업 지원"` 스모크(상위 결과 경로 눈검증).
- `data/corpus_index.db`는 gitignore 확인(이미 `data/*`로 커버).
- `docs/실행가이드_backend-agent.md`에 §3(인덱스 빌드/검색 명령) 추가.
- 전체: `py -3.14 -m pytest backend agent -q` (148+신규 전부),
  `node --test dashboard/test/*.test.js` 36 유지.
- main 병합(`--no-ff`) → push → NEXT.md 항목 1 갱신(⑤ 완료) + 당일 summary
  세션 섹션 append → 커밋·push.

## Verification

- 각 Task 후 `py -3.14 -m pytest backend agent -q` 그린.
- Task 7의 실코퍼스 스모크: 한국어 질의가 관련 구 spec 청크를 상위에 반환하는지.
- API 수동 확인: `py -3.14 -m uvicorn backend.main:app` →
  `curl "http://127.0.0.1:8000/search?q=청년창업"`.
- 회귀: 기존 agent_adapter·tasks 라우터 테스트 무수정 통과 = 폴백 경로 보존 증명.
