--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (068) : BOARD_MATERIAL.AGENDA_NO (이사회 결과의 안건 번호, 사용자 결정)
-- 규칙(서비스가 지킨다 — CHECK·FK 없음):
--   AGENDA_NO = 이사회 결과(가결·부결)를 등록할 때 개최일과 함께 적는 자유 문자열(예 '제2026-12호', 최대 30자). 없으면 NULL.
--   의결 예정으로 바꾸거나 재작성을 요구해 결과를 되돌리면 서비스·UPDATE 가 NULL 로 비운다. 변경 전→후는 BOARD_MATERIAL_LOG.REASON 에 남는다(새 로그 칸 없음).
-- ⚠️ 064 뒤 한 번만(065~067 은 다른 작업 예약이라 건너뛴다. 멱등하지 않다 — 칸 중복). 적용 뒤 이 파일을 고치지 않는다(체크섬). 적용은 DBA.
-- ⚠️ 배포 순서: DB 먼저, 서버 나중(서버가 새 칸을 SELECT 한다 — 없으면 이사회 자료 목록·상세 500).
-- ⚠️ DB 권한(DBA): 변동 없음.
-- 확인: SELECT COUNT(*) FROM BOARD_MATERIAL WHERE AGENDA_NO IS NOT NULL;  -- 적용 직후 0
-- 되돌리기(서버를 먼저 068 이전으로 되돌린 뒤): ALTER TABLE BOARD_MATERIAL DROP (AGENDA_NO);
--------------------------------------------------------------------------------

ALTER TABLE BOARD_MATERIAL ADD (AGENDA_NO VARCHAR2(30 CHAR));
