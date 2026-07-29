# 폐쇄망 배치 반입 설계 문서 (sub-project 2)

- **작성일**: 2026-07-30
- **상태**: 확정 (브레인스토밍 승인 완료)
- **상위 스펙**: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md` §⑧-2
  (폐쇄망 백엔드 코어)
- **계약 문서**: `collector/SCHEMA.md` — 특히 §⑥(망 안에서의 처리 흐름) 2·4·5·6단계가
  본 스펙의 구현 대상이다. SCHEMA.md는 "**2~6은 아직 구현되지 않았다**"고 명시하고
  §⑧(비범위)에서 그 코드를 후속 스펙으로 넘겼는데, 그 후속 스펙이 이 문서다.

---

## ① 목적 / 범위

망 밖 수집기가 만든 배치 폴더가 물리 반입(USB 등)으로 `corpus/inbox/`에 도착한 뒤,
망 안에서 벌어지는 일 전체를 구현한다. SCHEMA.md §⑥의 6단계 중 현재 구현된 것은
3(CSV 반입)뿐이다.

| §⑥ 단계 | 내용 | 현재 |
|---|---|---|
| 1 | 사람이 배치를 `corpus/inbox/`에 놓는다 | 운영 행위 (코드 아님) |
| 2 | 배치 검증 | **망 밖에만 있음** — `collector/schema.py` |
| 3 | `institutions.csv` → 기관 upsert | ✅ `POST /institutions/import` |
| 4 | 공고 레코드 → `bid_cases` 일정 갱신 | ❌ |
| 5 | 첨부 PDF → `corpus/rfp/` 이동 + `rfp_path` 기록 | ❌ |
| 6 | 처리된 배치를 inbox에서 치움 | ❌ |

**범위 밖**

- 수집·크롤링(망 밖) — sub-project 1과 별도 수집기 스펙의 몫.
- SCHEMA v2 마이그레이션 — v1만 지원하고, 상위 버전은 §⑨대로 **거부**한다.
- 반입 이력 UI — 결과는 API 응답으로만 돌려주고 화면은 sub-project 5에서 다룬다.

---

## ② 검증기를 중립 계약 모듈로 승격

§⑥ 2가 요구하는 검증 5가지(`schema_version` 지원 여부·필수 필드·날짜 형식·
`attachments` 실재·경로 이탈)는 **이미 `collector/schema.py`의 `validate_batch()`가
정확히 그대로 수행한다.** 망 안에 같은 것을 다시 만들면 SCHEMA v2 때 두 곳을 고쳐야
하는 "두 개의 진실"이 생긴다.

그렇다고 `backend`가 `collector`를 import하면, 운영(Track 1)에서 폐쇄망 서버에
DMZ용 FastAPI 앱이 들어 있는 `collector/` 패키지가 딸려 들어간다.

→ **양쪽 어디도 아닌 중립 패키지로 옮긴다.**

```
contract/
  __init__.py
  batch_schema.py     ← collector/schema.py 를 git mv (이력 보존)

collector/batch.py    from contract.batch_schema import validate_batch
collector/app.py      〃
collector/bridge.py   〃
backend/inbox_import.py  from contract.batch_schema import validate_batch
```

- `contract/`는 **표준 라이브러리만** 쓰고 `backend`·`agent`·`collector` 어느 쪽도
  import하지 않는다. 순수 형식 파서이므로 네트워크 경로를 만들지 않는다 — 양쪽이
  같은 JSON 라이브러리를 쓰는 것과 같은 성격이다.
- 기존 경계 테스트(`collector/tests/test_boundary.py`)는 정규식이
  `^\s*(?:from|import)\s+(backend|agent)\b`라 `contract`에 걸리지 않는다. **수정
  없이 그대로 유효**하다.
- **`collector/tests/test_schema.py`는 옮기지 않는다.** 이 파일은 픽스처를
  `collector.batch.write_batch` + `FixtureSource`로 만들기 때문에, `contract/`로
  옮기면 계약 모듈의 테스트가 거꾸로 collector에 의존하게 된다. 지금 자리에서
  "내가 만든 배치가 계약을 통과하는가"를 검증하는 collector 쪽 테스트로 두고,
  import 줄만 바꾼다.

---

## ③ 데이터 모델 변경 — `bid_cases`에 공고 식별자 추가

SCHEMA §④는 레코드 유일키를 **`(source.slug, notice_id)`**로 선언하고 "같은 공고를
다시 수집하는 것은 정상이며 **나중 배치가 이긴다**"고 규정한다. 그런데 현재
`bid_cases`에는 그 두 값을 담을 곳이 없어 "이 공고가 어느 bid_case인가"를 판정할
수단 자체가 없다.

```sql
ALTER TABLE bid_cases ADD COLUMN source_slug TEXT;
ALTER TABLE bid_cases ADD COLUMN notice_id   TEXT;
ALTER TABLE bid_cases ADD COLUMN title       TEXT;
ALTER TABLE bid_cases ADD COLUMN notice_url  TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_cases_notice
    ON bid_cases(source_slug, notice_id);
