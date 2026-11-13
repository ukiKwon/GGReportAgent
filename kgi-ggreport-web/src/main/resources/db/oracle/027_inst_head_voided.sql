--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (027) : 빈 기관장 정리 상태(NEXT 77, 11-13 사용자 결정 가)
--   COMMON_CODE 2행: HEAD_STATUS 'VOIDED'(확정 값을 모두 무효 처리한 현 기관장을 내린 상태 — 이전 기관장 FORMER 와 구분)
--                    HEAD_EVENT  'HEAD_VOID'(INST_HEAD_LOG: HEAD_ID=새 현 머리, FROM_HEAD_ID=빈 머리)
-- 표 구조 변경 없음. 외래키 없음. ⚠️ 멱등하지 않다 — 026 이후 한 번만.
-- 되돌리기: mysql 027 머리말과 같다(VOIDED 머리가 있으면 지우지 말 것).
--------------------------------------------------------------------------------

-- [INSERT 블록 시작 — MySQL 027 과 글자 그대로 같아야 한다(InstHeadDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_STATUS', 'VOIDED', '빈 기관장(확정 값 모두 무효, 숨김)', 6, 1, '2026-11-13T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_EVENT', 'HEAD_VOID', '빈 기관장 정리', 17, 1, '2026-11-13T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
