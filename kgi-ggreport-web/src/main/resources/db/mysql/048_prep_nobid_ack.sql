-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (048) : 입찰 없음 알림의 [계속 작성] 행위 기록 PREP_NOBID_ACK
-- 정본이 아니다. 정본은 db/oracle/048_prep_nobid_ack.sql (규칙, 참조, DB 권한은 정본 헤더).
-- 외래키, CHECK 없음. 멱등하지 않다 — 024, 037 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 앞 번호(047 등)까지 적용한 DB: 이 파일만 한 번 더 돌리면 된다(앞 번호와 표가 겹치지 않는다). 도중에 실패했으면 아래 되돌리기로 지우고 다시.
-- 배포 순서: DB 먼저, 서버 나중. 표가 없으면 사전준비 상세의 알림(nobid_notice)이 null 로 빠지고 [계속 작성] 기록은 500.
-- 되돌리기(데이터 소멸): DROP TABLE PREP_NOBID_ACK;
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

CREATE TABLE PREP_NOBID_ACK (
    EMP_NO            VARCHAR(7)    NOT NULL,
    INSTITUTION_ID    VARCHAR(64)   NOT NULL,
    ROUND_SEQ         INT           NOT NULL,
    NOTICE_HANDLED_AT VARCHAR(40)   NOT NULL,
    NOTICE_REV_NO     INT           NOT NULL,
    BID_CASE_ID       VARCHAR(64)   NOT NULL,
    PREP_STATE_CD     VARCHAR(20)   NOT NULL,
    EMP_VERIFIED      SMALLINT      NOT NULL DEFAULT 0,
    SCREEN_ID         VARCHAR(30)   NOT NULL,
    BUTTON_ID         VARCHAR(30)   NOT NULL,
    UI_VALID          SMALLINT      NOT NULL DEFAULT 0,
    ACKED_AT          VARCHAR(40)   NOT NULL,
    PRIMARY KEY (EMP_NO, INSTITUTION_ID, ROUND_SEQ, NOTICE_HANDLED_AT),
    KEY IDX_PNA_CASE (BID_CASE_ID, ACKED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
