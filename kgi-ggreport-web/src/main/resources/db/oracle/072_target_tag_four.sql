--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (072) : 목표 구분 4값 — 신규 입찰·신규 수의계약·재유치 입찰·재유치 수의계약 (입찰 현황판, 사용자 11-27, Q-2026-11-27-21~23)
-- 저장 = 한 칸 TAG_CD(코드 4개). RETAIN·NEW 는 코드 그대로 이름만 '재유치 입찰'·'신규 입찰'(사용자: RETAIN→재유치 입찰, NEW→신규 입찰 = 같은 뜻),
--   RETAIN_PRIVATE·NEW_PRIVATE 2행 추가, REGAIN(되찾기 도전)은 사용 안 함(ENABLED=0, 지우지 않음 — 옛 결재 항목·이력이 이름을 읽는다).
-- 옛 REGAIN 목표·관심 행은 모든 REV 를 NEW(신규 입찰)로 바꾸고(사용자: 되찾기 = 신규), 바꾼 행은 MIG072_TARGET_TAG 에
--   키·전·후·시각·실행자(APPLIED_BY)·근거(BASIS)·결재 번호·종류를 남긴다(= 시스템 이관 기록이자 되돌리기 원본). 결재 항목(INST_BID_TARGET_REQ_ITEM)은 바꾸지 않는다(요청 당시 문서).
--   결재 대기 중 REGAIN 항목은 승인 때 서버가 NEW 로 반영하고, 결재 문서 조회는 서버가 옛 REGAIN 을 NEW 로 같게 보아 '변경 없음'으로 낸다(TargetChangeService).
-- ⚠️ INST_BID_TARGET 은 앱 계정 SELECT·INSERT 전용(043) — 이 UPDATE 는 DBA 가 이 파일에서 한 번만. 앱 계정 권한은 바꾸지 않는다.
-- ⚠️ MIGRATED_AT 은 DB 시각(SYSDATE)에 +09:00 을 붙인다 — DB 시간대가 KST 라는 전제. 적용 전에 확인: SELECT SYSTIMESTAMP FROM DUAL;  (MySQL 미러는 SELECT @@time_zone;)
--   KST 가 아니면 MIGRATED_AT 이 틀린 시각으로 남는다 — 그때는 배포 장부에 실제 적용 시각을 적는다.
-- ⚠️ 이름 소급: 코드표 이름만 바꾸므로 072 이전 결재 문서·이력의 '재유치 도전'·'신규유치 도전'은 지금 '재유치 입찰'·'신규 입찰'로 보인다(코드 값은 그대로 — 표시만 바뀜).
--   옛 REGAIN 행도 이관 뒤 '신규 입찰'로 보이며 원래 값은 MIG072_TARGET_TAG 에만 있다.
-- 멱등하지 않다(CREATE·INSERT). 068 다음 한 번만. 069~071 과 의존 없음. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 문장 순서: ① REGAIN 사용 중지(새 REGAIN 이 더 못 들어오게) → ② 기록 표 → ③ 기록 INSERT → ④ 기록에 있는 행만 UPDATE → ⑤ 이름·새 코드 → ⑥ 사후 확인.
-- [적용 전 사전 조회 — 읽기 전용, 결과를 남겨 둔다]
--   A 코드표:   SELECT CODE, CODE_NAME, SORT_NO, ENABLED FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_TAG' ORDER BY SORT_NO;
--              → RETAIN·REGAIN·NEW 3행이고 RETAIN_PRIVATE·NEW_PRIVATE 가 없어야 한다(있으면 멈춘다 — PK 위반).
--   B 바뀔 행:  SELECT COUNT(*) FROM INST_BID_TARGET WHERE TAG_CD = 'REGAIN';   → 적용 뒤 MIG072_TARGET_TAG 행 수와 같아야 한다.
--   C 결재 대기: SELECT x.OP_CD, x.TAG_CD, COUNT(*) FROM INST_BID_TARGET_REQ_ITEM x JOIN APPROVAL_REQUEST r ON r.REQ_ID = x.REQ_ID
--               WHERE r.STATUS = 'PENDING' AND x.TAG_CD IS NOT NULL GROUP BY x.OP_CD, x.TAG_CD;   → REGAIN 이 있으면 결재자에게 알린다(승인 시 신규 입찰로 반영).
-- [배포 순서] ① 사전 조회 A~C ② 서버 중지 ③ 072 적용(DBA, 실제 실행 계정은 배포 장부에) ④ 사후 확인(맨 끝 SELECT 2개: 남은 REGAIN = 0, MIG072 행 수 = 사전 조회 B)
--   ⑤ 072 대응 서버 기동. 순서가 어긋나도 데이터는 안전하다(구 서버+072 = REGAIN 저장 400 / 새 서버+072 전 = 수의계약 코드 저장 400).
-- [되돌리기] (서버를 072 이전으로 먼저 되돌린 뒤, DBA)
--   UPDATE INST_BID_TARGET b SET TAG_CD = 'REGAIN' WHERE TAG_CD = 'NEW' AND EXISTS (SELECT 1 FROM MIG072_TARGET_TAG m
--     WHERE m.INSTITUTION_ID = b.INSTITUTION_ID AND m.TARGET_NO = b.TARGET_NO AND m.REV_NO = b.REV_NO);
--   UPDATE COMMON_CODE SET CODE_NAME = '재유치 도전', SORT_NO = 1 WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'RETAIN';
--   UPDATE COMMON_CODE SET CODE_NAME = '신규유치 도전', SORT_NO = 3 WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW';
--   UPDATE COMMON_CODE SET ENABLED = 1, SORT_NO = 2 WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'REGAIN';
--   수의계약 2코드: SELECT COUNT(*) FROM INST_BID_TARGET WHERE TAG_CD IN ('RETAIN_PRIVATE','NEW_PRIVATE'); (REQ_ITEM 도) 0 이면 DELETE, 아니면 ENABLED = 0 (이름은 남긴다).
--   DROP TABLE MIG072_TARGET_TAG;   (되돌리기 확인 뒤)
--   ⚠️ 되돌리기의 한계 1: 072 뒤 담당이 새로 만든 REV(NEW)는 기록 표에 없어 NEW 로 남는다 — 옛 REV 는 REGAIN, 새 REV 는 NEW 라 그 담당이 구분을 바꾼 것처럼 보인다.
--   ⚠️ 되돌리기의 한계 2: 수의계약 코드가 쓰였으면 ENABLED=0 으로만 남는다. 구 서버는 RETAIN_PRIVATE 를 '신규'로 세고(성과 판정), 수의계약 건을 다시 '입찰 없음' 409 로 막는다.
--------------------------------------------------------------------------------
UPDATE COMMON_CODE SET ENABLED = 0, SORT_NO = 9, UPDATED_AT = '2026-11-27T00:00:00+09:00' WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'REGAIN';

