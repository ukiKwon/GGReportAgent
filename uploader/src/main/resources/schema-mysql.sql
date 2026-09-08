-- =====================================================================
-- schema-mysql.sql — uploader 단독 스키마의 MySQL 정본
--
-- 미러 관계: `schema-oracle.sql` 과 **같은 내용**을 MySQL 문법으로 적은 것이다.
--            한쪽이 바뀌면 같은 커밋에서 다른 쪽도 바꾼다.
--            ⚠️ 컬럼명·순서·폭·제약·인덱스가 모두 미러 대상이다.
--            바꾼 이유와 판단 근거는 `schema-oracle.sql` 주석에 있다 —
--            여기서는 반복하지 않고 **결과만** 맞춘다.
--
-- 이 파일을 쓰는 곳: 외부망 `out-local`(MySQL) 과 테스트 H2(`MODE=MySQL`).
--                   (`src/test/resources/application.properties` 의
--                    `spring.sql.init.schema-locations`)
--
-- ⚠️ 2026-09-08 에 컬럼명을 전부 다시 지었다. Mapper XML 2개가 이 이름에 묶여 있다.
-- =====================================================================

-- ⚠️ 컬럼 순서는 조회 편의로 정했다 — 주 조회 축인 기관을 앞으로,
--    가장 길고 사람이 읽지 않는 STORED_FILE_PATH 를 맨 뒤로.
CREATE TABLE IF NOT EXISTS UPLOADED_FILE (
    UPLOADED_FILE_ID      BIGINT       NOT NULL AUTO_INCREMENT,
    INSTITUTION_NAME      VARCHAR(200),
    -- 코드값 5종: 지방자치단체 · 공공기관 · 대학교 · 병원 · 법원
    -- CHECK 는 일부러 걸지 않았다(화면·컨트롤러에 옛 4종이 아직 박혀 있다).
    INSTITUTION_CATEGORY  VARCHAR(100),
    DOCUMENT_YEAR         VARCHAR(4),
    CLASSIFICATION_STATUS VARCHAR(20)  NOT NULL DEFAULT 'UNCLASSIFIED',
    -- 파일명 상한은 파일시스템이 정한다(NTFS·ext4 모두 255자). 종전 500 → 255.
    ORIGINAL_FILE_NAME    VARCHAR(255) NOT NULL,
    UPLOADED_AT           DATETIME     NOT NULL,
    CLASSIFIED_AT         DATETIME,
    -- 종전 1000 → 700. Oracle 쪽이 4000바이트 상한에 걸쳐 있어 줄인 것이고,
    -- 최악 경로가 약 600자라 700 이면 여유가 남는다(근거는 oracle 파일 주석).
    STORED_FILE_PATH      VARCHAR(700) NOT NULL,
    PRIMARY KEY (UPLOADED_FILE_ID),
    -- ⚠️ 인덱스를 **CREATE TABLE 안에** 둔 것은 형식만 Oracle 과 다르다(내용은 같다).
    --    Oracle 은 인라인 인덱스를 지원하지 않아 저쪽은 CREATE INDEX 로 분리돼 있다.
    --    여기서 분리하면 안 되는 이유: 테스트 H2 가 `DB_CLOSE_DELAY=-1` 로 컨텍스트
    --    사이에서 DB 를 공유해 이 스크립트가 **여러 번 실행**된다. `CREATE TABLE IF
    --    NOT EXISTS` 는 멱등한데 `CREATE INDEX` 는 아니라서 "Duplicate key name" 으로
    --    기동이 깨진다(2026-09-08 실측).
    KEY IDX_UPLOADED_FILE_UPLOADED_AT (UPLOADED_AT),
    KEY IDX_UPLOADED_FILE_INST_STATUS (INSTITUTION_NAME, CLASSIFICATION_STATUS),
    -- ⚠️ MySQL 은 8.0.16 부터 CHECK 를 실제로 강제한다. 그 이전 버전에서는
    --    문법만 통과하고 무시된다 — 검증은 Oracle 쪽 제약이 책임진다.
    CONSTRAINT CK_UPLOADED_FILE_STATUS CHECK
        (CLASSIFICATION_STATUS IN ('UNCLASSIFIED', 'CLASSIFIED', 'REJECTED', 'DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ⚠️ 이름과 달리 "기관 마스터"가 아니라 **기관명 → 카테고리 매핑표 + 허용목록**이다.
--    그래서 컬럼 순서도 입력(INSTITUTION_NAME) → 출력(INSTITUTION_CATEGORY) 이다.
CREATE TABLE IF NOT EXISTS INSTITUTION (
    INSTITUTION_ID       BIGINT       NOT NULL AUTO_INCREMENT,
    INSTITUTION_NAME     VARCHAR(200) NOT NULL,
    INSTITUTION_CATEGORY VARCHAR(100) NOT NULL,
    MODIFIED_AT          DATETIME     NOT NULL,
    PRIMARY KEY (INSTITUTION_ID),
    UNIQUE KEY UK_INSTITUTION_NAME (INSTITUTION_NAME)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 인덱스 2종은 위 CREATE TABLE 안에 KEY 로 들어가 있다(이유는 그 자리 주석 참조).
-- 판단 근거(왜 이 둘인지, 안 넣은 것은 무엇인지)는 `schema-oracle.sql` 의 인덱스 절.
