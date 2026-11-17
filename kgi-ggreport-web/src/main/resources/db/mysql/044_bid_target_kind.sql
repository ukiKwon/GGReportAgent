-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (044) : INST_BID_TARGET.KIND_CD(GOAL/WATCH) 추가, TARGET_YEAR NULL 허용
-- ⚠️ 정본이 아니다. 정본은 db/oracle/044_bid_target_kind.sql (규칙은 정본 헤더).
-- ⚠️ 043 뒤 한 번만(멱등하지 않다). 한 문장이라 실패하면 아무것도 바뀌지 않는다(MySQL 8 원자 DDL) — 원인을 고친 뒤 다시 돌린다.
-- 이미 045 를 돌린 DB: 이 파일만 한 번 더 돌리면 된다(045 와 표가 겹치지 않는다). 043 을 아직 안 돌린 DB 는 043 → 044 순서로.
-- 기존 행은 DEFAULT 로 KIND_CD='GOAL'. 칸은 Oracle 과 같은 순서(맨 뒤)로 붙인다(AFTER 쓰지 않음).
-- 되돌리기(코드를 먼저 되돌린 뒤): ALTER TABLE INST_BID_TARGET DROP KEY IDX_IBT_KIND, DROP COLUMN KIND_CD;  (TARGET_YEAR NULL 허용은 그대로 둔다)
-- -----------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET
    ADD COLUMN KIND_CD VARCHAR(10) NOT NULL DEFAULT 'GOAL',
    MODIFY COLUMN TARGET_YEAR SMALLINT NULL,
    ADD KEY IDX_IBT_KIND (KIND_CD, INSTITUTION_ID);
