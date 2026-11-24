--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (061) : 관심 기관을 사람별로 — INST_BID_TARGET.WATCH_EMP_NO (사용자 11-24 Q-90·91, NEXT 117)
-- 규칙(서비스가 지킨다 — CHECK·UNIQUE·FK 없음):
--   KIND_CD='WATCH' 행 = WATCH_EMP_NO(주인 사번) 필수, 'GOAL' 행 = NULL. 관심은 사람마다 기관당 1개(서비스 409 ALREADY_WATCH).
--   관심과 목표는 서로 막지 않는다(044 의 '한 기관은 관심 또는 목표 하나' 규칙을 대체). 주인만 고치고 옮기고 뺀다(403 NOT_WATCH_OWNER).
--   관심 기록의 존재(기관별 이름·수)는 모두에게 보이고(GET /watchers), 켜고 끄는 것(♥)은 내 것만이다.
--   OWNER_EMP_NO(주 담당)와 다른 칸이다.
-- 기존 행 채우기: 관심 행마다 그 기록 REV 1 의 결재 요청자(있으면) 또는 입력자 = 처음 넣은 사람.
-- ⚠️ 060 뒤 한 번만(멱등하지 않다). 적용 뒤 이 파일을 고치지 않는다(체크섬).
-- ⚠️ DB 권한(DBA): UPDATE 는 이 스크립트(소유 계정)만. 앱 계정 권한 변동 없음(INST_BID_TARGET SELECT·INSERT 만).
-- 되돌리기(코드를 먼저 061 이전으로 되돌린 뒤): DROP INDEX IDX_IBT_WATCH; ALTER TABLE INST_BID_TARGET DROP (WATCH_EMP_NO);
--   (옛 코드는 사람별 관심을 다시 팀 공용으로 읽는다 — 한 기관에 관심이 여럿이면 옛 겹침 규칙(409)에 걸릴 수 있다)
-- 적용 뒤 검사(맨 끝 SELECT): NULL_WATCH_OWNER 는 0 이어야 한다. 0 이 아니면 주인 없는 관심(누구에게도 안 보이고 403)이 있다는 뜻이므로
--   DBA 가 그 행들(REV 1 이 없거나 요청자·입력자가 비어 있음)의 WATCH_EMP_NO 를 손으로 배정한 뒤 다시 확인한다.
--------------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET ADD (WATCH_EMP_NO VARCHAR2(7 CHAR));
CREATE INDEX IDX_IBT_WATCH ON INST_BID_TARGET (WATCH_EMP_NO, KIND_CD);

UPDATE INST_BID_TARGET b
   SET WATCH_EMP_NO = (SELECT MAX(COALESCE(ri.REQUESTER_EMP_NO, f.EDITOR_EMP_NO))
                         FROM INST_BID_TARGET f
                         LEFT JOIN INST_BID_TARGET_REQ_ITEM ri ON ri.REQ_ID = f.APPROVAL_REQ_ID AND ri.INSTITUTION_ID = f.INSTITUTION_ID
                        WHERE f.INSTITUTION_ID = b.INSTITUTION_ID AND f.TARGET_NO = b.TARGET_NO AND f.REV_NO = 1)
 WHERE b.KIND_CD = 'WATCH';
COMMIT;

SELECT COUNT(*) AS NULL_WATCH_OWNER FROM INST_BID_TARGET WHERE KIND_CD = 'WATCH' AND WATCH_EMP_NO IS NULL;
