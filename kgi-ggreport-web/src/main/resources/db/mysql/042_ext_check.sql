-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (042) : 외부 확인 반입 저장 EXT_CHECK · EXT_CHECK_FILE · EXT_CHECK_EXCL
-- ⚠️ 정본이 아니다. 정본은 db/oracle/042_ext_check.sql (규칙·참조·권한은 정본 헤더).
-- 외래키·CHECK 없음. ⚠️ 멱등하지 않다 — 041 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 039~041 까지 적용한 DB: 이 파일만 한 번 더 돌리면 된다(앞 번호 재실행 불필요). 도중에 실패했으면 아래 DROP 3줄로 지우고 다시.
-- 되돌리기(데이터 소멸): DROP TABLE EXT_CHECK_EXCL; DROP TABLE EXT_CHECK_FILE; DROP TABLE EXT_CHECK;
-- -----------------------------------------------------------------------------

CREATE TABLE EXT_CHECK (
    CHECK_KEY       VARCHAR(32)    NOT NULL,
    INSTITUTION_ID  VARCHAR(64)    NOT NULL,
    BATCH_ID        VARCHAR(80)    NOT NULL,
    CHECK_ID        VARCHAR(40)    NOT NULL,
    CHECKED_AT      VARCHAR(40)    NOT NULL,
    SOURCE_KIND     VARCHAR(10)    NOT NULL,
    SOURCE_SLUG     VARCHAR(30)    NOT NULL,
    STATUS_CD       VARCHAR(10)    NOT NULL,
    ERROR_CD        VARCHAR(30),
    MATCH_CONF      VARCHAR(5),
    MATCH_BASIS     VARCHAR(200),
    TITLE           VARCHAR(300),
    ITEM_NO         VARCHAR(60),
    PUBLISHER       VARCHAR(60),
    POSTED_AT       VARCHAR(10),
    DEADLINE_AT     VARCHAR(10),
    SRC_URL         VARCHAR(500),
    IMPORTED_AT     VARCHAR(40)    NOT NULL,
    PRIMARY KEY (CHECK_KEY),
    UNIQUE KEY UQ_EXT_CHECK_BATCH (BATCH_ID, CHECK_ID),
    KEY IDX_EXT_CHECK_INST (INSTITUTION_ID, SOURCE_KIND, CHECKED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE EXT_CHECK_FILE (
    CHECK_KEY       VARCHAR(32)    NOT NULL,
    FILE_SEQ        SMALLINT       NOT NULL,
    FORMAT_CD       VARCHAR(5)     NOT NULL,
    STORED_NAME     VARCHAR(100)   NOT NULL,
    SHA256          VARCHAR(64)    NOT NULL,
    FILE_SIZE       BIGINT         NOT NULL,
    PRIMARY KEY (CHECK_KEY, FILE_SEQ)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE EXT_CHECK_EXCL (
    BATCH_ID        VARCHAR(80)    NOT NULL,
    CHECK_ID        VARCHAR(40)    NOT NULL,
    FILE_SEQ        SMALLINT       NOT NULL,
    REASON_CD       VARCHAR(30)    NOT NULL,
    LOCATOR_CD      VARCHAR(20)    NOT NULL,
    HIT_CNT         INT            NOT NULL,
    EXCLUDED_AT     VARCHAR(40)    NOT NULL,
    PRIMARY KEY (BATCH_ID, CHECK_ID, FILE_SEQ, REASON_CD, LOCATOR_CD)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
