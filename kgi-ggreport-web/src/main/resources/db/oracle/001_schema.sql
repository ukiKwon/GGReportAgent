--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 스키마 정본 (001)
--
-- 출처: server/db.py 의 SCHEMA/INDEXES/MIGRATIONS + agent/retrieval/indexer.py.
-- 설계 §5 의 결정 (A)~(D) 를 반영한다.
--
-- ⚠️ 이 파일이 **정본**이다. db/mysql/001_schema.sql 은 외부망 로컬 전용 미러이며
--    여기서 파생된다. 정본이 바뀌면 미러도 같은 커밋에서 바꾼다.
--
-- ⚠️ Oracle 은 CREATE TABLE 에 IF NOT EXISTS 가 없다. 이 스크립트는 **빈 스키마에
--    한 번** 적용하는 것을 전제로 한다(멱등하지 않다). 이후 변경은 002_, 003_ …
--    번호가 붙은 스크립트로 관리한다 — 설계 §5-(D) 가 backend/db.py 의 기동 시
--    ALTER TABLE 마이그레이션을 대체하기로 한 방식이다.
--
-- 문자셋 전제: AL32UTF8. 모든 VARCHAR2 는 **CHAR 의미**로 선언한다(기본값인 BYTE
-- 의미로 두면 한글이 1/3 길이만 들어간다). VARCHAR2 의 물리 상한은 의미와 무관하게
-- 4000 바이트이므로, 한글 3바이트를 감안해 CHAR 길이는 1000 이하로만 쓴다.
--------------------------------------------------------------------------------


--------------------------------------------------------------------------------
-- 1. registry — 7 테이블
--------------------------------------------------------------------------------

-- 기관 마스터. PK 는 앱이 만드는 슬러그(예: seoul-dobong)라 시퀀스가 필요 없다.
CREATE TABLE INSTITUTIONS (
    INSTITUTION_ID  VARCHAR2(64 CHAR)   NOT NULL,
    NAME_KO         VARCHAR2(100 CHAR)  NOT NULL,
    REGION_CODE     VARCHAR2(20 CHAR),
    TYPE            VARCHAR2(50 CHAR),
    CONTRACT_END    VARCHAR2(30 CHAR),           -- ISO 문자열 (설계 §5-C)
    LAST_BID        VARCHAR2(30 CHAR),           -- ISO 문자열
    TERM            NUMBER(3),
    STAGE           NUMBER(2)           DEFAULT 1 NOT NULL,
    GIGANLIST_DIR   VARCHAR2(500 CHAR),
    RFP_PATH        VARCHAR2(500 CHAR),
    PPTX_PATH       VARCHAR2(500 CHAR),
    CONSTRAINT PK_INSTITUTIONS PRIMARY KEY (INSTITUTION_ID)
);

-- 입찰 건.
-- PARTICIPATION_DECISION 은 JSON 배열 문자열이다. 기본값이 '[]' 로 **빈 문자열이
-- 아니라서** Oracle 에서 그대로 쓸 수 있다(설계 §5-A 가 명시한 예외).
-- 등호 비교·정렬 대상이 아니고 결재 이력이 쌓이면 길어질 수 있어 CLOB 으로 둔다.
CREATE TABLE BID_CASES (
    BID_CASE_ID            VARCHAR2(64 CHAR)  NOT NULL,
    INSTITUTION_ID         VARCHAR2(64 CHAR)  NOT NULL,
    SCHEDULE_CONFIDENCE    VARCHAR2(20 CHAR)  DEFAULT '예상'   NOT NULL,
    EXPECTED_DATE          VARCHAR2(30 CHAR),
    CONFIRMED_DATE         VARCHAR2(30 CHAR),
    LAST_SYNCED_AT         VARCHAR2(30 CHAR),
    PARTICIPATION_STATUS   VARCHAR2(20 CHAR)  DEFAULT '검토중' NOT NULL,
    PARTICIPATION_DECISION CLOB               DEFAULT '[]'     NOT NULL,
    RESEARCH_STATUS        VARCHAR2(20 CHAR)  DEFAULT '대기'   NOT NULL,
    FINALIZED_BY           VARCHAR2(100 CHAR),
    FINALIZED_AT           VARCHAR2(30 CHAR),
    SOURCE_SLUG            VARCHAR2(64 CHAR),
    NOTICE_ID              VARCHAR2(100 CHAR),
    TITLE                  VARCHAR2(500 CHAR),
    NOTICE_URL             VARCHAR2(1000 CHAR),
    CONSTRAINT PK_BID_CASES PRIMARY KEY (BID_CASE_ID),
    CONSTRAINT FK_BID_CASES_INST FOREIGN KEY (INSTITUTION_ID)
        REFERENCES INSTITUTIONS (INSTITUTION_ID)
);

