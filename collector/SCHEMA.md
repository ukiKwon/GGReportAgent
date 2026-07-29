# 수집기(collector) 산출물 스키마 v1

- **작성일**: 2026-07-29
- **상위 스펙**: `docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §④·§⑦-6
  (에이전트 개입 지점 1 "공고 수집" — 폐쇄망과 충돌하는 유일한 지점)
- **성격**: **스키마 계약 문서만.** 수집기 코드는 이 문서 다음이다. 이 폴더에 코드가
  생기더라도 아래 §① 경계 원칙은 유지된다.

---

## ① 경계 원칙 — 이 문서가 존재하는 이유

수집기는 **망 밖**(인터넷 연결 구역)에서 돌고, 나머지 전부(`backend/`·`agent/`)는
**망 안**에서 돈다. 둘은 **코드를 공유하지 않는다** — import도, 공용 모듈도 없다.

```
[망 밖] collector ──파일──▶ corpus/inbox/ ──사람이 반입──▶ [망 안] backend
```

접점은 `corpus/inbox/`에 떨어지는 파일 한 종류뿐이고, **그 파일의 형식이 곧
인터페이스**다. 따라서 이 문서가 계약서다. 수집기를 파이썬으로 쓰든 RPA로 쓰든
외주로 받든, 아래 형식만 지키면 망 안은 바뀌지 않는다.

이는 코퍼스 검증 스펙(`2026-07-29-institution-corpus-validation-design.md`)의
"DMZ에서 생성 → 물리 반입 → 검증 → 등록" 흐름과 같은 패턴이다. 다른 점은 그쪽은
**사람이 만든 기관 조사 폴더**, 이쪽은 **기계가 만든 공고 목록**이라는 것뿐이다.

## ② 산출물 단위 — 배치 폴더 하나

수집 1회 = 폴더 1개. 이 폴더를 통째로 `corpus/inbox/` 아래에 놓는 것이 반입이다.

```
corpus/inbox/2026-07-29_0930_narajangteo/
├─ manifest.json       ← 권위 있는 산출물 (모든 정보)
├─ institutions.csv    ← manifest에서 파생된 반입용 CSV (기존 경로 재사용)
└─ files/              ← 첨부 원문 (공고문 PDF 등). manifest가 이름으로 참조
    └─ 20260729-00123_공고문.pdf
