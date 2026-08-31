--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 스키마 정본 (006) : 오케스트레이터 상태 ORCH_RUN / ORCH_STEP
--
-- ⚠️ 이 파일이 **정본**이다. db/mysql/006_orch.sql 은 외부망 로컬 미러다.
--
-- ── 무엇을 대신하는가 ────────────────────────────────────────────────────────
-- LangGraph 의 `SqliteSaver` 체크포인트(파일 `data/graph_checkpoints.db`)와
-- `interrupt()` 재개 의미론을 대신한다(설계 §6-B).
--
-- **재개 지점이 DB 에 명시적으로 남는 것이 오히려 장점이다** — 지금은 LangGraph
-- 체크포인트 내부(pickle 유사 구조)에 있어 운영자가 들여다볼 수 없다. 여기서는
-- "어느 기관이 어느 노드에서 누구 결재를 기다리는가"가 SELECT 한 방이다.
--
--   ORCH_RUN  — 실행 1건(기관·입찰건·현재 노드·상태).
--   ORCH_STEP — 노드별 입출력 스냅샷(= 체크포인트). 직렬화는 Jackson JSON.
--
-- ── 한 기관에 실행은 하나뿐 ──────────────────────────────────────────────────
-- 원본은 이걸 **프로세스 메모리**(`OrchestratorService._running` 딕셔너리)로 지켰다.
-- WAS 는 재기동·다중 인스턴스가 있으므로 그 방식으로는 못 지킨다 — DB 제약으로 옮긴다.
--
-- ⚠️ 그래서 `ACTIVE_INSTITUTION_ID` 라는 낯선 컬럼이 있다. 실행 중이면
--    `INSTITUTION_ID` 와 같은 값, 끝났으면 **NULL** 이다. 단일 컬럼 UNIQUE 라
--    ⓐ Oracle 은 전체가 NULL 인 키를 색인하지 않고 ⓑ MySQL 은 NULL 끼리 충돌하지
--    않으므로, **양쪽 방언에서 똑같이** "활성 실행 1건"만 허용된다.
--    (`UNIQUE(INSTITUTION_ID, ACTIVE_FLAG)` 같은 복합 키로는 안 된다 — Oracle 은
--     일부만 NULL 인 복합 키를 색인하므로 끝난 실행끼리 충돌한다. 두 DB 의 NULL
--     취급이 여기서 갈린다.)
--
-- ⚠️ 001·002·005 와 마찬가지로 **멱등하지 않다.** 한 번만 돌린다.
--------------------------------------------------------------------------------

CREATE TABLE ORCH_RUN (
    RUN_ID                 VARCHAR2(64 CHAR)  NOT NULL,
    INSTITUTION_ID         VARCHAR2(64 CHAR)  NOT NULL,
    -- 실행을 시작한 시점의 최신 공고. 없을 수도 있다(원본의 `adhoc-…` 자리).
    BID_CASE_ID            VARCHAR2(64 CHAR),
    -- RUNNING / PENDING_APPROVAL / DONE / FAILED
    STATUS                 VARCHAR2(20 CHAR)  NOT NULL,
    -- 지금 멈춰 있는(또는 실행 중인) 노드 이름. OrchNode enum 과 1:1.
    CURRENT_NODE           VARCHAR2(40 CHAR)  NOT NULL,
    -- 사람 결재를 기다리는 게이트 이름(기획승인·이관결재·최종결재). 화면이 그대로 읽는다.
    PENDING_GATE           VARCHAR2(40 CHAR),
    -- 그때의 기관 단계. 기록에 "몇 단계였는지"를 남기는 근거다.
    STAGE                  NUMBER(2),
    -- 실행 중일 때만 INSTITUTION_ID 와 같고, 끝나면 NULL (위 주석 참조).
    ACTIVE_INSTITUTION_ID  VARCHAR2(64 CHAR),
    FAILURE_REASON         VARCHAR2(1000 CHAR),
    CREATED_AT             VARCHAR2(40 CHAR)  NOT NULL,
    UPDATED_AT             VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_ORCH_RUN PRIMARY KEY (RUN_ID),
    CONSTRAINT FK_ORCH_RUN_INST FOREIGN KEY (INSTITUTION_ID)
        REFERENCES INSTITUTIONS (INSTITUTION_ID),
    CONSTRAINT UK_ORCH_RUN_ACTIVE UNIQUE (ACTIVE_INSTITUTION_ID)
);

CREATE INDEX IDX_ORCH_RUN_INST ON ORCH_RUN (INSTITUTION_ID, CREATED_AT);

CREATE TABLE ORCH_STEP (
    STEP_ID                VARCHAR2(64 CHAR)  NOT NULL,
    RUN_ID                 VARCHAR2(64 CHAR)  NOT NULL,
    -- 실행 순서. 같은 RUN 안에서 단조 증가한다(팬아웃 형제는 같은 부모를 갖는다).
    SEQ_NO                 NUMBER             NOT NULL,
    NODE                   VARCHAR2(40 CHAR)  NOT NULL,
    -- PENDING / RUNNING / DONE / FAILED / PENDING_APPROVAL
    STATUS                 VARCHAR2(20 CHAR)  NOT NULL,
    -- 팬아웃 자식이면 부모 STEP. 조인 판정("형제가 전부 끝났는가")이 이 값을 본다.
    PARENT_STEP_ID         VARCHAR2(64 CHAR),
    -- 팬아웃 자식의 담당(3팀 작성). 부모·단독 노드는 NULL.
    ROLE                   VARCHAR2(30 CHAR),
    -- 체크포인트 본문. Jackson JSON.
    INPUT_JSON             CLOB,
    OUTPUT_JSON            CLOB,
    FAILURE_REASON         VARCHAR2(1000 CHAR),
    STARTED_AT             VARCHAR2(40 CHAR)  NOT NULL,
    FINISHED_AT            VARCHAR2(40 CHAR),
    CONSTRAINT PK_ORCH_STEP PRIMARY KEY (STEP_ID),
    CONSTRAINT FK_ORCH_STEP_RUN FOREIGN KEY (RUN_ID)
        REFERENCES ORCH_RUN (RUN_ID),
    CONSTRAINT UK_ORCH_STEP_SEQ UNIQUE (RUN_ID, SEQ_NO)
);

CREATE INDEX IDX_ORCH_STEP_PARENT ON ORCH_STEP (PARENT_STEP_ID);

-- ⚠️ SEQ_NO 를 IDENTITY 로 두지 않았다(002·005 와 다르다). 여기서는 "RUN 안에서의
--    순서"라 전역 단조 증가가 아니라 **RUN 별로 1부터** 시작해야 읽기 쉽고,
--    팬아웃 형제에게 연속 번호를 직접 배정해야 한다. 앱이 정한다.
