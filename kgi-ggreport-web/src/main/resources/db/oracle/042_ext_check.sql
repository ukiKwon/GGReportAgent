--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (042) : 외부 확인 반입 저장 EXT_CHECK · EXT_CHECK_FILE · EXT_CHECK_EXCL (NEXT 90 3단계, 2026-11-17)
-- 망 밖 수집기가 보낸 checks[] 중 서버 검사(글자·첨부)를 통과한 것만 EXT_CHECK 에 담고, 첨부는 corpus/ext_check/<CHECK_KEY>/ 에 보관한다.
-- CHECK_KEY = 서버가 만든 무작위 32자리 hex(SecureRandom 16바이트). 열람 URL 에 쓰며 추측할 수 없다. 기관·시각으로 키를 만들지 않는다.
-- 같은 배치 재반입: UQ_EXT_CHECK_BATCH (BATCH_ID, CHECK_ID) 가 마지막 방어선(서비스가 먼저 BATCH_ID 로 확인해 422 BATCH_ALREADY_IMPORTED).
-- 참조(서비스가 확인, 외래키 없음): INSTITUTION_ID -> INSTITUTIONS, CHECK_KEY(FILE) -> EXT_CHECK.
-- 상태 STATUS_CD = found / not_found / error. 화면 표시값은 최신 found·not_found 이고 error 는 따로 본다(이전 found 를 덮지 않는다).
-- SOURCE_KIND = notice / press. press 는 TITLE=기사 제목, PUBLISHER=발행처, POSTED_AT=게재일, SRC_URL=기사 주소.
-- 값 원칙: 개인정보 검사를 통과한 글자만 저장한다. 제외 이력(EXT_CHECK_EXCL)에는 사유·위치·건수만 있고 원문·파일명·경로는 없다.
-- STORED_NAME = '<CHECK_KEY>/<check_id>_<순번>.<pdf|hwp|hwpx>' 서버 생성 이름. 원본 파일명은 어디에도 두지 않는다.
-- ⚠️ 접근은 X-Emp-No 자기신고 + 영업팀 계열 역할 규칙이다. 사칭 방지가 아니므로 '검증됨'으로 표시하지 않는다.
-- ⚠️ DB 권한(DBA): 세 표 모두 SELECT·INSERT 만(UPDATE·DELETE 없음).
-- ⚠️ 멱등하지 않다. 041 뒤 한 번만. 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE EXT_CHECK_EXCL; DROP TABLE EXT_CHECK_FILE; DROP TABLE EXT_CHECK;
--   (보관 파일 corpus/ext_check/ 는 DB 와 별개라 따로 정리한다)
--------------------------------------------------------------------------------

CREATE TABLE EXT_CHECK (
    CHECK_KEY       VARCHAR2(32 CHAR)   NOT NULL,   -- 서버 발급 무작위 hex, URL 용
    INSTITUTION_ID  VARCHAR2(64 CHAR)   NOT NULL,
    BATCH_ID        VARCHAR2(80 CHAR)   NOT NULL,
    CHECK_ID        VARCHAR2(40 CHAR)   NOT NULL,   -- 배치 안 번호(수집기가 정함)
    CHECKED_AT      VARCHAR2(40 CHAR)   NOT NULL,   -- ISO 8601, 수집기 시각(자기신고)
    SOURCE_KIND     VARCHAR2(10 CHAR)   NOT NULL,   -- notice | press
    SOURCE_SLUG     VARCHAR2(30 CHAR)   NOT NULL,
    STATUS_CD       VARCHAR2(10 CHAR)   NOT NULL,   -- found | not_found | error
    ERROR_CD        VARCHAR2(30 CHAR),
    MATCH_CONF      VARCHAR2(5 CHAR),               -- high | mid | low (found 일 때)
    MATCH_BASIS     VARCHAR2(200 CHAR),             -- 쉼표로 이은 근거 코드
    TITLE           VARCHAR2(300 CHAR),
    ITEM_NO         VARCHAR2(60 CHAR),              -- 공고 번호
    PUBLISHER       VARCHAR2(60 CHAR),              -- press 발행처
    POSTED_AT       VARCHAR2(10 CHAR),              -- YYYY-MM-DD
    DEADLINE_AT     VARCHAR2(10 CHAR),              -- YYYY-MM-DD
    SRC_URL         VARCHAR2(500 CHAR),             -- ? # 뒤는 서버가 자른 값
    IMPORTED_AT     VARCHAR2(40 CHAR)   NOT NULL,   -- 서버 시각(Times.nowIso)
    CONSTRAINT PK_EXT_CHECK PRIMARY KEY (CHECK_KEY),
    CONSTRAINT UQ_EXT_CHECK_BATCH UNIQUE (BATCH_ID, CHECK_ID)
);
CREATE INDEX IDX_EXT_CHECK_INST ON EXT_CHECK (INSTITUTION_ID, SOURCE_KIND, CHECKED_AT);

CREATE TABLE EXT_CHECK_FILE (
    CHECK_KEY       VARCHAR2(32 CHAR)   NOT NULL,
    FILE_SEQ        NUMBER(5)           NOT NULL,   -- 1부터
    FORMAT_CD       VARCHAR2(5 CHAR)    NOT NULL,   -- pdf | hwp | hwpx (파일 머리 바이트로 정한 값)
    STORED_NAME     VARCHAR2(100 CHAR)  NOT NULL,   -- CHECK_KEY/check_id_순번.확장자
    SHA256          VARCHAR2(64 CHAR)   NOT NULL,   -- 서버가 사본에서 확인한 값
    FILE_SIZE       NUMBER(19)          NOT NULL,
    CONSTRAINT PK_EXT_CHECK_FILE PRIMARY KEY (CHECK_KEY, FILE_SEQ)
);

CREATE TABLE EXT_CHECK_EXCL (
    BATCH_ID        VARCHAR2(80 CHAR)   NOT NULL,
    CHECK_ID        VARCHAR2(40 CHAR)   NOT NULL,
    FILE_SEQ        NUMBER(5)           NOT NULL,   -- 0 = check 자체(첨부 아님)
    REASON_CD       VARCHAR2(30 CHAR)   NOT NULL,   -- PII_MOBILE, ENCRYPTED, EMBEDDED, TIMEOUT, INSTITUTION_NOT_FOUND 등
    LOCATOR_CD      VARCHAR2(20 CHAR)   NOT NULL,   -- body, meta, annot, form, bookmark, preview, institution, notice 등
    HIT_CNT         NUMBER(10)          NOT NULL,
    EXCLUDED_AT     VARCHAR2(40 CHAR)   NOT NULL,
    CONSTRAINT PK_EXT_CHECK_EXCL PRIMARY KEY (BATCH_ID, CHECK_ID, FILE_SEQ, REASON_CD, LOCATOR_CD)
);
