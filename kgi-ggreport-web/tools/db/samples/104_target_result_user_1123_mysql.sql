-- =============================================================================
-- !!! 로컬 MySQL 전용 시험 표본 데이터 — NEXT 104 '협약 성과 관리' 화면 확인용 !!!
-- !!! 회사 DB·Oracle·운영 DB에는 절대 넣지 않는다. 마이그레이션이 아니다(번호 없음). !!!
--
-- 사용자 11-23 제공 내용으로 기존 표본(104_target_result_sample_mysql.sql, BUTTON_ID='sample_104')을 바꾼다.
--   재유치 = 도봉구·동작구·동대문구·광진구·노원구
--   신규   = 성북구·강북구·영등포구·강동구·중랑구·송파구
--   실패(타은행) = 서울특별시
-- 기존 표본의 강남·마포·서초·서울시 '국민은행' 값은 사실무근(우리가 만든 가상 값)이라 먼저 모두 지운다.
--
-- 추측 금지 원칙: 직전 약정 줄은 넣지 않는다(직전 은행을 모른다). 그래서 재유치/신규는 목표 구분(TAG_CD)으로 갈린다.
-- !!! 아래 3가지는 사용자가 준 사실이 아니라 '가정'이다 — 결과 줄을 만들기 위한 자리값 !!!
--   약정 시작 2027-01-01 · 약정 끝 2030-12-31 · 순위 FIRST(1금고)
--   (NOTE 칸에도 '날짜·순위 가정'으로 적는다)
-- 서울특별시: 목표 구분을 모른다 — TAG_CD='NEW'는 추정이 아니라 자리값(목표 구분 미상). 실패라서 재유치/신규 집계에는 안 들어간다.
--   결과 줄: 1금고·2금고 모두 신한은행(B03, 사용자 11-23).
--
-- 이미 목표·약정·개시일 행이 하나라도 있는 기관은 건너뛴다(실제 데이터를 건드리지 않음). 기관 표에 없으면 그 기관도 건너뛴다.
-- 식별: 세 표 모두 EDITOR_NAME='표본', BUTTON_ID='sample_104u', EDITOR_EMP_NO='SAMPLE'.
--
-- 부작용: 이 약정 줄은 '금고 약정' 화면에도 그대로 보인다(날짜·순위는 가정값). 확인이 끝나면 아래 되돌리기를 실행한다.
--
-- 적용(저장소 루트에서, 이미 sample_104를 적용했어도 이 파일이 먼저 지운다):
--   mysql -h localhost -P 3306 -u root -p --default-character-set=utf8mb4 ggreportdb < kgi-ggreport-web/tools/db/samples/104_target_result_user_1123_mysql.sql
--   (tools/db/apply-mysql.mjs 로 적용하지 않는다 — 번호 파일 전용)
-- 기대 화면(2026): 목표 12, 협약 11(재유치 5 · 신규 6), 타은행 유치 1, 달성률 91.7%
-- ID 근거: 자치구 003_seed_institutions.sql:20-44, 서울특별시 029_seed_institutions_all.sql:77
-- =============================================================================
SET NAMES utf8mb4;

-- 1) 기존 표본(sample_104)과 이 파일의 이전 실행분(sample_104u)을 먼저 모두 지운다.
DELETE FROM INST_BID_TARGET    WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');
DELETE FROM INST_BANK_CONTRACT WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');
DELETE FROM INST_BID_TERM      WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');

DROP TEMPORARY TABLE IF EXISTS SAMPLE_104U_INST;
CREATE TEMPORARY TABLE SAMPLE_104U_INST (
    INSTITUTION_ID VARCHAR(64) NOT NULL,
    TAG_CD         VARCHAR(20) NOT NULL,   -- RETAIN / NEW (목표 구분)
    WIN_BANK       VARCHAR(10) NOT NULL,   -- B02=KB국민 / ETC=타은행(이름 미상)
    BANK_ETC       VARCHAR(30),
    PRIMARY KEY (INSTITUTION_ID)
);

INSERT INTO SAMPLE_104U_INST (INSTITUTION_ID, TAG_CD, WIN_BANK, BANK_ETC) VALUES
    ('dobong',       'RETAIN', 'B02', NULL),
    ('dongjak',      'RETAIN', 'B02', NULL),
    ('dongdaemun',   'RETAIN', 'B02', NULL),
    ('gwangjin',     'RETAIN', 'B02', NULL),
    ('nowon',        'RETAIN', 'B02', NULL),
    ('seongbuk',     'NEW',    'B02', NULL),
    ('gangbuk',      'NEW',    'B02', NULL),
    ('yeongdeungpo', 'NEW',    'B02', NULL),
    ('gangdong',     'NEW',    'B02', NULL),
    ('jungnang',     'NEW',    'B02', NULL),
    ('songpa',       'NEW',    'B02', NULL),
    ('lg-11-407ce3e346', 'NEW', 'B03', NULL);   -- 서울특별시: 1·2금고 모두 신한은행(사용자 11-23). 목표 구분 미상(자리값 NEW)

-- 기관 표에 없는 기관은 뺀다.
DELETE FROM SAMPLE_104U_INST
 WHERE NOT EXISTS (SELECT 1 FROM INSTITUTIONS i WHERE i.INSTITUTION_ID = SAMPLE_104U_INST.INSTITUTION_ID);
