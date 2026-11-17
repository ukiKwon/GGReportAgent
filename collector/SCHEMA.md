# 수집기(collector) 산출물 스키마 v1

- **작성일**: 2026-07-29
- **상위 스펙**: `docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §④·§⑦-6
  (에이전트 개입 지점 1 "공고 수집" — 폐쇄망과 충돌하는 유일한 지점)
- **성격**: **스키마 계약 문서만.** 수집기 코드는 이 문서 다음이다. 이 폴더에 코드가
  생기더라도 아래 §① 경계 원칙은 유지된다.

---

## ① 경계 원칙 — 이 문서가 존재하는 이유

수집기는 **망 밖**(인터넷 연결 구역)에서 돌고, 나머지 전부(`server/`·`agent/`)는
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
  (`server/csv_import.py`)와 dashboard 업로드 UI가 그대로 먹는다. 수집기가 이걸
  내주면 **망 안에 신규 코드 없이** 첫날부터 반입이 성립한다.
- **JSON은 CSV가 못 담는 것을 담는다** — 공고 URL·공고번호·첨부파일·수집 근거·
  일정 신뢰도. 앞으로 늘어날 필드도 여기로 간다.
- 충돌 시 **manifest.json이 권위**다. CSV는 그 부분집합의 파생물이며, 수집기가
  manifest로부터 생성한다(사람이 따로 편집하지 않는다).

## ③ `institutions.csv` — 기존 계약 그대로

**소비자가 둘이고 읽는 열이 다르다.** 둘 다 **모르는 열은 조용히 무시**하므로,
아래 12열 상위집합 하나를 내면 양쪽이 각자 필요한 것만 가져간다.

- `server/csv_import.py`의 `HEADER_MAP` — 6열만 읽는다(표의 ✔ 표시).
- `frontend/js/logic.js`의 `CSV_HEADERS` — 12열 전부 읽는다(지도 매칭·출처 표시용).

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
  권한이다(`server/repository.upsert_institution`: `기관명` 일치 시 기존 id 사용,
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

### ④-2 `checks[]` — 외부 확인 결과 (v1.1, 선택 칸, `schema_version`은 1 유지, NEXT 90·2026-11-17)

- 기관 1곳을 1회 확인한 결과다. **`records`와 섞지 않는다.** `checks`는 `bid_cases`(일정·지도 색)를
  바꾸지 않는다 — 망 안은 이 배열을 '외부 확인' 표에만 저장한다.
- 공고를 찾아도, 찾지 못해도, 조회에 실패해도 **기관당 1건씩** 낸다(없으면 "확인 안 함"과 "못 찾음"을 구분할 수 없다).
- `checks`를 쓰면 **`schema_minor: 1`이 필수**다. 없거나 서버가 모르는 값이면 서버는 배치 전체를 `UNSUPPORTED_MINOR`로
  거부한다(조용히 버리지 않는다). `checks`가 없는 배치의 `schema_minor`는 무시한다.
- 외부 확인 전용 배치는 `source.slug`를 `extcheck`로 시작하고 `batch_id`(=폴더 이름)에도 `extcheck`를 넣는다(예 `2026-11-17_0700_extcheck-daily` — 망 안 저장소의 커밋 금지 규칙이 폴더 이름으로 잡는다). **어기면 배치 전체 422**(Java·Python 같은 규칙, 2026-11-17). `records: []`와 `checks`를 쓰고, `institutions.csv`는 머리글만 있는 파일을 둔다(v1 검증기가 파일 존재를 본다).
- 모르는 필드는 무시한다(§⑨). 아래 값 규칙을 어기면 서버는 **배치 전체를 422**로 거부하며, 문구에는 **받은 값이 실리지 않고**
  위치(`checks[3].attachments[0].path`)와 필드 이름만 실린다.

| 필드 | 필수 | 규칙 |
|---|---|---|
| `check_id` | ✅ | 배치 안 유일(대소문자 무시). `[A-Za-z0-9_-]{1,40}` |
| `institution.name_ko` | ✅ | 100자 이내, 제어·서식 문자 금지. `type` 30자, `region_code`·`sub_region_code`는 숫자 2~5자(모르면 생략) |
| `status` | ✅ | `found` \| `not_found` \| `error` |
| `checked_at` | ✅ | ISO 8601, 오프셋 포함(`+09:00`) |
| `source_kind` | ✅ | `notice` \| `press`(보도, 참고용) |
| `source_slug` | ✅ | `[a-z0-9-]{1,30}` |
| `error_code` | status=error | `[a-z_]{1,30}`(`timeout`·`blocked`·`parse_failed`·`quota`). 원문 오류 문구·URL·스택 금지 |
| `match.confidence`·`match.basis[]` | found | `high`\|`mid`\|`low`, 근거 코드 1~6개(`[a-z_]{1,30}`) |
| `notice.title`(300자)·`number`(60자)·`posted_at`·`deadline_at`·`url` | found + notice | 제목 필수. 날짜 `YYYY-MM-DD`. url은 `http(s)://` + 인쇄 가능 ASCII 500자 이내. 폐쇄망에서는 열리지 않는다 |
| `press.title`(200자)·`publisher`·`published_at`·`url` | found + press | **본문 필드 없음** |
| `attachments[]` | | check당 5개 이하. `{path, sha256, size, reported_*}` |
| `attachments[].path` | ✅ | `files/` + `[A-Za-z0-9._-]` **ASCII만**, 이름 80자 이내, 확장자 소문자 `pdf`·`hwp`·`hwpx`. 한글·`:`·공백·`\`·`..`·`.`로 시작·`CON`/`NUL` 등 예약어 금지(§⑤의 "한글 허용"은 checks 첨부에는 적용하지 않는다) |
| `attachments[].sha256` | ✅ | 소문자 hex 64자 |
| `attachments[].size` | ✅ | 1바이트~20 MiB. 배치 합계 200 MiB |
| `attachments[].reported_*` | | 아래 ④-3 8번 |

예시

```json
{"schema_version":1,"schema_minor":1,"batch_id":"2026-11-17_0700_extcheck-daily",
 "collected_at":"2026-11-17T07:00:05+09:00","source":{"slug":"extcheck-daily","name_ko":"외부 확인(일일)"},
 "records":[],
 "checks":[
  {"check_id":"c-0001","institution":{"name_ko":"○○구청","region_code":"11"},"status":"found",
   "checked_at":"2026-11-17T07:02:11+09:00","source_kind":"notice","source_slug":"eminwon",
   "match":{"confidence":"high","basis":["domain_match","org_code_match"]},
   "notice":{"number":"2026-123","title":"금고 지정 제안서 접수 공고","deadline_at":"2026-12-02"},
   "attachments":[{"path":"files/c-0001_1.pdf","sha256":"<64자 hex>","size":412345,
                   "reported_tool":"redact","reported_version":"1","reported_phones_removed":2,
                   "reported_landlines_masked":1,"reported_emails_masked":1,"reported_scope":["body","meta"]}]},
  {"check_id":"c-0002","institution":{"name_ko":"△△군청"},"status":"not_found",
   "checked_at":"2026-11-17T07:02:40+09:00","source_kind":"notice","source_slug":"eminwon"}]}