-- 팀별 작업.
-- ⚠️ DRAFT_CONTENT 는 SQLite 에서 `TEXT NOT NULL DEFAULT ''` 였다. 설계 §5-(A) 는
--    "NOT NULL 을 유지하되 DB 기본값을 두지 않는다"고 적었으나 **그대로는 성립하지
--    않는다** — Oracle 은 '' 를 NULL 로 바꾸므로 앱이 빈 문자열을 명시적으로 넣어도
--    NOT NULL 제약에 걸린다. 작업은 "아직 아무것도 안 쓴" 상태로 생성되므로 최초
--    INSERT 가 반드시 실패한다.
--    → **결정: 컬럼을 NULL 허용으로 두고, 읽을 때 Mapper 가 null → "" 로 정규화한다.**
--      정규화는 설계 §5-(A) 가 이미 요구한 것이라, 프런트가 받는 JSON 은 현재와 같다.
--      "아직 안 씀"의 표현이 '' 에서 NULL 로 바뀔 뿐이고 그 차이는 Mapper 안에서 끝난다.
CREATE TABLE TASKS (
    TASK_ID        VARCHAR2(64 CHAR)  NOT NULL,
    BID_CASE_ID    VARCHAR2(64 CHAR)  NOT NULL,
    TEAM           VARCHAR2(50 CHAR)  NOT NULL,
    STATUS         VARCHAR2(20 CHAR)  DEFAULT '대기' NOT NULL,
    PROGRESS_PCT   NUMBER(3)          DEFAULT 0      NOT NULL,
    DRAFT_CONTENT  CLOB,                             -- NULL = 아직 안 씀 (위 주석)
    ASSIGNEE       VARCHAR2(100 CHAR),
    APPROVER       VARCHAR2(100 CHAR),               -- 1차 결재자(그 팀의 팀장)
    FINAL_APPROVER VARCHAR2(100 CHAR),               -- 디자이너 최종본을 결재한 영업부장
    CONSTRAINT PK_TASKS PRIMARY KEY (TASK_ID),
    CONSTRAINT UK_TASKS_CASE_TEAM UNIQUE (BID_CASE_ID, TEAM),
    CONSTRAINT FK_TASKS_BID_CASE FOREIGN KEY (BID_CASE_ID)
        REFERENCES BID_CASES (BID_CASE_ID)
);

-- 작업별 대화/기록.
-- MODEL 은 그 기록이 LLM 을 실제로 썼는지 보여준다. LLM 을 안 쓴 기록(게이트 통과
-- 알림 등)은 NULL 로 남는다.
-- ⚠️ 이 컬럼은 server/db.py 의 SCHEMA 가 아니라 MESSAGE_MIGRATIONS 에만 있다 —
--    SCHEMA 만 보고 옮기면 조용히 빠진다. 실제 스키마는 SCHEMA + MIGRATIONS 다.
CREATE TABLE MESSAGES (
    MESSAGE_ID VARCHAR2(64 CHAR)  NOT NULL,
    TASK_ID    VARCHAR2(64 CHAR)  NOT NULL,
    ROLE       VARCHAR2(30 CHAR)  NOT NULL,
    CONTENT    CLOB               NOT NULL,
    CREATED_AT VARCHAR2(30 CHAR)  NOT NULL,
    AUTHOR     VARCHAR2(100 CHAR),          -- 사람이 쓴 글의 실명(결재자·담당자)
    STAGE      NUMBER(2),                   -- 기록 당시의 9단계 진행 단계
    MODEL      VARCHAR2(100 CHAR),
    CONSTRAINT PK_MESSAGES PRIMARY KEY (MESSAGE_ID),
    CONSTRAINT FK_MESSAGES_TASK FOREIGN KEY (TASK_ID)
        REFERENCES TASKS (TASK_ID)
);

