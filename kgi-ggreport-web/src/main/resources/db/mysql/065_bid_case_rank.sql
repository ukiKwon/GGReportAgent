-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (065) : BID_CASES.BID_RANK_CD (금고 순위, NULL = 미정·해당 없음)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/065_bid_case_rank.sql (규칙은 정본 헤더).
-- 코드 = TARGET_AIM_RANK(FIRST·SECOND·SINGLE·MAIN_BANK·OTHER). 기존 행은 모두 NULL(채우기 없음).
-- ⚠️ 멱등하지 않다 — 064 뒤 한 번만. 이미 064 까지 적용한 DB: 이 파일만 한 번. 적용 뒤 고치지 않는다(체크섬).
-- 사전 조회(0 이어야 한다): SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BID_CASES' AND COLUMN_NAME = 'BID_RANK_CD';
-- 확인: SELECT COUNT(*) FROM BID_CASES WHERE BID_RANK_CD IS NOT NULL;  -- 0
-- 되돌리기(서버를 먼저 되돌린 뒤): ALTER TABLE BID_CASES DROP COLUMN BID_RANK_CD;
-- -----------------------------------------------------------------------------

ALTER TABLE BID_CASES ADD COLUMN BID_RANK_CD VARCHAR(20) NULL;
COMMIT;