-- 이미 실제 행(목표·약정·개시일)이 있는 기관은 뺀다 — 실제 데이터와 섞지 않는다.
DELETE FROM SAMPLE_104U_INST
 WHERE EXISTS (SELECT 1 FROM INST_BID_TARGET x WHERE x.INSTITUTION_ID = SAMPLE_104U_INST.INSTITUTION_ID)
    OR EXISTS (SELECT 1 FROM INST_BANK_CONTRACT x WHERE x.INSTITUTION_ID = SAMPLE_104U_INST.INSTITUTION_ID)
    OR EXISTS (SELECT 1 FROM INST_BID_TERM x WHERE x.INSTITUTION_ID = SAMPLE_104U_INST.INSTITUTION_ID);

-- 2) 올해(2026) 목표 — GOAL, 번호 1, 판 1
INSERT INTO INST_BID_TARGET
    (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT, KIND_CD)
SELECT t.INSTITUTION_ID, 1, 1, 'SAVE', 2026, t.TAG_CD, '표본(사용자 제공 11-23)', NULL, NULL,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104u',
       0, '2026-03-02T01:00:00Z', 'GOAL'
  FROM SAMPLE_104U_INST t;

-- 3) 결과 약정 한 줄(직전 약정 줄은 만들지 않는다). 날짜·순위는 가정값.
INSERT INTO INST_BANK_CONTRACT
    (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC, TERM_FROM, TERM_TO,
     SRC_KIND, SRC_URL, SRC_NO, CHECKED_DATE, CHECKED_DEPT, NOTE, ACCOUNT_CD, ACCOUNT_ETC, OVERLAP_CONFIRMED,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT)
SELECT t.INSTITUTION_ID, 1, 1, 'SAVE', 'MANUAL', 'FIRST', t.WIN_BANK, t.BANK_ETC, '2027-01-01', '2030-12-31',
       'STAFF', NULL, NULL, '2026-11-23', '표본', '사용자 제공 결과(11-23) — 날짜·순위 가정, 표본', NULL, NULL, 0,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104u',
       0, '2026-11-23T01:00:00Z'
  FROM SAMPLE_104U_INST t;

-- 3-2) 서울특별시 2금고도 신한은행(사용자 11-23) — 날짜는 1금고와 같은 가정값
INSERT INTO INST_BANK_CONTRACT
    (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC, TERM_FROM, TERM_TO,
     SRC_KIND, SRC_URL, SRC_NO, CHECKED_DATE, CHECKED_DEPT, NOTE, ACCOUNT_CD, ACCOUNT_ETC, OVERLAP_CONFIRMED,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT)
SELECT t.INSTITUTION_ID, 2, 1, 'SAVE', 'MANUAL', 'SECOND', 'B03', NULL, '2027-01-01', '2030-12-31',
       'STAFF', NULL, NULL, '2026-11-23', '표본', '사용자 제공 결과(11-23) — 날짜 가정, 표본', NULL, NULL, 0,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104u',
       0, '2026-11-23T01:00:00Z'
  FROM SAMPLE_104U_INST t
 WHERE t.INSTITUTION_ID = 'lg-11-407ce3e346';

COMMIT;

-- 확인 1) 기관별 들어감/건너뜀(건너뜀 = 기관 표에 없거나 이미 실제 행이 있음)
SELECT n.INSTITUTION_ID AS 기관ID,
       COALESCE(i.NAME_KO, '(기관 표에 없음)') AS 기관명,
       CASE WHEN EXISTS (SELECT 1 FROM INST_BID_TARGET x
                          WHERE x.INSTITUTION_ID = n.INSTITUTION_ID AND x.BUTTON_ID = 'sample_104u')
            THEN '들어감' ELSE '건너뜀' END AS 결과
  FROM (SELECT 'dobong' AS INSTITUTION_ID UNION ALL SELECT 'dongjak' UNION ALL SELECT 'dongdaemun'
        UNION ALL SELECT 'gwangjin' UNION ALL SELECT 'nowon' UNION ALL SELECT 'seongbuk'
        UNION ALL SELECT 'gangbuk' UNION ALL SELECT 'yeongdeungpo' UNION ALL SELECT 'gangdong'
        UNION ALL SELECT 'jungnang' UNION ALL SELECT 'songpa' UNION ALL SELECT 'lg-11-407ce3e346') n
  LEFT JOIN INSTITUTIONS i ON i.INSTITUTION_ID = n.INSTITUTION_ID;

-- 확인 2) 기대 표본_기관 12 · 표본_약정 13 · 표본_개시일 0 (적으면 위 목록에서 '건너뜀'을 본다)
SELECT (SELECT COUNT(DISTINCT INSTITUTION_ID) FROM INST_BID_TARGET WHERE BUTTON_ID = 'sample_104u') AS 표본_기관,
       (SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE BUTTON_ID = 'sample_104u') AS 표본_약정,
       (SELECT COUNT(*) FROM INST_BID_TERM WHERE BUTTON_ID = 'sample_104u') AS 표본_개시일;

DROP TEMPORARY TABLE IF EXISTS SAMPLE_104U_INST;

-- =============================================================================
-- 되돌리기(표본 행만 지운다 — 주석을 풀어 따로 실행. 이 파일을 통째로 다시 돌리면 표본이 다시 들어간다):
--   DELETE FROM INST_BID_TARGET    WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   DELETE FROM INST_BANK_CONTRACT WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   DELETE FROM INST_BID_TERM      WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   COMMIT;
-- =============================================================================
