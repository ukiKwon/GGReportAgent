--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (064) : 입찰 대상 BID_CASES.BID_SUBJECT_CD·BID_SUBJECT_ETC + 코드표 BID_SUBJECT (NEXT 125, 사용자 11-26)
-- 규칙(서비스가 지킨다 — CHECK·FK 없음):
--   BID_SUBJECT_CD -> COMMON_CODE(BID_SUBJECT). 기본값 MAIN_BANK — 기존 행은 이 ALTER 가 모두 MAIN_BANK 로 채운다(별도 UPDATE 없음).
--   BID_SUBJECT_ETC = BID_SUBJECT_CD 가 ETC 일 때만 쓰는 손 이름(1~50자). 그 밖은 NULL.
--   앱 POJO BidCase 에는 싣지 않는다(골든 10·14·25 고정) — 사전준비 응답에서만 내보낸다.
-- ⚠️ 063 뒤 한 번만(멱등하지 않다 — 칸·PK 중복). 적용 뒤 이 파일을 고치지 않는다(체크섬). 적용은 DBA.
-- ⚠️ 배포 순서: DB 먼저, 서버 나중(서버가 새 칸을 SELECT 한다 — 없으면 사전준비 목록·상세·현황판 500).
-- ⚠️ DB 권한(DBA): 변동 없음.
-- 확인: SELECT BID_SUBJECT_CD, COUNT(*) FROM BID_CASES GROUP BY BID_SUBJECT_CD;  -- MAIN_BANK 한 줄이어야 한다
-- 되돌리기(서버를 먼저 064 이전으로 되돌린 뒤): ALTER TABLE BID_CASES DROP (BID_SUBJECT_ETC); ALTER TABLE BID_CASES DROP (BID_SUBJECT_CD);
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'BID_SUBJECT';
--------------------------------------------------------------------------------

ALTER TABLE BID_CASES ADD (BID_SUBJECT_CD VARCHAR2(20 CHAR) DEFAULT 'MAIN_BANK' NOT NULL);
ALTER TABLE BID_CASES ADD (BID_SUBJECT_ETC VARCHAR2(50 CHAR));

-- [INSERT 블록 시작 — MySQL 064 와 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BID_SUBJECT', 'MAIN_BANK', '주거래은행·금고', 1, 1, '2026-11-26T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BID_SUBJECT', 'FUND_MGMT', '자금관리 금융기관', 2, 1, '2026-11-26T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BID_SUBJECT', 'CORP_CARD', '법인카드 사업자', 3, 1, '2026-11-26T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('BID_SUBJECT', 'ETC', '기타', 9, 1, '2026-11-26T00:00:00+09:00');
-- [INSERT 블록 끝 — 4행]
COMMIT;
