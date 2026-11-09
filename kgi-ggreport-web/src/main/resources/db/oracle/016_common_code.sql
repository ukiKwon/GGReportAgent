--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (016) : 공통 코드 COMMON_CODE
--
-- 코드 종류(CODE_GROUP)와 값(CODE)을 한 표에 둔다. 외래키가 없으므로 값 검증은 서비스가
-- 이 표를 조회해서 한다(ENABLED = 1 인 것만 신규 선택 가능).
--
-- ⚠️ 삭제 금지. 폐기는 ENABLED = 0 으로 한다(이미 저장된 값의 표시명을 유지하기 위해).
-- ⚠️ 값 정본은 이 표다. 분기 로직이 달린 고정 값(USERS.STATUS, 결재 등급·상태 등)은 Java enum 이
--    정본이라 여기에 넣지 않는다(표시명 용도로만 넣을 수 있다).
-- ⚠️ 코드 값은 영문 대문자·숫자·밑줄만, 30자 이내(서비스가 검증한다). CHECK 는 쓰지 않는다.
-- ⚠️ 멱등하지 않다. 한 번만 돌린다. 시드는 017.
-- 되돌리기(데이터 소멸 주의): DROP TABLE COMMON_CODE;
--------------------------------------------------------------------------------

CREATE TABLE COMMON_CODE (
    CODE_GROUP  VARCHAR2(30 CHAR)   NOT NULL,                  -- 코드 종류(예: NOTICE_STATUS)
    CODE        VARCHAR2(30 CHAR)   NOT NULL,                  -- 저장되는 값
    CODE_NAME   VARCHAR2(100 CHAR)  NOT NULL,                  -- 화면 표시명
    SORT_NO     NUMBER(4)           DEFAULT 0 NOT NULL,
    ENABLED     NUMBER(1)           DEFAULT 1 NOT NULL,        -- 0 = 신규 선택 불가(삭제하지 않는다)
    NOTE        VARCHAR2(200 CHAR),
    UPDATED_AT  VARCHAR2(40 CHAR)   NOT NULL,                  -- Times.nowIso
    UPDATED_BY  VARCHAR2(7 CHAR),                              -- 사번. 서비스가 USERS 확인(시드는 NULL)
    CONSTRAINT PK_COMMON_CODE PRIMARY KEY (CODE_GROUP, CODE)
);
