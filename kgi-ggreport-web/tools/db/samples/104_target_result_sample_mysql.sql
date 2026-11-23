-- =============================================================================
-- !!! 로컬 MySQL 전용 시험 표본 데이터 — NEXT 104 '협약 성과 관리' 화면 확인용 !!!
-- !!! 회사 DB·Oracle·운영 DB에는 절대 넣지 않는다. 마이그레이션이 아니다(번호 없음). !!!
-- !!! 값은 모두 가상이다. 실제 계약·실제 은행 결과가 아니다. 보고서·화면 캡처를 외부에 내보내기 전에 되돌린다. !!!
--
-- 올해(2026) 국민은행 목표·결과를 가정해 서울특별시 본청·청주시청·서울 자치구 등 14곳에 만든다(실제 약정 사실과 무관).
-- 이미 목표·약정·개시일 행이 하나라도 있는 기관은 자동으로 건너뛴다(실제 데이터를 건드리지 않음).
-- 그 기관이 INSTITUTIONS 에 없으면 그 기관도 건너뛴다.
-- 식별: 세 표 모두 EDITOR_NAME='표본', BUTTON_ID='sample_104', EDITOR_EMP_NO='SAMPLE'.
--
-- 적용(터미널 한 줄, 저장소 루트에서):
--   mysql -h localhost -P 3306 -u root -p --default-character-set=utf8mb4 ggreportdb < kgi-ggreport-web/tools/db/samples/104_target_result_sample_mysql.sql
--   (tools/db/apply-mysql.mjs 로 적용하지 않는다 — 번호 파일 전용이라 적용 기록표(SCHEMA_MIGRATION)에 남는다)
-- 되돌리기: 맨 아래 'DELETE' 3문을 실행(표본 행만 지운다).
-- 두 번 실행해도 안전하다: 첫 실행에서 넣은 기관은 '기존 행 있음'으로 보여 두 번째에는 건너뛴다.
-- 시나리오(오늘 2026-11-23 기준 기대, 화면 말):
--   재유치 4 : 서울특별시 본청 lg-11-407ce3e346(1금고) gangnam(1금고) seocho(1금고) mapo(2금고)  직전 KB → 2027-01 KB
--   신규 2 : nowon(1금고) gwangjin(2금고)                                                        직전 신한 → 2027-01 KB
--   타은행 유치 3 : dobong(1금고, 우리) guro(1금고, 하나) yangcheon(2금고, 신한)
--   결과 대기 3 : jongno yongsan(약정·개시일 없음) seongdong(개시일 2027-01-01)
--   확인 필요 1 : 청주시청 lg-43-d6264750df (개시일 2026-11-01 이 지났는데 약정 없음)
--   연중에 뺀 곳 1 : dongjak (목표로 넣었다가 CANCEL, 사유 DROPPED)
-- 기대 화면(이 14곳의 기여분): 목표 13, 협약 6(재유치 4·신규 2, 1금고 4·2금고 2), 타은행 유치 3, 결과 대기 3, 확인 필요 1, 뺀 곳 1, 달성률 66.7%
-- ID 근거: 서울특별시 029_seed_institutions_all.sql:77, 청주시청 029:200, 자치구 003_seed_institutions.sql:20-44
-- =============================================================================
SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS SAMPLE_104_INST;
CREATE TEMPORARY TABLE SAMPLE_104_INST (
    INSTITUTION_ID VARCHAR(64) NOT NULL,
    SCEN           VARCHAR(10) NOT NULL,   -- WIN / LOSE / WAIT / REMOVED
    TAG_CD         VARCHAR(20) NOT NULL,   -- RETAIN / NEW
    RANK_CD        VARCHAR(20),            -- FIRST / SECOND (약정이 있는 시나리오만)
    PRIOR_BANK     VARCHAR(10),            -- 직전 약정 은행 코드 (B02=KB국민, B03=신한, B04=우리, B05=하나)
    WIN_BANK       VARCHAR(10),            -- 2027-01 시작 약정 은행 코드
    TERM_START     VARCHAR(10),            -- RFP 협약 개시일 기록(INST_BID_TERM), 없으면 NULL
    PRIMARY KEY (INSTITUTION_ID)
);

