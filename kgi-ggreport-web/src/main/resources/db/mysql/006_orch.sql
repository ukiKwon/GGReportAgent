-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 8.0 미러 (006) : ORCH_RUN / ORCH_STEP
--                                            ※ 외부망 로컬(out-local) 전용
--
-- ⚠️ 이 파일은 **정본이 아니다.** 정본은 db/oracle/006_orch.sql 이고, 이 테이블이
--    무엇을 대신하는지(LangGraph 체크포인트 + interrupt 재개)와 왜
--    ACTIVE_INSTITUTION_ID 라는 낯선 컬럼이 있는지는 거기에 적혀 있다.
--
-- ⚠️ **NULL 취급이 두 DB 에서 갈리는 자리를 일부러 피한 설계다.** 단일 컬럼 UNIQUE
--    라서 Oracle(전체 NULL 키는 미색인)과 MySQL(NULL 끼리 충돌 없음)이 같은 결과를
--    낸다 — 복합 UNIQUE 로 바꾸면 Oracle 에서만 끝난 실행끼리 충돌한다.
--
-- ⚠️ 멱등하지 않다. 한 번만 돌린다.
-- ---------------------------------------------------------------------------

CREATE TABLE ORCH_RUN (
    RUN_ID                 VARCHAR(64)   NOT NULL,
    INSTITUTION_ID         VARCHAR(64)   NOT NULL,
    BID_CASE_ID            VARCHAR(64),
    STATUS                 VARCHAR(20)   NOT NULL,
    CURRENT_NODE           VARCHAR(40)   NOT NULL,
    PENDING_GATE           VARCHAR(40),
    STAGE                  SMALLINT,
    ACTIVE_INSTITUTION_ID  VARCHAR(64),
    FAILURE_REASON         VARCHAR(1000),
    CREATED_AT             VARCHAR(40)   NOT NULL,
    UPDATED_AT             VARCHAR(40)   NOT NULL,
    PRIMARY KEY (RUN_ID),
    CONSTRAINT FK_ORCH_RUN_INST FOREIGN KEY (INSTITUTION_ID)
        REFERENCES INSTITUTIONS (INSTITUTION_ID),
    CONSTRAINT UK_ORCH_RUN_ACTIVE UNIQUE (ACTIVE_INSTITUTION_ID),
    KEY IDX_ORCH_RUN_INST (INSTITUTION_ID, CREATED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ORCH_STEP (
    STEP_ID                VARCHAR(64)   NOT NULL,
    RUN_ID                 VARCHAR(64)   NOT NULL,
    SEQ_NO                 BIGINT        NOT NULL,
    NODE                   VARCHAR(40)   NOT NULL,
    STATUS                 VARCHAR(20)   NOT NULL,
    PARENT_STEP_ID         VARCHAR(64),
    ROLE                   VARCHAR(30),
    INPUT_JSON             LONGTEXT,
    OUTPUT_JSON            LONGTEXT,
    FAILURE_REASON         VARCHAR(1000),
    STARTED_AT             VARCHAR(40)   NOT NULL,
    FINISHED_AT            VARCHAR(40),
    PRIMARY KEY (STEP_ID),
    CONSTRAINT FK_ORCH_STEP_RUN FOREIGN KEY (RUN_ID)
        REFERENCES ORCH_RUN (RUN_ID),
    CONSTRAINT UK_ORCH_STEP_SEQ UNIQUE (RUN_ID, SEQ_NO),
    KEY IDX_ORCH_STEP_PARENT (PARENT_STEP_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
