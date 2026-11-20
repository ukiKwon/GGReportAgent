-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (057) : 작업함 파일 점검(다른 기관명) DOC_CHECK · DOC_CHECK_HIT · DOC_CHECK_LOG
-- 정본이 아니다. 정본은 db/oracle/057_doc_check.sql (규칙, 참조, DB 권한, 대외비 원칙은 정본 헤더).
-- 대외비: 파일 이름은 평문으로 저장하지 않는다 — NAME_KEY(SHA-256 해시)만. DOC_CHECK_LOG.NAME_KEY 는 ACK·UNACK 줄이 어느 파일인지 가리킨다(SUBMIT_OPEN 은 NULL).
-- 해시 칸(NAME_KEY·FILE_SHA256)은 CHARACTER SET ascii — PK 가 767바이트(COMPACT 행 형식) 안에 들게(DOC_CHECK_HIT PK 최대 620바이트).
-- 외래키, CHECK 없음. 멱등하지 않다 — 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 056 까지 적용한 DB: 이 파일만 이어서 한 번 돌린다(058 은 별개 파일 — 순서와 무관하게 표가 겹치지 않는다). 도중에 실패했으면 아래 되돌리기로 지우고 다시.
-- 배포 순서: DB 먼저, 서버 나중. 표가 없으면 업로드·제출은 되지만 /tasks/{id}/doc-check 는 500.
-- 되돌리기(데이터 소멸): DROP TABLE DOC_CHECK_LOG; DROP TABLE DOC_CHECK_HIT; DROP TABLE DOC_CHECK;
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

CREATE TABLE DOC_CHECK (
    TASK_ID        VARCHAR(64)  NOT NULL,
    NAME_KEY       VARCHAR(64)  CHARACTER SET ascii NOT NULL,
    FILE_SHA256    VARCHAR(64)  CHARACTER SET ascii NOT NULL,
    FILE_SIZE      BIGINT       NOT NULL,
    FILE_MTIME_MS  BIGINT       NOT NULL,
    INSTITUTION_ID VARCHAR(64)  NOT NULL,
    STATE_CD       VARCHAR(12)  NOT NULL,
    REASON_CD      VARCHAR(30),
    HAS_IMAGES     SMALLINT     NOT NULL DEFAULT 0,
    HAS_EMBEDDED   SMALLINT     NOT NULL DEFAULT 0,
    ORDER_APPROX   SMALLINT     NOT NULL DEFAULT 0,
    HIT_ROWS       INT          NOT NULL DEFAULT 0,
    CHECKER_VER    INT          NOT NULL,
    CHECKED_AT     VARCHAR(40)  NOT NULL,
    PRIMARY KEY (TASK_ID, NAME_KEY)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DOC_CHECK_HIT (
    TASK_ID        VARCHAR(64)  NOT NULL,
    NAME_KEY       VARCHAR(64)  CHARACTER SET ascii NOT NULL,
    FOUND_INST_ID  VARCHAR(64)  NOT NULL,
    LOC_KIND       VARCHAR(10)  NOT NULL,
    LOC_NO         INT          NOT NULL,
    HIT_COUNT      INT          NOT NULL,
    PRIMARY KEY (TASK_ID, NAME_KEY, FOUND_INST_ID, LOC_KIND, LOC_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DOC_CHECK_LOG (
    TASK_ID           VARCHAR(64)  NOT NULL,
    SEQ_NO            INT          NOT NULL,
    EVENT_CD          VARCHAR(12)  NOT NULL,
    NAME_KEY          VARCHAR(64)  CHARACTER SET ascii,
    FILE_SHA256       VARCHAR(64)  CHARACTER SET ascii,
    FOUND_INST_ID     VARCHAR(64),
    LOC_KIND          VARCHAR(10),
    LOC_NO            INT,
    OPEN_COUNT        INT,
    NOT_CHECKED_COUNT INT,
    PARTIAL_COUNT     INT,
    EMP_NO            VARCHAR(7),
    EMP_VERIFIED      SMALLINT     NOT NULL DEFAULT 0,
    SCREEN_ID         VARCHAR(30)  NOT NULL,
    BUTTON_ID         VARCHAR(30)  NOT NULL,
    UI_VALID          SMALLINT     NOT NULL DEFAULT 0,
    ACTED_AT          VARCHAR(40)  NOT NULL,
    PRIMARY KEY (TASK_ID, SEQ_NO),
    KEY IDX_DCL_SHA (TASK_ID, FILE_SHA256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