INSERT INTO SAMPLE_104_INST (INSTITUTION_ID, SCEN, TAG_CD, RANK_CD, PRIOR_BANK, WIN_BANK, TERM_START) VALUES
    ('gangnam',   'WIN',     'RETAIN', 'FIRST',  'B02', 'B02', NULL),
    ('seocho',    'WIN',     'RETAIN', 'FIRST',  'B02', 'B02', NULL),
    ('mapo',      'WIN',     'RETAIN', 'SECOND', 'B02', 'B02', NULL),
    ('lg-11-407ce3e346', 'WIN', 'RETAIN', 'FIRST', 'B02', 'B02', NULL),   -- 서울특별시 본청(029:77)
    ('nowon',     'WIN',     'NEW',    'FIRST',  'B03', 'B02', NULL),
    ('gwangjin',  'WIN',     'NEW',    'SECOND', 'B03', 'B02', NULL),
    ('dobong',    'LOSE',    'RETAIN', 'FIRST',  'B02', 'B04', NULL),
    ('guro',      'LOSE',    'RETAIN', 'FIRST',  'B02', 'B05', NULL),
    ('yangcheon', 'LOSE',    'NEW',    'SECOND', 'B05', 'B03', NULL),
    ('jongno',    'WAIT',    'RETAIN', NULL,     NULL,  NULL,  NULL),
    ('yongsan',   'WAIT',    'NEW',    NULL,     NULL,  NULL,  NULL),
    ('seongdong', 'WAIT',    'RETAIN', NULL,     NULL,  NULL,  '2027-01-01'),
    ('lg-43-d6264750df', 'WAIT', 'NEW', NULL, NULL, NULL, '2026-11-01'),   -- 청주시청(029:200)
    ('dongjak',   'REMOVED', 'NEW',    NULL,     NULL,  NULL,  NULL);

-- 기관 표에 없는 기관은 뺀다.
DELETE FROM SAMPLE_104_INST
 WHERE NOT EXISTS (SELECT 1 FROM INSTITUTIONS i WHERE i.INSTITUTION_ID = SAMPLE_104_INST.INSTITUTION_ID);
-- 이미 실제 행(목표·약정·개시일)이 하나라도 있는 기관은 뺀다 — 실제 데이터와 섞지 않는다.
DELETE FROM SAMPLE_104_INST
 WHERE EXISTS (SELECT 1 FROM INST_BID_TARGET x WHERE x.INSTITUTION_ID = SAMPLE_104_INST.INSTITUTION_ID)
    OR EXISTS (SELECT 1 FROM INST_BANK_CONTRACT x WHERE x.INSTITUTION_ID = SAMPLE_104_INST.INSTITUTION_ID)
    OR EXISTS (SELECT 1 FROM INST_BID_TERM x WHERE x.INSTITUTION_ID = SAMPLE_104_INST.INSTITUTION_ID);

-- 1) 올해(2026) 목표 기관 — GOAL, 번호 1, 판 1
INSERT INTO INST_BID_TARGET
    (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT, KIND_CD)
SELECT t.INSTITUTION_ID, 1, 1, 'SAVE', 2026, t.TAG_CD, '표본(시험용)', NULL, NULL,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104',
       0, '2026-03-02T01:00:00Z', 'GOAL'
  FROM SAMPLE_104_INST t;

-- 2) 연중에 뺀 곳 — 같은 목표 번호 판 2 = CANCEL, 사유 DROPPED(목표 변경·포기)
INSERT INTO INST_BID_TARGET
    (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT, KIND_CD)
