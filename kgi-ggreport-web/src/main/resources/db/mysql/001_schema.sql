-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (001)  ※ 외부망 로컬(out-local) 전용
--
-- ⚠️ 이 파일은 **정본이 아니다.** 정본은 db/oracle/001_schema.sql 이고 이 파일은
--    거기서 파생된 미러다. 정본이 바뀌면 같은 커밋에서 이 파일도 바꾼다.
--
-- ⚠️ **여기서 통과했다고 Oracle 정합성이 증명되지 않는다.** 특히 설계 §5-(A) 의
--    빈 문자열→NULL 변환은 MySQL 에서 **일어나지 않는다** — MySQL 은 '' 와 NULL 을
--    구분해 저장하므로, Mapper 의 null→"" 정규화가 빠져 있어도 여기서는 아무 증상이
--    없다. 그 결함은 내부망 Oracle 에서만 드러난다. H2 를 금지한 것과 같은 이유다.
--
-- 미러가 지켜야 하는 것은 "같은 DDL"이 아니라 "같은 앱 동작"이다. 타입 대응은
-- 구현계획 Task 1.3 의 표를 따른다.
-- -----------------------------------------------------------------------------

-- MySQL 은 IF NOT EXISTS 를 지원하므로 이 스크립트는 멱등하다(Oracle 쪽과 다른 점).

