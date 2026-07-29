# DMZ 수집 서비스 설계 — sub-project 1 (1~3단계)

- **작성일**: 2026-07-29
- **상위 스펙**: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`
  §④ 1~3단계 · §⑧ sub-project 1
- **출력 계약**: `collector/SCHEMA.md` (수집 산출물 스키마 v1) — **이 문서는 그 계약의
  생산자를 정의한다.** 스키마를 바꾸는 결정은 여기가 아니라 SCHEMA.md에서 한다.
- **하위 소비자**: `docs/superpowers/specs/2026-07-28-institution-intelligence-agent-design.md`
  §②가 "DMZ sub-project 1~3의 산출물"로 가정하는 것들(예상/확정 감지, `last_synced_at`)
- **성격**: 구현 스펙. 실행은 별도 플랜으로 태스크를 쪼갠다.

---

## ① 무엇을 만드는가

망 밖(인터넷 연결 구역)에서 도는 **공고 수집 서비스** 하나. 재구성 스펙 §③의
"에이전트 개입 지점 1(공고 수집) — 폐쇄망과 충돌하는 유일한 지점"을 잘라낸 자리이고,
재구성 스펙 §④가 비워둔 `collector/` 폴더가 그 자리다.

이미 정해져 있어 **다시 결정하지 않는 것**:

| 이미 확정 | 어디서 | 내용 |
|---|---|---|
| 출력 형식 | `collector/SCHEMA.md` | 배치 폴더 = `manifest.json`(권위) + `institutions.csv`(파생) + `files/` |
| dedup 키 | SCHEMA.md §④ | `(source.slug, notice_id)`, 배치 불변·나중 배치 우선 |
| id 발급 금지 | SCHEMA.md §③·⑩-2 | `institution_id`는 망 안 권한 |
| 추측 금지 | SCHEMA.md §④·⑩-3 | 공고에 없는 값은 공란, `confidence`로 확실성 표현 |
| 코드 공유 금지 | 재구성 스펙 §④ | collector는 `backend/`·`agent/`를 import하지 않는다 |

따라서 이 문서가 새로 정하는 것은 **서비스의 모양**(API·어댑터 구조)과
**테스트 시 배치를 어떻게 건네는가** 둘뿐이다.

## ② 확정 전제

| 항목 | 결정 | 이유 |
|---|---|---|
| 위치 | `collector/` (기존 SCHEMA.md 옆) | 재구성 스펙 §④가 지정한 자리 |
| 프레임워크 | FastAPI + uvicorn | 이미 `requirements.txt`에 있음. 망 안과 같은 스택이라 반입 승인 부담이 늘지 않음 |
| 의존 | **`backend/`·`agent/` import 0** | 망 경계를 코드로 강제. 공용 유틸이 필요하면 복제한다 |
| 수집 대상 | **소스 어댑터로 분리** | 사이트별 파싱은 계속 바뀐다. 서비스 뼈대와 분리해야 어댑터만 갈아끼운다 |
| 실사이트 크롤러 | **범위 밖** (§⑨) | 상위 E2E 스펙이 "크롤링 세부 구현"을 명시적으로 범위 밖에 둠 |
| 저장소 | DMZ 로컬 디스크 (`data/collector/`) | DB 불필요. 배치는 파일이고, 불변이며, 나중 배치가 이긴다 |
| 포트 | DMZ **8001** / 망 안 8000 | 사용자 요구(같은 IP·포트만 분리)를 그대로 반영 |

## ③ 핵심 결정 — 테스트에서 배치를 어떻게 건네는가

**문제**: 운영에서 망 경계는 사람이 파일을 물리적으로 옮기는 것(USB)이다. 그런데
테스트에서는 두 서비스가 같은 머신에 뜨고(8000/8001), 사람 없이 배치가 건너가야 한다.

**제약**: `collector/SCHEMA.md` §⑧ 비범위가 **"양방향 통신 — 망 안이 수집기를 호출하는
경로는 만들지 않는다. 파일 단방향뿐"** 을 이미 못박아 두었다. 편하다고 망 안에
"DMZ에서 당겨오기"를 넣으면 그 경계가 무의미해진다.

### 채택: 브리지(반입 대행) CLI — 사람의 대역

```
[DMZ :8001]  collector          [운영자 자리]           [망 안 :8000]  backend
   배치 생성 → data/collector/     ↓ 운영: 사람 + USB        corpus/inbox/ → import API
   GET /batches/{id} 로 제공  ──▶ 테스트: bridge CLI ──▶
