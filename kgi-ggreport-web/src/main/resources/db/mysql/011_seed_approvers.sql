-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — 시드 (011, MySQL 미러) : 가상 사용자의 상위 결재자 (009 이후, 010 이후)
--
-- ⚠️ 가상 데이터. 자동 규칙(ApproverRules)의 결과와 같다 — 어긋나면 ApproverSeedTest 가 잡는다.
--   · 영업·전산 팀은 팀장이 2명이라 자동 결정이 안 되는 경우다 → 지정(APPROVER_MANUAL = 1)으로 둔다.
--   · 예산팀 팀원 → 예산팀장, 모든 팀장 → 영업부장(DEPT_HEAD), 영업부장 → 대표급, 대표급은 최상위(NULL).
-- -----------------------------------------------------------------------------
-- 영업부장(부장급) → 대표급
UPDATE USERS SET APPROVER_EMP_NO = '1473958' WHERE EMP_NO = '2674805';
-- 팀장 5명 → 영업부장
UPDATE USERS SET APPROVER_EMP_NO = '2674805' WHERE EMP_NO IN ('5047192', '5640327', '6295038', '8892046', '9026715');
-- 예산팀 팀원 → 예산팀장 (자동)
UPDATE USERS SET APPROVER_EMP_NO = '9026715' WHERE ROLE = '예산팀';
-- 영업팀·디자이너 → 영업팀장 이영업 (지정: 팀장이 2명)
UPDATE USERS SET APPROVER_EMP_NO = '5047192', APPROVER_MANUAL = 1 WHERE ROLE IN ('영업팀', '디자이너');
-- 전산팀 → 전산팀장 오전산 (지정: 팀장이 2명)
UPDATE USERS SET APPROVER_EMP_NO = '6295038', APPROVER_MANUAL = 1 WHERE ROLE = '전산팀';
