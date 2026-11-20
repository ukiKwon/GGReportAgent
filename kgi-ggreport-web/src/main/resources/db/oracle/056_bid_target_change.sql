--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (056) : 목표 기관 변경 결재(TARGET_CHANGE)·자동 이월 (NEXT 105, 2026-11-20)
-- INST_BID_TARGET 칸 3개(맨 뒤): APPROVAL_REQ_ID = 결재로 반영된 행 → APPROVAL_REQUEST.REQ_ID(직접·이월 행은 NULL).
--   CARRY_FROM_NO·CARRY_BASIS_CD = 자동 이월 행의 REV 1 에만(작년 목표 TARGET_NO, 그때 판정 UNREGISTERED|FAIL|PENDING).
--   ACTION_CD 에 'CARRY'(이월 REV 1)가 더해진다 — 살아 있음 판정(ACTION_CD <> 'CANCEL')은 그대로.
-- INST_BID_TARGET_REQ_ITEM: 결재 요청 한 건의 기관별 항목(INSERT 만). PK (REQ_ID, INSTITUTION_ID) = 한 요청에 같은 기관은 한 번.
--   '결재 중' = 항목의 요청이 APPROVAL_REQUEST.STATUS='PENDING' → 그 기관의 목표·관심 쓰기·이월을 서비스가 409 CHANGE_PENDING 으로 막는다.
-- INST_BID_TARGET_REQ_ACT: 상신·승인·반려·취소 1회 = 1행(INSERT 만). 누가(사번·이름 스냅샷·자기신고 여부)·어느 화면·버튼·근거(REQUESTER|LINE|HEAD).
--   PK (REQ_ID, ACT_CD) — 결재선 1단계라 한 요청에 각 행위는 한 번.
-- INST_BID_TERM: 기관·목표 연도(입찰한 해)별 RFP 협약 개시일(INSERT 만, 현재 = 최대 REV, CANCEL = 지움). 결재 없음(RFP 사실, 039 와 같은 취급).
--   자동 이월 판정일 = 이 날짜(없으면 목표 연도 다음 해 설정일). 약정 귀속: TERM_FROM 이 이 날짜와 같으면 그 목표 연도(ResultYearRules).
-- COMMON_CODE 1행: TARGET_CANCEL_REASON 'CARRY_REVOKED'(이월 자동 취소) ENABLED=0 — 사람이 고르는 목록에 안 나오고 서버만 쓴다.
-- 참조는 서비스가 확인(외래키·검사 제약 없음). 11g 호환: 자동 증가 칸·FETCH FIRST 없음, 이름 30자 이하.
-- ⚠️ 사번은 X-Emp-No 자기신고일 수 있다(EMP_VERIFIED=0). SCREEN_ID·BUTTON_ID 도 자기신고 머리글(허용 밖 UNKNOWN, UI_VALID=0).
-- ⚠️ DB 권한(DBA): 새 표 셋(INST_BID_TARGET_REQ_ITEM·INST_BID_TARGET_REQ_ACT·INST_BID_TERM)은 앱 계정 SELECT·INSERT 만. INST_BID_TARGET 권한 변동 없음.
-- ⚠️ 멱등하지 않다. 055 뒤 한 번만. 적용 뒤 이 파일을 고치지 않는다(체크섬).
-- 되돌리기(코드를 먼저 056 이전으로 되돌린 뒤): DROP TABLE INST_BID_TARGET_REQ_ACT; DROP TABLE INST_BID_TARGET_REQ_ITEM;
--   DROP INDEX IDX_IBT_REQ; DROP INDEX IDX_IBT_CARRY; ALTER TABLE INST_BID_TARGET DROP (APPROVAL_REQ_ID, CARRY_FROM_NO, CARRY_BASIS_CD);
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'TARGET_CANCEL_REASON' AND CODE = 'CARRY_REVOKED';  DROP TABLE INST_BID_TERM;
--   (CARRY 행이 이미 있으면 옛 코드도 살아 있는 기록으로 읽는다 — 행은 지우지 않는다)
--------------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET ADD (APPROVAL_REQ_ID NUMBER(19));
ALTER TABLE INST_BID_TARGET ADD (CARRY_FROM_NO NUMBER(6));
ALTER TABLE INST_BID_TARGET ADD (CARRY_BASIS_CD VARCHAR2(20 CHAR));
CREATE INDEX IDX_IBT_REQ ON INST_BID_TARGET (APPROVAL_REQ_ID);
CREATE INDEX IDX_IBT_CARRY ON INST_BID_TARGET (INSTITUTION_ID, CARRY_FROM_NO);

