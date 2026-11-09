--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (018) : 공고 예정일 경과 건 처리 이력 NOTICE_FOLLOWUP
--
-- 추가 전용. 외래키 없음. 행을 고치거나 지우지 않는다.
--   키 = (기관, 공고 예정일, 회차 REV_NO). 상태를 바꿀 때마다 같은 (기관, 예정일)에 REV_NO + 1 행을 추가한다.
--   현재 상태 = 그 (기관, 예정일)에서 REV_NO 가 가장 큰 행. 별도 "현재" 표는 두지 않는다.
--   복합 PK 가 곧 동시성 보장이다: 같은 REV_NO 는 두 번 들어가지 못한다(충돌은 서비스가 409 로 돌려준다).
--
-- 참조(서비스가 저장 전에 확인): INSTITUTION_ID -> INSTITUTIONS, HANDLER_EMP_NO -> USERS(ACTIVE),
--                              STATUS_CD -> COMMON_CODE(NOTICE_STATUS, ENABLED = 1)
-- 처리자 사번·이름·시각은 서버가 Actor 에서 채운다(요청 본문 값은 받지 않는다). HANDLER_NAME 은 그 시점의 이름 스냅샷.
-- "미처리"(경과했지만 행 없음), "지연 대기 + NEXT_CHECK_DATE 경과" 판정은 서버 쿼리·화면이 하고 DB 에 저장하지 않는다.
--
-- ⚠️ EMP_VERIFIED: 현재 인증은 X-Emp-No 자기신고다. 1 = 앞단 인증 주체, 0 = 자기신고(위조 가능).
--    화면은 "검증됨"이라고 표시하지 않는다.
-- ⚠️ OPINION 은 자유 글이라 개인정보·원문 주소를 넣지 않도록 화면이 안내한다. 접근 이력에는 본문을 넣지 않는다.
-- ⚠️ 멱등하지 않다. 016·017 적용 후 한 번만 돌린다.
-- 되돌리기(데이터 소멸 주의): DROP TABLE NOTICE_FOLLOWUP;
--------------------------------------------------------------------------------

CREATE TABLE NOTICE_FOLLOWUP (
    INSTITUTION_ID   VARCHAR2(64 CHAR)  NOT NULL,
    DUE_DATE         VARCHAR2(10 CHAR)  NOT NULL,   -- 처리 대상 회차의 공고 예정일 YYYY-MM-DD(한국 날짜)
    REV_NO           NUMBER(6)          NOT NULL,   -- 1부터. 같은 회차 안에서 단조 증가
    STATUS_CD        VARCHAR2(20 CHAR)  NOT NULL,   -- COMMON_CODE NOTICE_STATUS (IN_PROGRESS/CLOSED/DELAYED)
    OPINION          VARCHAR2(500 CHAR),            -- 담당자 의견. 비면 NULL(Oracle 은 빈 문자열을 NULL 로 본다), 앱이 빈 문자열로 정규화
    NEXT_CHECK_DATE  VARCHAR2(10 CHAR),             -- 지연·재공고 대기일 때 다시 확인할 날(YYYY-MM-DD)
    HANDLER_EMP_NO   VARCHAR2(7 CHAR)   NOT NULL,   -- 처리자 사번(서버가 Actor 에서)
    HANDLER_NAME     VARCHAR2(50 CHAR)  NOT NULL,   -- 처리 시점 이름 스냅샷
    EMP_VERIFIED     NUMBER(1)          DEFAULT 0 NOT NULL,
    HANDLED_AT       VARCHAR2(40 CHAR)  NOT NULL,   -- Times.nowIso
    CONSTRAINT PK_NOTICE_FOLLOWUP PRIMARY KEY (INSTITUTION_ID, DUE_DATE, REV_NO)
);

CREATE INDEX IDX_NF_STATUS  ON NOTICE_FOLLOWUP (STATUS_CD, NEXT_CHECK_DATE);   -- 지연 대기 재확인일 조회
CREATE INDEX IDX_NF_HANDLER ON NOTICE_FOLLOWUP (HANDLER_EMP_NO, HANDLED_AT);   -- "내가 처리한 건"·감사
