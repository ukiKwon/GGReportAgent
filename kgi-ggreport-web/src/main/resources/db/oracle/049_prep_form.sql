--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (049) : 사전준비 양식 BID_PREP_FORM · BID_PREP_FORM_VER + BID_PREP_LOG/ACT.FORM_VER (2026-11-20, NEXT 100 S2)
-- 무엇: 사전준비 과제 T1 '기관 정보 요약'을 시스템 양식으로 작성·확정한다. 정본 = 확정 판(CONFIRMED_VER)의 CONTENT_JSON, 파일(.docx)은 출력물.
--   판(VER) 행은 추가만 한다(저장·미리 채움마다 한 줄). 헤더는 현재 판·확정 판을 가리킨다.
--   CONTENT_SHA256 = CONTENT_JSON(정규 JSON) UTF-8 의 SHA-256. 확정 때 CONFIRMED_SHA256 에 박제 — 서버가 다시 계산해 다르면 확정본으로 쓰지 않는다.
-- 키: BID_PREP_FORM (BID_CASE_ID, FORM_CD) / BID_PREP_FORM_VER (BID_CASE_ID, FORM_CD, VER_NO). 자연 PK, 자동 번호·시퀀스 없음.
--   동시 요청 직렬화는 서비스가 BID_PREP 행을 FOR UPDATE 로 먼저 잡고(그다음 BID_PREP_FORM) 한다.
-- 참조(서비스가 확인, 외래키 없음): BID_CASE_ID -> BID_PREP, *_BY -> USERS. FORM_CD 는 Java 상수(INST_SUMMARY).
-- 024 의 두 표에 FORM_VER 열(NULL 허용)을 더한다 — FORM_* 이벤트·행위만 채운다. 기존 행·기존 INSERT 문은 영향 없다.
--   ACTION_CD 접두어 'FORM_' 은 양식 전용 예약(051 의 DSN_·TASK_ 와 같은 방식). 사전준비 이력 집계 화면이 생기면 접두어로 거른다.
-- 주의: 사번은 자기신고(X-Emp-No). *_VERIFIED=0 이 정상값이고 '검증됨'으로 표시하지 않는다. CONTENT_JSON 에는 내부 추정치(연도별 예상 평잔·수익)가 들어간다 —
--   열람은 담당자·영업팀장·영업부장(담당 디자이너 포함, 사용자 11-19). 감사 표·접근 이력에는 내용을 싣지 않는다.
-- 주의 DB 권한(DBA): BID_PREP_FORM = SELECT, INSERT, UPDATE(삭제 없음). BID_PREP_FORM_VER = SELECT, INSERT 만(추가 전용).
-- 11g 호환: 자동 번호 열, 행 수 제한 구문, 검사 제약, 외래키 없음. ADD 하는 열은 NULL 허용·기본값 없음이라 기존 행을 고쳐 쓰지 않는다(사전 확인 권장).
-- 주의: 멱등하지 않다. 이미 적용된 024 의 표에 ALTER 가 들어간다 — 두 번 돌리면 ORA-01430. 051 을 이미 적용한 DB 도 이 파일만 한 번 돌린다
--   (번호는 051 보다 앞이지만 의존이 없다: 024·048 뒤면 된다). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 주의 배포 순서: DB 먼저(DBA), 서버 나중. 표 없이 서버를 먼저 올리면 /bidcases/{id}/prep/forms/** 는 500 이고, 기존 사전준비 흐름은 영향이 없다.
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE BID_PREP_FORM_VER; DROP TABLE BID_PREP_FORM;
--   ALTER TABLE BID_PREP_LOG DROP COLUMN FORM_VER; ALTER TABLE BID_PREP_ACT DROP COLUMN FORM_VER;
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'PREP_EVENT' AND CODE IN ('FORM_CONFIRM', 'FORM_UNCONFIRM');
--------------------------------------------------------------------------------

CREATE TABLE BID_PREP_FORM (
    BID_CASE_ID        VARCHAR2(64 CHAR)  NOT NULL,
    FORM_CD            VARCHAR2(20 CHAR)  NOT NULL,   -- INST_SUMMARY
    TASK_CD            VARCHAR2(20 CHAR)  NOT NULL,   -- T1
    CUR_VER            NUMBER(6)          DEFAULT 0 NOT NULL,
    CONFIRMED_VER      NUMBER(6),                     -- NULL = 확정 안 됨
    CONFIRMED_SHA256   VARCHAR2(64 CHAR),
    CONFIRMED_BY       VARCHAR2(7 CHAR),
    CONFIRMED_VERIFIED NUMBER(1)          DEFAULT 0 NOT NULL,
    CONFIRMED_AT       VARCHAR2(40 CHAR),
    CREATED_BY         VARCHAR2(7 CHAR)   NOT NULL,
    CREATED_AT         VARCHAR2(40 CHAR)  NOT NULL,
    UPDATED_BY         VARCHAR2(7 CHAR)   NOT NULL,
    UPDATED_AT         VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_BID_PREP_FORM PRIMARY KEY (BID_CASE_ID, FORM_CD)
);

CREATE TABLE BID_PREP_FORM_VER (
    BID_CASE_ID    VARCHAR2(64 CHAR)  NOT NULL,
    FORM_CD        VARCHAR2(20 CHAR)  NOT NULL,
    VER_NO         NUMBER(6)          NOT NULL,   -- 1부터, 서버가 CUR_VER+1
    KIND_CD        VARCHAR2(20 CHAR)  NOT NULL,   -- PREFILL / DRAFT (Java 상수)
    BASE_VER       NUMBER(6)          NOT NULL,   -- 이 판을 만들 때 화면이 본 판
    TPL_VER        NUMBER(4)          NOT NULL,   -- 칸 지도 판
    RENDER_VER     NUMBER(4)          NOT NULL,   -- 출력 모양 판(렌더러를 고치면 옛 판 분기를 남긴다)
    CONTENT_JSON   CLOB               NOT NULL,
    CONTENT_SHA256 VARCHAR2(64 CHAR)  NOT NULL,
    CONTENT_BYTES  NUMBER(8)          NOT NULL,
    SAVED_BY       VARCHAR2(7 CHAR)   NOT NULL,
    SAVED_VERIFIED NUMBER(1)          DEFAULT 0 NOT NULL,
    SAVED_AT       VARCHAR2(40 CHAR)  NOT NULL,
    CONSTRAINT PK_BID_PREP_FORM_VER PRIMARY KEY (BID_CASE_ID, FORM_CD, VER_NO)
);

ALTER TABLE BID_PREP_LOG ADD (FORM_VER NUMBER(6));
ALTER TABLE BID_PREP_ACT ADD (FORM_VER NUMBER(6));

-- [INSERT 블록 시작 — MySQL 049 와 글자 그대로 같다(PrepFormDdlPairTest)]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PREP_EVENT', 'FORM_CONFIRM', '기관 정보 요약 확정', 21, 1, '2026-11-19T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('PREP_EVENT', 'FORM_UNCONFIRM', '기관 정보 요약 확정 취소', 22, 1, '2026-11-19T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
