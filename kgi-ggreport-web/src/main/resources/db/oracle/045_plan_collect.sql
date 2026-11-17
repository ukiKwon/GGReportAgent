--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (045) : 사업계획 수집 요청 PLAN_COLLECT_REQ · PLAN_COLLECT_REQUESTER (+ COMMON_CODE PLAN_ACTION 7행) (2026-11-17)
-- 흐름: 영업부서·개발부서가 기관 사업계획 화면에서 [수집 요청] → 기관 단위로 묶임(열린 요청 1건 + 요청자 덧붙임) → 개발부서 처리 화면에서
--   목록 내려받기·'수집 중' 표시(수동) 또는 시험용 agent 호출 → 그 기관에 수집 반입(IMPORT) 판이 생기면 서버가 '반영됨'으로 닫는다(SEED 는 세지 않는다).
-- 상태 STATUS_CD: REQUESTED(요청됨) → RUNNING(수집 중·반입 대기) → APPLIED(반영됨) | FAILED(실패) | CANCELED(취소됨) | EXCLUDED(제외됨).
--   닫힌 행은 다시 열지 않는다(새 요청 = 새 REQ_SEQ). agent 호출 자체가 실패하면 RUNNING → REQUESTED 로 되돌리고 RUN_RESULT_CD 에 남긴다.
-- 기관당 열린 요청 1건: OPEN_INST_ID = 열린 동안 INSTITUTION_ID, 닫히면 NULL. 단일 칸 UNIQUE(UQ_PCR_OPEN)는 NULL 을 여럿 허용하므로
--   '열린 것만 유일'이 된다(함수 기반 인덱스 없이 11g·MySQL·H2 공통). 서비스가 INSTITUTIONS 행 FOR UPDATE 로 먼저 직렬화하고, 이 제약은 마지막 방어선(409).
-- REQ_SEQ = 기관 안 1,2,3…(잠금 아래 MAX+1). REQ_KEY = 서버가 만든 UUID — 화면·내보내기·agent 에 쓰는 식별자. DB 번호는 밖에 내보내지 않는다.
-- PREV_DOMAINS(요청 시점)·RUN_DOMAINS(실행 시점) = 그 기관 최신 판 INST_PLAN_DOC.SRC_URL 의 호스트(소문자, 앞 'www.' 제거)를 쉼표로 이은 값(최대 5개).
-- 참조(서비스가 확인): INSTITUTION_ID -> INSTITUTIONS, *_BY·EMP_NO -> USERS, APPLIED_IMPORT_ID -> INST_PLAN_IMPORT.
-- 감사는 034 INST_PLAN_ACT(PLAN_ACTION COLLECT_*)가 맡는다(화면·버튼은 서버 고정값 PlanUiIds).
-- ⚠️ 사번은 X-Emp-No 자기신고일 수 있다(*_VERIFIED=0). '검증됨'으로 표시하지 않는다.
-- ⚠️ CLOSE_REASON 은 개발부서가 적는 자유 글(100자) — 서버가 개인정보(전화·주민번호·이메일 등)를 거른다. 망 밖으로 보내지 않는다.
-- ⚠️ DB 권한(DBA): 두 표 SELECT·INSERT + 칸 단위 UPDATE, DELETE 없음.
--   PLAN_COLLECT_REQ: STATUS_CD, OPEN_INST_ID, RUN_MODE, RUN_BY, RUN_AT, RUN_VERIFIED, RUN_DOMAINS, RUN_RESULT_CD, JOB_ID, APPLIED_IMPORT_ID, CLOSED_AT, CLOSED_BY, CLOSE_REASON
--   PLAN_COLLECT_REQUESTER: REQUESTED_AT, EMP_VERIFIED, CANCELED_AT
-- 11g 호환: IDENTITY·행 수 제한 구문·CHECK·외래키 없음(UNIQUE 제약은 11g 에서 쓸 수 있다).
-- ⚠️ 멱등하지 않다. 016·034 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE PLAN_COLLECT_REQUESTER; DROP TABLE PLAN_COLLECT_REQ;
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP='PLAN_ACTION' AND CODE IN ('COLLECT_REQUEST','COLLECT_CANCEL','COLLECT_EXPORT','COLLECT_RUN','COLLECT_EXCLUDE','COLLECT_FAIL','COLLECT_APPLY');
--------------------------------------------------------------------------------

