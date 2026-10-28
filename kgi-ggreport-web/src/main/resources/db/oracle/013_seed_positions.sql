-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — 시드 (013) : 가상 사용자의 직위를 회사 직급 체계로 맞춘다 (009·011 이후)
--
-- 직급: 계장 < 대리 < 과장 < 차장 < 수석차장 < 팀장 < 부장 < 대표 (팀장 아래는 모두 '팀원'급).
-- ⚠️ 가상 데이터. 멱등하다(몇 번 돌려도 같다).
-- -----------------------------------------------------------------------------
UPDATE USERS SET POSITION_TITLE = '팀장' WHERE ROLE IN ('영업팀장', '전산팀장', '예산팀장');
UPDATE USERS SET POSITION_TITLE = '부장' WHERE EMP_NO = '2674805';
UPDATE USERS SET POSITION_TITLE = '대표' WHERE EMP_NO = '1473958';
UPDATE USERS SET POSITION_TITLE = '계장' WHERE POSITION_TITLE = '사원';
UPDATE USERS SET POSITION_TITLE = '과장' WHERE EMP_NO = '8203417';
