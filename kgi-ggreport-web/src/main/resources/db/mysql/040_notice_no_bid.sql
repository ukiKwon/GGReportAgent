-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (040) : 공고 상태 NO_BID 추가
-- ⚠️ 정본이 아니다. 정본은 db/oracle/040_notice_no_bid.sql. 037 뒤 한 번만(멱등하지 않다). DDL 없음.
-- 되돌리기: DELETE FROM COMMON_CODE WHERE (CODE_GROUP = 'NOTICE_STATUS' AND CODE = 'NO_BID') OR (CODE_GROUP = 'NOTICE_ROUND_CLOSE' AND CODE = 'NO_BID');
-- -----------------------------------------------------------------------------

-- [INSERT 블록 시작 — Oracle 040 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('NOTICE_STATUS', 'NO_BID', '입찰 없음(연장·지정)', 4, 1, '2026-11-16T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('NOTICE_ROUND_CLOSE', 'NO_BID', '입찰 없이 약정 연장·재지정', 3, 1, '2026-11-16T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
