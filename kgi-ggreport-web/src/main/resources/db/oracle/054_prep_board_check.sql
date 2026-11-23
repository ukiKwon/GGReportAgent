--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (054) : 대시보드 칸 체크 BID_PREP_CHECK + 코드표 DASH_MARK (NEXT 102, 2026-11-23)
-- 무엇: 대시보드(행 = 제안 확정 기관, 열 = 영업추진 체크리스트)의 손 칸 아이콘 값을 건 x 열마다 추가 전용으로 쌓는다.
--   값 4종: DONE(V 완료) / IN_PROGRESS(△ 진행) / NA(- 대상 아님) / NONE(빈칸 시작 전). 날짜는 입력받지 않고 서버가 체크한 날(한국 날짜)을 MARK_DATE 에 남긴다.
--   현재 값 = (BID_CASE_ID, COL_CD)의 최대 REV_NO. 열 정의는 서버 코드(PrepBoardColumns)에 있고 표에는 코드만 저장한다.
-- 키: (BID_CASE_ID, COL_CD, REV_NO) 자연 PK — IDENTITY·시퀀스 없음. 동시 저장은 서비스가 BID_PREP 행 FOR UPDATE 를 먼저 잡아 줄 세우고, 화면이 본 개정 번호로 409, PK 가 마지막 방어선.
-- 참조(서비스가 확인, 외래키 없음): BID_CASE_ID -> BID_PREP, ACTOR_EMP_NO -> USERS, MARK_CD·PREV_MARK_CD -> COMMON_CODE(DASH_MARK). 허용 값의 정본은 서버 상수다.
-- 주의: 사번·화면·버튼은 자기신고(X-Emp-No, X-Screen-Id, X-Button-Id). EMP_VERIFIED=0 이 정상값이고 '검증됨'으로 표시하지 않는다.
-- 주의 감사: 행위 감사는 BID_PREP_ACT(024)를 재사용한다. ACTION_CD 'DASH_'(DASH_LIST, DASH_LIST_ENDED, DASH_CHECK, DASH_CHECK_SAME) 와 TASK_CD 'CK_' 는 대시보드 전용 예약.
--   BID_PREP_ACT 를 집계하는 화면이 생기면 DSN_·TASK_·DASH_ 를 걸러야 한다.
-- 주의 DB 권한(DBA): BID_PREP_CHECK = SELECT, INSERT 만. UPDATE, DELETE 없음(추가 전용).
-- 11g 호환: IDENTITY, 행 수 제한 구문, CHECK, 외래키 없음.
-- 주의: 멱등하지 않다. 016(COMMON_CODE)·024(BID_PREP) 뒤 한 번만. 055~058 을 이미 적용한 DB 에도 이 파일만 한 번 돌리면 된다(표·코드 그룹이 겹치지 않는다).
--   적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 배포 순서: DB 먼저(DBA), 서버 나중. 표 없이 서버를 올리면 /prep-board 와 칸 체크는 500, 기존 /preps·사전준비 상세는 영향 없음.
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE BID_PREP_CHECK; DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK';
--------------------------------------------------------------------------------

CREATE TABLE BID_PREP_CHECK (
    BID_CASE_ID     VARCHAR2(64 CHAR)  NOT NULL,
    COL_CD          VARCHAR2(20 CHAR)  NOT NULL,   -- 열 코드(서버 허용 목록, [A-Z0-9_]{1,17})
    REV_NO          NUMBER(6)          NOT NULL,   -- (건, 열) 안에서 1부터 연속
    MARK_CD         VARCHAR2(20 CHAR)  NOT NULL,   -- DASH_MARK: DONE / IN_PROGRESS / NA / NONE
    PREV_MARK_CD    VARCHAR2(20 CHAR),             -- NULL = 첫 기록
    MARK_DATE       VARCHAR2(10 CHAR)  NOT NULL,   -- 체크한 날 YYYY-MM-DD(한국 날짜, 서버가 정함)
    ACTOR_EMP_NO    VARCHAR2(7 CHAR)   NOT NULL,
    ACTOR_NAME      VARCHAR2(50 CHAR)  NOT NULL,   -- 그때 이름 스냅샷(비면 사번 — Oracle 은 '' 를 NULL 로 본다)
    EMP_VERIFIED    NUMBER(1)          DEFAULT 0 NOT NULL,
    SCREEN_ID       VARCHAR2(30 CHAR)  NOT NULL,   -- 허용 목록 밖은 UNKNOWN
    BUTTON_ID       VARCHAR2(30 CHAR)  NOT NULL,
    UI_VALID        NUMBER(1)          DEFAULT 0 NOT NULL,
    SAVED_AT        VARCHAR2(40 CHAR)  NOT NULL,   -- Times.nowIso(UTC)
    CONSTRAINT PK_BID_PREP_CHECK PRIMARY KEY (BID_CASE_ID, COL_CD, REV_NO)
);
CREATE INDEX IDX_BPC_ACTOR ON BID_PREP_CHECK (ACTOR_EMP_NO, SAVED_AT);

INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'DONE', '완료', 1, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'IN_PROGRESS', '진행', 2, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'NA', '대상 아님', 3, 1, '2026-11-23T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'NONE', '시작 전', 4, 1, '2026-11-23T00:00:00+09:00');
COMMIT;