-- 쪽지·알림.
-- ⚠️ INSTITUTION_ID·TASK_ID 에 **외래키를 걸지 않는다.** SQLite 원본에도 없다 —
--    알림은 대상이 사라진 뒤에도 남아야 하는 기록이다.
CREATE TABLE NOTIFICATIONS (
    NOTIFICATION_ID VARCHAR2(64 CHAR)  NOT NULL,
    RECIPIENT       VARCHAR2(100 CHAR) NOT NULL,
    KIND            VARCHAR2(30 CHAR)  NOT NULL,   -- 쪽지/되물음/결재요청/이관
    INSTITUTION_ID  VARCHAR2(64 CHAR),
    TASK_ID         VARCHAR2(64 CHAR),
    CONTENT         CLOB               NOT NULL,
    LINK            VARCHAR2(500 CHAR),
    CREATED_AT      VARCHAR2(30 CHAR)  NOT NULL,
    READ_AT         VARCHAR2(30 CHAR),
    STAGE           NUMBER(2),
    SENDER          VARCHAR2(100 CHAR),            -- 사람이 보낸 쪽지만. 시스템 알림은 NULL
    CONSTRAINT PK_NOTIFICATIONS PRIMARY KEY (NOTIFICATION_ID)
);

-- 역할별 메뉴 노출 (계획 I).
-- 행이 없다는 것은 '꺼짐'이 아니라 '아직 정하지 않음'이라 앱 기본값이 적용된다.
-- 여기엔 사람이 명시적으로 정한 것만 쌓인다.
CREATE TABLE ROLE_MENUS (
    ROLE    VARCHAR2(50 CHAR) NOT NULL,
    MENU    VARCHAR2(50 CHAR) NOT NULL,
    ENABLED NUMBER(1) DEFAULT 1 NOT NULL,
    CONSTRAINT PK_ROLE_MENUS PRIMARY KEY (ROLE, MENU)
);

-- 기관별 대화창.
-- ⚠️ INSTITUTION_ID 에 외래키를 걸지 않는다 — SQLite 원본에도 없다.
CREATE TABLE CHAT_MESSAGES (
    CHAT_MESSAGE_ID VARCHAR2(64 CHAR)  NOT NULL,
    INSTITUTION_ID  VARCHAR2(64 CHAR)  NOT NULL,
    ROLE            VARCHAR2(30 CHAR)  NOT NULL,   -- user/agent
    CONTENT         CLOB               NOT NULL,
    CREATED_AT      VARCHAR2(30 CHAR)  NOT NULL,
    AUTHOR          VARCHAR2(100 CHAR),            -- 에이전트 답변은 NULL
    CONSTRAINT PK_CHAT_MESSAGES PRIMARY KEY (CHAT_MESSAGE_ID)
);


--------------------------------------------------------------------------------
-- 2. 검색 색인 — 4 테이블
--
-- 원본은 별도 파일(corpus_index.db)이었으나 Oracle 에서는 같은 스키마로 통합한다
-- (설계 §4). FTS5 가상 테이블은 일반 테이블 + 전문검색 인덱스로 나뉜다.
--
-- ⚠️ **전문검색 인덱스(Oracle Text CONTEXT)는 여기 없다.** 사용 가능 여부가
--    문의 3 의 회신에 걸려 있고, 못 쓰면 §6-A 2안(Java 인메모리 색인)으로 간다.
--    회신이 오면 002_ 스크립트로 인덱스만 추가한다 — 테이블 구조는 어느 쪽이든 같다.
--------------------------------------------------------------------------------

-- 색인 청크.
-- ⚠️ CHUNK_ID 는 SQLite 의 암묵 rowid 를 대신한다. registry 쪽 PK 와 달리 숫자이며,
--    색인 빌드가 순번을 직접 매긴다(시퀀스를 쓰지 않는 이유: 전체 재색인 때 번호가
--    이어지지 않고 다시 1부터 시작해야 VECTORS 와의 1:1 대응이 단순하다).
CREATE TABLE CHUNKS (
    CHUNK_ID       NUMBER              NOT NULL,
    CHUNK_TEXT     CLOB                NOT NULL,   -- 원본 컬럼명은 `text`
    PATH           VARCHAR2(1000 CHAR) NOT NULL,
    CHUNK_NO       NUMBER              NOT NULL,
    INSTITUTION_ID VARCHAR2(64 CHAR),
    DOCTYPE        VARCHAR2(50 CHAR),
    FILENAME       VARCHAR2(500 CHAR),
    CONSTRAINT PK_CHUNKS PRIMARY KEY (CHUNK_ID)
);

