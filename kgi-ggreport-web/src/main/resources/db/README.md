# 스키마 DDL — Task 1.3

```
db/
├── oracle/001_schema.sql   ← 정본
└── mysql/001_schema.sql    ← 외부망 로컬 미러 (정본에서 파생)
```

**정본이 바뀌면 미러도 같은 커밋에서 바꾼다.** 이후 변경은 `002_`, `003_` … 번호가
붙은 스크립트로 관리한다 — `server/db.py`의 기동 시 `ALTER TABLE` 마이그레이션을
대체하기로 한 방식이다(설계 §5-D).

출처는 `server/db.py`의 `SCHEMA` + `INDEXES` + **`MIGRATIONS`**, 그리고
`agent/retrieval/indexer.py`의 색인 스키마다.

> ⚠️ **`MIGRATIONS`를 빠뜨리면 컬럼 하나가 조용히 사라진다.** `messages.model`은
> `SCHEMA`에 없고 `MESSAGE_MIGRATIONS`에만 있다. 실제 스키마는 둘의 합이다.

## 담긴 것 — 11 테이블

| 묶음 | 테이블 |
|---|---|
| registry (7) | `INSTITUTIONS` `BID_CASES` `TASKS` `MESSAGES` `NOTIFICATIONS` `ROLE_MENUS` `CHAT_MESSAGES` |
| 검색 (4) | `CHUNKS` `VECTORS` `META` `FILES` |

## 아직 없는 것

| 무엇 | 왜 | 언제 |
|---|---|---|
| **Oracle Text `CONTEXT` 인덱스** | 사용 가능 여부가 **문의 3 회신**에 걸려 있다. 못 쓰면 §6-A 2안(Java 인메모리 색인)으로 간다 | 회신 후 `002_` 로 인덱스만 추가. **테이블 구조는 어느 쪽이든 같아서** 지금 만들어 둘 수 있었다 |
| **`ORCH_RUN` / `ORCH_STEP`** | 설계 §6-B에 용도만 있고 컬럼이 없다. 재개 의미론(팬아웃/조인·`PENDING_APPROVAL`)을 DB 모양으로 옮기는 신규 설계라 나머지 11개의 기계적 변환과 성격이 다르다 | **단계 4**(오케스트레이터) 착수 때 (사용자 확정 2026-08-26) |

## 타입 대응

| 정본(Oracle) | 미러(MySQL) | 주의 |
|---|---|---|
| `VARCHAR2(n CHAR)` | `VARCHAR(n)` | Oracle 기본은 **BYTE 의미**라 그대로 두면 한글이 1/3 길이만 들어간다. 전부 `CHAR` 명시. 단 물리 상한은 의미와 무관하게 **4000바이트**라 한글 3바이트를 감안해 `CHAR` 길이는 1000 이하로만 썼다 |
| `CLOB` | `LONGTEXT` | 양쪽 다 `ORDER BY`/`DISTINCT` 대상에서 배제. MyBatis에 `jdbcType=CLOB` 명시 |
| `BLOB` | `LONGBLOB` | 리틀엔디언 float32 바이트 포맷 동일 |
| `NUMBER(n)` | `SMALLINT`/`INT`/`BIGINT` | PK가 전부 앱 생성 문자열이라 시퀀스·AUTO_INCREMENT 모두 불필요 |
| `NUMBER` (실수) | `DOUBLE` | `FILES.MTIME` (원본 SQLite `REAL`) |
| `''` → NULL 취급 | `''` ≠ NULL | ⚠️ **여기가 설계 §5-(A)의 함정이다. 아래 참조** |

## 정본에서 내린 판단 4건

### ① `TASKS.DRAFT_CONTENT` — 설계 §5-(A)를 그대로 쓸 수 없어 조정했다

설계는 *"`NOT NULL`을 유지하되 DB 기본값을 두지 않고, INSERT 시 애플리케이션이 항상
명시값을 넣는다"* 고 적었다. **그대로는 성립하지 않는다** — Oracle은 `''`를 NULL로
바꾸므로, 앱이 빈 문자열을 명시적으로 넣어도 `NOT NULL` 제약에 걸린다. 작업은 "아직
아무것도 안 쓴" 상태로 생성되므로 **최초 INSERT가 반드시 실패한다.**

→ **컬럼을 NULL 허용으로 두고, 읽을 때 Mapper가 `null → ""`로 정규화한다.**
정규화는 설계가 이미 요구한 것이라 프런트가 받는 JSON은 현재와 같다. "아직 안 씀"의
표현이 `''`에서 `NULL`로 바뀔 뿐이고, 그 차이는 Mapper 안에서 끝난다.

