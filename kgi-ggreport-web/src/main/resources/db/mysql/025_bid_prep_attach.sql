-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (025) : 제안서 사전준비 첨부 원본 보관(NEXT 71)
--   BID_PREP_ATTACH (+ COMMON_CODE PREP_PII)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/025_bid_prep_attach.sql (규칙·참조 목록은 정본 헤더).
-- 외래키 없음. ⚠️ 멱등하지 않다 — 024 적용 후 한 번만. (이미 024 까지 적용한 DB 는 이 파일만 이어서 실행한다)
-- 파일 본체는 서버 디스크(ggreport.prep-attach-dir)에 있다 — 그 폴더도 백업 대상이다.
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE BID_PREP_ATTACH; DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'PREP_PII';
-- -----------------------------------------------------------------------------

CREATE TABLE BID_PREP_ATTACH (
    ATTACH_ID         BIGINT        NOT NULL AUTO_INCREMENT,
    BID_CASE_ID       VARCHAR(64)   NOT NULL,
    TASK_CD           VARCHAR(20)   NOT NULL,
    ORIG_NAME         VARCHAR(200)  NOT NULL,
    EXT_CD            VARCHAR(10)   NOT NULL,
    SIZE_BYTES        BIGINT        NOT NULL,
    SHA256            VARCHAR(64)   NOT NULL,
    STORE_KEY         VARCHAR(40)   NOT NULL,
    PII_STATE         VARCHAR(20)   NOT NULL,
    PII_NOTE          VARCHAR(100),
    VALID_YN          SMALLINT      NOT NULL DEFAULT 1,
    UPLOADED_BY       VARCHAR(7)    NOT NULL,
    UPLOADED_AT       VARCHAR(40)   NOT NULL,
    UPLOADED_VERIFIED SMALLINT      NOT NULL DEFAULT 0,
    VOIDED_BY         VARCHAR(7),
    VOIDED_AT         VARCHAR(40),
    PRIMARY KEY (ATTACH_ID),
    KEY IDX_BPAT_CASE (BID_CASE_ID, TASK_CD, ATTACH_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('PREP_PII', 'CHECKED', '검사함', 1, 1, '2026-11-11T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('PREP_PII', 'UNCHECKED', '검사 못 함', 2, 1, '2026-11-11T00:00:00+09:00');
