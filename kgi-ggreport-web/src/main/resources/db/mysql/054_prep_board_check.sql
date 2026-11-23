-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (054) : 대시보드 칸 체크 BID_PREP_CHECK + 코드표 DASH_MARK (NEXT 102)
-- 정본이 아니다. 정본은 db/oracle/054_prep_board_check.sql (규칙, 참조, DB 권한, 감사 접두어 예약은 정본 헤더).
-- 외래키, CHECK 없음. 멱등하지 않다 — 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 055~058 까지 적용한 로컬 DB: 이 파일만 한 번 돌리면 된다(054 는 예약 번호였고 표·코드 그룹이 겹치지 않는다).
--   도중에 실패했으면 아래 되돌리기로 지우고 다시.
-- 배포 순서: DB 먼저, 서버 나중. 표가 없으면 /prep-board 와 칸 체크는 500, 기존 사전준비는 영향 없음.
-- 되돌리기(데이터 소멸): DROP TABLE BID_PREP_CHECK; DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK';
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

CREATE TABLE BID_PREP_CHECK (
    BID_CASE_ID     VARCHAR(64)  NOT NULL,
    COL_CD          VARCHAR(20)  NOT NULL,
    REV_NO          INT          NOT NULL,
    MARK_CD         VARCHAR(20)  NOT NULL,
    PREV_MARK_CD    VARCHAR(20),
    MARK_DATE       VARCHAR(10)  NOT NULL,
    ACTOR_EMP_NO    VARCHAR(7)   NOT NULL,
    ACTOR_NAME      VARCHAR(50)  NOT NULL,
    EMP_VERIFIED    SMALLINT     NOT NULL DEFAULT 0,
    SCREEN_ID       VARCHAR(30)  NOT NULL,
    BUTTON_ID       VARCHAR(30)  NOT NULL,
    UI_VALID        SMALLINT     NOT NULL DEFAULT 0,
    SAVED_AT        VARCHAR(40)  NOT NULL,
    PRIMARY KEY (BID_CASE_ID, COL_CD, REV_NO),
    KEY IDX_BPC_ACTOR (ACTOR_EMP_NO, SAVED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'DONE', '완료', 1, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'IN_PROGRESS', '진행', 2, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'NA', '대상 아님', 3, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'NONE', '시작 전', 4, 1, '2026-11-23T00:00:00+09:00');
