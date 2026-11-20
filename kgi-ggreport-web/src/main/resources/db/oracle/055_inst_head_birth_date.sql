--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (055) : 기관장 정보 '생년월일' 칸 코드(HEAD_FIELD.BIRTH_DATE) 1행
--   새 표·컬럼 없음 — 값은 INST_HEAD_ITEM.VAL_DATE(YYYY-MM-DD)에 담는다. 서버는 이 코드 행을 읽지 않는다(표시·문서용).
-- 규칙(서버): 상세(A3)에서만 내보낸다. 목록(A1)·내보내기·Word 에는 없다. 범위 1920-01-01 ~ 서울 오늘-18년. 민감정보 칸 없음(사용자 결정 2026-11-19).
-- ⚠️ 멱등하지 않다. 026 이후 한 번만(사이 번호와 표가 겹치지 않는다).
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP='HEAD_FIELD' AND CODE='BIRTH_DATE';
--   (값이 쌓인 뒤에는 INST_HEAD_ITEM 의 FIELD_CD='BIRTH_DATE' 행을 VOIDED 로 정리해야 한다 — 행을 지우지 않는 규칙)
--------------------------------------------------------------------------------

-- [INSERT 블록 시작 — MySQL 055 와 글자 그대로 같아야 한다(InstHeadDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('HEAD_FIELD', 'BIRTH_DATE', '생년월일', 9, 1, '2026-11-19T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
