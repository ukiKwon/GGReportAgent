# 계획 F — 하이브리드 검색(FTS+임베딩) + 아카이브 후 자동 재색인

## Context

스펙 §⑩ 재대조에서 남은 ⚠️ 2건 중 **§② 17번(아카이브 후 FTS 재색인 자동화)** 을 처리하려
했는데, 사용자가 "FTS가 뭐냐 → 벡터DB와 뭐가 다르냐"를 물으며 **검색 방식 자체를
하이브리드로 바꾸기로 결정**해 두 건이 하나의 계획으로 합쳐졌다.

- 출처: `handoff/NEXT.md` 항목 1의 "스펙 §⑩ 나머지 미충족 2건", `2026-08-03_summary.md`
- 상위 스펙: `docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md` §②-17
- 검색 스펙: `docs/superpowers/specs/2026-07-29-agent-retrieval-fts-design.md` §⑤
  (**"후일 임베딩 검색을 도입할 때 search()의 시그니처는 유지하고 구현만 바꾼다"** —
  `agent/retrieval/search.py:1-5`에 같은 문장이 주석으로 박혀 있다. 이 계획이 그 "후일"이다.)

### 이번 세션에 실측한 것 (추측 아님)

이 PC: RAM **15.7GB**, NVIDIA GPU **없음**(`nvidia-smi` 부재), Ollama **0.32.5**.

| 항목 | 실측값 | 비고 |
|---|---|---|
| `bge-m3` 임베딩 차원 | **1024** | 한국어 강함, 모델 1.2GB |
| 질의 1건(짧은 문장) | **약 1.2초** | CPU 추론. GPU면 20ms급 |
| 청크 1건(400자) 단건 | 2.27초 | |
| 청크 1건(배치 8) | **1.24초** | 배치 32는 오히려 1.60초 — 묶어도 CPU가 한계 |
| 현재 색인 청크 수 | **2,763** | `data/corpus_index.db` 12.6MB |
| ⇒ 전체 임베딩 빌드 | **약 57분** | 2763 × 1.24초 |
| numpy | **미설치** | 순수 파이썬 코사인이면 질의당 1~2초 추가 |

의미 검색이 실제로 동작함을 확인했다. 질의 `"청년 자립 지원"`(**FTS로는 0건** — 겹치는
3-gram이 없다)에 대한 코사인 유사도:

```
0.674  청년 창업 자금 융자     ← 글자가 안 겹치는데 찾아냄
0.623  청년몰 조성 사업
0.486  노인 일자리 확대
0.396  도로 재포장 공사
```

### 사용자 확정 결정 (2026-08-04)

1. **항상 하이브리드**(ⓑ안). "검색 결과가 1.2초 늘어나도 결과가 안 나오는 것보다 낫다."
   → 스위치로 두지 않는다. 다만 **임베딩 엔드포인트가 없으면 FTS 단독으로 자동 폴백**
   한다(폐쇄망에 모델이 없을 수 있다 — 이건 사용자 선택이 아니라 환경 대응이다).
2. **numpy를 `requirements.txt`에 추가**한다. 무빌드·무의존 원칙은 `dashboard/`(프런트)
   한정이고, 백엔드는 이미 langgraph·pypdf 등을 쓴다.
3. `gpt-oss-120b`는 **하드웨어가 생길 때까지 보류** — `LLM_MODEL`/`LLM_BASE_URL` 교체만으로
   붙는 구조임을 `agent/llm.py:31-32,49`에서 확인했다. 이 계획의 범위가 아니다.

### 탐색으로 확인한 현재 지형

- `agent/retrieval/` 은 **366줄**뿐이다 — `indexer.py`(109) · `search.py`(112) ·
  `__main__.py`(64) · `chunker.py`(42) · `parsers.py`(30) · `__init__.py`(9).
- `indexer.build_index()`는 **전체 재빌드 전용**이다(`indexer.py:1-5`가 그렇게 명시).
  `{db}.tmp`에 새로 만들고 `os.replace`로 원자 교체 — 빌드 중 검색은 구 인덱스를 본다.
  **이 원자성은 반드시 유지한다.**
- `search()`의 `.score`를 실제로 읽는 곳은 **`__main__.py:55`(출력)뿐**이다.
  `backend/routers/search.py:33`은 `asdict(chunk)`로 통째 직렬화하므로 **dataclass에
  필드를 더하면 API 응답에 자동으로 실린다**(기본값을 주면 하위호환).
  `dashboard/js/knowledge.js`는 score를 쓰지 않는다.
