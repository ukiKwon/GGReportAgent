-- =====================================================================
-- 🔴 2026-09-23 결정: **이 DDL 은 적용하지 않는다.**
--    소스를 스키마 무변경안으로 고쳤다(커밋 9c42b28). 앱은 기존 11개 컬럼만 쓴다.
--      · 문서종류 = 원본파일명 확장자
--      · 파싱 성공 = 저장경로내용이 .json/.md
--      · 공고일·연도 = 산출물 파일명 앞 토큰 · 파싱시각 = 분류일시
--    이 파일은 **나중에 파싱 실패 사유를 DB 에 남겨야 할 때** 쓰려고 남겨 둔다.
--    그때는 7개가 아니라 파싱상태구분 + 파싱메시지내용 **2개만** 추가하면 된다
--    (TODO_modify.md 의 "내부망 스키마 변경 폭 줄이기" 참조).
-- =====================================================================

-- =====================================================================
-- 2026-09-23 — TSKGIAF01 에 파싱 관련 컬럼 7개 추가 (MySQL, 외부망 out-local)
--
-- 미러: `2026-09-23_TSKGIAF01_파싱컬럼추가-oracle.sql` 과 **같은 내용**이다.
--       바꾼 이유·컬럼 설명·이름 짓기 근거는 저쪽 주석에 있다 — 여기서는 결과만 맞춘다.
--
-- Oracle 판과 일부러 다른 것 3가지
--   1. VARCHAR2(n CHAR) → VARCHAR(n)   (MySQL 은 길이가 원래 문자 단위)
--   2. DECIMAL(5) 는 그대로 쓴다        (앱이 Integer 로 받는다)
--   3. ADD COLUMN 을 한 문장에 묶었다   (MySQL 문법)
--
-- ⚠️ **실행 인코딩.** 2026-09-22 에 이 DB 에서 한글 컬럼명이 모지바케로 만들어져
--    `Unknown column '분류상태구분'` 이 났다. 되풀이하지 않으려면 둘 중 하나로 실행한다.
--      · MySQL Workbench 로 파일을 열어 실행 (기본이 UTF-8 이다)
--      · CLI 라면: mysql --default-character-set=utf8mb4 -u uploader -p uploaderdb \
--                        -e "source .../2026-09-23_TSKGIAF01_파싱컬럼추가-mysql.sql"
--    ⚠️ PowerShell 에서 파이프(`Get-Content | mysql`)로 넘기지 말 것 — 5.1 이 한글을 깨뜨린다.
--
-- ⚠️ MySQL 8.0.16+ 는 CHECK 를 실제로 강제한다(5.7 은 무시한다).
-- ⚠️ 재실행하면 ER_DUP_FIELDNAME(1060)으로 실패한다. 파일 끝 롤백을 먼저 돌릴 것.
--
-- ⚠️ **DEFAULT 를 넣지 않았다.** MySQL 은 ADD COLUMN 에 DEFAULT 를 주면 기존 행까지
--    그 값으로 채우는데, Oracle 은 NULL 로 남긴다. 두 환경을 같게 두려고 기본값을
--    두지 않고 값은 앱이 INSERT 때 채운다. 기존 행은 전부 NULL 이다("이전 방식" 표시).
-- ⚠️ 적용 전 확인: **컬럼 수를 줄이는 절충안이 검토 대기 중이다**(2026-09-23).
--    7개 중 5개(문서종류구분·파싱산출물경로내용·문서일자·파싱일시·문서페이지수)는
--    기존 컬럼과 산출물 파일명으로 대체할 수 있다. 내부망은 DDL 한 줄도 DBA 승인이
--    필요하므로, DBA 제출 전에 GGFileserver/uploader/TODO/TODO_modify.md 의
--    "내부망 스키마 변경 폭 줄이기" 항목을 먼저 읽고 최종안을 정할 것.
--    (권장 절충안: 파싱상태구분 + 파싱메시지내용 **2개만** 추가)
-- =====================================================================

