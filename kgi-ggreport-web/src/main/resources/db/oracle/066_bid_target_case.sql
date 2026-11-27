--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (066) : 목표 = 입찰 건(NEXT 125, 사용자 11-26) — INST_BID_TARGET 입찰 대상·공고 연결·기타 금고 방식 이름, 결재 항목 키 = 건
-- 업무 키(서비스가 지킨다): 기관 + BID_SUBJECT_CD(ETC 는 NFKC 정규화 이름) + AIM_RANK_CD(금고 순위) + TARGET_YEAR.
--   같은 (기관·연도·대상)에 살아 있는 목표 건 1개 — 스위치 ggreport.bid-target.multi-subject 가 켜졌을 때만 MAIN_BANK 1금고+2금고 두 건.
--   AIM_RANK_CD 는 MAIN_BANK 건에만(그 밖 NULL = 해당 없음). 관심(WATCH) 행 = MAIN_BANK·이름 없음·연결 없음.
--   BID_CASE_ID = 이은 공고·건. 제안 확정 때 새 REV 로 적고, 확정 취소·중단·관심으로 옮기기·빼기 때 비우는 REV 를 남긴다(추가 전용).
--   한 공고 건은 살아 있는 목표 건 하나에만 이어진다(서비스 409 CASE_LINKED).
--   결재 중 잠금 = 건 단위(TARGET_NO) + 칸 단위 키 보호(결재 중 항목이 건드리는 연도·대상 칸의 키 변경 409 SLOT_PENDING).
--   AIM_RANK_CD 코드 = TARGET_AIM_RANK(FIRST·SECOND·SINGLE·MAIN_BANK·OTHER). OTHER(기타)면 AIM_RANK_ETC(1~30자, NFKC 정규화 값)가 필수, 그 밖은 NULL.
--   기타는 같은 칸(연도·대상)에 혼자 — 함께 둘 수 있는 것은 1금고+2금고 짝뿐(스위치 켜짐). 정렬은 SORT_NO(기타 5), 정하지 않음은 서버가 맨 뒤.
--   INST_BID_TARGET_REQ_ITEM.AIM_RANK_ETC = 요청 때 고른 기타 이름(EDIT·ADD 스냅샷).
--   COMMON_CODE 1행: TARGET_AIM_RANK 'OTHER' '기타' SORT_NO 5.
--   기존 행: DEFAULT 로 MAIN_BANK·연결 없음·기타 이름 없음 — 금고 방식(063)은 그대로 금고 순위가 된다(없으면 미정). 별도 UPDATE 백필 없음.
--   옛 제안과의 연결은 서버가 읽을 때 추정한다(데이터 쓰기 없음).
-- INST_BID_TARGET_REQ_ITEM: PK (REQ_ID, INSTITUTION_ID) → (REQ_ID, ITEM_NO) — 한 요청에 같은 기관의 여러 건. ITEM_NO 는 요청 안 1..20 연속(기존 행도 유일).
--   BID_SUBJECT_CD·BID_SUBJECT_ETC = 요청 때 건의 대상 스냅샷(ADD·TO_GOAL 은 반영할 값). 기존 행은 DEFAULT MAIN_BANK(옛 의미와 같음).
-- ⚠️ 065 뒤 한 번만(멱등하지 않다). 적용 뒤 이 파일을 고치지 않는다(체크섬 — 이 헤더는 적용 전에 확정한다). 적용은 DBA.
-- ⚠️ [필수] 적용 직전 조회 — 0 줄이 아니면 적용하지 않는다:
--     SELECT REQ_ID, ITEM_NO, COUNT(*) FROM INST_BID_TARGET_REQ_ITEM GROUP BY REQ_ID, ITEM_NO HAVING COUNT(*) > 1;
-- ⚠️ [필수] 앱 서버를 멈춘 창에서 적용한다. Oracle DDL 은 문장마다 커밋된다 — DROP CONSTRAINT 뒤 ADD CONSTRAINT 가 실패하면 PK 없는 표로 남는다.
--     그때는 원인(중복)을 지우고 바로 다시 ADD CONSTRAINT PK_IBT_REQ_ITEM PRIMARY KEY (REQ_ID, ITEM_NO) 를 실행한 뒤 서버를 올린다.
--     PK 가 DBA 가 따로 만든 색인을 쓰고 있으면 DROP CONSTRAINT PK_IBT_REQ_ITEM DROP INDEX 로 지운다.
-- ⚠️ 배포 순서: DB 먼저, 서버 나중. 옛 서버는 같은 기관 두 항목을 막으므로(DUP_INST) 새 PK 에서도 그대로 돈다.
-- ⚠️ DB 권한(DBA): 변동 없음(두 표 앱 계정 SELECT·INSERT 그대로).
-- 확인: SELECT BID_SUBJECT_CD, COUNT(*) FROM INST_BID_TARGET GROUP BY BID_SUBJECT_CD;  -- MAIN_BANK 한 줄
-- 되돌리기(서버를 먼저 066 이전으로, 1708 5절 점검 쿼리 ①②③과 ④가 모두 0 일 때만, 서버 정지 창에서):
--   옛 PK 복원 전 점검 — 0 줄일 때만 복원한다(한 요청에 같은 기관 두 건이 있으면 PK 가 깨진다):
--     SELECT REQ_ID, INSTITUTION_ID, COUNT(*) FROM INST_BID_TARGET_REQ_ITEM GROUP BY REQ_ID, INSTITUTION_ID HAVING COUNT(*) > 1;
--   ALTER TABLE INST_BID_TARGET_REQ_ITEM DROP CONSTRAINT PK_IBT_REQ_ITEM;
--   ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD CONSTRAINT PK_IBT_REQ_ITEM PRIMARY KEY (REQ_ID, INSTITUTION_ID);
--   ALTER TABLE INST_BID_TARGET_REQ_ITEM DROP (AIM_RANK_ETC, BID_SUBJECT_ETC, BID_SUBJECT_CD);
--   DROP INDEX IDX_IBT_CASE; ALTER TABLE INST_BID_TARGET DROP (AIM_RANK_ETC, BID_CASE_ID, BID_SUBJECT_ETC, BID_SUBJECT_CD);
--   기타 값이 든 행이 있으면 먼저 SELECT COUNT(*) FROM INST_BID_TARGET WHERE AIM_RANK_CD = 'OTHER' 확인 후
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_AIM_RANK' AND CODE = 'OTHER';
--   (운영에서는 서버만 되돌리고 칸은 두는 것을 권장)
--------------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET ADD (BID_SUBJECT_CD VARCHAR2(20 CHAR) DEFAULT 'MAIN_BANK' NOT NULL);
ALTER TABLE INST_BID_TARGET ADD (BID_SUBJECT_ETC VARCHAR2(50 CHAR));
ALTER TABLE INST_BID_TARGET ADD (BID_CASE_ID VARCHAR2(64 CHAR));
ALTER TABLE INST_BID_TARGET ADD (AIM_RANK_ETC VARCHAR2(30 CHAR));
CREATE INDEX IDX_IBT_CASE ON INST_BID_TARGET (BID_CASE_ID);
ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD (BID_SUBJECT_CD VARCHAR2(20 CHAR) DEFAULT 'MAIN_BANK' NOT NULL);
ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD (BID_SUBJECT_ETC VARCHAR2(50 CHAR));
ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD (AIM_RANK_ETC VARCHAR2(30 CHAR));
ALTER TABLE INST_BID_TARGET_REQ_ITEM DROP CONSTRAINT PK_IBT_REQ_ITEM;
ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD CONSTRAINT PK_IBT_REQ_ITEM PRIMARY KEY (REQ_ID, ITEM_NO);

-- [INSERT 블록 시작 — MySQL 066 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_AIM_RANK', 'OTHER', '기타', 5, 1, '2026-11-26T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
