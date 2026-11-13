-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (027) : 빈 기관장 정리 상태(NEXT 77, 11-13 사용자 결정 가)
--   COMMON_CODE 2행: HEAD_STATUS 'VOIDED' · HEAD_EVENT 'HEAD_VOID'. 표 구조는 바꾸지 않는다.
-- ⚠️ 정본이 아니다. 정본은 db/oracle/027_inst_head_voided.sql.
-- 외래키 없음. ⚠️ 멱등하지 않다(PK 중복) — 026 적용 후 한 번만. (이미 026 까지 적용한 DB 는 이 파일만 이어서 실행한다)
-- 이 파일 없이 서버를 먼저 올려도 동작은 같다(상태·이벤트 코드는 코드표로 검사하지 않는다) — 코드 이름 표시용.
-- 되돌리기: DELETE FROM COMMON_CODE WHERE (CODE_GROUP='HEAD_STATUS' AND CODE='VOIDED') OR (CODE_GROUP='HEAD_EVENT' AND CODE='HEAD_VOID');
--   (이미 VOIDED 로 내려간 머리가 있으면 지우지 말 것 — 코드 이름만 사라진다)
-- -----------------------------------------------------------------------------

-- [INSERT 블록 시작 — Oracle 027 과 글자 그대로 같아야 한다(InstHeadDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_STATUS', 'VOIDED', '빈 기관장(확정 값 모두 무효, 숨김)', 6, 1, '2026-11-13T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_EVENT', 'HEAD_VOID', '빈 기관장 정리', 17, 1, '2026-11-13T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
