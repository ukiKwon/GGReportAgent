--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (063) : 목표 기관 '금고 방식' — INST_BID_TARGET.AIM_RANK_CD·결재 항목 AIM_RANK_CD·코드표 TARGET_AIM_RANK,
--   그리고 구분(INST_BID_TARGET.TAG_CD)을 비워 둘 수 있게(NULL 허용)  (NEXT 114, 사용자 11-25)
-- 규칙(서비스가 지킨다 — CHECK·FK 없음):
--   AIM_RANK_CD -> COMMON_CODE(TARGET_AIM_RANK). NULL = '-'(아직 안 정함). 목표(GOAL)에서만 정한다(관심에 값을 보내면 400, 목표에서 옮겨 온 값은 둔다).
--   목표로 처음 넣을 때(ADD)는 비운다 — 비어 있지 않으면 400. 넣은 뒤 표에서 고른다. 고르기·바꾸기·지우기 모두 구분 태그처럼 결재 없이
--   바로(행 REV 로 이력), 단 지난해 목표는 결재. 목표↔관심 옮기기·자동 이월은 값을 이어받고, ♥ 다시 켜기는 비운다.
--   코드 글자는 BANK_RANK(039·041)의 FIRST·SECOND·SINGLE 과 같게 둔다(실제 약정 순위와 견주기 위해). MAIN_BANK 는 이 그룹에만.
--   MEMO 칸은 지우지 않는다(옛 기록·이력 보존). 고치기 본문에 memo·aim_rank_cd 가 없으면 서버가 지금 값을 잇는다.
-- INST_BID_TARGET_REQ_ITEM.AIM_RANK_CD = EDIT 결재 항목이 승인 때 쓸 값(요청 때 스냅샷 — 승인 때 금고 방식이 지워지지 않게). ADD 는 항상 NULL.
-- INST_BID_TARGET.TAG_CD = NULL 허용(구분 '-'). 결재 항목 TAG_CD 는 056 부터 이미 NULL 허용이라 바꾸지 않는다.
-- 기존 행 채우기 없음(옛 메모에서 값을 추측해 옮기지 않는다).
-- ⚠️ 062 뒤 한 번만(멱등하지 않다 — MODIFY NULL 은 이미 NULL 허용이면 ORA-01451). 적용 뒤 이 파일을 고치지 않는다(체크섬).
-- ⚠️ DB 권한(DBA): 변동 없음(두 표 앱 계정 SELECT·INSERT 그대로).
-- 되돌리기(코드를 먼저 063 이전으로 되돌린 뒤): ALTER TABLE INST_BID_TARGET DROP (AIM_RANK_CD); ALTER TABLE INST_BID_TARGET_REQ_ITEM DROP (AIM_RANK_CD);
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_AIM_RANK';
--   (값이 든 행이 있으면 칸을 지우는 순간 기록이 사라진다 — 먼저 SELECT COUNT(*) FROM INST_BID_TARGET WHERE AIM_RANK_CD IS NOT NULL. 코드만 끄려면 ENABLED=0)
--   TAG_CD 를 다시 NOT NULL 로: 먼저 SELECT COUNT(*) FROM INST_BID_TARGET WHERE TAG_CD IS NULL 이 0 이어야 한다(아니면 구분을 채운 뒤) → ALTER TABLE INST_BID_TARGET MODIFY (TAG_CD NOT NULL);
--------------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET ADD (AIM_RANK_CD VARCHAR2(20 CHAR));
ALTER TABLE INST_BID_TARGET_REQ_ITEM ADD (AIM_RANK_CD VARCHAR2(20 CHAR));
ALTER TABLE INST_BID_TARGET MODIFY (TAG_CD NULL);

-- [INSERT 블록 시작 — MySQL 063 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_AIM_RANK', 'FIRST', '1금고', 1, 1, '2026-11-25T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_AIM_RANK', 'SECOND', '2금고', 2, 1, '2026-11-25T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_AIM_RANK', 'SINGLE', '단수금고', 3, 1, '2026-11-25T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_AIM_RANK', 'MAIN_BANK', '주거래', 4, 1, '2026-11-25T00:00:00+09:00');
-- [INSERT 블록 끝 — 4행]
COMMIT;
