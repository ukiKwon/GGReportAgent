--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (044) : 목표 기관 표(043)에 구분 KIND_CD(GOAL 목표 / WATCH 관심) 추가, 관심은 연도 없음 (2026-11-17)
-- 규칙(서비스가 지킨다 — CHECK·UNIQUE·FK 없음):
--   KIND_CD = 'GOAL'(목표, TARGET_YEAR 필수, 넣기·연도 바꾸기는 올해~+2) | 'WATCH'(관심, TARGET_YEAR NULL). 기존 행은 DEFAULT 로 'GOAL'.
--   한 기관의 '현재' 기록(관심, 또는 올해 이후 목표)은 목표·관심으로 겹치지 않는다(서비스 409 ALREADY_GOAL·ALREADY_WATCH). 관심은 기관당 1개.
--     목표끼리는 043 그대로 — 같은 해만 막고(DUP_TARGET) 다른 해는 함께 둘 수 있다. 지난해 목표는 겹침 판정에서 뺀다.
--   옮기기(목표↔관심) = 같은 TARGET_NO 의 새 REV 한 행, ACTION_CD='MOVE'(서버가 정함). 살아 있음 = 최대 REV 의 ACTION_CD <> 'CANCEL'.
-- ⚠️ 043 뒤 한 번만(멱등하지 않다). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬). DB 권한 변동 없음(INST_BID_TARGET 은 SELECT·INSERT 만).
-- 되돌리기(코드를 먼저 044 이전으로 되돌린 뒤): DROP INDEX IDX_IBT_KIND; ALTER TABLE INST_BID_TARGET DROP COLUMN KIND_CD;
--   TARGET_YEAR 는 NULL 허용으로 둔다(관심 행이 있으면 NOT NULL 로 못 돌린다 — 운영에서 행을 지우지 않는다).
--------------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET ADD (KIND_CD VARCHAR2(10 CHAR) DEFAULT 'GOAL' NOT NULL);
ALTER TABLE INST_BID_TARGET MODIFY (TARGET_YEAR NULL);
CREATE INDEX IDX_IBT_KIND ON INST_BID_TARGET (KIND_CD, INSTITUTION_ID);