```

**배치 폴더명**: `YYYY-MM-DD_HHmm_<source_slug>` (수집 시작 시각 기준, 로컬 시간).
`source_slug`는 소문자 ASCII + 하이픈만.

### 왜 JSON과 CSV를 둘 다 내는가

- **CSV는 이미 동작하는 반입 경로다.** 망 안의 `POST /institutions/import`
  (`backend/csv_import.py`)와 dashboard 업로드 UI가 그대로 먹는다. 수집기가 이걸
  내주면 **망 안에 신규 코드 없이** 첫날부터 반입이 성립한다.
- **JSON은 CSV가 못 담는 것을 담는다** — 공고 URL·공고번호·첨부파일·수집 근거·
  일정 신뢰도. 앞으로 늘어날 필드도 여기로 간다.
- 충돌 시 **manifest.json이 권위**다. CSV는 그 부분집합의 파생물이며, 수집기가
  manifest로부터 생성한다(사람이 따로 편집하지 않는다).

## ③ `institutions.csv` — 기존 계약 그대로

**소비자가 둘이고 읽는 열이 다르다.** 둘 다 **모르는 열은 조용히 무시**하므로,
아래 12열 상위집합 하나를 내면 양쪽이 각자 필요한 것만 가져간다.

- `backend/csv_import.py`의 `HEADER_MAP` — 6열만 읽는다(표의 ✔ 표시).
- `dashboard/js/logic.js`의 `CSV_HEADERS` — 12열 전부 읽는다(지도 매칭·출처 표시용).

헤더는 **한글**이고, 순서는 아래 그대로 쓴다(대시보드 템플릿과 일치).

| 헤더 | backend | 필수 | 형식 | 망 안 필드 |
|---|---|---|---|---|
| `기관명` | ✔ | ✅ | 문자열 | `name_ko` |
| `기관구분` | ✔ | | `지자체`/`대학병원`/`공공기관`/`공기업` | `type` |
| `지역코드` | ✔ | | 광역 행정표준코드 (예: `11`) | `region_code` |
| `구시군코드` | | | 시군구 코드 (예: `11140`) — 대시보드 지도 폴리곤 매칭용 | (대시보드 전용) |
| `입찰주기` | ✔ | | 정수(년) | `term` |
| `지난입찰일` | ✔ | | `YYYY-MM-DD` | `last_bid` |
| `입찰예상일` | ✔ | | `YYYY-MM-DD` | `contract_end` |
| `확정여부` | | | `y`/`yes`/`true`/`1`이면 확정, 그 외 전부 미확정 | (대시보드 전용) |
| `경도` / `위도` | | | 십진수. 좌표를 모르면 공란 | (대시보드 전용) |
| `출처` | | | URL 목록, **세미콜론(`;`) 구분** | (대시보드 전용) |
| `수정일` | | | `YYYY-MM-DD` | (대시보드 전용) |

- `확정여부`는 manifest의 `schedule.confidence`(`확정`/`예상`)와 같은 사실을 CSV
  어휘로 옮긴 것이다 — 값이 서로 어긋나면 안 된다.
- **인코딩: UTF-8 with BOM**(`utf-8-sig`). 백엔드는 BOM 우선·실패 시 cp949 폴백,
  대시보드는 선두 BOM을 잘라내고 파싱한다 — BOM을 붙이는 쪽이 Excel 호환까지
  얻어 양쪽 모두에 안전하다.
- 쉼표·따옴표·개행이 든 값은 RFC4180대로 `"`로 감싸고 내부 `"`는 `""`로 이스케이프
  한다(대시보드 파서가 이 규칙을 구현하고 있다).
- **빈 값은 열을 비워둔다**(`""`). 망 안 upsert가 `COALESCE`라 **빈 값은 기존
  데이터를 덮어쓰지 않는다** — "모르는 값"을 안전하게 표현하는 방법이 공란이다.
  반대로 잘못된 추측값을 넣으면 기존 확정 데이터를 덮어쓴다.
- **`institution_id` 열은 없다. 만들지도 말 것.** canonical 슬러그 발급은 망 안의
  권한이다(`backend/repository.upsert_institution`: `기관명` 일치 시 기존 id 사용,
  없으면 `new-<hex8>` 발급). 수집기가 id를 지어내면 `corpus/institutions/{id}`
  폴더명과의 일치 규칙이 깨진다.

### manifest → CSV 파생 규칙

CSV의 모든 열은 manifest에서 기계적으로 나온다. 사람이 손대지 않는다.

| CSV 열 | manifest 출처 |
|---|---|
| `기관명` | `records[].institution.name_ko` |
| `기관구분` | `records[].institution.type` |
| `지역코드` / `구시군코드` | `records[].institution.region_code` / `.sub_region_code` |
| `입찰주기` | `records[].schedule.term` |
| `지난입찰일` / `입찰예상일` | `records[].schedule.last_bid` / `.contract_end` |
| `확정여부` | `records[].schedule.confidence == "확정"` → `y`, 아니면 공란 |
| `출처` | `records[].evidence.url` (한 기관에 여러 레코드면 `;`로 결합) |
| `수정일` | `collected_at`의 날짜 부분 |
| `경도` / `위도` | 없음 — 수집기는 좌표를 만들지 않는다(공란) |

한 기관에 공고 레코드가 여러 개면 CSV는 **기관당 1행**으로 합치고, 일정 필드는
`confidence == "확정"`인 레코드를 우선한다(동률이면 `posted_at`이 최신인 것).

## ④ `manifest.json` — 권위 있는 산출물

```json
{
  "schema_version": 1,
  "batch_id": "2026-07-29_0930_narajangteo",
  "collected_at": "2026-07-29T09:30:12+09:00",
  "source": {
    "slug": "narajangteo",
    "name_ko": "나라장터",
    "base_url": "https://www.g2b.go.kr/",
    "collector_version": "0.1.0"
  },
  "records": [
    {
      "notice_id": "20260729-00123",
      "title": "○○구 금고 지정 제안서 제출 안내 공고",
      "institution": {
        "name_ko": "○○구청",
        "type": "지자체",
        "region_code": "11",
        "sub_region_code": "11140"
      },
      "schedule": {
        "posted_at": "2026-07-29",
        "deadline_at": "2026-08-19",
        "contract_end": "2026-09-30",
        "last_bid": "2022-12-30",
        "term": 4,
        "confidence": "확정"
      },
      "attachments": ["files/20260729-00123_공고문.pdf"],
      "evidence": {
        "url": "https://www.g2b.go.kr/...",
        "captured_at": "2026-07-29T09:31:40+09:00",
        "note": "공고 본문 표에서 계약기간 종료일 추출"
      }
    }
  ]
}
```

### 필드 규칙

| 필드 | 필수 | 규칙 |
|---|---|---|
| `schema_version` | ✅ | 정수. 이 문서가 v1. **호환 불가 변경 시에만** 올린다 |
| `batch_id` | ✅ | 배치 폴더명과 **동일 문자열** |
| `collected_at` | ✅ | ISO 8601, **오프셋 포함**(`+09:00`) |
| `source.slug` | ✅ | 소문자 ASCII+하이픈. dedup 키의 일부 |
| `records[].notice_id` | ✅ | **출처 사이트의 공고번호 원문**. 수집기가 지어내지 않는다 |
| `records[].title` | ✅ | 공고 제목 원문 |
| `records[].institution.name_ko` | ✅ | 공고에 적힌 발주기관명 원문. CSV `기관명`과 동일 값 |
| `records[].schedule.*` | | 날짜는 전부 `YYYY-MM-DD`. 모르면 **키를 생략**(`null`도 허용, 빈 문자열 금지) |
| `records[].schedule.confidence` | ✅ | `확정` \| `예상`. 공고 본문에 명시된 날짜만 `확정` |
| `records[].attachments` | | 배치 폴더 기준 상대경로. `files/` 아래만 허용 |
| `records[].evidence.url` | ✅ | 그 레코드를 뽑아낸 실제 페이지 URL |

- **문자 인코딩**: UTF-8, **BOM 없음**. 줄바꿈은 `\n`.
- **날짜/시각**: 날짜는 `YYYY-MM-DD`(망 안 대시보드가 `new Date(x + 'T00:00:00')`로
  파싱한다), 시각은 오프셋 포함 ISO 8601.
- **추측 금지**: 공고에 없는 값을 계산해 넣지 않는다. 특히 `contract_end`를
  `last_bid + term`으로 유도하는 것은 **수집기가 아니라 망 안의 판단**이다.
  모르면 생략하고, `confidence`로 확실성을 말한다.

### dedup·재수집 규칙

- 레코드 유일 키는 **`(source.slug, notice_id)`**.
- 같은 공고를 다시 수집하는 것은 정상이며(일정 갱신 등), **나중 배치가 이긴다**.
- 배치는 **불변**이다 — 이미 내보낸 배치 폴더를 수정하지 말고 새 배치를 만든다.

## ⑤ 첨부 파일(`files/`) 규칙

- 배치 폴더 밖을 가리키는 경로(`..`, 절대경로, 심볼릭 링크) **금지**.
- 파일명에 경로 구분자(`/`, `\`)와 널 문자 금지. 한글 파일명은 허용(이 리포 관행).
- 권장 명명: `<notice_id>_<원문파일명>`.
- 망 안에서 공고문 PDF는 반입·검증 후 **`corpus/rfp/`로 이동**하고, 해당 기관의
  `institutions.rfp_path`에 그 경로를 기록한다(기존 필드 재사용).

## ⑥ 망 안에서의 처리 흐름 (수집기 범위 밖, 계약 이해용)

1. 사람이 배치 폴더를 `corpus/inbox/` 아래에 놓는다(USB 등 물리 반입).
2. 검증: `schema_version` 지원 여부, 필수 필드, 날짜 형식, `attachments` 실재,
   경로 이탈 여부. **결정적 규칙만** — `backend/corpus_validator.py`와 같은 원칙
   (표준 라이브러리, LLM 미사용, errors/warnings 보고).
3. `institutions.csv`를 `POST /institutions/import`로 반입 → 기관 upsert.
4. 공고 레코드로 `bid_cases`의 일정 필드(`expected_date`/`confirmed_date`/
   `schedule_confidence`/`last_synced_at`)를 갱신. `confidence`가 그대로
   `schedule_confidence`(`확정`/`예상`)에 대응한다.
5. 첨부 PDF를 `corpus/rfp/`로 이동하고 `rfp_path` 기록.
6. 처리된 배치 폴더는 `corpus/inbox/`에서 치운다(보관 위치는 운영 정책).

**2~6은 아직 구현되지 않았다.** 지금 존재하는 것은 3의 CSV 반입 경로뿐이며,
나머지는 이 스키마를 전제로 후속 스펙에서 만든다.

## ⑦ 이 문서의 검증 상태 (2026-07-29)

계약이 실제 코드에 대해 성립하는지 예제로 확인했다(수집기 코드 없이, 파서만 호출).

- §③의 12열 상위집합 CSV(UTF-8 BOM, 위 예시값)를 **양쪽 파서에 그대로 통과**시켰다:
  `backend.csv_import.parse_csv` → 6개 필드(`name_ko`/`type`/`region_code`/`term`/
  `last_bid`/`contract_end`) 정상 추출, 나머지 6열 무시. `dashboard/js/logic.js`의
  `parseCsv` → 12열 전부 인식(`confirmed: true`, `sources` 세미콜론 분리 배열).
- §④의 `manifest.json` 예시는 유효한 JSON이다(파싱 확인).
- 확인하지 않은 것: §⑥ 2·4·5·6은 아직 코드가 없어 검증 대상이 아니다.

## ⑧ 비범위

- **크롤링/파싱 구현** — 사이트별 셀렉터, 세션, 캡차, 수집 주기·스케줄링 전부.
  상위 E2E 스펙 sub-project 1(DMZ FastAPI)과 별도 수집기 스펙의 몫이다.
- **망 안 검증기·반입 처리 코드**(§⑥ 2·4·5·6) — 이 문서는 형식만 정한다.
- **인증·비밀정보** — 수집기가 로그인 자격증명을 쓴다면 그 관리 방식은 이 계약
  밖이며, 산출물에 자격증명이 실려서는 안 된다.
- **양방향 통신** — 망 안이 수집기를 호출하는 경로는 만들지 않는다. 파일 단방향뿐.

## ⑨ 버전 정책

- `schema_version`은 **호환 불가 변경**(필수 필드 추가/삭제, 의미 변경)에서만 올린다.
- 선택 필드 추가는 버전을 올리지 않는다 — 망 안은 **모르는 필드를 무시**해야 한다.
- 망 안은 자신이 지원하는 최대 버전보다 높은 배치를 만나면 **거부**하고 사람에게
  알린다(조용히 부분 처리하지 않는다).

## ⑩ 결정 로그

1. **JSON(권위) + CSV(파생) 이중 산출** — CSV만 내면 공고 URL·첨부·근거를 잃고,
   JSON만 내면 망 안에 신규 반입 코드가 생겨야 첫 반입이 가능해진다. 둘 다 내면
   기존 경로로 오늘 당장 반입되면서 정보 손실도 없다.
2. **`institution_id`를 망 밖에서 발급하지 않음** — 슬러그는 `corpus/institutions/{id}`
   폴더명과 강제 일치해야 하고(상위 E2E 스펙 §③), 그 대응 관계를 아는 것은 망
   안뿐이다. 망 밖이 id를 지어내면 두 개의 진실이 생긴다.
3. **빈 값 = 공란(추측 금지)** — 망 안 upsert가 `COALESCE`라 공란은 무해하지만
   틀린 추측은 확정 데이터를 덮어쓴다. "모른다"를 표현할 수 있어야 한다.
4. **배치 불변 + 나중 배치 우선** — 수집은 반복되고 일정은 갱신된다. 배치를 고쳐
   쓰면 무엇이 반입됐는지 추적이 불가능해진다.
5. **파일 단방향** — 망 경계를 구조에 새기는 것이 재구성 스펙의 목적이다(§④).
   콜백·폴링 등 역방향 경로를 하나라도 허용하면 그 경계가 무의미해진다.