```

| 컬럼 | 출처 | 비고 |
|---|---|---|
| `source_slug` | `manifest.source.slug` | dedup 키 절반 |
| `notice_id` | `records[].notice_id` | dedup 키 절반. 출처 사이트 원문 |
| `title` | `records[].title` | 공고 제목 원문 |
| `notice_url` | `records[].evidence.url` | 반입 근거 — 감사 추적용 |

- **부분 유니크 인덱스가 아니라 일반 유니크 인덱스**로 충분하다. SQLite는 `NULL`을
  서로 다른 값으로 취급하므로, 두 컬럼이 `NULL`인 기존 수동/seed `bid_case`가
  여러 건 있어도 인덱스가 걸리지 않는다.
- `backend/db.py`의 `SCHEMA`는 `CREATE TABLE IF NOT EXISTS`라 **기존 `registry.db`에
  컬럼이 자동으로 붙지 않는다.** `init_db()`에 멱등 마이그레이션
  (`PRAGMA table_info(bid_cases)`로 확인 후 없는 컬럼만 `ALTER TABLE`)을 넣는다.
  과거 `finalized_by` 추가 때처럼 DB를 지우고 재시드하는 방식은 쓰지 않는다 —
  이제는 반입된 실데이터가 들어 있을 수 있다.

---

## ④ API — validate / import 2개

기존 코퍼스 반입(`POST /institutions/{id}/corpus/validate` + `POST .../corpus`)이
이미 이 리포의 관례이므로 같은 모양을 따른다.

```
POST /inbox/{batch_id}/validate   # 검사만. DB·파일 완전 무변경
POST /inbox/{batch_id}/import     # §⑥ 2·3·4·5·6 실행
```

**`/validate` 응답**

```json
{ "ok": true, "errors": [], "batch_id": "2026-07-29_0930_fixture" }
```

`validate_batch()`가 경고 개념 없이 오류 목록만 돌려주므로 `warnings`는 두지 않는다
(코퍼스 검증기와 다른 점 — 배치는 형식 계약이라 "애매하지만 통과"가 없다).

**`/import` 응답**

```json
{
  "batch_id": "2026-07-29_0930_fixture",
  "imported_institutions": 2,
  "institution_ids": ["dobong", "new-a1b2c3d4"],
  "bid_cases": { "created": ["bc-1a2b3c4d"], "updated": ["bc-9f8e7d6c"] },
  "rfp_files": [{ "institution_id": "dobong", "rfp_path": "corpus/rfp/20260729-00123_공고문.pdf" }],
  "archived_to": "data/batches/2026-07-29_0930_fixture"
}
```

**상태 코드**

| 상황 | 코드 | 부작용 |
|---|---|---|
| `batch_id`가 `BATCH_ID_RE`에 안 맞음 | 400 | 없음 |
| `corpus/inbox/{batch_id}`가 없음 | 404 | 없음 |
| `validate_batch()` 오류 | 422 | **없음** (DB·파일 무변경) |
| 레코드의 `name_ko`로 기관을 못 찾음 | 422 | **없음** (커밋 전 롤백) |
| 정상 | 200 | 아래 ⑤ |

---

## ⑤ `/import` 실행 순서와 원자성

```
1. _safe_batch_dir(batch_id)          → 400 / 404
2. validate_batch(batch_dir)          → 422
```

**1단계는 경로 문자열을 검사하지 않고 `batch_id` 형식을 검사한다.** `contract`에 이미
있는 `BATCH_ID_RE`(`^\d{4}-\d{2}-\d{2}_\d{4}_[a-z0-9-]+$`)에 맞지 않으면 400이다.
이 정규식은 `/`·`\`·`..`·`:`를 애초에 허용하지 않으므로 경로 이탈이 **구조적으로**
불가능하다 — 허용 목록이 차단 목록보다 안전하다. 통과한 뒤 `corpus/inbox/{batch_id}`가
실제 디렉터리인지 확인해 아니면 404.

```
── 여기부터 DB 트랜잭션 (commit=False) ──
3. parse_csv + upsert_institution     (기존 함수 직접 재사용)
4. 레코드별 bid_case upsert
   conn.commit()                      ← DB 확정