CREATE TABLE MIG072_TARGET_TAG (
    INSTITUTION_ID   VARCHAR2(64 CHAR)  NOT NULL,
    TARGET_NO        NUMBER(6)          NOT NULL,
    REV_NO           NUMBER(6)          NOT NULL,
    OLD_TAG_CD       VARCHAR2(20 CHAR)  NOT NULL,
    NEW_TAG_CD       VARCHAR2(20 CHAR)  NOT NULL,
    KIND_CD          VARCHAR2(10 CHAR),
    APPROVAL_REQ_ID  NUMBER(19),
    APPLIED_BY       VARCHAR2(20 CHAR)  NOT NULL,
    BASIS            VARCHAR2(40 CHAR)  NOT NULL,
    MIGRATED_AT      VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_MIG072_TARGET_TAG PRIMARY KEY (INSTITUTION_ID, TARGET_NO, REV_NO)
);
INSERT INTO MIG072_TARGET_TAG (INSTITUTION_ID, TARGET_NO, REV_NO, OLD_TAG_CD, NEW_TAG_CD, KIND_CD, APPROVAL_REQ_ID, APPLIED_BY, BASIS, MIGRATED_AT)
  SELECT INSTITUTION_ID, TARGET_NO, REV_NO, TAG_CD, 'NEW', KIND_CD, APPROVAL_REQ_ID, 'DBA-072', 'Q-2026-11-27-23', TO_CHAR(SYSDATE, 'YYYY-MM-DD"T"HH24:MI:SS') || '+09:00' FROM INST_BID_TARGET WHERE TAG_CD = 'REGAIN';
UPDATE INST_BID_TARGET b SET TAG_CD = 'NEW' WHERE b.TAG_CD = 'REGAIN' AND EXISTS (SELECT 1 FROM MIG072_TARGET_TAG m
    WHERE m.INSTITUTION_ID = b.INSTITUTION_ID AND m.TARGET_NO = b.TARGET_NO AND m.REV_NO = b.REV_NO);
UPDATE COMMON_CODE SET CODE_NAME = '재유치 입찰', SORT_NO = 1, UPDATED_AT = '2026-11-27T00:00:00+09:00' WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'RETAIN';
UPDATE COMMON_CODE SET CODE_NAME = '신규 입찰', SORT_NO = 3, UPDATED_AT = '2026-11-27T00:00:00+09:00' WHERE CODE_GROUP = 'TARGET_TAG' AND CODE = 'NEW';

-- [INSERT 블록 시작 — MySQL 072 와 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'RETAIN_PRIVATE', '재유치 수의계약', 2, 1, '2026-11-27T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'NEW_PRIVATE', '신규 수의계약', 4, 1, '2026-11-27T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;

-- 사후 확인: REMAINING_REGAIN 은 0, MIG072_ROWS 는 사전 조회 B 와 같아야 한다.
SELECT COUNT(*) AS REMAINING_REGAIN FROM INST_BID_TARGET WHERE TAG_CD = 'REGAIN';
SELECT COUNT(*) AS MIG072_ROWS FROM MIG072_TARGET_TAG;
