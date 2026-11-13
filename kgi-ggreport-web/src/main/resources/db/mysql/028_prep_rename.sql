-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (028) : 사전준비 영업부장 승인 이름 '기획승인' → '사전준비 승인'(사용자 11-13)
--   진행 현황 5번 게이트 '기획승인'과 다른 승인이라 이름을 나눈다. 코드값은 그대로, COMMON_CODE 이름 4행만.
-- ⚠️ 정본이 아니다. 정본은 db/oracle/028_prep_rename.sql. 멱등(UPDATE). 024 이후 실행.
-- 되돌리기: 같은 UPDATE 에 옛 이름('기획승인 중'·'기획승인 요청'·'기획승인 요청 회수'·'기획승인').
-- -----------------------------------------------------------------------------

UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 중', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_STATE' AND CODE = 'APPROVAL_PENDING';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 요청', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_SUBMIT';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 요청 회수', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_WITHDRAW';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_APPROVE';
