--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (040) : 공고 상태 '입찰 없음(연장·지정)' NO_BID 추가 (NEXT 30 2단계 보강, 2026-11-16)
-- 기관이 입찰 없이 지금 은행과 약정을 연장하거나 그대로 다시 지정해 공고가 안 나는 경우. 이 판정을 저장하면 서버가 그 회차를 바로 닫는다(CLOSE_REASON_CD = NO_BID).
-- 037 은 이미 적용된 파일이라 고치지 않는다. 이 파일은 COMMON_CODE INSERT 만 한다(DDL 없음).
-- 037 뒤 한 번만. ⚠️ 멱등하지 않다(PK 위반).
-- 되돌리기: DELETE FROM COMMON_CODE WHERE (CODE_GROUP = 'NOTICE_STATUS' AND CODE = 'NO_BID') OR (CODE_GROUP = 'NOTICE_ROUND_CLOSE' AND CODE = 'NO_BID');
--   ⚠️ NO_BID 로 저장된 이력(STATUS_CD)이 있으면 지우지 않는다 — 참조가 끊긴다(integrity_check 의 NOTICE_STATUS 참조 검사가 잡는다).
--------------------------------------------------------------------------------

-- [INSERT 블록 시작 — MySQL 040 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('NOTICE_STATUS', 'NO_BID', '입찰 없음(연장·지정)', 4, 1, '2026-11-16T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('NOTICE_ROUND_CLOSE', 'NO_BID', '입찰 없이 약정 연장·재지정', 3, 1, '2026-11-16T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
