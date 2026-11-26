-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (068) : BOARD_MATERIAL.AGENDA_NO (이사회 결과의 안건 번호, 자유 문자열 30자)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/068_board_agenda_no.sql (규칙은 정본 헤더).
-- ⚠️ 멱등하지 않다 — 064 뒤 한 번만(065~067 은 다른 작업 예약이라 번호를 건너뛴다. 이미 064 까지 적용한 DB 는 이 파일만 돌리면 된다). 적용 뒤 고치지 않는다(체크섬).
-- ⚠️ 배포 순서: DB 먼저, 서버 나중. 기존 행은 NULL.
-- 확인: SELECT COUNT(*) FROM BOARD_MATERIAL WHERE AGENDA_NO IS NOT NULL;  -- 적용 직후 0
-- 되돌리기(서버를 먼저 되돌린 뒤): ALTER TABLE BOARD_MATERIAL DROP COLUMN AGENDA_NO;
-- -----------------------------------------------------------------------------

ALTER TABLE BOARD_MATERIAL ADD COLUMN AGENDA_NO VARCHAR(30) NULL;
