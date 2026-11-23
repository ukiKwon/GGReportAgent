-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (059) : 목표 태그 REGAIN(되찾기 도전) 추가 (정본 db/oracle/059_target_tag_regain.sql, 규칙은 정본 헤더)
-- ⚠️ 정본이 아니다. 멱등하지 않다 — 043 뒤 한 번만(INSERT 는 PK 위반). DDL 없음.
-- 이미 058 까지 적용한 DB: 이 파일만 한 번 돌리면 된다(앞 번호 재실행 불필요). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 되돌리기: UPDATE COMMON_CODE SET SORT_NO = 2 WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW'; DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'REGAIN';  (REGAIN 이력이 있으면 지우지 않는다)
-- -----------------------------------------------------------------------------
UPDATE COMMON_CODE SET SORT_NO = 3, UPDATED_AT = '2026-11-23T00:00:00+09:00' WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW';

-- [INSERT 블록 시작 — Oracle 059 와 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'REGAIN', '되찾기 도전', 2, 1, '2026-11-23T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
