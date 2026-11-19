-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (051) : 디자인 검토 흐름 DESIGN_ROUND · DESIGN_ROUND_RECIP · DESIGN_COMMENT · DESIGN_ACK
-- 정본이 아니다. 정본은 db/oracle/051_design_review.sql (규칙, 참조, DB 권한, 감사 접두어 예약은 정본 헤더).
-- 감사는 BID_PREP_ACT(024)를 재사용한다 — ACTION_CD 의 DSN_, TASK_ 접두어는 디자인 검토·팀 작업 결재 전용(예약)이고
--   TASK_CD 는 DSN_R{회차} 또는 TEAM_SALES / TEAM_IT / TEAM_BUDGET 으로 고정한다. 사전준비 이력을 집계할 때는 이 접두어로 걸러야 한다.
-- 외래키, CHECK 없음. 멱등하지 않다 — 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 앞 번호(048 등)까지 적용한 DB: 이 파일만 한 번 돌리면 된다(049, 050 예약 번호와 표가 겹치지 않는다). 도중에 실패했으면 아래 되돌리기로 지우고 다시.
-- 배포 순서: DB 먼저, 서버 나중. 표가 없으면 /design-tasks, /tasks/{id}/design* 는 500, 기존 /tasks 흐름은 영향 없음.
-- 되돌리기(데이터 소멸): DROP TABLE DESIGN_ACK; DROP TABLE DESIGN_COMMENT; DROP TABLE DESIGN_ROUND_RECIP; DROP TABLE DESIGN_ROUND;
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

CREATE TABLE DESIGN_ROUND (
    TASK_ID         VARCHAR(64)  NOT NULL,
    ROUND_NO        INT          NOT NULL,
    BID_CASE_ID     VARCHAR(64)  NOT NULL,
    OPENED_BY       VARCHAR(7)   NOT NULL,
    OPENED_VERIFIED SMALLINT     NOT NULL DEFAULT 0,
    OPENED_AT       VARCHAR(40)  NOT NULL,
    RECIP_COUNT     INT          NOT NULL,
    CLOSED_AT       VARCHAR(40),
    CLOSE_CD        VARCHAR(20),
    CLOSED_BY       VARCHAR(7),
    PRIMARY KEY (TASK_ID, ROUND_NO),
    KEY IDX_DR_CASE (BID_CASE_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DESIGN_ROUND_RECIP (
    TASK_ID         VARCHAR(64)  NOT NULL,
    ROUND_NO        INT          NOT NULL,
    EMP_NO          VARCHAR(7)   NOT NULL,
    REASON_CD       VARCHAR(20)  NOT NULL,
    NOTIFICATION_ID VARCHAR(64)  NOT NULL,
    PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO),
    KEY IDX_DRR_EMP (EMP_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DESIGN_COMMENT (
    TASK_ID      VARCHAR(64)   NOT NULL,
    ROUND_NO     INT           NOT NULL,
    EMP_NO       VARCHAR(7)    NOT NULL,
    SEQ_NO       INT           NOT NULL,
    BODY         VARCHAR(1000) NOT NULL,
    EMP_VERIFIED SMALLINT      NOT NULL DEFAULT 0,
    CREATED_AT   VARCHAR(40)   NOT NULL,
    PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO, SEQ_NO),
    KEY IDX_DC_ROUND (TASK_ID, ROUND_NO, CREATED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DESIGN_ACK (
    TASK_ID      VARCHAR(64)  NOT NULL,
    ROUND_NO     INT          NOT NULL,
    EMP_NO       VARCHAR(7)   NOT NULL,
    EMP_VERIFIED SMALLINT     NOT NULL DEFAULT 0,
    ACKED_AT     VARCHAR(40)  NOT NULL,
    PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
