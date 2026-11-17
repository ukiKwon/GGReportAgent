-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (041) : 금고 순위 SINGLE(단수 금고) 추가
-- ⚠️ 정본이 아니다. 정본은 db/oracle/041_bank_rank_single.sql. 039 뒤 한 번만(멱등하지 않다). DDL 없음.
-- 이미 039·040 까지 적용한 DB: 이 파일만 한 번 더 돌리면 된다(앞 번호 재실행 불필요). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'BANK_RANK' AND CODE = 'SINGLE';  (RANK_CD='SINGLE' 이력이 있으면 지우지 않는다)
-- -----------------------------------------------------------------------------

-- [INSERT 블록 시작 — Oracle 041 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BANK_RANK', 'SINGLE', '단수 금고', 5, 1, '2026-11-17T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