-- 청크 임베딩. 리틀엔디언 float32 × embed_dim 을 그대로 담는다.
-- 벡터DB 를 쓰지 않는다 — 코퍼스가 5.6MB/413파일이라 전량 메모리 적재로 충분하고,
-- Java 에서 float[] 브루트포스 코사인으로 계산한다(설계 §4·§9).
CREATE TABLE VECTORS (
    CHUNK_ID  NUMBER NOT NULL,
    EMBEDDING BLOB   NOT NULL,
    CONSTRAINT PK_VECTORS PRIMARY KEY (CHUNK_ID),
    CONSTRAINT FK_VECTORS_CHUNK FOREIGN KEY (CHUNK_ID)
        REFERENCES CHUNKS (CHUNK_ID)
);

-- 색인 메타(임베딩 모델명·차원 등).
-- ⚠️ 원본 컬럼명은 key/value 인데 둘 다 Oracle·MySQL 에서 키워드라 접두사를 붙였다.
CREATE TABLE META (
    META_KEY   VARCHAR2(100 CHAR) NOT NULL,
    META_VALUE VARCHAR2(1000 CHAR),
    CONSTRAINT PK_META PRIMARY KEY (META_KEY)
);

-- 색인된 원본 파일(증분 색인용 mtime/size 비교).
-- ⚠️ 원본 컬럼명은 `size` 인데 **SIZE 는 Oracle 예약어**라 FILE_SIZE 로 바꿨다.
CREATE TABLE FILES (
    PATH      VARCHAR2(1000 CHAR) NOT NULL,
    MTIME     NUMBER              NOT NULL,   -- epoch 초 (원본은 REAL)
    FILE_SIZE NUMBER              NOT NULL,
    ROOT      VARCHAR2(50 CHAR)   NOT NULL,   -- corpus / archive
    CONSTRAINT PK_FILES PRIMARY KEY (PATH)
);


--------------------------------------------------------------------------------
-- 3. 인덱스
--------------------------------------------------------------------------------

-- 반입 dedup 키 (collector/SCHEMA.md §④ 의 유일키).
-- ⚠️ Oracle 도 SQLite 도 유니크 인덱스에서 NULL 을 서로 다른 값으로 취급한다.
--    따라서 두 컬럼이 모두 NULL 인 수동/시드 BID_CASE 가 여러 건 있어도 걸리지 않는다 —
--    원본이 부분 인덱스를 쓰지 않은 이유가 그대로 유효하다.
CREATE UNIQUE INDEX IDX_BID_CASES_NOTICE ON BID_CASES (SOURCE_SLUG, NOTICE_ID);

-- 외래키 컬럼 인덱스.
-- Oracle 에서 인덱스 없는 외래키는 부모 테이블 DML 때 자식 테이블 전체에 락을
-- 걸 수 있다. SQLite 에는 없던 인덱스지만 성능이 아니라 **잠금 회피**가 목적이라
-- 넣는다(조회 결과는 달라지지 않는다).
CREATE INDEX IDX_BID_CASES_INST  ON BID_CASES (INSTITUTION_ID);
CREATE INDEX IDX_TASKS_BID_CASE  ON TASKS (BID_CASE_ID);
CREATE INDEX IDX_MESSAGES_TASK   ON MESSAGES (TASK_ID);

-- 조회 패턴 인덱스 (쪽지함·대화창·증분 색인).
CREATE INDEX IDX_NOTIF_RECIPIENT ON NOTIFICATIONS (RECIPIENT, CREATED_AT);
CREATE INDEX IDX_CHAT_INST       ON CHAT_MESSAGES (INSTITUTION_ID, CREATED_AT);
CREATE INDEX IDX_CHUNKS_PATH     ON CHUNKS (PATH);
CREATE INDEX IDX_CHUNKS_INST     ON CHUNKS (INSTITUTION_ID);