-- ── 1. 컬럼 추가 ─────────────────────────────────────────────────────
ALTER TABLE TSKGIAF01
    -- 🔴 코드값. 01 입찰제안서(ppt·pptx) / 02 입찰공고문 RFP(pdf·hwp·hwpx)
    ADD COLUMN 문서종류구분       VARCHAR(2),
    -- 🔴 코드값. 01 PENDING / 02 SUCCESS / 03 FAILED
    --    ⚠️ 분류상태구분(기관분류 확정 여부)과 다른 축이다.
    ADD COLUMN 파싱상태구분       VARCHAR(2),
    ADD COLUMN 파싱메시지내용     VARCHAR(1000),
    -- 산출물(제안서 JSON · RFP 요약 MD) 경로. 원본 경로인 저장경로내용과 다르다.
    ADD COLUMN 파싱산출물경로내용 VARCHAR(600),
    -- 🔴 시각이 문자열이다(사내 표준). YYYYMMDDHH24MISS 14자.
    ADD COLUMN 파싱일시           VARCHAR(14),
    -- 제안서는 슬라이드 수, RFP 는 페이지 수.
    ADD COLUMN 문서페이지수       DECIMAL(5),
    -- 제안서는 연도(4자리), RFP 는 공고일(YYYYMMDD). 기존 문서년(4)은 남겨 둔다.
    ADD COLUMN 문서일자           VARCHAR(8);

-- ── 2. 코드값 제약 ───────────────────────────────────────────────────
-- 기존 행은 NULL 이고 CHECK 는 NULL 을 위반으로 보지 않으므로 그대로 통과한다.
ALTER TABLE TSKGIAF01
    ADD CONSTRAINT CK_TSKGIAF01_문서종류 CHECK (문서종류구분 IN ('01', '02')),
    ADD CONSTRAINT CK_TSKGIAF01_파싱상태 CHECK (파싱상태구분 IN ('01', '02', '03'));

-- ── 3. 인덱스 ────────────────────────────────────────────────────────
-- 파싱 현황 화면·대시보드 KPI 가 `파싱상태구분 = ?` 으로 센다.
-- 두 번째 열이 PK 라 ORDER BY 업로드파일일련번호 DESC 정렬까지 인덱스가 받는다.
CREATE INDEX IX_TSKGIAF01_파싱상태 ON TSKGIAF01 (파싱상태구분, 업로드파일일련번호);

-- ── 4. 검증 ──────────────────────────────────────────────────────────
-- ⓐ 컬럼명이 정상 한글인지. HEX 까지 보는 이유는 화면에서 멀쩡해 보여도
--    깨진 바이트(EFBFBD = 복원 불가)가 섞일 수 있기 때문이다.
SELECT COLUMN_NAME, HEX(COLUMN_NAME), COLUMN_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TSKGIAF01'
 ORDER BY ORDINAL_POSITION;
--    정상이라면 HEX 가 아래와 같다(UTF-8). EFBFBD 가 섞여 있으면 깨진 것이다.
--          파싱상태구분 → ED8C8CEC8BB1EC8381ED839CEAB5ACEBB684
--          문서종류구분 → EBACB8EC849CECA285EBA598EAB5ACEBB684

-- ⓑ 앱이 실제로 쓰는 조건이 도는지. 1054(Unknown column)가 나면 컬럼명이 어긋난 것이다.
SELECT COUNT(*) FROM TSKGIAF01 WHERE 파싱상태구분 = '03';

-- ⓒ 옛 행이 그대로인지(파싱 컬럼은 전부 NULL 이어야 한다).
SELECT COUNT(*) AS 전체, COUNT(문서종류구분) AS 문서종류있음, COUNT(파싱상태구분) AS 파싱상태있음
  FROM TSKGIAF01;

-- ── 5. 롤백 ──────────────────────────────────────────────────────────
-- ⚠️ 컬럼을 지우면 그 안의 데이터도 사라진다.
-- DROP INDEX IX_TSKGIAF01_파싱상태 ON TSKGIAF01;
-- ALTER TABLE TSKGIAF01
--     DROP CONSTRAINT CK_TSKGIAF01_파싱상태,
--     DROP CONSTRAINT CK_TSKGIAF01_문서종류,
--     DROP COLUMN 문서종류구분, DROP COLUMN 파싱상태구분, DROP COLUMN 파싱메시지내용,
--     DROP COLUMN 파싱산출물경로내용, DROP COLUMN 파싱일시, DROP COLUMN 문서페이지수,
--     DROP COLUMN 문서일자;

-- ── 6. 이 DDL 만으로는 끝나지 않는다 (소스 작업) ─────────────────────
--   · UploadedFileMapper.xml — resultMap 에 새 컬럼 7개, INSERT/UPDATE 컬럼 목록 수정.
--     ⚠️ resultMap 에 빠뜨리면 DB 에는 들어가는데 조회하면 늘 NULL 이다.
--   · DocType·ParseStatus 코드 클래스와 TypeHandler 2개.
--   · 도메인 UploadedFile 필드 7개, 파싱 서비스·파싱 현황 화면 이식.
-- =====================================================================