```

- 브리지는 **어느 쪽 서비스도 아니다** — 운영자의 손을 대신하는 별도 CLI다.
  `collector/bridge.py`에 두되, collector 서비스 코드가 브리지를 import하지 않는다.
- 브리지가 하는 일 3가지: ⓐ DMZ에서 배치를 받아 ⓑ `corpus/inbox/`에 풀어놓고
  ⓒ 망 안 API(`POST /institutions/import`)를 호출한다.
- **양쪽 서비스는 서로의 주소를 모른다.** collector는 망 안 URL을 갖지 않고, backend는
  DMZ URL을 갖지 않는다. 주소를 아는 것은 브리지뿐이고, 운영에서는 그 자리에 사람이
  들어간다 — 즉 **운영 경로와 테스트 경로의 차이가 "누가 옮기는가" 하나로 국한**된다.

### 기각한 대안

| 안 | 왜 안 되는가 |
|---|---|
| 망 안이 DMZ를 pull | SCHEMA.md §⑧이 명시적으로 금지. 폐쇄망은 외부로 나갈 수 없어 운영에서 아예 성립 안 함 |
| DMZ가 망 안으로 push | DMZ가 망 안 주소를 알아야 함(결합). 운영에서 폐쇄망은 외부에서 접근 불가라 테스트에서만 되는 코드가 남는다 |

## ④ 구성요소

| 파일 | 역할 |
|---|---|
| `collector/app.py` | FastAPI 앱. 아래 §⑤ 엔드포인트 |
| `collector/sources/base.py` | 소스 어댑터 인터페이스(§⑥) + 레지스트리 |
| `collector/sources/fixture.py` | 로컬 픽스처 소스 — 테스트·데모용 기본 어댑터 |
| `collector/batch.py` | 배치 생성기 — SCHEMA.md v1대로 폴더/파일을 쓴다 |
| `collector/schema.py` | 배치 자체 검증(필수 필드·날짜 형식·경로 이탈). 생성 직후 자기검사에 사용 |
| `collector/bridge.py` | 반입 대행 CLI(§③) |
| `collector/tests/` | 위 전부의 단위 테스트 |

- 전부 **표준 라이브러리 + FastAPI**만 쓴다. `backend`/`agent` import 금지를 테스트로
  강제한다(§⑧).

## ⑤ DMZ API 계약

```
GET  /health                     → {"status":"ok","version":...}
GET  /sources                    → 등록된 소스 어댑터 목록
POST /collect                    → 수집 1회 실행 → 배치 생성. body: {"source":"fixture"}
                                   응답: {"batch_id":..., "records":n, "path":...}
GET  /batches                    → 배치 목록(batch_id, collected_at, record_count)
GET  /batches/{batch_id}         → manifest.json 그대로
GET  /batches/{batch_id}/archive → 배치 폴더 zip (브리지가 받아가는 것)
```

- `POST /collect`는 **동기**다. 수집 주기·스케줄러는 범위 밖(§⑨) — 운영에서는 cron이
  이 엔드포인트를 때리거나 CLI를 돌린다.
- 배치는 불변이므로 삭제·수정 엔드포인트를 두지 않는다.

## ⑥ 소스 어댑터 인터페이스

사이트마다 다른 것은 어댑터 안에 가두고, 밖으로는 **레코드 목록 하나**만 낸다.

```python
@dataclass(frozen=True)
class CollectedNotice:
    notice_id: str                 # 출처 사이트의 공고번호 원문 (지어내지 않는다)
    title: str
    institution_name_ko: str
    evidence_url: str
    posted_at: str | None = None   # 전부 YYYY-MM-DD
    deadline_at: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
    confirmed: bool = False        # 공고 본문에 명시된 일정만 True
    institution_type: str | None = None
    region_code: str | None = None
    sub_region_code: str | None = None
    attachments: list[AttachmentRef] = ()   # (파일명, 바이트 또는 URL)

class Source(Protocol):
    slug: str          # 소문자 ASCII+하이픈 — SCHEMA.md의 source.slug
    name_ko: str
    base_url: str
    def fetch(self) -> list[CollectedNotice]: ...