-- -----------------------------------------------------------------------------
-- 1. registry — 7 테이블
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS INSTITUTIONS (
    INSTITUTION_ID  VARCHAR(64)   NOT NULL,
    NAME_KO         VARCHAR(100)  NOT NULL,
    REGION_CODE     VARCHAR(20),
    TYPE            VARCHAR(50),
    CONTRACT_END    VARCHAR(30),
    LAST_BID        VARCHAR(30),
    TERM            SMALLINT,
    STAGE           SMALLINT      NOT NULL DEFAULT 1,
    GIGANLIST_DIR   VARCHAR(500),
    RFP_PATH        VARCHAR(500),
    PPTX_PATH       VARCHAR(500),
    PRIMARY KEY (INSTITUTION_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BID_CASES (
    BID_CASE_ID            VARCHAR(64)  NOT NULL,
    INSTITUTION_ID         VARCHAR(64)  NOT NULL,
    SCHEDULE_CONFIDENCE    VARCHAR(20)  NOT NULL DEFAULT '예상',
    -- ⚠️ 아래 ISO 시각 컬럼들의 길이 30 은 **부족하다**(실제 32자). db/*/004 가 40 으로 넓힌다.
    EXPECTED_DATE          VARCHAR(30),
    CONFIRMED_DATE         VARCHAR(30),
    LAST_SYNCED_AT         VARCHAR(30),
    PARTICIPATION_STATUS   VARCHAR(20)  NOT NULL DEFAULT '검토중',
    -- Oracle 정본은 CLOB DEFAULT '[]'. MySQL 은 TEXT 계열에 DEFAULT 를 줄 수 없어
    -- (8.0.13+ 의 표현식 기본값을 써야 한다) 앱이 항상 명시값을 넣는 것을 전제한다.
    -- Oracle 쪽 기본값에 기대는 INSERT 가 있으면 여기서만 NULL 이 되므로,
    -- **앱은 어느 쪽에서도 '[]' 를 명시적으로 넣어야 한다.**
    PARTICIPATION_DECISION LONGTEXT,
    RESEARCH_STATUS        VARCHAR(20)  NOT NULL DEFAULT '대기',
    FINALIZED_BY           VARCHAR(100),
    FINALIZED_AT           VARCHAR(30),
    SOURCE_SLUG            VARCHAR(64),
    NOTICE_ID              VARCHAR(100),
    TITLE                  VARCHAR(500),
    NOTICE_URL             VARCHAR(1000),
    PRIMARY KEY (BID_CASE_ID),
    -- 반입 dedup 키 (collector/SCHEMA.md §④). NULL 취급은 Oracle·SQLite 와 같아
    -- 두 컬럼이 모두 NULL 인 수동/시드 행은 중복으로 걸리지 않는다.
    UNIQUE KEY IDX_BID_CASES_NOTICE (SOURCE_SLUG, NOTICE_ID),
    CONSTRAINT FK_BID_CASES_INST FOREIGN KEY (INSTITUTION_ID)
        REFERENCES INSTITUTIONS (INSTITUTION_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS TASKS (
    TASK_ID        VARCHAR(64)  NOT NULL,
    BID_CASE_ID    VARCHAR(64)  NOT NULL,
    TEAM           VARCHAR(50)  NOT NULL,
    STATUS         VARCHAR(20)  NOT NULL DEFAULT '대기',
    PROGRESS_PCT   SMALLINT     NOT NULL DEFAULT 0,
    -- ⚠️ 정본과 같이 **NULL 허용**으로 둔다. MySQL 에서는 '' 도 담을 수 있지만,
    --    "아직 안 씀"의 표현이 두 DB 에서 갈리면 Mapper 를 한 벌로 못 쓴다.
    --    Mapper 는 어느 쪽에서든 null → "" 로 정규화한다.
    DRAFT_CONTENT  LONGTEXT,
    ASSIGNEE       VARCHAR(100),
    APPROVER       VARCHAR(100),
    FINAL_APPROVER VARCHAR(100),
    PRIMARY KEY (TASK_ID),
    UNIQUE KEY UK_TASKS_CASE_TEAM (BID_CASE_ID, TEAM),
    CONSTRAINT FK_TASKS_BID_CASE FOREIGN KEY (BID_CASE_ID)
        REFERENCES BID_CASES (BID_CASE_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS MESSAGES (
    MESSAGE_ID VARCHAR(64)  NOT NULL,
    TASK_ID    VARCHAR(64)  NOT NULL,
    ROLE       VARCHAR(30)  NOT NULL,
    CONTENT    LONGTEXT     NOT NULL,
    CREATED_AT VARCHAR(30)  NOT NULL,
    AUTHOR     VARCHAR(100),
    STAGE      SMALLINT,
    MODEL      VARCHAR(100),
    PRIMARY KEY (MESSAGE_ID),
    CONSTRAINT FK_MESSAGES_TASK FOREIGN KEY (TASK_ID)
        REFERENCES TASKS (TASK_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS NOTIFICATIONS (
    NOTIFICATION_ID VARCHAR(64)  NOT NULL,
    RECIPIENT       VARCHAR(100) NOT NULL,
    KIND            VARCHAR(30)  NOT NULL,
    INSTITUTION_ID  VARCHAR(64),
    TASK_ID         VARCHAR(64),
    CONTENT         LONGTEXT     NOT NULL,
    LINK            VARCHAR(500),
    CREATED_AT      VARCHAR(30)  NOT NULL,
    READ_AT         VARCHAR(30),
    STAGE           SMALLINT,
    SENDER          VARCHAR(100),
    PRIMARY KEY (NOTIFICATION_ID),
    KEY IDX_NOTIF_RECIPIENT (RECIPIENT, CREATED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ROLE_MENUS (
    ROLE    VARCHAR(50) NOT NULL,
    MENU    VARCHAR(50) NOT NULL,
    ENABLED TINYINT     NOT NULL DEFAULT 1,
    PRIMARY KEY (ROLE, MENU)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CHAT_MESSAGES (
    CHAT_MESSAGE_ID VARCHAR(64)  NOT NULL,
    INSTITUTION_ID  VARCHAR(64)  NOT NULL,
    ROLE            VARCHAR(30)  NOT NULL,
    CONTENT         LONGTEXT     NOT NULL,
    CREATED_AT      VARCHAR(30)  NOT NULL,
    AUTHOR          VARCHAR(100),
    PRIMARY KEY (CHAT_MESSAGE_ID),
    KEY IDX_CHAT_INST (INSTITUTION_ID, CREATED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- -----------------------------------------------------------------------------
-- 2. 검색 색인 — 4 테이블
--
-- ⚠️ 전문검색은 미러에 **재현되지 않는다.** 정본 쪽은 Oracle Text CONTEXT(또는
--    Java 인메모리 폴백)이고, MySQL FULLTEXT 는 한글 토크나이징이 달라 같은 결과를
--    주지 않는다. 외부망 로컬에서 검색 품질을 판정하지 말 것 — 구조만 맞춰 둔다.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CHUNKS (
    CHUNK_ID       BIGINT       NOT NULL,
    CHUNK_TEXT     LONGTEXT     NOT NULL,
    PATH           VARCHAR(1000) NOT NULL,
    CHUNK_NO       INT          NOT NULL,
    INSTITUTION_ID VARCHAR(64),
    DOCTYPE        VARCHAR(50),
    FILENAME       VARCHAR(500),
    PRIMARY KEY (CHUNK_ID),
    -- utf8mb4 인덱스 키 상한(3072바이트) 때문에 접두사 길이를 준다.
    KEY IDX_CHUNKS_PATH (PATH(768)),
    KEY IDX_CHUNKS_INST (INSTITUTION_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS VECTORS (
    CHUNK_ID  BIGINT   NOT NULL,
    EMBEDDING LONGBLOB NOT NULL,
    PRIMARY KEY (CHUNK_ID),
    CONSTRAINT FK_VECTORS_CHUNK FOREIGN KEY (CHUNK_ID)
        REFERENCES CHUNKS (CHUNK_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS META (
    META_KEY   VARCHAR(100) NOT NULL,
    META_VALUE VARCHAR(1000),
    PRIMARY KEY (META_KEY)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS FILES (
    -- ⚠️ utf8mb4 에서 인덱스 키 상한(3072바이트)에 걸리므로 PK 는 접두사 길이를 준다.
    --    Oracle 정본은 VARCHAR2(1000 CHAR) 전체를 PK 로 쓴다 — 미러의 제약일 뿐이다.
    PATH      VARCHAR(1000) NOT NULL,
    MTIME     DOUBLE        NOT NULL,
    FILE_SIZE BIGINT        NOT NULL,
    ROOT      VARCHAR(50)   NOT NULL,
    PRIMARY KEY (PATH(768))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- -----------------------------------------------------------------------------
-- 3. 인덱스 — 위 CREATE TABLE 안에 인라인으로 선언했다
--
-- MySQL 의 `CREATE INDEX` 에는 IF NOT EXISTS 가 없어, 별도 문으로 두면 이 스크립트가
-- **두 번째 실행에서 깨진다**(테이블은 IF NOT EXISTS 로 넘어가는데 인덱스에서 멈춘다).
-- 인라인으로 두면 스크립트 전체가 멱등해진다.
--
-- 정본(Oracle)의 FK 컬럼 인덱스 IDX_BID_CASES_INST / IDX_TASKS_BID_CASE /
-- IDX_MESSAGES_TASK 에 해당하는 것은 만들지 않는다 — InnoDB 는 외래키에 인덱스를
-- 자동 생성한다. Oracle 은 자동 생성하지 않아 정본에만 명시돼 있다.
