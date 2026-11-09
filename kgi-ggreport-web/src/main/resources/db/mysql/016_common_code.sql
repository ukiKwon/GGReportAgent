-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (016) : 공통 코드 COMMON_CODE
-- ⚠️ 정본이 아니다. 정본은 db/oracle/016_common_code.sql (용도·규칙은 정본 헤더).
-- 삭제 금지, 폐기는 ENABLED = 0. CHECK 는 쓰지 않는다.
-- ⚠️ 멱등하지 않다 — 015 적용 후 한 번만. 되돌리기: DROP TABLE COMMON_CODE;
-- -----------------------------------------------------------------------------

CREATE TABLE COMMON_CODE (
    CODE_GROUP  VARCHAR(30)   NOT NULL,
    CODE        VARCHAR(30)   NOT NULL,
    CODE_NAME   VARCHAR(100)  NOT NULL,
    SORT_NO     SMALLINT      NOT NULL DEFAULT 0,
    ENABLED     SMALLINT      NOT NULL DEFAULT 1,
    NOTE        VARCHAR(200),
    UPDATED_AT  VARCHAR(40)   NOT NULL,
    UPDATED_BY  VARCHAR(7),
    PRIMARY KEY (CODE_GROUP, CODE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
