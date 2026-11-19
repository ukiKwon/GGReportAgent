--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (051) : 디자인 검토 흐름 DESIGN_ROUND · DESIGN_ROUND_RECIP · DESIGN_COMMENT · DESIGN_ACK (2026-11-19, NEXT 100 ⑥)
-- 무엇: 디자이너가 [디자인 작업 완료]를 누르면 TASKS(TEAM='디자이너') 가 1차완료가 되고, 그때마다 '회차'(DESIGN_ROUND) 한 줄이 열린다.
--   회차마다 받는 사람(DESIGN_ROUND_RECIP, 그 기관 담당자 + 세 팀 팀장)을 박제하고, 받은 사람은 의견(DESIGN_COMMENT)이나 확인함(DESIGN_ACK)을 남긴다.
--   회차는 [다시 수정](REVISE) · 영업팀장 승인(FORWARD) · 영업팀장 반려(LEAD_RETURN) 때 닫힌다. 업무 상태 정본은 계속 TASKS.STATUS 다(이 표들은 따라간다).
-- 키: DESIGN_ROUND (TASK_ID, ROUND_NO) / DESIGN_ROUND_RECIP (TASK_ID, ROUND_NO, EMP_NO) / DESIGN_COMMENT (TASK_ID, ROUND_NO, EMP_NO, SEQ_NO) / DESIGN_ACK (TASK_ID, ROUND_NO, EMP_NO).
--   모두 자연 PK 라 IDENTITY·시퀀스가 없다. 동시 요청의 직렬화는 서비스가 TASKS 행을 FOR UPDATE 로 먼저 잡아서 한다(회차 열기·닫기, 의견 30건 상한).
-- 참조(서비스가 확인, 외래키 없음): TASK_ID -> TASKS, BID_CASE_ID -> BID_CASES, EMP_NO·OPENED_BY·CLOSED_BY -> USERS, NOTIFICATION_ID -> NOTIFICATIONS.
-- 주의: 사번은 자기신고다(X-Emp-No). *_VERIFIED=0 이 정상값이고 검증됨으로 표시하지 않는다. 의견 본문은 감사 표(BID_PREP_ACT)와 쪽지에 싣지 않는다.
-- 주의 감사: 행위 감사는 새 표를 만들지 않고 BID_PREP_ACT(024)를 재사용한다. 이 표는 읽는 SQL 이 아직 없고 사전준비 이력 화면에 섞이지 않는다.
--   접두어 예약: ACTION_CD 의 'DSN_' 와 'TASK_' 는 디자인 검토·팀 작업 결재 전용이다. TASK_CD 는 'DSN_R{회차}'(디자인 회차) 또는 TEAM_SALES / TEAM_IT / TEAM_BUDGET(팀 작업).
--   BID_PREP_ACT 에는 TASK_ID 칸이 없으므로 (BID_CASE_ID, 팀) 고유키 UK_TASKS_CASE_TEAM 으로 작업을 되찾는다 — 그래서 TASK_CD 표기를 고정한다.
--   나중에 사전준비 이력을 이 표에서 집계하는 화면이 생기면 접두어로 반드시 걸러야 한다(안 거르면 디자인 의견·확인한 사람이 사전준비 열람자에게 보인다).
--   정밀 조회가 필요해지면 DESIGN_ACT 표로 분리한다(되돌리기 쉽다).
-- 주의 DB 권한(DBA): DESIGN_ROUND = SELECT, INSERT, UPDATE(UPDATE 는 닫기 칸 CLOSED_AT, CLOSE_CD, CLOSED_BY 만, 문장에 WHERE CLOSED_AT IS NULL 이 붙는다).
--   DESIGN_ROUND_RECIP · DESIGN_COMMENT · DESIGN_ACK = SELECT, INSERT 만. UPDATE, DELETE 없음(추가 전용).
-- 11g 호환: IDENTITY, 행 수 제한 구문, CHECK, 외래키 없음.
-- 주의: 멱등하지 않다. 049, 050(예약 번호) 과 표가 겹치지 않는다 — 048 까지 적용한 DB 는 이 파일만 한 번 돌린다. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 주의 배포 순서: DB 먼저(DBA), 서버 나중. 표 없이 서버를 먼저 올리면 /design-tasks, /tasks/{id}/design* 는 500 이다.
--   기존 /tasks 흐름은 영향이 없다(디자이너 결재 훅은 회차 행이 없으면 건너뛴다).
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE DESIGN_ACK; DROP TABLE DESIGN_COMMENT; DROP TABLE DESIGN_ROUND_RECIP; DROP TABLE DESIGN_ROUND;
--------------------------------------------------------------------------------

