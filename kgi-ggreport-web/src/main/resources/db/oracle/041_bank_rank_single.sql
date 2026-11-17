--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (041) : 금고 순위 '단수 금고' SINGLE 추가 (NEXT 89, 2026-11-17)
-- 지자체·교육청에서 한 은행이 금고 전체를 맡는 형태(1금고도 2금고도 아닌 혼합형). 서비스 규칙: 지자체·교육청 허용 순위 = FIRST·SECOND·SINGLE,
--   SINGLE 은 같은 기관의 유효한 FIRST·SECOND·SINGLE 줄과 기간이 겹치면 409 DUP_RANK(확인 후 저장 가능), 그 밖(법원·공공기관 등)은 400.
-- 039 는 이미 적용된 파일이라 고치지 않는다(체크섬). 이 파일은 COMMON_CODE INSERT 한 줄뿐이다(DDL 없음).
-- 039 뒤 한 번만. ⚠️ 멱등하지 않다(PK 위반).
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'BANK_RANK' AND CODE = 'SINGLE';
--   ⚠️ RANK_CD='SINGLE' 인 약정 이력이 있으면 지우지 않는다 — 참조가 끊긴다(먼저 SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE RANK_CD = 'SINGLE').
--------------------------------------------------------------------------------

-- [INSERT 블록 시작 — MySQL 041 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BANK_RANK', 'SINGLE', '단수 금고', 5, 1, '2026-11-17T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
