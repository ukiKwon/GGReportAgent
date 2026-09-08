-- =====================================================================
-- schema-mysql.sql — uploader 단독 스키마의 MySQL 정본
--
-- 미러 관계: `schema-oracle.sql` 과 **같은 내용**을 MySQL 문법으로 적은 것이다.
--            한쪽이 바뀌면 같은 커밋에서 다른 쪽도 바꾼다.
--            ⚠️ 테이블명·컬럼명·순서·폭·제약·인덱스가 모두 미러 대상이다.
--            바꾼 이유와 판단 근거는 `schema-oracle.sql` 주석에 있다 —
--            여기서는 반복하지 않고 **결과만** 맞춘다.
--
-- 이 파일을 쓰는 곳: 외부망 `out-local`(MySQL) 과 테스트 H2(`MODE=MySQL`).
--                   (`src/test/resources/application.properties` 의
--                    `spring.sql.init.schema-locations`)
--
-- ⚠️ 2026-09-08 — 사내 표준에 맞춰 **컬럼은 한글, 테이블은 코드**(TSKGIAF01·02)로
--    바꿨다. 식별자는 따옴표 없이 쓴다 — MySQL 은 U+0080~U+FFFF 를 무인용 식별자로
--    명시 허용하고, H2 도 한글 식별자를 그대로 받는다.
--    Mapper XML 2개가 이 이름에 묶여 있다.
-- =====================================================================

-- ── 업로드된 파일 (TSKGIAF01) ────────────────────────────────────────
-- ⚠️ 컬럼 순서는 조회 편의로 정했다 — 주 조회 축인 기관명을 앞으로,
--    가장 길고 사람이 읽지 않는 저장경로를 맨 뒤로.
CREATE TABLE IF NOT EXISTS TSKGIAF01 (
    업로드파일ID  BIGINT       NOT NULL AUTO_INCREMENT,
    기관명        VARCHAR(200),
    -- 코드값 5종: 지방자치단체 · 공공기관 · 대학교 · 병원 · 법원
    -- CHECK 는 일부러 걸지 않았다(화면·컨트롤러에 옛 4종이 아직 박혀 있다).
    기관분류      VARCHAR(100),
    문서연도      VARCHAR(4),
    분류상태      VARCHAR(20)  NOT NULL DEFAULT 'UNCLASSIFIED',
    -- 파일명 상한은 파일시스템이 정한다(NTFS·ext4 모두 255자). 종전 500 → 255.
    원본파일명    VARCHAR(255) NOT NULL,
    업로드일시    DATETIME     NOT NULL,
    분류일시      DATETIME,
    -- 종전 1000 → 700. Oracle 쪽이 4000바이트 상한에 걸쳐 있어 줄인 것이고,
    -- 최악 경로가 약 600자라 700 이면 여유가 남는다(근거는 oracle 파일 주석).
    저장경로      VARCHAR(700) NOT NULL,
    PRIMARY KEY (업로드파일ID),
    -- ⚠️ 인덱스를 **CREATE TABLE 안에** 둔 것은 형식만 Oracle 과 다르다(내용은 같다).
    --    Oracle 은 인라인 인덱스를 지원하지 않아 저쪽은 CREATE INDEX 로 분리돼 있다.
    --    여기서 분리하면 안 되는 이유: 테스트 H2 가 `DB_CLOSE_DELAY=-1` 로 컨텍스트
    --    사이에서 DB 를 공유해 이 스크립트가 **여러 번 실행**된다. `CREATE TABLE IF
    --    NOT EXISTS` 는 멱등한데 `CREATE INDEX` 는 아니라서 "Duplicate key name" 으로
    --    기동이 깨진다(2026-09-08 실측).
    KEY IX_TSKGIAF01_업로드일시 (업로드일시),
    KEY IX_TSKGIAF01_기관명분류 (기관명, 분류상태),
    -- ⚠️ MySQL 은 8.0.16 부터 CHECK 를 실제로 강제한다. 그 이전 버전에서는
    --    문법만 통과하고 무시된다 — 검증은 Oracle 쪽 제약이 책임진다.
    CONSTRAINT CK_TSKGIAF01_분류상태 CHECK
        (분류상태 IN ('UNCLASSIFIED', 'CLASSIFIED', 'REJECTED', 'DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 기관 (TSKGIAF02) ─────────────────────────────────────────────────
-- ⚠️ 이름과 달리 "기관 마스터"가 아니라 **기관명 → 기관분류 매핑표 + 허용목록**이다.
--    그래서 컬럼 순서도 입력(기관명) → 출력(기관분류) 이다.
CREATE TABLE IF NOT EXISTS TSKGIAF02 (
    기관ID    BIGINT       NOT NULL AUTO_INCREMENT,
    기관명    VARCHAR(200) NOT NULL,
    기관분류  VARCHAR(100) NOT NULL,
    수정일시  DATETIME     NOT NULL,
    PRIMARY KEY (기관ID),
    UNIQUE KEY UK_TSKGIAF02_기관명 (기관명)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 인덱스 2종은 위 CREATE TABLE 안에 KEY 로 들어가 있다(이유는 그 자리 주석 참조).
-- 판단 근거(왜 이 둘인지, 안 넣은 것은 무엇인지)는 `schema-oracle.sql` 의 인덱스 절.