- **§② 17번의 진짜 원인**: `backend/archive.py:32`가 산출물을
  `{archive_root}/{기관명}/{날짜}/`(기본 **`data/report_archive`**)에 넣는데,
  `indexer.py:19`의 스캔 루트는 **`corpus`** 다. 즉 아카이브물은 **경로상 색인 대상이
  아예 아니다.** "재색인을 안 돌려서 안 잡힌다"가 아니라 **돌려도 안 잡힌다.**
  `archive.py:3`에도 "FTS 색인 확장은 지식시스템 탭(계획 C)과 함께"라고 미뤄둔 주석이 있다.

---

## Global Constraints

- **`dashboard/js/render.js`는 한 줄도 고치지 않는다** — 계획 A1부터 지금까지 한 번도
  깨지지 않은 제약이다(2026-08-03에 "깨야 한다"고 적었다가 틀린 것으로 정정한 이력 있음).
- **원자 교체 유지** — 전체 빌드가 57분이라, 빌드 중에도 기존 검색이 멀쩡해야 한다.
- **임베딩 부재는 오류가 아니다** — 엔드포인트가 없거나 죽어 있으면 FTS 단독으로
  조용히 폴백하고 **한 번만** 경고한다. 검색 자체가 503으로 죽으면 안 된다.
  (인덱스 파일 자체가 없을 때만 기존대로 `IndexNotBuiltError` → 503.)
- **테스트는 Ollama 없이 통과해야 한다** — HTTP 호출부를 주입 가능하게 만들고
  가짜 임베딩으로 고정한다. CI에 1.2초짜리 실호출을 넣지 않는다.
- 기준선 유지: `py -3.14 -m pytest agent backend collector -q` **408 passed**,
  `node --test dashboard/test/*.test.js` **100**.
- **런처 주의**: 이 PC의 `py -3`은 3.15라 의존성이 없다. **`py -3.14`를 쓴다.**
- 주석·커밋 한국어, UTF-8, TDD. 커밋 끝에
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Task 1 — 임베딩 클라이언트 (`agent/retrieval/embedder.py`)

**Files:** `agent/retrieval/embedder.py`(신규), `requirements.txt`
**Test:** `agent/tests/test_embedder.py`(신규)

- `requirements.txt`에 **`numpy`** 추가.
- HTTP는 **stdlib `urllib.request`** 로 한다 — `agent/llm.py`가 쓰는 langchain은
  채팅 모델용이고, 임베딩 하나 때문에 의존성을 늘릴 이유가 없다.
- 환경변수(`agent/llm.py`의 `_env` 관행 그대로 — 빈 문자열도 미설정으로 본다):
  - `EMBED_MODEL` (기본 `bge-m3`)
  - `EMBED_BASE_URL` (기본 `http://localhost:11434`)
  - `EMBED_DIM` 은 두지 않는다 — **첫 응답의 길이로 확정**하고 meta에 적는다.
    사람이 손으로 맞추게 하면 틀렸을 때 조용히 이상한 결과가 나온다.
- API:
  - `embed_texts(texts: Sequence[str], batch_size: int = 8) -> list[list[float]]`
    — Ollama `/api/embed`(복수 `input`) 사용. **배치 8**이 실측 최적이다(32는 더 느렸다).
  - `embed_query(text: str) -> list[float]` — 단건.
  - `EmbeddingUnavailableError` — 엔드포인트 연결 실패·모델 부재·차원 불일치.
- **차원 검증**: 응답 길이가 인덱스 meta의 `embed_dim`과 다르면 즉시 예외.
  모델을 바꿔 끼운 채 옛 벡터와 섞이면 유사도가 무의미해지는데, 그건 눈에 안 보인다.

---

## Task 2 — 벡터 저장 + 빌드 시 임베딩

**Files:** `agent/retrieval/indexer.py`, `agent/retrieval/__main__.py`
**Test:** `agent/tests/test_indexer.py`(추가)

- 스키마 추가(**같은 DB 파일에** 둔다 — 원자 교체 한 번으로 FTS와 벡터가 같이 넘어가고,
  둘이 어긋날 수가 없다):

