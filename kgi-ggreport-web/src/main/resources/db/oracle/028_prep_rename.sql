--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (028) : 사전준비 영업부장 승인 이름 '기획승인' → '사전준비 승인'(사용자 11-13)
--   진행 현황 5번 게이트 '기획승인'과 다른 승인이라 이름을 나눈다. 코드값은 그대로, COMMON_CODE 이름 4행만.
-- 멱등(UPDATE). 024 이후 실행. 이미 상신된 결재 제목·지난 이력 비고는 바꾸지 않는다(감사 기록).
-- 되돌리기: mysql 028 머리말과 같다.
--------------------------------------------------------------------------------

UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 중', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_STATE' AND CODE = 'APPROVAL_PENDING';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 요청', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_SUBMIT';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인 요청 회수', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_WITHDRAW';
UPDATE COMMON_CODE SET CODE_NAME = '사전준비 승인', UPDATED_AT = '2026-11-13T00:00:00+09:00' WHERE CODE_GROUP = 'PREP_EVENT' AND CODE = 'PLAN_APPROVE';
COMMIT;
