--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (059) : 목표 태그 '되찾기 도전' REGAIN 추가 (입찰 현황판, 2026-11-23)
-- 지금 금고에 국민은행이 없고 약정 기록에 국민은행 이력이 있는 기관(last_kb_year < 올해)에 쓰는 태그. 표시 순서 재유치1·되찾기2·신규3.
-- 043 뒤 한 번만(멱등 아님: UPDATE 는 다시 돌려도 같지만 INSERT 는 PK 위반). DDL 없음. 기존 INST_BID_TARGET 행은 건드리지 않는다(NEW 목표는 NEW 그대로).
-- 043 은 적용된 파일이라 고치지 않는다(체크섬). DB 권한(DBA): COMMON_CODE UPDATE 가 필요하다(이 파일 한 번뿐, 적용 계정이 DBA 면 앱 계정 권한 변동 없음).
-- 되돌리기(코드를 먼저 059 이전으로 되돌린 뒤): UPDATE COMMON_CODE SET SORT_NO = 2 WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW';
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'REGAIN';
--   ⚠️ TAG_CD='REGAIN' 인 목표·결재 항목이 있으면 지우지 않는다(참조 끊김). 먼저 SELECT COUNT(*) FROM INST_BID_TARGET WHERE TAG_CD='REGAIN'; 그리고 INST_BID_TARGET_REQ_ITEM 도.
--------------------------------------------------------------------------------
UPDATE COMMON_CODE SET SORT_NO = 3, UPDATED_AT = '2026-11-23T00:00:00+09:00' WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW';

-- [INSERT 블록 시작 — MySQL 059 와 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'REGAIN', '되찾기 도전', 2, 1, '2026-11-23T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
