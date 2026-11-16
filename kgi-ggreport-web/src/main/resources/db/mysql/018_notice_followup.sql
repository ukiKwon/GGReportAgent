-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (018) : 공고 예정일 경과 건 처리 이력 NOTICE_FOLLOWUP
-- ⚠️ 정본이 아니다. 정본은 db/oracle/018_notice_followup.sql (추가 전용·현재 상태 규칙·참조 목록은 정본 헤더).
-- 외래키 없음. 키 = (INSTITUTION_ID, DUE_DATE, REV_NO), 현재 상태 = 최대 REV_NO.
-- ⚠️ 멱등하지 않다 — 016·017 적용 후 한 번만. 되돌리기: DROP TABLE NOTICE_FOLLOWUP;
-- -----------------------------------------------------------------------------

CREATE TABLE NOTICE_FOLLOWUP (
    INSTITUTION_ID   VARCHAR(64)  NOT NULL,
    DUE_DATE         VARCHAR(10)  NOT NULL,
    REV_NO           INT          NOT NULL,
    STATUS_CD        VARCHAR(20)  NOT NULL,
    OPINION          VARCHAR(500),
    NEXT_CHECK_DATE  VARCHAR(10),
    HANDLER_EMP_NO   VARCHAR(7)   NOT NULL,
    HANDLER_NAME     VARCHAR(50)  NOT NULL,
    EMP_VERIFIED     SMALLINT     NOT NULL DEFAULT 0,
    HANDLED_AT       VARCHAR(40)  NOT NULL,
    PRIMARY KEY (INSTITUTION_ID, DUE_DATE, REV_NO),
    KEY IDX_NF_STATUS (STATUS_CD, NEXT_CHECK_DATE),
    KEY IDX_NF_HANDLER (HANDLER_EMP_NO, HANDLED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