CREATE TABLE DESIGN_ROUND (
    TASK_ID         VARCHAR2(64 CHAR)  NOT NULL,
    ROUND_NO        NUMBER(6)          NOT NULL,   -- 그 작업 안의 회차(1부터, 서버가 max+1)
    BID_CASE_ID     VARCHAR2(64 CHAR)  NOT NULL,   -- 조회용 사본
    OPENED_BY       VARCHAR2(7 CHAR)   NOT NULL,   -- [디자인 작업 완료]를 누른 디자이너 사번(자기신고). 디자이너 앞 쪽지의 수신자
    OPENED_VERIFIED NUMBER(1)          DEFAULT 0 NOT NULL,
    OPENED_AT       VARCHAR2(40 CHAR)  NOT NULL,   -- Times.nowIso
    RECIP_COUNT     NUMBER(6)          NOT NULL,   -- 박제한 받는 사람 수
    CLOSED_AT       VARCHAR2(40 CHAR),             -- 열려 있으면 NULL
    CLOSE_CD        VARCHAR2(20 CHAR),             -- REVISE / FORWARD / LEAD_RETURN
    CLOSED_BY       VARCHAR2(7 CHAR),
    CONSTRAINT PK_DESIGN_ROUND PRIMARY KEY (TASK_ID, ROUND_NO)
);
CREATE INDEX IDX_DR_CASE ON DESIGN_ROUND (BID_CASE_ID);

CREATE TABLE DESIGN_ROUND_RECIP (
    TASK_ID         VARCHAR2(64 CHAR)  NOT NULL,
    ROUND_NO        NUMBER(6)          NOT NULL,
    EMP_NO          VARCHAR2(7 CHAR)   NOT NULL,   -- 받는 사람(사번). 회차 도중 담당이 바뀌어도 이 줄은 그대로(박제)
    REASON_CD       VARCHAR2(20 CHAR)  NOT NULL,   -- ASSIGNEE_SALES / ASSIGNEE_IT / ASSIGNEE_BUDGET / LEAD
    NOTIFICATION_ID VARCHAR2(64 CHAR)  NOT NULL,   -- 그 사람에게 간 쪽지(사람마다 한 줄이라 읽음도 각자)
    CONSTRAINT PK_DESIGN_ROUND_RECIP PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO)
);
CREATE INDEX IDX_DRR_EMP ON DESIGN_ROUND_RECIP (EMP_NO);

CREATE TABLE DESIGN_COMMENT (
    TASK_ID      VARCHAR2(64 CHAR)    NOT NULL,
    ROUND_NO     NUMBER(6)            NOT NULL,
    EMP_NO       VARCHAR2(7 CHAR)     NOT NULL,
    SEQ_NO       NUMBER(6)            NOT NULL,    -- 그 사람, 그 회차 안 순번(서버가 count+1, 상한 30)
    BODY         VARCHAR2(1000 CHAR)  NOT NULL,    -- 개인정보 검사(Pii.scanLoose)를 통과한 값만
    EMP_VERIFIED NUMBER(1)            DEFAULT 0 NOT NULL,
    CREATED_AT   VARCHAR2(40 CHAR)    NOT NULL,
    CONSTRAINT PK_DESIGN_COMMENT PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO, SEQ_NO)
);
CREATE INDEX IDX_DC_ROUND ON DESIGN_COMMENT (TASK_ID, ROUND_NO, CREATED_AT);

CREATE TABLE DESIGN_ACK (
    TASK_ID      VARCHAR2(64 CHAR)  NOT NULL,
    ROUND_NO     NUMBER(6)          NOT NULL,
    EMP_NO       VARCHAR2(7 CHAR)   NOT NULL,
    EMP_VERIFIED NUMBER(1)          DEFAULT 0 NOT NULL,
    ACKED_AT     VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_DESIGN_ACK PRIMARY KEY (TASK_ID, ROUND_NO, EMP_NO)
);