```sql
CREATE TABLE vectors (
    rowid     INTEGER PRIMARY KEY,   -- chunks.rowid와 1:1
    embedding BLOB NOT NULL          -- float32 × dim, 리틀엔디언 고정
);
-- 증분 재색인용 파일 대장 (Task 4)
CREATE TABLE files (
    path     TEXT PRIMARY KEY,       -- 저장 경로(stored_path와 동일 표기)
    mtime    REAL NOT NULL,
    size     INTEGER NOT NULL,
    root     TEXT NOT NULL           -- 어느 루트에서 왔는지(corpus / archive)
);
```
  `meta`에 `embed_model` · `embed_dim` · `embedded_at` 키를 추가한다.

- `build_index(..., embed: bool = True)`:
  - 청크를 다 넣은 뒤 `rowid` 순서로 배치 임베딩 → `vectors` INSERT.
  - **임베딩 실패 시 FTS 인덱스는 살린다.** `EmbeddingUnavailableError`를 잡아
    경고를 찍고 `vectors`를 비운 채 정상 종료 — 폐쇄망에서 검색이 통째로 죽으면 안 된다.
  - **진행 표시 필수**(57분짜리다): `[임베딩] 340/2763 (12%) — 남은 시간 약 50분`.
    깜깜한 채로 1시간을 기다리게 하지 않는다.
- `__main__.py`의 `build`에 `--no-embed` 플래그(FTS만 빠르게 다시 만들 때).

---

## Task 3 — 하이브리드 검색 (RRF)

**Files:** `agent/retrieval/search.py`
**Test:** `agent/tests/test_search.py`(추가)

- `search()` **시그니처를 유지**한다(스펙 §⑤의 약속). 호출부
  (`backend/routers/search.py`·`backend/agent_adapter.py`)는 **수정하지 않는다.**
- 흐름:
  1. FTS로 후보를 넉넉히(`limit * 5`) 뽑는다 — bm25 순위.
  2. 질의를 1회 임베딩(약 1.2초) → **전체 `vectors`와 코사인**(numpy 행렬곱,
     2763×1024는 밀리초급) → 코사인 순위 `limit * 5`.
  3. **RRF(Reciprocal Rank Fusion)** 로 합친다: `Σ 1 / (60 + 순위)`.
     - **왜 RRF인가**: bm25(낮을수록 좋음·상한 없음)와 코사인(0~1)은 **척도가 달라
       그냥 더할 수 없다.** 정규화는 질의마다 분포가 달라 불안정하다. RRF는 점수가
       아니라 **순위**만 쓰므로 이 문제가 아예 없다. k=60은 원 논문의 관례값.
  4. 필터(`institution_id`·`doctypes`·`filename_prefix`)는 **양쪽 경로 모두에** 적용한다
     — 한쪽에만 걸면 필터 밖 문서가 벡터 경로로 새어 들어온다.
- **폴백**: `vectors`가 비었거나 임베딩 호출이 실패하면 **FTS 단독 결과를 그대로**
  돌려준다. 경고는 프로세스당 한 번만(매 검색마다 찍으면 로그가 못 쓰게 된다).
- **3자 미만 질의**: 지금은 FTS 한계 때문에 `[]`를 반환하는데(`search.py:46`),
  하이브리드에서는 **의미 검색이 가능하다.** `MIN_QUERY_CHARS` 게이트를 FTS 경로
  안쪽으로 옮겨 짧은 질의도 벡터로는 답하게 한다. (지식 탭의 "3자 이상" 안내 문구도
  Task 6에서 함께 고친다.)
- `RetrievedChunk`에 **기본값 있는 필드**를 추가해 하위호환을 지킨다:
  - `score_kind: str = "bm25"` — `"bm25"` | `"rrf"`
  - `bm25: float | None = None`, `cosine: float | None = None`
  - ⚠️ **`score`의 의미가 모드에 따라 뒤집힌다** — bm25는 낮을수록, RRF는 높을수록
    좋다. 그래서 `score_kind`를 **같이** 내보내는 것이고, 정렬은 항상 `search()`가
    끝내서 준다(호출부가 다시 정렬하면 안 된다는 점을 docstring에 못박는다).
    `__main__.py:55`의 출력도 `score_kind`를 함께 찍도록 고친다.

---

## Task 4 — 증분 재색인

**Files:** `agent/retrieval/indexer.py`, `agent/retrieval/__main__.py`
**Test:** `agent/tests/test_indexer.py`(추가)

