-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (060) : 기관 관련 뉴스 반입 INST_NEWS_IMPORT / INST_NEWS_ITEM (+ COMMON_CODE PLAN_ACTION 1행)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/060_inst_news.sql (규칙·참조·DB 권한·IMPORT_ID 의미·CLOSE_REASON='NEWS' 는 정본 헤더).
-- 외래키 없음. ⚠️ 멱등하지 않다 — 034·045 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 이미 059 까지 적용한 DB: 이 파일 하나만 한 번 돌린다(앞 번호 재실행 불필요). 도중에 실패했으면 아래 되돌리기로 지우고 다시.
-- ⚠️ 배포 순서: DB 060 먼저, 서버 나중. 060 없이 서버를 먼저 올려도 기존 사업계획 경로는 영향이 없지만 뉴스 API(조회·반입)는 500 이다.
-- 되돌리기(데이터 소멸): DROP TABLE INST_NEWS_ITEM; DROP TABLE INST_NEWS_IMPORT; DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'PLAN_ACTION' AND CODE = 'NEWS_IMPORT';
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

CREATE TABLE INST_NEWS_IMPORT (
    IMPORT_ID         BIGINT        NOT NULL AUTO_INCREMENT,
    INSTITUTION_ID    VARCHAR(64)   NOT NULL,
    FILE_DATE         VARCHAR(10)   NOT NULL,
    FILE_SHA256       VARCHAR(64)   NOT NULL,
    FILE_BYTES        BIGINT        NOT NULL,
    ITEM_COUNT        SMALLINT      NOT NULL,
    BATCH_ID          VARCHAR(64),
    IMPORTED_BY       VARCHAR(7)    NOT NULL,
    IMPORTED_AT       VARCHAR(40)   NOT NULL,
    IMPORTED_VERIFIED SMALLINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (IMPORT_ID),
    KEY IDX_INI_INST (INSTITUTION_ID, IMPORT_ID),
    KEY IDX_INI_SHA (INSTITUTION_ID, FILE_SHA256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE INST_NEWS_ITEM (
    NEWS_ID         BIGINT        NOT NULL AUTO_INCREMENT,
    IMPORT_ID       BIGINT        NOT NULL,
    INSTITUTION_ID  VARCHAR(64)   NOT NULL,
    ROW_NO          INT           NOT NULL,
    FIELD_CD        VARCHAR(20)   NOT NULL,
    TITLE           VARCHAR(200)  NOT NULL,
    PRESS           VARCHAR(60)   NOT NULL,
    PUBLISHED_ON    VARCHAR(10)   NOT NULL,
    SRC_URL         VARCHAR(1000) NOT NULL,
    SUMMARY         VARCHAR(900)  NOT NULL,
    CHECKED_ON      VARCHAR(10)   NOT NULL,
    COLLECTOR_AGENT VARCHAR(60)   NOT NULL,
    PRIMARY KEY (NEWS_ID),
    KEY IDX_INW_IMPORT (IMPORT_ID, ROW_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- [INSERT 블록 시작 — Oracle 060 과 글자 그대로 같아야 한다(NewsDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'NEWS_IMPORT', '뉴스 반입', 11, 1, '2026-11-24T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