CREATE TABLE PLAN_COLLECT_REQ (                      -- 기관 단위 요청 1건
    INSTITUTION_ID    VARCHAR2(64 CHAR)  NOT NULL,
    REQ_SEQ           NUMBER(6)          NOT NULL,   -- 기관 안 1부터
    REQ_KEY           VARCHAR2(36 CHAR)  NOT NULL,   -- UUID(서버 생성)
    STATUS_CD         VARCHAR2(20 CHAR)  NOT NULL,   -- REQUESTED/RUNNING/APPLIED/FAILED/CANCELED/EXCLUDED
    OPEN_INST_ID      VARCHAR2(64 CHAR),             -- 열린 동안 = INSTITUTION_ID, 닫히면 NULL
    PREV_DOMAINS      VARCHAR2(300 CHAR),            -- 요청 시점 이전 출처 도메인(쉼표)
    REQUESTED_BY      VARCHAR2(7 CHAR)   NOT NULL,   -- 처음 요청자
    REQUESTED_AT      VARCHAR2(40 CHAR)  NOT NULL,   -- Times.nowIso
    REQ_VERIFIED      NUMBER(1)          DEFAULT 0 NOT NULL,
    RUN_MODE          VARCHAR2(10 CHAR),             -- MANUAL(내보내기 뒤 수동 표시) | AGENT(시험용 직접 호출)
    RUN_BY            VARCHAR2(7 CHAR),
    RUN_AT            VARCHAR2(40 CHAR),
    RUN_VERIFIED      NUMBER(1)          DEFAULT 0 NOT NULL,
    RUN_DOMAINS       VARCHAR2(300 CHAR),            -- 실행 시점 도메인
    RUN_RESULT_CD     VARCHAR2(20 CHAR),             -- SENT/AGENT_UNREACHABLE/AGENT_REJECTED/BAD_RESPONSE(서버 고정 코드)
    JOB_ID            VARCHAR2(64 CHAR),             -- agent 접수 번호([A-Za-z0-9-]{1,64}만)
    APPLIED_IMPORT_ID NUMBER,                        -- 반영된 판
    CLOSED_AT         VARCHAR2(40 CHAR),
    CLOSED_BY         VARCHAR2(7 CHAR),
    CLOSE_REASON      VARCHAR2(100 CHAR),            -- 제외·실패 사유
    CONSTRAINT PK_PLAN_COLLECT_REQ PRIMARY KEY (INSTITUTION_ID, REQ_SEQ),
    CONSTRAINT UQ_PCR_KEY UNIQUE (REQ_KEY),
    CONSTRAINT UQ_PCR_OPEN UNIQUE (OPEN_INST_ID)
);
CREATE INDEX IDX_PCR_STATUS ON PLAN_COLLECT_REQ (STATUS_CD, REQUESTED_AT);

CREATE TABLE PLAN_COLLECT_REQUESTER (                -- 요청자 덧붙임(같은 기관을 또 요청하면 행만 는다)
    INSTITUTION_ID    VARCHAR2(64 CHAR)  NOT NULL,
    REQ_SEQ           NUMBER(6)          NOT NULL,
    EMP_NO            VARCHAR2(7 CHAR)   NOT NULL,
    REQUESTED_AT      VARCHAR2(40 CHAR)  NOT NULL,
    EMP_VERIFIED      NUMBER(1)          DEFAULT 0 NOT NULL,
    CANCELED_AT       VARCHAR2(40 CHAR),             -- 본인 취소(NULL = 유효)
    CONSTRAINT PK_PLAN_COLLECT_REQUESTER PRIMARY KEY (INSTITUTION_ID, REQ_SEQ, EMP_NO)
);
CREATE INDEX IDX_PCRQ_EMP ON PLAN_COLLECT_REQUESTER (EMP_NO, REQUESTED_AT);

-- [INSERT 블록 시작 — MySQL 045 와 글자 그대로 같아야 한다(PlanCollectDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_REQUEST', '수집 요청', 4, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_CANCEL', '수집 요청 취소', 5, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_EXPORT', '수집 요청 목록 내려받기', 6, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_RUN', '수집 실행·수집 중 표시', 7, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_EXCLUDE', '수집 요청 제외', 8, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_FAIL', '수집 실패 표시', 9, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PLAN_ACTION', 'COLLECT_APPLY', '수집 반영(반입 자동)', 10, 1, '2026-11-17T00:00:00+09:00');
-- [INSERT 블록 끝 — 7행]
COMMIT;
