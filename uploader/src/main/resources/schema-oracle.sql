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
--   1. `BIGINT AUTO_INCREMENT` → `NUMBER(18)` + **시퀀스**
--      (자릿수는 2026-09-08 에 19 → 18. 사내 DB 규격에 맞춘 것이고, ID 는 Java `Long`
--       이라 이론상 19자리까지 되지만 시퀀스가 1부터 증가해 실사용에서 무의미하다.)
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
-- ⚠️ **2026-09-08 에 컬럼명을 전부 다시 지었다.** 종전 이름은 "무엇의" 이름·경로·
--    상태·분류인지가 드러나지 않았다. 본체(`kgi-ggreport-web`)의 명명 규칙
--    (서술형 영문 풀네임 + 테이블명 접두 ID: `INSTITUTION_ID`·`PARTICIPATION_STATUS`)
--    을 따랐다 — 나중에 두 스키마를 합칠 때 갈리지 않게 하려는 것이다.
--
--      ID               → UPLOADED_FILE_ID
--      ORIGINAL_NAME    → ORIGINAL_FILE_NAME
--      STORED_PATH      → STORED_FILE_PATH
--      FILE_YEAR        → DOCUMENT_YEAR          (파일의 해가 아니라 문서 기준연도)
--      CATEGORY         → INSTITUTION_CATEGORY   (기관의 유형에서 복사된 값)
--      STATUS           → CLASSIFICATION_STATUS  (분류 처리 상태)
--      INSTITUTION.ID   → INSTITUTION_ID  ·  NAME → INSTITUTION_NAME
--                       ·  CATEGORY → INSTITUTION_CATEGORY
--
--    ⚠️ **Mapper XML 2개가 이 이름에 묶여 있다**(`UploadedFileMapper.xml`·
--       `InstitutionMapper.xml` 의 resultMap `column` 과 모든 SQL). 한쪽만 고치면
--       기동은 되고 조회에서 `ORA-00904: invalid identifier` 가 난다.
--
-- ⚠️ 컬럼 순서는 **조회 편의**로 정했다(2026-09-08). Oracle 에서 물리 컬럼 순서는
--    조회 성능과 사실상 무관하고(9개 컬럼에서는 측정되지 않는다), 앱도 컬럼을
--    **이름으로만** 다룬다(resultMap 이름 매핑 + INSERT 에 컬럼 목록 명시).
--    그래서 사람이 표를 읽는 순서에 맞췄다: **주 조회 축인 기관 → 분류 → 연도 →
--    상태 → 파일명 → 시각**, 그리고 가장 길고 사람이 읽지 않는 STORED_PATH 를 맨 뒤로.
CREATE TABLE UPLOADED_FILE (
    UPLOADED_FILE_ID      NUMBER(18)          NOT NULL,
    -- ⚠️ FK 가 아니라 **이름 문자열**이다(원본 그대로). INSTITUTION_NAME 이 바뀌면
    --    오류 없이 조용히 끊긴다. 알려진 설계 부채이고, 본체 편입(단계 6) 때
    --    INSTITUTION_ID FK 로 바꿀지 정한다 — 지금은 미러 충실성을 우선한다.
    INSTITUTION_NAME      VARCHAR2(200 CHAR),
    -- 기관의 유형. INSTITUTION.INSTITUTION_CATEGORY 에서 **복사**돼 들어온다.
    -- 코드값 5종(2026-09-08 확정): 지방자치단체 · 공공기관 · 대학교 · 병원 · 법원
    -- ⚠️ CHECK 제약은 일부러 걸지 않았다. 화면·컨트롤러에 옛 4종
    --    (지자체·대학교·대학병원·공공기관)이 아직 박혀 있어, 제약을 먼저 걸면
    --    기관 등록이 ORA-02290 으로 실패한다. **코드를 5종으로 맞춘 뒤** 걸 것.
    INSTITUTION_CATEGORY  VARCHAR2(100 CHAR),
    -- 파일이 만들어진 해가 아니라 **문서의 기준 연도**다. 연산에 쓰지 않아 문자열이다.
    DOCUMENT_YEAR         VARCHAR2(4 CHAR),
    CLASSIFICATION_STATUS VARCHAR2(20 CHAR)   DEFAULT 'UNCLASSIFIED' NOT NULL,
    -- 파일명 상한은 파일시스템이 정한다 — NTFS·ext4 모두 255자다. 종전 500 은
    -- 근거 없는 2배 여유였다(2026-09-08 축소).
    ORIGINAL_FILE_NAME    VARCHAR2(255 CHAR)  NOT NULL,
    UPLOADED_AT           TIMESTAMP           NOT NULL,
    CLASSIFIED_AT         TIMESTAMP,
    -- ⚠️ 종전 1000 CHAR 는 AL32UTF8 에서 **4000바이트 = Oracle 11g VARCHAR2 상한**에
    --    정확히 걸쳐 있어 **단 한 자도 늘릴 수 없었다**(늘리려면 CLOB 전환).
    --    실제 최악 경로는 약 600자다:
    --      baseDir(~20) + "/classified/"(12) + 카테고리(100) + "/" + 연도(4) + "/"
    --      + 기관(200) + "/" + 파일명(255) = 591
    --    700 이면 그 최악을 담고도 나중에 1000 까지 늘릴 여유가 남는다(2026-09-08).
    STORED_FILE_PATH      VARCHAR2(700 CHAR)  NOT NULL,
    CONSTRAINT PK_UPLOADED_FILE PRIMARY KEY (UPLOADED_FILE_ID),
    -- 값이 넷뿐인데 종전에는 제약이 없어 오타가 그대로 들어갔다. 비용은 사실상 0이다.
    -- ⚠️ 값을 늘리려면 UploadedFile 도메인(classify·softDelete)과 함께 고칠 것.
    CONSTRAINT CK_UPLOADED_FILE_STATUS CHECK
        (CLASSIFICATION_STATUS IN ('UNCLASSIFIED', 'CLASSIFIED', 'REJECTED', 'DELETED'))
);

