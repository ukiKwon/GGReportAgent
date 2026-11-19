--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (048) : 입찰 없음 알림의 [계속 작성] 행위 기록 PREP_NOBID_ACK (2026-11-19)
-- 무엇: 공고 상태가 입찰 없음(NO_BID)으로 닫힌 기관에 진행 중인 제안 건이 있을 때 사전준비 상세에서 뜨는 알림의 [계속 작성] 기록.
--   업무 상태(BID_PREP, NOTICE_ROUND)는 바꾸지 않는다. 누가, 언제, 어느 화면, 어느 버튼, 어느 공고 기록을 보고 눌렀는지만 남긴다(사용자 11-19).
-- 키 = (EMP_NO, INSTITUTION_ID, ROUND_SEQ, NOTICE_HANDLED_AT) 자연 PK. 같은 사람, 같은 공고 기록이면 한 줄이고 알림은 다시 뜨지 않는다.
--   서버는 INSERT 를 시도하고 중복 키면 이미 기록됨(200 saved=false)으로 끝낸다(조회 뒤 INSERT 경합 없음, security 11-19 중-3).
--   NOTICE_HANDLED_AT, NOTICE_REV_NO 는 그 회차 최신 NOTICE_ROUND_LOG 를 서버가 다시 읽은 값이다(화면 값을 저장하지 않는다).
-- 참조(서비스가 확인): EMP_NO -> USERS, INSTITUTION_ID -> INSTITUTIONS, (INSTITUTION_ID, ROUND_SEQ) -> NOTICE_ROUND, BID_CASE_ID -> BID_PREP.
-- 주의: 사번, 화면, 버튼은 자기신고다(X-Emp-No, X-Screen-Id, X-Button-Id). EMP_VERIFIED=0 이 정상값이고 검증됨으로 표시하지 않는다.
--   허용 목록 밖 화면, 버튼은 UNKNOWN(UI_VALID=0).
-- 주의 DB 권한(DBA): SELECT, INSERT 만. UPDATE, DELETE 없음(추가 전용).
-- 11g 호환: IDENTITY, 행 수 제한 구문, CHECK, 외래키 없음.
-- 주의: 멱등하지 않다. 024, 037 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 주의 배포 순서: DB 먼저(DBA), 서버 나중. 표 없이 서버를 먼저 올리면 사전준비 상세는 나가되 알림(nobid_notice)이 빠지고
--   [계속 작성] 기록(POST /bidcases/{id}/prep/nobid-ack)은 500 이다.
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE PREP_NOBID_ACK;
--------------------------------------------------------------------------------

CREATE TABLE PREP_NOBID_ACK (
    EMP_NO            VARCHAR2(7 CHAR)   NOT NULL,   -- 누른 사람(자기신고)
    INSTITUTION_ID    VARCHAR2(64 CHAR)  NOT NULL,
    ROUND_SEQ         NUMBER(6)          NOT NULL,   -- NO_BID 로 닫힌 회차
    NOTICE_HANDLED_AT VARCHAR2(40 CHAR)  NOT NULL,   -- 그 회차 최신 판정의 HANDLED_AT
    NOTICE_REV_NO     NUMBER(6)          NOT NULL,   -- 그 판정의 REV_NO
    BID_CASE_ID       VARCHAR2(64 CHAR)  NOT NULL,   -- 누른 화면의 제안 건
    PREP_STATE_CD     VARCHAR2(20 CHAR)  NOT NULL,   -- 그때 건 상태
    EMP_VERIFIED      NUMBER(1)          DEFAULT 0 NOT NULL,
    SCREEN_ID         VARCHAR2(30 CHAR)  NOT NULL,
    BUTTON_ID         VARCHAR2(30 CHAR)  NOT NULL,
    UI_VALID          NUMBER(1)          DEFAULT 0 NOT NULL,
    ACKED_AT          VARCHAR2(40 CHAR)  NOT NULL,   -- Times.nowIso
    CONSTRAINT PK_PREP_NOBID_ACK PRIMARY KEY (EMP_NO, INSTITUTION_ID, ROUND_SEQ, NOTICE_HANDLED_AT)
);
CREATE INDEX IDX_PNA_CASE ON PREP_NOBID_ACK (BID_CASE_ID, ACKED_AT);