```

### ④-3 첨부 전처리 규칙 (망 밖에서 반입 전에 끝낸다, 사용자 11-17)

> **구현 상태(2026-11-17, NEXT 90 2단계)**: 망 안 서버는 `checks` 배치를 반입 호출 때 **검사·제외만 하고 DB에는 쓰지 않는다**(저장은 3단계). check 단위로 제외하고(`excluded[]`: 사유 코드·위치 코드·건수·check_id만), 통과한 첨부는 서버가 만든 이름으로 `corpus/ext_check/`에 보관한다. 처리 뒤(422 포함) 원본 파일은 삭제하고 보관 manifest는 값 없이 다시 쓴다. **`records`와 `checks`를 한 배치에 섞으면 422(`MIXED_BATCH_NOT_SUPPORTED`)**, **HWP(.hwp)는 이번 단계에서 `UNSUPPORTED_FORMAT`으로 제외**한다(HWPX·PDF만, HWP는 다음 묶음). 연도 형식(`2024.` `2024-` 등) 바로 뒤에 붙은 번호는 서버 검사가 날짜로 보고 놓치는 의도된 한계가 있으니 전처리에서 반드시 지운다. 전처리 구분자는 `-`·공백·`.`·`/`·`_`·`,`·`~`를 서버가 접어 보지만, 번호 사이를 다른 글자로 띄우면 못 본다. 이미지 속 글자는 서버가 읽지 못한다(아래 7번).

서버는 안전망으로 다시 검사하고, 걸린 check는 **그 check만 제외**하며 파일은 즉시 삭제한다. 제외 사유에는 종류·위치·건수만 남고 값은 남지 않는다.

1. **휴대폰**(010·011·016~019, `+82`·`0082`·괄호·사선·점 구분 포함)은 **삭제**한다. `***`로 바꾸지 않는다 — 서버는 가려진 휴대폰 모양도 "있음"으로 본다.
2. **유선**(02·031~064·070·050x)은 국번 뒤를 전부 가린다: `02-****-****`. 대표번호 15xx·16xx·18xx는 그대로 둔다.
3. **이메일**은 `첫글자***@도메인`. 로컬 부분이 `첫글자 + *`가 아니면(`ho***@`, `ab***z@`, `***@`) 서버가 거부한다.
4. 처리 위치: 본문, 문서 속성(작성자·제목·XMP·요약정보), 주석, 양식 필드 값, 책갈피, 미리보기 텍스트(HWP·HWPX), 파일명.
5. **덮개 사각형만 씌우지 않는다.** 아래 글자가 남는다. 글자 층에서 지운 파일로 새로 쓴다.
6. **증분 저장·문서 이력 없이 새 파일로 저장한다.** PDF는 "다른 이름으로 새로 저장"(증분 저장 금지 — 이전 판의 객체가 파일에 남는다), HWP는 "문서 이력 저장" 해제 후 새 파일로 저장한다. 서버는 PDF의 `/Prev`·`startxref` 2개 이상, HWP 이력·XML 템플릿·전자서명 비트가 있으면 `INCREMENTAL`/`HISTORY`로 제외한다.
6-1. **HWPX 안의 항목**은 `mimetype`, `*.xml`, `META-INF/*.rdf`, `Contents/*.hpf`, `Preview/*.txt`·그림, `BinData/` 그림만 둔다. 그 밖의 항목은 `UNSUPPORTED_ENTRY`, `Scripts/`는 `SCRIPT`로 제외한다. 단 한컴이 새 문서에 자동으로 넣는 빈 틀 `Scripts/headerScripts.js`·`Scripts/sourceScripts.js`는 내용이 기본값과 바이트 단위로 같을 때만 허용한다(실물 공고 HWPX 23건 중 6건, 2026-11-17 확인). 전처리에서 지워도 된다.
7. **이미지 속 글자는 서버가 읽지 못한다.** 이미지 위주 문서(이미지가 있고 추출 글자가 거의 없음)는 서버가 `IMAGE_ONLY`로 제외한다. 첨부하지 말고 `notice.url`만 보낸다.
8. 첨부마다 `reported_tool`, `reported_version`, `reported_phones_removed`, `reported_landlines_masked`, `reported_emails_masked`, `reported_scope[]`(`body`·`meta`·`annot`·`form`·`bookmark`·`filename`)를 쓸 수 있다. 개수만 쓰고 값은 쓰지 않는다. **자기신고다.** 서버는 믿지 않고 판정에 쓰지 않으며 이력에도 남기지 않는다.
9. 서버가 첨부 처리 때문에 제외한 check는 다음 배치에 새 파일로 다시 낸다(같은 `batch_id`를 고쳐 쓰지 않는다, §④ 불변 원칙).

## ⑤ 첨부 파일(`files/`) 규칙

- 배치 폴더 밖을 가리키는 경로(`..`, 절대경로, 심볼릭 링크) **금지**.
- 파일명에 경로 구분자(`/`, `\`)와 널 문자 금지. 한글 파일명은 허용(이 리포 관행).
- 권장 명명: `<notice_id>_<원문파일명>`.
- 망 안에서 공고문 PDF는 반입·검증 후 **`corpus/rfp/`로 이동**하고, 해당 기관의
  `institutions.rfp_path`에 그 경로를 기록한다(기존 필드 재사용).

## ⑥ 망 안에서의 처리 흐름 (수집기 범위 밖, 계약 이해용)

1. 사람이 배치 폴더를 `corpus/inbox/` 아래에 놓는다(USB 등 물리 반입).
2. 검증: `schema_version` 지원 여부, 필수 필드, 날짜 형식, `attachments` 실재,
   경로 이탈 여부. **결정적 규칙만** — `server/corpus_validator.py`와 같은 원칙
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
  `server.csv_import.parse_csv` → 6개 필드(`name_ko`/`type`/`region_code`/`term`/
  `last_bid`/`contract_end`) 정상 추출, 나머지 6열 무시. `frontend/js/logic.js`의
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
- `schema_minor`는 **선택 칸 추가**에서 올린다. 망 안은 자신이 아는 최대 minor보다 높은 값, 또는 minor 없이
  `checks`가 있으면 배치 전체를 `UNSUPPORTED_MINOR`로 거부한다(§④-2).

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