SELECT t.INSTITUTION_ID, 1, 2, 'CANCEL', 2026, t.TAG_CD, '표본(시험용)', NULL, NULL,
       'DROPPED', NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104',
       0, '2026-06-15T01:00:00Z', 'GOAL'
  FROM SAMPLE_104_INST t
 WHERE t.SCEN = 'REMOVED';

-- 3) 직전 약정(2023-01-01 ~ 2026-12-31) — 재유치·신규 구분의 근거
INSERT INTO INST_BANK_CONTRACT
    (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC, TERM_FROM, TERM_TO,
     SRC_KIND, SRC_URL, SRC_NO, CHECKED_DATE, CHECKED_DEPT, NOTE, ACCOUNT_CD, ACCOUNT_ETC, OVERLAP_CONFIRMED,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT)
SELECT t.INSTITUTION_ID, 1, 1, 'SAVE', 'MANUAL', t.RANK_CD, t.PRIOR_BANK, NULL, '2023-01-01', '2026-12-31',
       'STAFF', NULL, NULL, '2026-11-23', '표본', '표본(시험용)', NULL, NULL, 0,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104',
       0, '2026-11-23T01:00:00Z'
  FROM SAMPLE_104_INST t
 WHERE t.PRIOR_BANK IS NOT NULL;

-- 4) 2027-01-01 시작 약정(올해 입찰 결과) — 1월 시작이라 2026 목표로 귀속된다
INSERT INTO INST_BANK_CONTRACT
    (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC, TERM_FROM, TERM_TO,
     SRC_KIND, SRC_URL, SRC_NO, CHECKED_DATE, CHECKED_DEPT, NOTE, ACCOUNT_CD, ACCOUNT_ETC, OVERLAP_CONFIRMED,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT)
SELECT t.INSTITUTION_ID, 2, 1, 'SAVE', 'MANUAL', t.RANK_CD, t.WIN_BANK, NULL, '2027-01-01', '2030-12-31',
       'STAFF', NULL, NULL, '2026-11-23', '표본', '표본(시험용)', NULL, NULL, 0,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104',
       0, '2026-11-23T01:00:00Z'
  FROM SAMPLE_104_INST t
 WHERE t.WIN_BANK IS NOT NULL;

-- 5) RFP 협약 개시일 기록(2026 입찰분)
INSERT INTO INST_BID_TERM
    (INSTITUTION_ID, TARGET_YEAR, REV_NO, ACTION_CD, TERM_START, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED,
     SCREEN_ID, BUTTON_ID, UI_VALID, SAVED_AT)
SELECT t.INSTITUTION_ID, 2026, 1, 'SAVE', t.TERM_START, 'SAMPLE', '표본', 0,
       'sample', 'sample_104', 0, '2026-11-23T01:00:00Z'
  FROM SAMPLE_104_INST t
 WHERE t.TERM_START IS NOT NULL;

COMMIT;

-- 확인: 실제로 들어간 표본. 기대 표본_기관 14 · 표본_약정 18 · 표본_개시일 2 (적으면 건너뛴 기관이 있다)
SELECT (SELECT COUNT(DISTINCT INSTITUTION_ID) FROM INST_BID_TARGET WHERE BUTTON_ID = 'sample_104') AS 표본_기관,
       (SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE BUTTON_ID = 'sample_104') AS 표본_약정,
       (SELECT COUNT(*) FROM INST_BID_TERM WHERE BUTTON_ID = 'sample_104') AS 표본_개시일;

DROP TEMPORARY TABLE IF EXISTS SAMPLE_104_INST;

-- =============================================================================
-- 되돌리기(표본 행만 지운다 — 식별값이 같은 행만):
--   DELETE FROM INST_BID_TARGET    WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104';
--   DELETE FROM INST_BANK_CONTRACT WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104';
--   DELETE FROM INST_BID_TERM      WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104';
--   COMMIT;
-- (위 3문은 주석을 풀어 따로 실행한다. 이 파일을 통째로 다시 돌리면 표본이 다시 들어간다.)
-- =============================================================================