-- ── 기관 ─────────────────────────────────────────────────────────────
-- ⚠️ 이름과 달리 "기관 마스터"가 아니다. 주소·기관코드 같은 기관 정보가 없는 이유가
--    그것이다. 실제 역할은 둘뿐이다(ClassificationService.classify):
--      ① 기관명 → 카테고리 **매핑표**   ② 등록된 기관만 분류되는 **허용목록**
--    그래서 컬럼 순서도 **입력(INSTITUTION_NAME) → 출력(INSTITUTION_CATEGORY)** 이다.
CREATE TABLE INSTITUTION (
    INSTITUTION_ID       NUMBER(18)         NOT NULL,
    INSTITUTION_NAME     VARCHAR2(200 CHAR) NOT NULL,
    -- 코드값 5종: 지방자치단체 · 공공기관 · 대학교 · 병원 · 법원
    -- (CHECK 미적용 이유는 UPLOADED_FILE.INSTITUTION_CATEGORY 주석 참조)
    INSTITUTION_CATEGORY VARCHAR2(100 CHAR) NOT NULL,
    MODIFIED_AT          TIMESTAMP          NOT NULL,
    CONSTRAINT PK_INSTITUTION PRIMARY KEY (INSTITUTION_ID),
    CONSTRAINT UK_INSTITUTION_NAME UNIQUE (INSTITUTION_NAME)
);

-- ── 인덱스 ───────────────────────────────────────────────────────────
-- ⚠️ 넣기 전에 알아둘 것: **지금 데이터 규모(연 수천 건)에서는 없어도 된다.**
--    수만 행 풀스캔은 밀리초다. 아래 둘만 넣는 이유는 비용이 거의 없고 가장 자주
--    쓰는 접근 경로를 받기 때문이다. `schema-mysql.sql` 에도 같은 둘이 있다.

-- findRecent(대시보드 기본 화면)와 모든 ORDER BY UPLOADED_AT DESC 를 받는다.
-- Oracle 이 인덱스를 역순 스캔해 상위 N건만 읽고 멈출 수 있어 **전체 정렬이 사라진다.**
-- ⚠️ Oracle 11g 의 식별자 상한은 **30바이트**다. 아래 두 이름은 각각 29자로
--    한 글자 여유뿐이다 — 이름을 늘리지 말 것.
CREATE INDEX IDX_UPLOADED_FILE_UPLOADED_AT ON UPLOADED_FILE (UPLOADED_AT);

-- 기관이 주 조회 축이다("A 기관 자료 들어왔나?"). 오늘 당장은
-- findClassifiedByUnknownInstitution(INSTITUTION_NAME = '알수없음' AND STATUS = …)이
-- 이 인덱스를 탄다.
-- ⚠️ 화면 검색(findByInstitutionNameContaining)은 `LIKE '%키워드%'` 라 **선행 와일드카드
--    때문에 이 인덱스를 못 쓴다.** 기관 입력을 드롭다운(정확 일치)으로 바꾸는 후속
--    작업이 끝나야 이 인덱스가 제 값을 한다.
CREATE INDEX IDX_UPLOADED_FILE_INST_STATUS ON UPLOADED_FILE (INSTITUTION_NAME, CLASSIFICATION_STATUS);

-- 넣지 않은 것 — 조건이 오면 그때 넣는다:
--   · (STATUS) 단독 — 재분류 잡의 STATUS='UNCLASSIFIED' 용. 지금은 그 잡이 꺼져 있고
--     (reclassification.cron 비움) 풀스캔도 밀리초라 보류한다. **잡을 켜고 표가
--     10만 행을 넘으면** 그때 넣을 것.
--   · (INSTITUTION_NAME) 단독 — 위 복합 인덱스의 선행 컬럼이라 불필요하다.

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
--   · 인덱스: ~~양쪽 다 PK/UK 뿐~~ → **2026-09-08 에 양쪽에 같은 둘을 넣었다**
--     (UPLOADED_AT · INSTITUTION_NAME+STATUS). 늘리거나 줄일 때도 **두 파일을 같은
--     커밋에서** 함께 고칠 것. 판단 근거는 위 인덱스 절의 주석에 있다.
-- =====================================================================
