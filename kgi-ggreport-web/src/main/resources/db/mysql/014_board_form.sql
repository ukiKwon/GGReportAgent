-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 스키마 (014) : 이사회 자료 양식 커스텀
-- ⚠️ 정본이 아니다. 정본은 db/oracle/014_board_form.sql (용도·규칙은 정본 헤더).
-- ⚠️ 외래키(FK)를 두지 않는다(회사 DB 기준) — 정본 헤더의 참조 목록을 서비스가 저장 전에 확인한다.
--    이미 FK 가 걸린 로컬 DB 는 015_drop_foreign_keys.sql 이 뗀다.
-- ⚠️ 멱등하지 않다 — 013 적용 후 한 번만. 되돌리기: DROP TABLE BOARD_FORM_USE; DROP TABLE BOARD_FORM_VER; DROP TABLE BOARD_FORM;
-- -----------------------------------------------------------------------------

CREATE TABLE BOARD_FORM (
    FORM_ID      BIGINT       NOT NULL AUTO_INCREMENT,
    TEAM_KEY     VARCHAR(50)  NOT NULL,
    NAME         VARCHAR(60)  NOT NULL,
    BASE_DOC     VARCHAR(50)  NOT NULL,
    STATUS       VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
    CURRENT_VER  INT          NOT NULL DEFAULT 1,
    CREATED_BY   VARCHAR(7)   NOT NULL,
    CREATED_AT   VARCHAR(40)  NOT NULL,
    UPDATED_BY   VARCHAR(7)   NOT NULL,
    UPDATED_AT   VARCHAR(40)  NOT NULL,
    PRIMARY KEY (FORM_ID),
    KEY IDX_BF_TEAM (TEAM_KEY, STATUS),
    CONSTRAINT CK_BF_STATUS CHECK (STATUS IN ('ACTIVE', 'ARCHIVED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE BOARD_FORM_VER (
    FORM_ID      BIGINT       NOT NULL,
    VER_NO       INT          NOT NULL,
    NAME         VARCHAR(60)  NOT NULL,
    CATALOG_VER  SMALLINT     NOT NULL,
    SPEC_JSON    LONGTEXT     NOT NULL,
    CREATED_BY   VARCHAR(7)   NOT NULL,
    CREATED_AT   VARCHAR(40)  NOT NULL,
    PRIMARY KEY (FORM_ID, VER_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE BOARD_FORM_USE (
    USE_ID       BIGINT       NOT NULL AUTO_INCREMENT,
    REQ_ID       BIGINT       NOT NULL,
    FORM_ID      BIGINT       NOT NULL,
    VER_NO       INT          NOT NULL,
    USED_AT      VARCHAR(40)  NOT NULL,
    PRIMARY KEY (USE_ID),
    UNIQUE KEY UQ_BFU_REQ (REQ_ID),
    KEY IDX_BFU_FORM (FORM_ID, VER_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