```

- 어댑터는 **판단하지 않는다**: `contract_end`를 `last_bid + term`으로 유도하는 것
  같은 추론은 금지(SCHEMA.md §④ "추측 금지"). 공고에 없으면 `None`.
- `confirmed`가 배치의 `schedule.confidence`(`확정`/`예상`)로 번역된다.
- v1 기본 어댑터는 `fixture` 하나 — 로컬 JSON 픽스처를 읽어 레코드를 낸다. 실사이트
  어댑터는 별도 스펙(§⑨).

## ⑦ 배치 생성 규칙

`collector/batch.py`가 SCHEMA.md를 **실행 가능한 형태로 강제**하는 유일한 지점이다.

1. 폴더명·`batch_id` = `YYYY-MM-DD_HHmm_<source.slug>` (동일 문자열, SCHEMA.md §④).
2. `manifest.json`(UTF-8, BOM 없음) 먼저 쓰고, 그로부터 `institutions.csv`를 파생
   (SCHEMA.md §③ "manifest → CSV 파생 규칙" 표 그대로: 12열 상위집합, UTF-8 **BOM 있음**).
3. 한 기관에 레코드 여러 개면 CSV는 기관당 1행으로 합치고 `confidence=="확정"` 우선,
   동률이면 `posted_at` 최신.
4. 첨부는 `files/<notice_id>_<원문파일명>`으로 저장하고 manifest가 상대경로로 참조.
   경로 이탈(`..`·절대경로·구분자 포함 파일명)은 **생성 단계에서 거부**한다.
5. 쓰기 완료 후 `collector/schema.py`로 **자기검사**하고, 실패하면 배치를 남기지 않는다
   (반쯤 만들어진 배치가 inbox로 흘러가지 않게).

## ⑧ 검증 계획

- 단위: 배치 생성(폴더 구조·파일명·BOM 유무), CSV 파생 규칙(기관 합치기·확정 우선),
  경로 이탈 거부, 자기검사 실패 시 롤백, 어댑터 레지스트리.
- **계약 검증(가장 중요)**: 생성된 `institutions.csv`를 **망 안의 진짜 파서 두 개**에
  넣어 통과를 확인한다 — `backend.csv_import.parse_csv`(6열)와
  `dashboard/js/logic.js`의 `parseCsv`(12열). SCHEMA.md §⑦에서 손으로 한 검증을
  **자동 테스트로 승격**하는 것이다.
  (테스트가 backend를 import하는 것은 허용 — 런타임 코드가 아니라 계약 검증이다.
  `collector/` **런타임** 코드의 backend/agent import 금지는 별도 테스트로 강제한다.)
- E2E: collector(8001) 기동 → `POST /collect` → 브리지 실행 → `corpus/inbox/`에 배치가
  놓이고 backend(8000)에 기관이 upsert되는 것까지 한 번에 확인.

## ⑨ 비범위

- **실사이트 크롤러**(나라장터·지자체 공고 페이지 파싱, 세션·캡차) — 상위 E2E 스펙이
  명시한 범위 밖. 어댑터 인터페이스만 열어둔다.
- **스케줄러**(수집 주기, cron, 재시도 백오프) — `POST /collect` 1회 실행까지만.
- **AWS 배포**(IAM·VPC·도메인) — 상위 스펙도 범위 밖으로 둠. 로컬 8001 기동까지.
- **망 안의 배치 수신 처리**(SCHEMA.md §⑥ 2·4·5·6 — 검증 후 bid_cases 일정 갱신,
  PDF를 `corpus/rfp/`로 이동) — sub-project 2의 몫. 브리지는 기존
  `POST /institutions/import`까지만 호출한다.
- **인증/비밀정보** — 수집기가 로그인을 요구하는 소스를 다루게 되면 그때 별도 결정.

## ⑩ 결정 로그

1. **브리지 CLI로 망 경계 유지(§③)** — 테스트 편의를 위해 서비스 간 직접 호출을
   넣으면 SCHEMA.md §⑧의 단방향 원칙이 깨지고, 운영에서 성립하지 않는 코드가 남는다.
   사람의 대역을 별도 도구로 두면 운영/테스트 차이가 "누가 옮기는가"로 국한된다.
2. **소스 어댑터 분리, 실사이트는 범위 밖** — 사이트 파싱은 가장 자주 깨지는 부분이고
   상위 스펙이 이미 범위 밖으로 뒀다. 뼈대를 먼저 세우고 어댑터를 갈아끼운다.
3. **DB 없이 파일만** — 배치는 불변이고 dedup 키가 이미 정의돼 있다. DMZ에 DB를 두면
   "망 안 registry와 무엇이 다른가"라는 두 번째 진실이 생긴다.
4. **생성 직후 자기검사 + 실패 시 배치 미생성** — 잘못된 배치가 inbox까지 가면 사람이
   물리적으로 옮긴 뒤에야 발견된다. 가장 싼 지점에서 막는다.
5. **CSV 계약 검증을 자동 테스트로 승격(§⑧)** — SCHEMA.md는 문서라 썩는다. 망 안
   파서 두 개에 실제로 통과시키는 테스트가 계약을 살아있게 유지하는 유일한 방법이다.
