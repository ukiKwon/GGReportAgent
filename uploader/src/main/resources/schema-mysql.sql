-- =====================================================================
-- schema-mysql.sql — uploader 단독 스키마의 MySQL 정본
--
-- 미러 관계: `schema-oracle.sql` 과 **같은 내용**을 MySQL 문법으로 적은 것이다.
--            한쪽이 바뀌면 같은 커밋에서 다른 쪽도 바꾼다.
--            바꾼 이유·인포타입·코드표는 저쪽 주석에 있다 — 여기서는 결과만 맞춘다.
--
-- 이 파일을 쓰는 곳: 외부망 `out-local`(MySQL) 과 테스트 H2(`MODE=MySQL`).
--
-- ⚠️ 일부러 다른 것 하나: PK 를 **BIGINT AUTO_INCREMENT** 로 둔다. Oracle 쪽은
--    인포타입 그대로 `DECIMAL(16)` + 시퀀스인데, MySQL 의 AUTO_INCREMENT 는
--    DECIMAL 에 걸 수 없다. 자릿수(16)는 BIGINT 안에 들어가므로 값은 같다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS TSKGIAF01 (
    업로드파일일련번호  BIGINT       NOT NULL AUTO_INCREMENT,
    기관명              VARCHAR(250),
    -- 코드값: 01 지방자치단체 / 02 공공기관 / 03 대학교 / 04 병원 / 05 법원
    기관구분            VARCHAR(2),
    문서년              VARCHAR(4),
    -- 코드값: 01 UNCLASSIFIED / 02 CLASSIFIED / 03 REJECTED / 04 DELETED
    분류상태구분        VARCHAR(2)   NOT NULL DEFAULT '01',
    원본파일명          VARCHAR(260) NOT NULL,
    -- 시각은 문자열 YYYYMMDDHH24MISS (사내 표준). 자바는 LocalDateTime 그대로.
    업로드일시          VARCHAR(20)  NOT NULL,
    분류일시            VARCHAR(20),
    저장경로            VARCHAR(800) NOT NULL,
    PRIMARY KEY (업로드파일일련번호),
    -- ⚠️ 인덱스를 CREATE TABLE 안에 둔 것은 형식만 Oracle 과 다르다. 분리하면
    --    테스트 H2 가 DB 를 공유해 스크립트를 여러 번 돌릴 때 "Duplicate key name"
    --    으로 깨진다(CREATE TABLE IF NOT EXISTS 는 멱등한데 CREATE INDEX 는 아니다).
    -- 열 순서가 전부다 — (기관명, 업로드일시) 라서 기관 조회 + 최신순 정렬이
    -- 정렬 없이 처리된다. 근거는 schema-oracle.sql 의 인덱스 절.
    KEY IX_TSKGIAF01_기관명일시 (기관명, 업로드일시),
    -- ⚠️ MySQL 은 8.0.16 부터 CHECK 를 실제로 강제한다.
    CONSTRAINT CK_TSKGIAF01_분류상태 CHECK (분류상태구분 IN ('01', '02', '03', '04'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS TSKGIAF02 (
    기관일련번호  BIGINT       NOT NULL AUTO_INCREMENT,
    기관명        VARCHAR(250) NOT NULL,
    기관구분      VARCHAR(2)   NOT NULL,
    수정일시      VARCHAR(20)  NOT NULL,
    PRIMARY KEY (기관일련번호),
    UNIQUE KEY UK_TSKGIAF02_기관명 (기관명)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
