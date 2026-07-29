# agent/retrieval 설계 — 코퍼스 파서 + SQLite FTS 인덱스 + 교체 가능한 검색 인터페이스

- **작성일**: 2026-07-29
- **상위 스펙**: `docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §④·§⑦-5
  (에이전트 개입 지점 4 "작성 지원 검색 채팅"의 검색 부품)
- **관련 코드**: `backend/agent_adapter.py`(`_load_team_corpus` — 교체 대상),
  `backend/routers/tasks.py`(채팅 엔드포인트), `corpus/`(원료)
- **성격**: 구현 스펙. 실행은 별도 플랜(`docs/superpowers/plans/`)으로 태스크를 쪼개
  후속 세션에서 진행한다.

---

## ① 배경 — 무엇을 왜 만드나

현재 팀 채팅(지점 4)은 `_load_team_corpus()`가 기관 폴더의 해당 팀 파일을 **통째로**
읽어 프롬프트에 붓는다. 기관 1곳 코퍼스로는 동작하지만:

1. **질의와 무관한 내용까지 전부 컨텍스트에 들어간다** — 내부 LLM의 컨텍스트 한도와
   응답 품질 모두에 불리하다.
2. **기관 간 교차 검색이 불가능하다** — "다른 구는 비슷한 사업을 어떻게 했나" 류의
   질의는 현재 구조로는 성립하지 않는다.
3. **rfp/·reports/·inbox/는 아예 검색 대상이 아니다** — 코퍼스 개념이 폴더
   (`corpus/`)로는 생겼지만 검색으로는 이어지지 않았다.

상위 스펙의 확정 전제를 그대로 따른다: **벡터DB를 전제하지 않고**, 사내 선례인
"파일 낙하지점 → 파서 → 캐시 인덱스" 형태를 SQLite FTS5로 구현하며, 검색부는
함수 시그니처 하나로 격리해 후일 임베딩 검색으로 **이 부품만** 교체 가능하게 한다.

## ② 환경 확인 (이 리포에서 검증됨)

- `py -3.14`의 sqlite3 = SQLite **3.50.4**, `tokenize='trigram'` FTS5 가상 테이블
  생성 확인 완료. trigram 토크나이저는 SQLite 3.34+부터이므로 폐쇄망 반입 파이썬도
  3.9+ 표준 배포면 충족될 가능성이 높다 — 반입 환경에서 §② 첫 줄 한 줄 검증을
  선행할 것.
- 의존성 추가 없음: **표준 라이브러리만 사용한다** (`sqlite3`, `pathlib`, `dataclasses`,
  `argparse`). `backend/corpus_validator.py`와 같은 원칙 — 반입 승인 부담을 늘리지 않는다.

## ③ 모듈 구조

```
agent/retrieval/
├─ __init__.py     search(), RetrievedChunk 재수출 — 외부는 이것만 import
├─ parsers.py      확장자별 파서 레지스트리. v1은 .txt 하나 (UTF-8, 실패 시 건너뛰고 경고)
├─ chunker.py      텍스트 → 청크 목록 (빈 줄 기준 문단 분할 → 최대 800자까지 병합)
├─ indexer.py      build_index(corpus_root, db_path) — 전체 재빌드(원자적 교체)
├─ search.py       search(query, ...) -> list[RetrievedChunk] — FTS5 bm25 질의
└─ __main__.py     CLI: py -3.14 -m agent.retrieval build | search "질의"
```

- 인덱스 파일: **`data/corpus_index.db`** — 시스템 생성물이므로 `data/`
  (gitignore됨, `.claude/` 반입 정책과 무관). `registry.db`와 섞지 않는 별도 파일:
  워크플로 DB와 검색 캐시는 백업·재생성 정책이 다르다.
- 재빌드는 **항상 전체**: 임시 파일에 빌드 후 `os.replace`로 원자 교체. 코퍼스가
  수백 파일 규모라 증분 인덱싱의 복잡도가 이득보다 크다(비범위 §⑦).

## ④ 데이터 모델

FTS5 external-content 없이 단순 구성 — 청크 텍스트를 FTS 테이블에 직접 넣는다.

```sql
CREATE VIRTUAL TABLE chunks USING fts5(
    text,                        -- 청크 본문 (검색 대상)
    path UNINDEXED,              -- 리포 루트 기준 상대경로 (예: corpus/institutions/dobong/spec/02_….txt)
    chunk_no UNINDEXED,          -- 파일 내 청크 순번 (0부터)
    institution_id UNINDEXED,    -- corpus/institutions/{id}/… 에서 추출, 그 외 NULL
    doctype UNINDEXED,           -- spec | plan | bank_ideas | rfp | report | inbox
    filename UNINDEXED,          -- 파일명만 (팀별 접두사 필터용: 02_*, 03_*)
    tokenize = 'trigram'
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);  -- built_at, corpus_root, file_count
```

- `doctype` 판정은 경로 규칙으로: `corpus/institutions/*/spec/` → `spec`,
  `…/plan/` → `plan`, `bank_ideas_draft.txt` → `bank_ideas`, `corpus/rfp/` → `rfp`,
  `corpus/reports/` → `report`, `corpus/inbox/` → `inbox`.
- v1 파서가 .txt뿐이므로 실제로 인덱스되는 것은 institutions 전체 + inbox의 .txt다.
  rfp(PDF)·reports(HTML/DOCX)는 파서 레지스트리에 확장자 항목만 추가하면 되는
  구조로 남긴다(비범위 §⑦).

## ⑤ 검색 인터페이스 — 교체 가능성의 경계선

상위 스펙 §④가 요구한 "함수 시그니처 하나(질의 → 근거 청크 목록)":

```python
@dataclass(frozen=True)
class RetrievedChunk:
    path: str            # 리포 루트 기준 상대경로 — 답변 인용에 그대로 사용
    chunk_no: int
    text: str
    score: float         # bm25 (낮을수록 좋음 — SQLite 관례 그대로 노출)
    institution_id: str | None
    doctype: str
    filename: str

def search(
    query: str,
    *,
    institution_id: str | None = None,
    doctypes: Sequence[str] | None = None,
    filename_prefix: str | None = None,
    limit: int = 8,
    db_path: str | os.PathLike = "data/corpus_index.db",
) -> list[RetrievedChunk]:
```

- **후일 임베딩 도입 시 이 시그니처만 유지하고 구현을 통째로 바꾼다.** 호출부
  (agent_adapter, 질의 API)는 수정하지 않는다.
- trigram 토크나이저 특성: 질의가 **3자 미만이면 매치 불가** → 빈 목록 반환(예외
  아님). FTS5 질의 문법 충돌(따옴표 등)은 질의 전체를 문자열 리터럴(`"…"`)로 감싸
  방어한다.
- 인덱스 파일이 없으면 `IndexNotBuiltError`를 던진다 — 호출부가 폴백을 결정한다(§⑥).

## ⑥ 통합 지점 2곳

### 1. `backend/agent_adapter._load_team_corpus()` 교체

현재의 "팀별 폴더 통째 읽기"를 검색 호출로 바꾼다. 팀 → 필터 매핑:

| team | 현재 동작 | 검색 필터 |
|---|---|---|
| 영업 | spec/*.txt 전부 + bank_ideas_draft.txt | `doctypes=("spec", "bank_ideas")` |
| IT | plan/02_*.txt | `doctypes=("plan",)`, `filename_prefix="02_"` |
| 그 외(금전 등) | plan/03_*.txt | `doctypes=("plan",)`, `filename_prefix="03_"` |

- 질의어는 `user_message`를 그대로 쓴다. `institution_id`는 기존 `giganlist_dir`
  값(`corpus/institutions/{id}`)에서 추출한다.
- **폴백 유지**: `IndexNotBuiltError`(인덱스 미구축) 시 기존 통째-읽기 경로로
  동작한다. 폐쇄망 반입 직후 인덱스가 아직 없어도 채팅이 죽지 않아야 하고,
  기존 테스트(`test_agent_adapter.py`)가 폴백 경로의 회귀 방어가 된다.
- 프롬프트의 근거 자료 표기는 기존 `[spec/파일명]` 형식을 `[경로#청크번호]`로
  바꿔 인용 추적성을 유지한다.

### 2. 질의 API (backend)

`GET /search?q=…&institution_id=…&doctype=…&limit=…` → `RetrievedChunk` 목록 JSON.
새 라우터 `backend/routers/search.py`. 인덱스 미구축 시 503 + "build 안내" 메시지.
후일 통합 프런트(상위 E2E 스펙 sub-project 5)의 검색 화면이 이 API를 그대로 쓴다.

## ⑦ 비범위

- **임베딩/벡터 검색** — §⑤ 시그니처 뒤의 교체 문제로 격리 완료.
- **증분 인덱싱·파일 감시** — 전체 재빌드 CLI로 충분한 규모.
- **PDF(rfp)·HTML/DOCX(reports) 파서** — 파서 레지스트리에 자리만 있음. PDF 추출은
  `agent/nodes/rfp_analysis.py`와의 공유 여부를 그때 별도 판단.
- **프런트 검색 UI** — sub-project 5의 몫. 여기서는 API까지만.
- **검색 품질 튜닝**(동의어, 형태소 분석기 반입 등) — trigram 부분일치로 시작.

## ⑧ 검증 계획

1. 단위: chunker(문단 병합 경계), parsers(비UTF-8 건너뜀), indexer(원자 교체,
   doctype 판정), search(필터 조합, 3자 미만, 특수문자 질의, 인덱스 부재).
2. 통합: 실제 `corpus/institutions/` 25개 구 전체 인덱스 빌드 → 한국어 질의
   스모크(예: "청년 창업 지원" → dobong/nowon spec 청크가 상위에 오는지 눈검증).
3. 회귀: `py -3.14 -m pytest backend agent -q` 기존 148개 + 신규 전부 통과.
   agent_adapter 폴백 경로는 기존 테스트가 그대로 커버.

## ⑨ 결정 로그

1. **trigram 토크나이저 기본 채택** — FTS5 기본(unicode61)은 한국어를 어절
   단위로만 잘라 조사 붙은 단어를 놓친다. trigram은 부분 문자열 일치라 형태소
   분석기 반입 없이 한국어에서 실용적. 이 리포 환경에서 동작 검증됨(§②).
2. **인덱스를 `data/corpus_index.db`로 분리** — corpus(원료)/data(생성물) 경계
   원칙(상위 스펙 §④) 그대로. registry.db와도 분리 — 재생성 정책이 다르다.
3. **전체 재빌드 + 원자 교체만 지원** — 코퍼스 규모에서 증분의 복잡도가 이득을
   초과. 빌드 중 검색 요청은 교체 전 구 인덱스를 계속 본다.
4. **표준 라이브러리만 사용** — corpus_validator와 동일 원칙. 폐쇄망 반입 승인
   대상을 늘리지 않는다.
5. **agent_adapter에 폴백 유지** — 인덱스는 캐시이지 진실의 원천이 아니다. 캐시
   부재가 기능 정지로 이어지지 않게 하고, 기존 테스트를 회귀 방어로 재활용한다.
6. **v1 파서는 .txt만** — 현재 검색 수요(팀 채팅)의 원료가 전부 .txt. PDF/HTML은
   레지스트리 확장 지점으로만 남겨 스코프를 고정한다.
