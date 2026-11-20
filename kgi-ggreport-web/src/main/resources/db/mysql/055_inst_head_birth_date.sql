-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (055) : HEAD_FIELD.BIRTH_DATE 코드 1행 (새 표·컬럼 없음)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/055_inst_head_birth_date.sql (규칙·되돌리기는 정본 헤더).
-- ⚠️ 멱등하지 않다 — 026 적용 후 한 번만. (이미 051·052 등까지 적용한 DB 는 이 파일만 이어서 실행한다. 사이 번호와 무관)
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP='HEAD_FIELD' AND CODE='BIRTH_DATE';
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

-- [INSERT 블록 시작 — Oracle 055 와 글자 그대로 같아야 한다(InstHeadDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_FIELD', 'BIRTH_DATE', '생년월일', 9, 1, '2026-11-19T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
