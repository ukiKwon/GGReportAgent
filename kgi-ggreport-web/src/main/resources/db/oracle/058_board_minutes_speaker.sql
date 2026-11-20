--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (058) : 이사회 회의록 발화자 역할 라벨 BOARD_MINUTES_SPEAKER
-- 047 적용 뒤 한 번만(멱등 아님). 외래키·CHECK 없음. 참조는 서비스가 확인: MINUTES_ID -> BOARD_MINUTES, SPEAKER_NO -> BOARD_MINUTES_UTTER.SPEAKER_NO
-- ⚠️ LABEL 은 서버 고정 어휘(소속·역할·번호 1~9)만 — 실명·사번을 넣지 않는다(security R14 예외 범위, 사용자 11-20).
-- ⚠️ 사번 칸을 두지 않는다. 누가 바꿨는지는 BOARD_MINUTES_REV·_LOG·_ACT 에 남는다.
-- DBA 권한 메모: SELECT·INSERT·DELETE(UPDATE 불필요 — 바꿀 때 지우고 넣는다).
-- 되돌리기(라벨 소멸): DROP TABLE BOARD_MINUTES_SPEAKER;
--------------------------------------------------------------------------------
CREATE TABLE BOARD_MINUTES_SPEAKER (
    MINUTES_ID  NUMBER             NOT NULL,
    SPEAKER_NO  NUMBER(3)          NOT NULL,                     -- 참석자 N 의 N
    LABEL       VARCHAR2(40 CHAR)  NOT NULL,                     -- 예 '은행 측', '구청장 2'
    CONSTRAINT PK_BOARD_MINUTES_SPEAKER PRIMARY KEY (MINUTES_ID, SPEAKER_NO)
);
