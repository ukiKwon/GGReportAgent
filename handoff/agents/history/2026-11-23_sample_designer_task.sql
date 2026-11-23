-- 로컬 개발 DB 전용 — NEXT 106 제안서 점검 실사용용 디자이너 샘플 작업 1건 (2026-11-23, 사용자 요청)
-- 노원구(nowon) 새 입찰건 + 영업·전산·예산 2차완료 + 디자이너 작성중(담당 7130526) → 업로드·점검·제출 확인창까지 열림
-- 근거: handoff/agents/backend-dev/ 11-23 샘플 작업 보고(DesignReviewApiTest·DocCheckApiTest 시드 방식과 같음)
-- 되돌리기: 이 파일 맨 아래 DELETE 묶음(주석 해제)
INSERT INTO BID_CASES (BID_CASE_ID, INSTITUTION_ID, PARTICIPATION_STATUS, PARTICIPATION_DECISION)
VALUES ('bc-sample-dsn1', 'nowon', '참여확정', '[]');
INSERT INTO TASKS (TASK_ID, BID_CASE_ID, TEAM, STATUS, ASSIGNEE) VALUES
 ('task-sample-dsn1-s','bc-sample-dsn1','영업','2차완료','3918264'),
 ('task-sample-dsn1-i','bc-sample-dsn1','전산','2차완료','4482971'),
 ('task-sample-dsn1-b','bc-sample-dsn1','예산','2차완료','1857403'),
 ('task-sample-dsn1-d','bc-sample-dsn1','디자이너','작성중','7130526');
INSERT INTO BID_ASSIGNMENT (BID_CASE_ID, EMP_NO, ACTIVE_YN, ASSIGNED_BY, ASSIGNED_AT)
VALUES ('bc-sample-dsn1','3918264',1,'5047192','2026-11-23T00:00:00.000000+00:00');

-- 되돌리기(필요할 때 주석을 풀고 실행):
-- DELETE FROM DESIGN_ACK WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM DESIGN_COMMENT WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM DESIGN_ROUND_RECIP WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM DESIGN_ROUND WHERE BID_CASE_ID='bc-sample-dsn1';
-- DELETE FROM DOC_CHECK_HIT WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM DOC_CHECK_LOG WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM DOC_CHECK WHERE TASK_ID LIKE 'task-sample-dsn1-%';
-- DELETE FROM BID_PREP_ACT WHERE BID_CASE_ID='bc-sample-dsn1';
-- DELETE FROM BID_ASSIGN_LOG WHERE BID_CASE_ID='bc-sample-dsn1';
-- DELETE FROM BID_ASSIGNMENT WHERE BID_CASE_ID='bc-sample-dsn1';
-- DELETE FROM TASKS WHERE BID_CASE_ID='bc-sample-dsn1';
-- DELETE FROM BID_CASES WHERE BID_CASE_ID='bc-sample-dsn1';