── 여기부터 파일 이동 (롤백 불가) ──
5. 첨부 PDF → corpus/rfp/
6. batch_dir → data/batches/{batch_id}
```

**DB를 먼저 커밋하고 파일을 나중에 옮기는 이유**: 파일 이동은 트랜잭션이 아니다.
순서를 뒤집으면 4단계에서 실패했을 때 DB는 롤백되지만 배치 폴더는 이미
`data/batches/`로 사라진 뒤라, 되돌릴 방법도 재시도할 방법도 없다. 반대 순서에서
5·6이 실패하면 DB는 이미 반영됐고 배치는 inbox에 남아 있으므로 — 사람이 원인을
고친 뒤 다시 호출할 수 있고, 3·4는 upsert라 재실행이 안전하다.

**3단계는 HTTP 자기호출을 하지 않는다.** `backend/csv_import.parse_csv`와
`backend/repository.upsert_institution`이 이미 순수 함수라 그대로 부르면 된다
(`POST /institutions/import` 핸들러가 하는 일도 딱 그 둘이다).

**4단계의 기관 해소**: 레코드에는 `institution_id`가 없다 — SCHEMA §⑩-2가 망 밖의
슬러그 발급을 금지하기 때문이다. 대신 §④ 필드 규칙이
`records[].institution.name_ko`를 "CSV `기관명`과 **동일 값**"으로 못박는다. 3단계가
그 이름의 기관을 반드시 만들어 놓으므로, `repository._find_id_by_name()`으로 조회하면
반드시 찾힌다. **못 찾으면 그것은 계약 위반**이므로 422로 거부하고 롤백한다
(조용히 건너뛰면 일정이 없는 유령 공고가 생긴다).

**4단계 upsert 규칙**

- `(source_slug, notice_id)`로 조회 → 있으면 `expected_date`/`confirmed_date`/
  `schedule_confidence`/`last_synced_at`을 **덮어쓴다**(나중 배치가 이긴다).
- 없으면 `create_bid_case()`로 새로 만든다 — `participation_status='검토중'`,
  `research_status`는 기존 로직대로 기관의 `giganlist_dir` 유무로 결정된다.
- `schedule.confidence`가 그대로 `schedule_confidence`에 대응한다(§⑥-4).
- **어느 날짜를 쓰는가**: `schedule`에는 날짜가 4개(`posted_at`·`deadline_at`·
  `contract_end`·`last_bid`) 있으므로 명시가 필요하다. `bid_cases.expected_date`/
  `confirmed_date`는 "입찰이 언제인가"를 뜻하므로 **`deadline_at`(제출 마감일)을
  우선** 쓰고, 없으면 `contract_end`로 폴백한다(계약 종료가 곧 다음 입찰 시점이라는
  기존 대시보드 관례 — `csv_import.HEADER_MAP`이 `입찰예상일`을 `contract_end`에
  매핑하는 것과 같은 해석). 둘 다 없으면 날짜는 `NULL`로 두고 bid_case는 만든다
  (공고는 실재하므로).
- `confidence == '확정'`이면 그 날짜를 `confirmed_date`에, `'예상'`이면
  `expected_date`에 넣는다. 반대쪽 컬럼은 **건드리지 않는다** — 예상이 확정으로
  승격될 때 예전 예상값을 지우면 "언제 예상했었나"가 사라진다.
- **Task는 여기서 만들지 않는다.** 신규 bid_case는 `검토중`이고, Task는 참여확정 +
  코퍼스 완료일 때만 생기는 기존 규칙을 그대로 탄다.

**5단계 첨부 처리**: 첨부는 `corpus/rfp/{notice_id}_{원본파일명}`으로 옮긴다(§⑤ 권장
명명). 한 레코드에 첨부가 여러 개면 **첫 번째만** `institutions.rfp_path`에 기록하고
나머지는 파일만 옮긴다 — `rfp_path`는 단일 컬럼이고 §⑤도 "공고문 PDF"를 단수로
전제한다. 이름이 이미 있으면 덮어쓴다(같은 공고의 재수집이므로 나중 배치가 이긴다).

**멱등성은 공짜다.** 성공하면 6단계에서 배치가 inbox에서 사라지므로, 같은
`batch_id`로 다시 부르면 404다. 실패해서 배치가 남아 있는 경우의 재호출은 3·4가
upsert라 안전하다.

---

## ⑥ 브리지 연결

`collector/bridge.py`의 `_import_csv()`는 지금 `POST /institutions/import`(CSV만)를
부른다. 이를 `POST /inbox/{batch_id}/import`로 **교체**한다. 브리지는 이미 배치를
`corpus/inbox/{batch_id}`에 풀어놓은 뒤이므로, 파일을 다시 올릴 필요 없이
`batch_id`만 넘기면 된다.

- 망 경계는 그대로다 — 백엔드는 **자기 파일시스템의 `corpus/inbox/`만 읽는다.**
  망 밖을 향한 요청도, 역방향 콜백도 생기지 않는다(SCHEMA §⑩-5).
- 브리지의 역할("운영에서 사람이 USB로 하는 일의 대역")은 바뀌지 않는다. 운영에서는
  사람이 배치를 놓은 뒤 `/inbox/{batch_id}/import`를 호출하는 것이 같은 일이다.

---

## ⑦ 파일 구조

| 파일 | 상태 | 내용 |
|---|---|---|
| `contract/__init__.py` | 신규 | 빈 파일 |
| `contract/batch_schema.py` | **이사** | `collector/schema.py`를 `git mv` |
| `collector/{app,batch,bridge}.py` | 수정 | import 1줄씩 |
| `collector/tests/test_schema.py` | 수정 | import 1줄 |
| `collector/bridge.py` | 수정 | `_import_csv` → `_import_batch` (⑥) |
| `backend/db.py` | 수정 | 4컬럼 + 유니크 인덱스 + 멱등 마이그레이션 |
| `backend/bidcase_repository.py` | 수정 | `upsert_bid_case_from_notice()` 추가 |
| `backend/repository.py` | 수정 | `_find_id_by_name` → `find_id_by_name` 공개 |
| `backend/inbox_import.py` | 신규 | ⑤의 1~6단계 오케스트레이션 |
| `backend/routers/inbox.py` | 신규 | 엔드포인트 2개 |
| `backend/main.py` | 수정 | 라우터 등록 |
| `backend/models.py` | 수정 | `BidCase`에 4필드 추가 |
| `backend/tests/test_api_inbox.py` | 신규 | ⑧ |

`backend/inbox_import.py`가 순수 함수(오케스트레이션)이고 라우터는 얇은 껍데기라,
반입 로직은 HTTP 없이 단위 테스트할 수 있다 — 기존 `corpus_validator.py` /
`routers/institutions.py`의 역할 분리와 같은 형태다.

---

## ⑧ 테스트

**`backend/tests/test_api_inbox.py`** (신규)

| 테스트 | 확인 |
|---|---|
| `test_validate_ok` | 정상 배치 → `{ok: true, errors: []}` |
| `test_validate_does_not_change_state` | `/validate` 후 DB·inbox 그대로 |
| `test_rejects_bad_batch_id` | `../../etc`, `C:/windows`, 빈 문자열 → 400 (형식 불일치) |
| `test_404_for_missing_batch` | 없는 `batch_id` → 404 |
| `test_import_422_on_invalid_batch` | manifest 훼손 → 422, **DB·파일 무변경** |
| `test_import_422_when_institution_unresolved` | CSV에 없는 `name_ko` → 422, 롤백 |
| `test_import_full_path` | 기관 upsert + bid_case 생성 + PDF 이동 + `rfp_path` + 배치 보관 4가지 전부 |
| `test_reimport_updates_same_bid_case` | 같은 `(slug, notice_id)` 재수집 → **새 bid_case가 생기지 않고** 일정만 갱신 |
| `test_import_twice_is_404` | 성공 후 재호출 → 404 |

**회귀**: 기존 `collector/tests/` 8개 파일은 import 1줄 외 **무수정 통과**해야 한다.
특히 `test_boundary.py`(경계)와 `test_batch.py:69`의
`monkeypatch.setattr("collector.batch.validate_batch", ...)`는 `collector.batch`
네임스페이스에 바인딩된 이름을 패치하므로 이사와 무관하게 계속 동작한다.

**기준선**: 현재 main 178 passed. 이 작업 후 증가분만 늘고 감소는 없어야 한다.

---

## ⑨ 결정 로그

1. **검증기를 `contract/`로 승격** — 재구현하면 SCHEMA v2 때 두 곳을 고쳐야 하고,
   `backend`가 `collector`를 import하면 폐쇄망 배포에 DMZ 앱이 딸려온다. 순수
   stdlib 형식 파서를 공유하는 것은 망 경계를 뚫지 않는다.
2. **`(source_slug, notice_id)` 컬럼 추가** — SCHEMA가 선언한 유일키를 저장할 곳이
   없으면 "나중 배치가 이긴다"를 구현할 수 없다. 기관 단위로 뭉개면 한 기관에 공고
   2건이 올 때 서로 덮어쓴다.
3. **DB 커밋 → 파일 이동 순서** — 파일 이동은 롤백이 없다. 실패했을 때 사람이
   재시도할 수 있는 상태로 남는 쪽을 골랐다.
4. **`name_ko` 미해소는 422(무시 아님)** — SCHEMA가 CSV와 동일 값을 보장하므로
   못 찾는 것은 배치가 계약을 어긴 것이다. 건너뛰면 일정 없는 유령 공고가 남는다.
5. **처리된 배치는 `data/batches/`로** — `.gitignore`가 `data/*`를 이미 전부
   제외하므로 수집 원문·PDF가 실수로 커밋되지 않는다. `corpus/inbox/`는 "미처리만"이
   문자 그대로 성립한다. 삭제하지 않는 이유는 `evidence.url`·수집 시각이 반입 근거라
   감사에 필요하기 때문이다.
6. **`/validate`에 `warnings` 없음** — 배치는 형식 계약이라 "애매하지만 통과"가
   존재하지 않는다. 코퍼스 검증기와 의도적으로 다르다.

---

## 스펙 자체 검증 메모

- 플레이스홀더(TBD 등) 없음.
- ②·⑥·⑨-1이 일관: 망 경계는 "파일 단방향 + 역방향 호출 없음"이며, `contract/` 공유와
  `batch_id`만 넘기는 브리지 호출 둘 다 그 원칙을 깨지 않는다.
- ⑤의 실행 순서와 ④의 상태 코드 표가 부작용 열에서 서로 일치(422는 전부 무변경).
- 범위가 단일 구현계획에 맞다 — 신규 파일 3개, 수정 9개, 테스트 1파일.
- "배치"·"반입"·"계약 모듈" 등 용어는 SCHEMA.md와 같은 뜻으로만 사용했다.