CREATE TABLE INST_BID_TARGET_REQ_ITEM (
    REQ_ID             NUMBER(19)          NOT NULL,
    INSTITUTION_ID     VARCHAR2(64 CHAR)   NOT NULL,
    ITEM_NO            NUMBER(3)           NOT NULL,   -- 요청 안 순서 1..20
    OP_CD              VARCHAR2(10 CHAR)   NOT NULL,   -- ADD | EDIT | CANCEL | TO_WATCH | TO_GOAL
    TARGET_NO          NUMBER(6),                      -- ADD 는 NULL(승인 때 번호)
    BASE_REV_NO        NUMBER(6),                      -- 요청 때 본 REV(승인 때 다르면 409 ITEM_CHANGED)
    BASE_KIND_CD       VARCHAR2(10 CHAR),
    BASE_YEAR          NUMBER(4),
    TO_YEAR            NUMBER(4),                      -- ADD·EDIT·TO_GOAL
    TAG_CD             VARCHAR2(20 CHAR),              -- ADD·EDIT
    MEMO               VARCHAR2(100 CHAR),
    OWNER_EMP_NO       VARCHAR2(7 CHAR),
    OWNER_NAME         VARCHAR2(50 CHAR),
    CANCEL_REASON_CD   VARCHAR2(20 CHAR),              -- CANCEL
    CANCEL_REASON_ETC  VARCHAR2(50 CHAR),
    WARN_CD            VARCHAR2(20 CHAR),              -- INST_BID_CLOSED(진행 중 제안이 있어 경고로 통과)
    REQUESTER_EMP_NO   VARCHAR2(7 CHAR)    NOT NULL,
    REQUESTER_NAME     VARCHAR2(50 CHAR)   NOT NULL,   -- 그때 이름 스냅샷
    CREATED_AT         VARCHAR2(40 CHAR)   NOT NULL,
    CONSTRAINT PK_IBT_REQ_ITEM PRIMARY KEY (REQ_ID, INSTITUTION_ID)
);
CREATE INDEX IDX_IBTRI_INST ON INST_BID_TARGET_REQ_ITEM (INSTITUTION_ID, REQ_ID);

CREATE TABLE INST_BID_TARGET_REQ_ACT (
    REQ_ID             NUMBER(19)          NOT NULL,
    ACT_CD             VARCHAR2(10 CHAR)   NOT NULL,   -- SUBMIT | APPROVE | REJECT | CANCEL
    ACTOR_BASIS        VARCHAR2(10 CHAR)   NOT NULL,   -- REQUESTER | LINE | HEAD
    ACTOR_EMP_NO       VARCHAR2(7 CHAR)    NOT NULL,
    ACTOR_NAME         VARCHAR2(50 CHAR)   NOT NULL,
    EMP_VERIFIED       NUMBER(1)           DEFAULT 0 NOT NULL,
    SCREEN_ID          VARCHAR2(30 CHAR)   NOT NULL,
    BUTTON_ID          VARCHAR2(30 CHAR)   NOT NULL,
    UI_VALID           NUMBER(1)           DEFAULT 0 NOT NULL,
    ACTED_AT           VARCHAR2(40 CHAR)   NOT NULL,
    CONSTRAINT PK_IBT_REQ_ACT PRIMARY KEY (REQ_ID, ACT_CD)
);
CREATE INDEX IDX_IBTRA_ACTOR ON INST_BID_TARGET_REQ_ACT (ACTOR_EMP_NO, ACTED_AT);

CREATE TABLE INST_BID_TERM (
    INSTITUTION_ID     VARCHAR2(64 CHAR)   NOT NULL,
    TARGET_YEAR        NUMBER(4)           NOT NULL,   -- 입찰한 해 = 목표 연도
    REV_NO             NUMBER(6)           NOT NULL,
    ACTION_CD          VARCHAR2(10 CHAR)   NOT NULL,   -- SAVE | CANCEL
    TERM_START         VARCHAR2(10 CHAR),              -- YYYY-MM-DD(RFP 협약 개시일). CANCEL 은 NULL
    EDITOR_EMP_NO      VARCHAR2(7 CHAR)    NOT NULL,
    EDITOR_NAME        VARCHAR2(50 CHAR)   NOT NULL,
    EMP_VERIFIED       NUMBER(1)           DEFAULT 0 NOT NULL,
    SCREEN_ID          VARCHAR2(30 CHAR)   NOT NULL,
    BUTTON_ID          VARCHAR2(30 CHAR)   NOT NULL,
    UI_VALID           NUMBER(1)           DEFAULT 0 NOT NULL,
    SAVED_AT           VARCHAR2(40 CHAR)   NOT NULL,
    CONSTRAINT PK_INST_BID_TERM PRIMARY KEY (INSTITUTION_ID, TARGET_YEAR, REV_NO)
);

-- [INSERT 블록 시작 — MySQL 056 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_CANCEL_REASON', 'CARRY_REVOKED', '이월 자동 취소', 9, 0, '2026-11-20T00:00:00+09:00');
-- [INSERT 블록 끝 — 1행]
COMMIT;