⚠️ **미러(MySQL)에서도 똑같이 NULL 허용으로 뒀다.** MySQL은 `''`를 담을 수 있지만,
"아직 안 씀"의 표현이 두 DB에서 갈리면 Mapper를 한 벌로 못 쓴다.

### ② 외래키를 실제로 건다 — SQLite와 달라지는 지점

`server/db.py`의 `get_connection()`은 `PRAGMA foreign_keys`를 켜지 않는다. 즉 **현재
Python 시스템에서 외래키는 선언만 돼 있고 강제되지 않는다.** Oracle·MySQL은 강제한다.

정본은 원본이 선언한 3건만 건다 — `BID_CASES→INSTITUTIONS`, `TASKS→BID_CASES`,
`MESSAGES→TASKS`, 그리고 `VECTORS→CHUNKS`. 원본에 선언이 없는
`NOTIFICATIONS.INSTITUTION_ID`·`TASK_ID`·`CHAT_MESSAGES.INSTITUTION_ID`에는 **걸지
않는다** — 알림은 대상이 사라진 뒤에도 남아야 하는 기록이다.

⚠️ **단계 2의 골든 비교에서 지켜볼 것.** 지금 앱이 고아 행을 조용히 만들고 있었다면
Oracle에서는 INSERT가 거부된다. 그런 경우가 나오면 해당 제약을 빼는 쪽이 아니라
**왜 고아 행이 생기는지를 먼저 본다** — "동작 동일"이 목표이지 "결함 동일"이 아니다.

### ③ 컬럼명 3건을 바꿨다 (예약어·키워드 회피)

| 원본 | 변경 | 이유 |
|---|---|---|
| `files.size` | `FILES.FILE_SIZE` | **`SIZE`는 Oracle 예약어**다 |
| `meta.key` / `meta.value` | `META.META_KEY` / `META_VALUE` | 둘 다 Oracle·MySQL에서 키워드 |
| `chunks.text` | `CHUNKS.CHUNK_TEXT` | MySQL에서 타입명과 겹쳐 혼동을 부른다 |

전부 색인 내부용 컬럼이라 API 응답에 그대로 나가지 않는다. 이름 대응은 Mapper가 흡수한다.

### ④ Oracle에만 FK 컬럼 인덱스를 뒀다

Oracle에서 인덱스 없는 외래키는 부모 테이블 DML 때 자식 테이블 전체에 락을 걸 수 있다.
성능이 아니라 **잠금 회피**가 목적이라 조회 결과는 달라지지 않는다.
InnoDB는 외래키에 인덱스를 자동 생성하므로 미러에는 해당 인덱스가 없다.

## 적용 방법

### 외부망 로컬 (MySQL)

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS ggreportdb DEFAULT CHARSET utf8mb4;"
mysql -u root -p ggreportdb < src/main/resources/db/mysql/001_schema.sql
```

**멱등하다** — 여러 번 돌려도 안전하다. 그래서 인덱스를 별도 `CREATE INDEX` 문이 아니라
`CREATE TABLE` 안에 인라인으로 선언했다(MySQL의 `CREATE INDEX`에는 `IF NOT EXISTS`가
없어, 별도 문으로 두면 두 번째 실행에서 깨진다).

> 앱 기동 시 자동 적용(`spring.sql.init.*`)은 **켜지 않았다.** 스키마 생성은 명시적인
> 행위로 남겨 두는 편이 낫고, Oracle 쪽은 어차피 DBA가 적용한다.

### 내부망 (Oracle)

```sql
-- SQL*Plus / SQL Developer 에서 대상 스키마에 접속한 뒤
@001_schema.sql
```

**멱등하지 않다.** Oracle에는 `CREATE TABLE ... IF NOT EXISTS`가 없어 **빈 스키마에
한 번** 적용하는 것을 전제한다. 문자셋은 `AL32UTF8`을 전제한다.

## 검증 상태 (2026-08-26)

| 대상 | 상태 |
|---|---|
| MySQL 미러 | ✅ **실적용 확인** — `ggreportdb`에 2회 연속 적용, 테이블 11 / 인덱스 9, 두 번째도 성공(멱등) |
| Oracle 정본 | ⚠️ **문법만 확인.** H2 `MODE=Oracle`로 스크립트 전체가 오류 없이 실행되는 것까지만 봤다 |

> ⚠️ **H2 통과는 Oracle 통과가 아니다.** H2 Oracle 모드는 호환 흉내일 뿐이라
> 오타 수준의 문법 오류를 잡아 줄 뿐, `''`→NULL 변환·CLOB 제약·예약어·CHAR 의미
> 같은 **바로 이 파일이 다루는 쟁점들은 검증하지 못한다**(설계 §8이 H2 대체를 금지한
> 이유가 그것이다). **정본의 실검증은 내부망 Oracle에서 처음 이뤄진다.**
