-- =====================================================================
-- schema-oracle.sql — uploader 단독 스키마의 Oracle 정본
--
-- 미러 관계: `schema-mysql.sql` 과 **같은 내용**을 Oracle 문법으로 적은 것이다.
--            한쪽이 바뀌면 같은 커밋에서 다른 쪽도 바꾼다
--            (`kgi-ggreport-web/src/main/resources/db/README.md` 와 같은 규칙).
--
-- 왜 필요한가: `config-envs` 의 local·dev·stg 는 이미 `oracle.jdbc.OracleDriver`
--            를 보고 있고 prod 는 JNDI(`jdbc/uploaderDS`)다. MySQL 은 외부망
--            `out-local` 하나뿐인데, 종전에는 DDL 이 `schema-mysql.sql` 한 벌뿐이라
--            **내부망 4개 환경에 만들 테이블이 없었다.**
--
-- ---------------------------------------------------------------------
-- MySQL → Oracle 로 바꾼 것 5가지
--
--   1. `BIGINT AUTO_INCREMENT` → `NUMBER(19)` + **시퀀스**
--      ⚠️ IDENTITY(12c+) 가 아니라 시퀀스를 쓴다. 이유 둘:
--         ⓐ Mapper 의 oracle 분기가 `<selectKey>` 로 `..._SEQ.NEXTVAL` 을 먼저
--            읽어 ID 를 직접 넣는다 — 시퀀스가 실물로 있어야 한다.
--         ⓑ Oracle 11g 에서도 그대로 돈다(버전 회신을 기다릴 필요가 없다).
--   2. `VARCHAR(n)` → `VARCHAR2(n CHAR)`
--      ⚠️ `CHAR` 를 명시한다. 빠뜨리면 NLS 에 따라 **바이트** 의미가 되어
--         한글 기관명이 200자가 아니라 66자에서 잘린다.
--   3. `DATETIME` → `TIMESTAMP`
--      ⚠️ 본체(`kgi-ggreport-web`)의 `007_uploader.sql` 은 같은 열을
--         `VARCHAR2(40 CHAR)` ISO 문자열로 두는데, **일부러 다르게 했다.**
--         007 은 uploader 테이블을 *본체 스키마 안에* 합칠 때의 초안이라 본체의
--         시각 표기 규약(설계 §5)을 따른 것이고, 이 파일은 uploader 가 **단독으로**
--         뜰 때의 정본이다. uploader 도메인은 `LocalDateTime` 을 쓰고
--         (`UploadedFile.uploadedAt` 등) Mapper 도 문자열 변환을 하지 않으므로,
--         여기서 문자열로 두면 코드를 고쳐야 한다. 단계 6(본체 편입) 때 어느 쪽으로
--         합칠지 정한다 — 그때까지 두 파일은 **의도적으로 공존**한다.
--   4. `ENGINE=InnoDB` / `DEFAULT CHARSET=utf8mb4` 절 제거 (Oracle 에 없다)
--   5. `CREATE TABLE IF NOT EXISTS` → `CREATE TABLE`
--      ⚠️ Oracle 에 `IF NOT EXISTS` 가 없다. **이 스크립트는 재실행하면
--         ORA-00955(이미 있는 이름)로 실패한다.** 다시 깔려면 파일 끝의
--         DROP 문단을 먼저 돌릴 것.
--
-- ⚠️ 이 스키마는 `spring.sql.init` 으로 자동 실행되지 않는다. 그 설정은
--    테스트(H2)에만 있다 — 내부망에서는 DBA 가 이 파일을 직접 적용한다.
-- =====================================================================

-- ── 업로드된 파일 ────────────────────────────────────────────────────
CREATE TABLE UPLOADED_FILE (
    ID               NUMBER(19)          NOT NULL,
    ORIGINAL_NAME    VARCHAR2(500 CHAR)  NOT NULL,
    STORED_PATH      VARCHAR2(1000 CHAR) NOT NULL,
    FILE_YEAR        VARCHAR2(4 CHAR),
    -- ⚠️ FK 가 아니라 **이름 문자열**이다(원본 그대로). INSTITUTION.NAME 이 바뀌면
    --    오류 없이 조용히 끊긴다. 알려진 설계 부채이고, 본체 편입(단계 6) 때
    --    INSTITUTION_ID FK 로 바꿀지 정한다 — 지금은 미러 충실성을 우선한다.
    INSTITUTION_NAME VARCHAR2(200 CHAR),
    CATEGORY         VARCHAR2(100 CHAR),
    STATUS           VARCHAR2(20 CHAR)   DEFAULT 'UNCLASSIFIED' NOT NULL,
    UPLOADED_AT      TIMESTAMP           NOT NULL,
    CLASSIFIED_AT    TIMESTAMP,
    CONSTRAINT PK_UPLOADED_FILE PRIMARY KEY (ID)
);

-- ── 기관 ─────────────────────────────────────────────────────────────
CREATE TABLE INSTITUTION (
    ID          NUMBER(19)         NOT NULL,
    NAME        VARCHAR2(200 CHAR) NOT NULL,
    CATEGORY    VARCHAR2(100 CHAR) NOT NULL,
    MODIFIED_AT TIMESTAMP          NOT NULL,
    CONSTRAINT PK_INSTITUTION PRIMARY KEY (ID),
    CONSTRAINT UK_INSTITUTION_NAME UNIQUE (NAME)
);

-- ── 시퀀스 ───────────────────────────────────────────────────────────
-- ⚠️ 이름을 바꾸지 말 것. Mapper XML 의 oracle 분기가 이 이름을 그대로 부른다
--    (`UploadedFileMapper.xml` / `InstitutionMapper.xml` 의 <selectKey>).
--    `NOCACHE` 는 WAS 재기동 때 번호가 크게 건너뛰지 않게 하려는 것이다 —
--    ID 에 의미를 두지 않으므로 성능이 문제되면 캐시를 켜도 된다.
CREATE SEQUENCE UPLOADED_FILE_SEQ START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE INSTITUTION_SEQ   START WITH 1 INCREMENT BY 1 NOCACHE;

-- =====================================================================
-- 재설치용 DROP (필요할 때만 직접 실행)
--
--   DROP SEQUENCE UPLOADED_FILE_SEQ;
--   DROP SEQUENCE INSTITUTION_SEQ;
--   DROP TABLE UPLOADED_FILE PURGE;
--   DROP TABLE INSTITUTION PURGE;
--
-- ---------------------------------------------------------------------
-- 미러와 일부러 다르게 둔 것 (drift 아님)
--
--   · 인덱스: MySQL 쪽에도 PK/UK 말고는 없다. 007 초안은 STATUS·INSTITUTION_NAME
--     인덱스를 제안하는데, **여기에 넣으면 두 파일이 갈린다.** 넣기로 하면
--     `schema-mysql.sql` 에 같은 인덱스를 같은 커밋에서 함께 넣을 것.
-- =====================================================================
