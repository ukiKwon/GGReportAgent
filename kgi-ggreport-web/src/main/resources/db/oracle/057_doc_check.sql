--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (057) : 작업함 파일 점검(다른 기관명) DOC_CHECK · DOC_CHECK_HIT · DOC_CHECK_LOG (2026-11-20, NEXT 106)
-- 무엇: 작업함에 올린 파일마다 '현재 기관이 아닌 기관 이름'이 어디에(슬라이드·노트·쪽 …) 몇 번 나오는지 기록한다.
--   DOC_CHECK = 파일당 한 줄(최신 점검 결과), DOC_CHECK_HIT = (기관, 위치)당 한 줄, DOC_CHECK_LOG = 의도적 언급 표시·해제·미확인 제출(추가 전용 감사).
-- 대외비: 파일 속 글·문맥은 저장하지 않는다. 저장하는 것은 기관 ID·위치·건수·파일 해시뿐이다. 파일 이름은 평문으로 저장하지 않는다(NAME_KEY = SHA-256(이름) 해시만, DOC_CHECK·DOC_CHECK_HIT·DOC_CHECK_LOG 모두).
-- 키: DOC_CHECK (TASK_ID, NAME_KEY) / DOC_CHECK_HIT (TASK_ID, NAME_KEY, FOUND_INST_ID, LOC_KIND, LOC_NO) / DOC_CHECK_LOG (TASK_ID, SEQ_NO).
--   SEQ_NO 는 서버가 max+1 — TASKS 행을 FOR UPDATE 로 먼저 잡아 같은 작업 안에서 한 줄로 세운다(051 과 같은 방식). IDENTITY·시퀀스 없음.
-- 참조(서비스가 확인, 외래키 없음): TASK_ID -> TASKS, INSTITUTION_ID·FOUND_INST_ID -> INSTITUTIONS, EMP_NO -> USERS.
-- 주의: EMP_NO·SCREEN_ID·BUTTON_ID 는 자기신고다(X-Emp-No·X-Screen-Id·X-Button-Id). EMP_VERIFIED=0 이 정상값이고 검증됨으로 표시하지 않는다.
--   EVENT_CD: ACK(의도적 언급 표시) / UNACK(해제) / SUBMIT_OPEN(미확인·점검 못 함이 남은 채 제출). SUBMIT_OPEN 은 EMP_NO 가 비어 있을 수 있다(사번 없이 온 세 팀 제출).
-- 주의 DB 권한(DBA): DOC_CHECK·DOC_CHECK_HIT = SELECT, INSERT, DELETE(파일을 다시 올리거나 지우면 바꿔 쓴다). DOC_CHECK_LOG = SELECT, INSERT 만(UPDATE·DELETE 없음, 추가 전용).
-- 11g 호환: IDENTITY, 행 수 제한 구문, CHECK, 외래키 없음. Oracle 은 빈 문자열을 NULL 로 바꾼다 — NULL 허용 칸만 비어 있을 수 있고 서비스는 NOT NULL 칸에 빈 값을 넣지 않는다.
-- 주의: 멱등하지 않다. 056 까지 적용한 DB 는 이 파일만 한 번 돌린다(앞 번호와 표가 겹치지 않는다). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 주의 배포 순서: DB 먼저(DBA), 서버 나중. 표 없이 서버를 먼저 올리면 업로드·제출은 그대로 되지만(점검 기록 실패는 WARN 로그) /tasks/{id}/doc-check 는 500 이다.
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE DOC_CHECK_LOG; DROP TABLE DOC_CHECK_HIT; DROP TABLE DOC_CHECK;
--------------------------------------------------------------------------------

CREATE TABLE DOC_CHECK (
    TASK_ID        VARCHAR2(64 CHAR)  NOT NULL,
    NAME_KEY       VARCHAR2(64 CHAR)  NOT NULL,   -- SHA-256(파일 이름 UTF-8) 16진 소문자
    FILE_SHA256    VARCHAR2(64 CHAR)  NOT NULL,   -- 점검한 내용의 해시(의도적 언급 표시가 이 값에 묶인다)
    FILE_SIZE      NUMBER(19)         NOT NULL,
    FILE_MTIME_MS  NUMBER(19)         NOT NULL,   -- 디스크 수정시각 — 다르면 STALE
    INSTITUTION_ID VARCHAR2(64 CHAR)  NOT NULL,   -- 점검 때의 '현재 기관'
    STATE_CD       VARCHAR2(12 CHAR)  NOT NULL,   -- DONE / PARTIAL / NOT_CHECKED / ERROR
    REASON_CD      VARCHAR2(30 CHAR),
    HAS_IMAGES     NUMBER(1)          DEFAULT 0 NOT NULL,
    HAS_EMBEDDED   NUMBER(1)          DEFAULT 0 NOT NULL,
    ORDER_APPROX   NUMBER(1)          DEFAULT 0 NOT NULL,
    HIT_ROWS       NUMBER(6)          DEFAULT 0 NOT NULL,
    CHECKER_VER    NUMBER(6)          NOT NULL,
    CHECKED_AT     VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_DOC_CHECK PRIMARY KEY (TASK_ID, NAME_KEY)
);

CREATE TABLE DOC_CHECK_HIT (
    TASK_ID        VARCHAR2(64 CHAR)  NOT NULL,
    NAME_KEY       VARCHAR2(64 CHAR)  NOT NULL,
    FOUND_INST_ID  VARCHAR2(64 CHAR)  NOT NULL,
    LOC_KIND       VARCHAR2(10 CHAR)  NOT NULL,   -- SLIDE / NOTE / MASTER / META / OTHER / PAGE
    LOC_NO         NUMBER(6)          NOT NULL,   -- 보이는 순서(1부터). MASTER·META·OTHER 는 0
    HIT_COUNT      NUMBER(9)          NOT NULL,
    CONSTRAINT PK_DOC_CHECK_HIT PRIMARY KEY (TASK_ID, NAME_KEY, FOUND_INST_ID, LOC_KIND, LOC_NO)
);

CREATE TABLE DOC_CHECK_LOG (
    TASK_ID           VARCHAR2(64 CHAR)  NOT NULL,
    SEQ_NO            NUMBER(9)          NOT NULL,
    EVENT_CD          VARCHAR2(12 CHAR)  NOT NULL,
    NAME_KEY          VARCHAR2(64 CHAR),             -- SHA-256(파일 이름) — ACK·UNACK 줄이 어느 파일인지(SUBMIT_OPEN 은 비어 있다)
    FILE_SHA256       VARCHAR2(64 CHAR),
    FOUND_INST_ID     VARCHAR2(64 CHAR),
    LOC_KIND          VARCHAR2(10 CHAR),
    LOC_NO            NUMBER(6),
    OPEN_COUNT        NUMBER(9),
    NOT_CHECKED_COUNT NUMBER(9),
    PARTIAL_COUNT     NUMBER(9),
    EMP_NO            VARCHAR2(7 CHAR),
    EMP_VERIFIED      NUMBER(1)          DEFAULT 0 NOT NULL,
    SCREEN_ID         VARCHAR2(30 CHAR)  NOT NULL,
    BUTTON_ID         VARCHAR2(30 CHAR)  NOT NULL,
    UI_VALID          NUMBER(1)          DEFAULT 0 NOT NULL,
    ACTED_AT          VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_DOC_CHECK_LOG PRIMARY KEY (TASK_ID, SEQ_NO)
);
CREATE INDEX IDX_DCL_SHA ON DOC_CHECK_LOG (TASK_ID, FILE_SHA256);
