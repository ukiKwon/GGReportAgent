--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (062) : 사전준비 이력 이벤트 OPEN_START('사전준비 시작') (2026-11-25, NEXT 114)
-- 무엇: 개설 신청(BID_OPEN, 팀장 결재)을 새로 받지 않고, 확정한 사람·같은 팀 영업팀장이 담당자를 정하면 바로 IN_PROGRESS 가 된다.
--   그 전이를 BID_PREP_LOG.EVENT_CD = 'OPEN_START' 로 남긴다(REQ_ID 없음). 표·열 변경 없음. 기존 OPEN_* 코드는 남은 옛 건 이력용으로 그대로.
-- 주의: 멱등하지 않다(PK 위반) — 061 뒤 한 번만. 적용 뒤 고치지 않는다(체크섬). 적용은 DBA.
-- 주의 배포 순서: DB 먼저 권장. 없어도 서버는 돌고 이력의 이벤트 이름만 빈다(LEFT JOIN).
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'OPEN_START';
--------------------------------------------------------------------------------
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PREP_EVENT', 'OPEN_START', '사전준비 시작', 23, 1, '2026-11-25T00:00:00+09:00');
COMMIT;
