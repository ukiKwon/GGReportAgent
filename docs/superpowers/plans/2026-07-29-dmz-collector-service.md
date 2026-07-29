# DMZ 수집 서비스 구현 플랜 (sub-project 1)

**설계 근거**: `docs/superpowers/specs/2026-07-29-dmz-collector-service-design.md`
**출력 계약**: `collector/SCHEMA.md` (변경하지 않는다 — 이 구현이 그 계약을 지키는 쪽)

**Goal:** 망 밖 수집 서비스(`collector/`)를 세워, `POST /collect` 한 번으로
SCHEMA.md v1 규격의 배치가 생성되고, 브리지 CLI가 그 배치를 `corpus/inbox/`에 놓고
망 안(8000)에 반입시키는 데까지 동작시킨다.

## Global Constraints

- 항상 **`py -3.14`**.
- **경로 명시 커밋만** (`git add <paths>`) — 다른 세션의 미커밋 수정을 스테이징하지 않는다.
- `collector/` **런타임 코드는 `backend`·`agent`를 import하지 않는다**(테스트로 강제).
  테스트 코드가 계약 검증 목적으로 backend 파서를 import하는 것은 허용.
- 신규 의존성 0 (FastAPI·pytest는 이미 있음).
- 기준선: `py -3.14 -m pytest backend agent -q` → 178 passed. Task마다 그린 유지 + 커밋 1개.

## Tasks

### Task 1: 플랜 문서 커밋
- 이 파일을 커밋(브랜치 `dmz-collector-service`는 생성 완료).

### Task 2: 소스 어댑터 (`collector/sources/`)
**Files:** `sources/base.py`, `sources/fixture.py`, `tests/test_sources.py`
- `CollectedNotice`(frozen dataclass, 스펙 §⑥ 필드 그대로), `AttachmentRef(filename, data)`.
- `Source` 프로토콜(`slug`/`name_ko`/`base_url`/`fetch()`) + `SOURCES` 레지스트리 +
  `get_source(slug)`(미등록이면 `KeyError` → 앱이 404로 번역).
- `FixtureSource`: JSON 파일(또는 dict)에서 레코드를 읽는다. 기본 픽스처 1개 동봉.
- 테스트: 레지스트리 조회/미등록, 픽스처 파싱, 날짜 형식 검사(잘못되면 거부).

### Task 3: 배치 생성 + 자기검사 (`collector/batch.py`, `collector/schema.py`)
**Files:** `batch.py`, `schema.py`, `tests/test_batch.py`, `tests/test_schema.py`
- `schema.py`: `validate_batch(dir) -> list[str]`(오류 메시지 목록). 필수 필드,
  `batch_id`==폴더명, 날짜 `YYYY-MM-DD`, `confidence` 값 domain, 첨부 실재·경로 이탈,
  `schema_version` 지원 여부. **표준 라이브러리만.**
- `batch.py`: `write_batch(source, notices, out_root, now) -> BatchResult`.
  - 폴더명/`batch_id` = `YYYY-MM-DD_HHmm_<slug>`, manifest(UTF-8, BOM 없음),
    CSV 12열(UTF-8 **BOM 있음**), `files/<notice_id>_<파일명>`.
  - CSV 파생: 기관당 1행 합치기, `확정` 우선·동률이면 `posted_at` 최신,
    `출처`는 `;` 결합, `수정일`은 `collected_at` 날짜부.
  - 경로 이탈 파일명 **거부**, 쓰기 후 `validate_batch` 자기검사 → 실패 시
    **폴더 삭제하고 예외**(반쯤 만든 배치를 남기지 않는다).
- 테스트: 구조/BOM/합치기/확정우선/이탈거부/자기검사 롤백.

### Task 4: CSV 계약 테스트 (스펙 §⑧의 핵심)
**Files:** `tests/test_csv_contract.py`
- 생성된 CSV를 `backend.csv_import.parse_csv`에 통과시켜 6필드 추출 확인.
- 같은 CSV를 `node`로 `dashboard/js/logic.js` `parseCsv`에 통과시켜 12필드 확인
  (node 부재 시 `pytest.skip`).
- `collector/` 런타임 코드가 `backend`/`agent`를 import하지 않음을 소스 스캔으로 강제.

### Task 5: FastAPI 앱 (`collector/app.py`)
**Files:** `app.py`, `__init__.py`, `tests/test_app.py`
- 스펙 §⑤ 엔드포인트 6개. `create_app(out_root=...)`로 출력 경로 주입(테스트는 tmp).
- `/batches/{id}/archive`는 zip 스트림. 미등록 소스 404, 없는 배치 404.
- 기본 출력 루트 `data/collector/`(gitignored).

### Task 6: 브리지 CLI (`collector/bridge.py`)
**Files:** `bridge.py`, `tests/test_bridge.py`
- `py -3.14 -m collector.bridge --dmz http://127.0.0.1:8001 --batch <id>
   --inbox corpus/inbox --backend http://127.0.0.1:8000`
- 동작: ⓐ zip 내려받아 ⓑ inbox에 풀고 `validate_batch`로 검사 ⓒ CSV를
  `POST /institutions/import`에 업로드. `--no-import`로 ⓒ 생략 가능.
- 검증 실패면 **inbox에 남기지 않고** 중단. 이미 같은 batch_id가 inbox에 있으면 거부.
- 테스트: httpx `MockTransport`로 DMZ/backend 양쪽을 모킹해 전 구간 검증.

### Task 7: E2E 스모크 + 문서 + 마무리
- 실제 두 서비스 기동(8001/8000) → `POST /collect` → 브리지 → 기관 upsert 확인.
- `docs/실행가이드_backend-agent.md`에 §4(수집 서비스·브리지) 추가.
- 전체 테스트 그린 → `--no-ff` 병합 → push → NEXT.md·summary 갱신.

## Verification

- Task마다 `py -3.14 -m pytest backend agent collector -q` 그린.
- Task 4의 계약 테스트가 SCHEMA.md §⑦의 수동 검증을 자동화한 것 — 이게 깨지면
  스키마 문서와 구현이 갈라진 것이다.
- Task 7의 E2E가 "포트만 다른 같은 IP에서 주고받기"(사용자 요구)의 실제 확인.
