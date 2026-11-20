-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (058) : BOARD_MINUTES_SPEAKER (정본 db/oracle/058, 규칙은 정본 헤더)
-- ⚠️ 멱등하지 않다 — 047 적용 후 한 번만. 049~057 과는 서로 의존하지 않는다.
-- 되돌리기: DROP TABLE BOARD_MINUTES_SPEAKER;
-- -----------------------------------------------------------------------------
CREATE TABLE BOARD_MINUTES_SPEAKER (
    MINUTES_ID  BIGINT       NOT NULL,
    SPEAKER_NO  SMALLINT     NOT NULL,
    LABEL       VARCHAR(40)  NOT NULL,
    PRIMARY KEY (MINUTES_ID, SPEAKER_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
