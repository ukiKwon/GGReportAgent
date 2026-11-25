-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (062) : 사전준비 이력 이벤트 OPEN_START('사전준비 시작' — 결재 없는 담당자 지정, 사용자 11-25 NEXT 114)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/062_prep_open_start.sql.
-- ⚠️ 멱등하지 않다(PK 위반) — 061 뒤 한 번만. 이미 061 까지 적용한 DB: 이 파일만 한 번 돌린다. 적용 뒤 고치지 않는다(체크섬).
-- 없어도 서버는 돈다(이력 조회가 LEFT JOIN 이라 이벤트 이름 칸만 빈다). 배포는 DB 먼저 권장.
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'OPEN_START';
-- -----------------------------------------------------------------------------
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PREP_EVENT', 'OPEN_START', '사전준비 시작', 23, 1, '2026-11-25T00:00:00+09:00');
COMMIT;