- 전체 빌드가 **57분**이라, 문서 몇 개 추가하자고 매번 전체를 돌릴 수 없다.
  §② 17번 자동화가 성립하려면 증분이 **선행 조건**이다.
- `reindex(roots, db_path) -> dict`:
  - `files` 대장의 `(mtime, size)`와 실제 파일을 대조해 **추가/변경/삭제**를 낸다.
  - 변경·삭제된 파일의 청크를 `chunks`·`vectors`에서 지우고, 추가·변경분만 다시
    청킹·임베딩해 넣는다.
  - **제자리(in-place) 갱신**이라 `os.replace` 원자 교체를 쓰지 않는다. 대신
    한 트랜잭션으로 묶어 중간 상태가 보이지 않게 한다.
  - 반환: `{"added": n, "updated": n, "removed": n, "chunks": n, "embedded": n}`.
- `__main__.py`에 `reindex` 서브커맨드 추가.
- **해시가 아니라 mtime+size를 쓰는 이유**: 코퍼스가 수천 개 파일이라 전량 해시는
  그 자체로 느리고, 여기서 잡으려는 것은 "산출물이 새로 떨어졌다"이지 위변조가 아니다.
  대신 `--force` 로 대장을 무시하고 다시 넣는 길을 열어둔다.

---

## Task 5 — 아카이브를 색인 대상에 넣고, 완료 시 자동 재색인 (§② 17)

**Files:** `agent/retrieval/indexer.py`, `backend/main.py`, `backend/routers/workflow.py`,
`backend/reindex_service.py`(신규)
**Test:** `backend/tests/test_api_complete.py`(추가), `agent/tests/test_indexer.py`(추가)

- **핵심 발견부터**: 아카이브물이 지식 탭에 안 잡히는 건 재색인을 안 돌려서가 아니라
  **`data/report_archive/`가 `corpus/` 밖이라 스캔 대상이 아니기 때문**이다.
  따라서 재색인 자동화만으로는 §② 17번이 해결되지 않는다.
- **채택(사용자 확인 필요 — 아래 "미결" 참조)**: 인덱서가 **다중 루트**를 받게 하고
  `archive_root`를 `doctype="archive"`로 추가 색인한다.
  - `build_index(roots=[("corpus", "corpus"), (archive_root, "archive")])`
  - `classify()`에 `archive` 분기 추가. `{기관명}/{날짜}/` 구조에서 기관명을
    `institution_id`로 되짚는다(레지스트리의 `name_ko` → `institution_id` 역인덱스 필요 —
    없으면 `institution_id=None`으로 두고 **파일명·doctype으로만** 찾게 한다).
  - `DOCTYPES` 튜플에 `"archive"` 추가.
  - **`tasks_dump.json`은 색인하지 않는다** — 대화 원문 전체가 지식 검색에 섞이면
    산출물 검색이 잡담에 묻힌다. `ARTIFACT_NAMES`와 `.pptx`만 넣는다.
- `backend/reindex_service.py`: `schedule_reindex(app_state, paths)` — 완료 처리 후
  **백그라운드**(FastAPI `BackgroundTasks`)로 그 기관 아카이브 폴더만 증분 색인.
  - **실패해도 `POST /institutions/{id}/complete`는 200이다.** 계획 D에서 확정한 원칙과
    같다 — *부수 작업의 실패가 결재를 되돌리면 안 된다.* 대신 **실패 사유를 쪽지로
    남긴다**(`create_notification(recipient=완료자, kind='쪽지', sender=None)`).
  - 동시 실행 방지: 프로세스 내 `threading.Lock` 하나. SQLite 쓰기가 겹치면
    `database is locked`가 난다.

---

## Task 6 — 마감: 화면·문서·이월 정리

**Files:** `dashboard/js/knowledge.js`, `dashboard/index.html`,
`docs/실행가이드_backend-agent.md`, 스펙 §⑩, `handoff/NEXT.md`
**Test:** `dashboard/test/knowledge.test.js`(추가)

- **지식 탭**:
  - 검색이 **1.2초 이상 걸린다** — 지금은 아무 표시가 없어 "먹통인가?" 싶다.
    검색 중 표시(버튼 비활성 + "검색 중…")를 넣는다.
  - "3자 이상 입력하세요" 안내를 **하이브리드 기준으로 정정**(Task 3에서 짧은 질의도
    벡터로 답하게 된다).
  - 결과 행에 `score_kind`가 `rrf`면 **"의미 검색 포함"** 배지. 임베딩이 없어 FTS로
    폴백한 상태를 사용자가 알 수 있어야 한다(조용히 나빠지는 것이 가장 나쁘다).
- **실행가이드 §13 신설**: 하이브리드 검색이 무엇인지(글자 매치 + 뜻 매치),
  `ollama pull bge-m3`, `EMBED_MODEL`/`EMBED_BASE_URL`, **전체 빌드가 CPU에서 약 1시간**
  이라는 사실과 `reindex`로 증분 갱신하는 법, 임베딩이 없을 때의 폴백 동작.
- **스펙 §⑩ 재대조 갱신**: §② 17번을 ⚠️ → **✅**. 남은 ⚠️는 §② 14번(디자이너 전용 뷰)
  1건이 된다.
- **`handoff/NEXT.md` 갱신**: §② 17번 항목 제거, M-1(archive_dir 값 통일)에 대해
  **이 계획에서 알아낸 사실을 반영**한다 — `backend/main.py:28`은 `data/report_archive`,
  `backend/orchestrator_service.py:75`는 `report_archive`로 **접두사가 다르다.**
  Task 5가 archive_root를 색인 루트로 쓰기 시작하면 이 불일치가 **처음으로 실제 증상**
  (색인이 엉뚱한 폴더를 본다)을 낸다. Task 5에서 값을 통일하고 M-1을 닫을지,
  별건으로 남길지 그때 판단해 기록한다.

---

## Verification

```bash
py -3.14 -m pip install -r requirements.txt        # numpy
py -3.14 -m pytest agent backend collector -q      # 408 + 신규
node --test dashboard/test/*.test.js               # 100 + 신규

# 전체 빌드는 약 1시간 — 백그라운드로 돌리고 진행률을 본다
py -3.14 -m agent.retrieval build
py -3.14 -m agent.retrieval reindex                # 두 번째는 변경분만 → 수 초
```

브라우저 `http://localhost:8000/` (`py -3.14 -m backend.demo`):

1. **[지식] 탭 → `청년 자립 지원`** 검색. FTS 단독일 때는 **0건**이던 질의에서
   청년 창업·청년몰 관련 청크가 나오고, 행에 **"의미 검색 포함"** 배지가 붙는다.
2. **`제안서 평가 배점`** 처럼 원문 그대로인 용어는 여전히 정확히 잡힌다
   (하이브리드가 기존 강점을 깨지 않았는지 — 이게 핵심 회귀 확인이다).
3. 검색 중 **"검색 중…"** 이 보이고 버튼이 잠긴다(1.2초).
4. **Ollama를 끄고** 검색 → 503으로 죽지 않고 **FTS 결과가 나오며** 배지가 사라진다.
5. 워크플로 탭에서 기관 하나를 **완료 처리** → 몇 초 뒤 지식 탭에서 그 기관의
   `rfp_scoring.json`·제안서가 **검색된다**(§② 17번 실증).
6. 완료 처리 중 인덱스 DB를 잠가 재색인을 실패시켜도 **완료는 200**이고,
   **쪽지함에 실패 사유**가 온다.

## 미결 — 착수 전 사용자 확인 1건

**Task 5의 아카이브 색인 방식**을 ⓐ로 잡아뒀다. 대안은 ⓑ다.

- **ⓐ 인덱서가 `archive_root`를 추가 루트로 스캔** (이 계획의 기본안).
  파일을 복사하지 않아 중복이 없고, `corpus/`의 의미("반입된 원본")를 흐리지 않는다.
- **ⓑ 아카이브 산출물을 `corpus/reports/`로 승격 복사**.
  색인기는 손대지 않아도 되지만 **같은 파일이 두 곳에 생기고**, "승격 경로 설계"가
  선행돼야 한다(NEXT.md의 M-1이 바로 그 미결 항목이다).

## 이번 범위 밖

- **§② 14번 디자이너 전용 뷰** — 남은 마지막 ⚠️. 화면 신설이라 별도 계획.
- **`gpt-oss-120b` 실측** — 하드웨어 종속. 환경변수 교체만으로 붙는 것은 확인됨.
- **M-6**(업로드 동기 LLM 지연) — 비동기화 설계 결정이 선행.
- **벡터 인덱스 자료구조(HNSW 등)** — 2,763청크에서는 전수 비교가 밀리초급이라
  불필요하다. 수만 건이 되면 그때 `sqlite-vec` 도입을 검토한다.
