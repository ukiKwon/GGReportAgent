-- =============================================================================
-- !!! 로컬 MySQL 전용 시험 표본 데이터 — NEXT 104 '협약 성과 관리' 화면 확인용 !!!
-- !!! 회사 DB·Oracle·운영 DB에는 절대 넣지 않는다. 마이그레이션이 아니다(번호 없음). !!!
--
-- 사용자 11-23: 104_target_result_user_1123_mysql.sql 은 동작구·강동구를 '이미 실제 행 있음'으로 건너뛰었다.
--   이번 파일이 두 기관을 추가한다(둘 다 국민은행 B02).
--   동작구(dongjak)  = 재유치(RETAIN)
--   강동구(gangdong) = 신규(NEW)
--
-- 규칙: 기존 행은 고치거나 지우지 않는다. 추가(INSERT)만 한다. 이 파일에는 DELETE가 없다.
--   목표: 그 기관에 '최신 REV가 GOAL·2026·CANCEL 아님'인 목표 번호가 이미 있으면 넣지 않는다.
--         없으면 TARGET_NO = 그 기관 MAX(TARGET_NO)+1, REV 1, GOAL 2026.
--   약정: 그 기관 최신 SAVE 약정 중 BANK_CD='B02' 이고 TERM_FROM 이 '2027-01' 로 시작하는 줄이 있으면 넣지 않는다.
--         2027-01 시작인 '다른 은행' 줄이 있으면 같은 순위 비교가 섞이므로 넣지 않고 확인 SELECT 에 '충돌'로 표시한다.
--         없으면 CONTRACT_NO = MAX+1, FIRST, B02, 2027-01-01 ~ 2030-12-31.
--   !!! 날짜(2027-01-01~2030-12-31)·순위(FIRST)는 사용자가 준 사실이 아니라 '가정' 이다(NOTE 칸에도 적는다) !!!
--   식별: EDITOR_NAME='표본', BUTTON_ID='sample_104u', EDITOR_EMP_NO='SAMPLE' — 기존 되돌리기 DELETE 로 함께 지워진다.
--   여러 번 돌려도 같은 결과다(두 번째부터는 '이미 있음'으로 넣지 않는다).
--
-- 기대 화면(2026): 기존 표본 10곳 + 이 두 곳 → 목표 12, 협약 11(재유치 5 · 신규 6), 타은행 유치 1, 달성률 11/12 = 91.7%
--   !!! 단, 아래 이유로 달라질 수 있다 !!!
--   - 동작·강동에 이미 있는 실제 목표/약정 때문에 이 파일이 한쪽 또는 둘 다 건너뛸 수 있다(확인 SELECT 참고).
--   - 동작·강동에 실제 행이 있으면 기존 실제 행도 화면 집계에 함께 잡혀 숫자가 늘거나 줄 수 있다.
--   - 기존 10곳 표본(sample_104u)이 지금 DB에 실제로 들어 있어야 10곳이 된다(104_..._user_1123_mysql.sql 적용 여부).
--   - 기존 파일에서 다른 기관이 건너뛰어졌다면 그 숫자만큼 줄어든다.
--
-- 적용(저장소 루트에서):
--   mysql -h localhost -P 3306 -u root -p --default-character-set=utf8mb4 ggreportdb < kgi-ggreport-web/tools/db/samples/104_target_result_user_1123_add_mysql.sql
--   (tools/db/apply-mysql.mjs 로 적용하지 않는다 — 번호 파일 전용)
-- =============================================================================
SET NAMES utf8mb4;

-- 0) 미리보기 — 두 기관의 기존 행(실행 결과를 공유해 주면 이유를 확인할 수 있다)
SELECT '목표' AS 종류, INSTITUTION_ID AS 기관ID, CAST(TARGET_NO AS CHAR) AS 번호, REV_NO, ACTION_CD AS ACTION,
       KIND_CD AS KIND, CAST(TARGET_YEAR AS CHAR) AS 연도, TAG_CD AS 은행_또는_구분, NULL AS 기간,
       EDITOR_NAME, BUTTON_ID
  FROM INST_BID_TARGET WHERE INSTITUTION_ID IN ('dongjak', 'gangdong')
UNION ALL
SELECT '약정', INSTITUTION_ID, CAST(CONTRACT_NO AS CHAR), REV_NO, ACTION_CD,
       RANK_CD, NULL, COALESCE(BANK_CD, BANK_NAME_ETC), CONCAT(COALESCE(TERM_FROM, ''), ' ~ ', COALESCE(TERM_TO, '')),
       EDITOR_NAME, BUTTON_ID
  FROM INST_BANK_CONTRACT WHERE INSTITUTION_ID IN ('dongjak', 'gangdong')
UNION ALL
SELECT '개시일', INSTITUTION_ID, NULL, REV_NO, ACTION_CD,
       NULL, CAST(TARGET_YEAR AS CHAR), NULL, TERM_START,
       EDITOR_NAME, BUTTON_ID
  FROM INST_BID_TERM WHERE INSTITUTION_ID IN ('dongjak', 'gangdong')
ORDER BY 기관ID, 종류, 번호, REV_NO;

-- 1) 올해(2026) 목표 — 최신 REV 가 GOAL·2026·CANCEL 아님인 목표가 없는 기관에만, 번호 = MAX+1
INSERT INTO INST_BID_TARGET
    (INSTITUTION_ID, TARGET_NO, REV_NO, ACTION_CD, TARGET_YEAR, TAG_CD, MEMO, OWNER_EMP_NO, OWNER_NAME,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT, KIND_CD)
SELECT n.INSTITUTION_ID,
       COALESCE((SELECT MAX(m.TARGET_NO) FROM INST_BID_TARGET m WHERE m.INSTITUTION_ID = n.INSTITUTION_ID), 0) + 1,
       1, 'SAVE', 2026, n.TAG_CD, '표본(사용자 제공 11-23, 추가)', NULL, NULL,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104u',
       0, '2026-03-02T01:00:00Z', 'GOAL'
  FROM (SELECT 'dongjak' AS INSTITUTION_ID, 'RETAIN' AS TAG_CD
        UNION ALL SELECT 'gangdong', 'NEW') n
 WHERE EXISTS (SELECT 1 FROM INSTITUTIONS i WHERE i.INSTITUTION_ID = n.INSTITUTION_ID)
   AND NOT EXISTS (
         SELECT 1 FROM INST_BID_TARGET x
          WHERE x.INSTITUTION_ID = n.INSTITUTION_ID
            AND x.KIND_CD = 'GOAL' AND x.TARGET_YEAR = 2026 AND x.ACTION_CD <> 'CANCEL'
            AND x.REV_NO = (SELECT MAX(y.REV_NO) FROM INST_BID_TARGET y
                             WHERE y.INSTITUTION_ID = x.INSTITUTION_ID AND y.TARGET_NO = x.TARGET_NO));

-- 2) 결과 약정 — B02 2027-01 시작 줄이 없고, 2027-01 시작 '다른 은행' 줄(충돌)도 없는 기관에만, 번호 = MAX+1
INSERT INTO INST_BANK_CONTRACT
    (INSTITUTION_ID, CONTRACT_NO, REV_NO, ACTION_CD, ORIGIN_CD, RANK_CD, BANK_CD, BANK_NAME_ETC, TERM_FROM, TERM_TO,
     SRC_KIND, SRC_URL, SRC_NO, CHECKED_DATE, CHECKED_DEPT, NOTE, ACCOUNT_CD, ACCOUNT_ETC, OVERLAP_CONFIRMED,
     CANCEL_REASON_CD, CANCEL_REASON_ETC, EDITOR_EMP_NO, EDITOR_NAME, EMP_VERIFIED, SCREEN_ID, BUTTON_ID,
     UI_VALID, SAVED_AT)
SELECT n.INSTITUTION_ID,
       COALESCE((SELECT MAX(m.CONTRACT_NO) FROM INST_BANK_CONTRACT m WHERE m.INSTITUTION_ID = n.INSTITUTION_ID), 0) + 1,
       1, 'SAVE', 'MANUAL', 'FIRST', 'B02', NULL, '2027-01-01', '2030-12-31',
       'STAFF', NULL, NULL, '2026-11-23', '표본', '사용자 제공 결과(11-23) — 날짜·순위 가정, 표본', NULL, NULL, 0,
       NULL, NULL, 'SAMPLE', '표본', 0, 'sample', 'sample_104u',
       0, '2026-11-23T01:00:00Z'
  FROM (SELECT 'dongjak' AS INSTITUTION_ID UNION ALL SELECT 'gangdong') n
 WHERE EXISTS (SELECT 1 FROM INSTITUTIONS i WHERE i.INSTITUTION_ID = n.INSTITUTION_ID)
   -- 이미 B02 2027-01 시작 최신 SAVE 줄이 있으면 넣지 않는다
   AND NOT EXISTS (
         SELECT 1 FROM INST_BANK_CONTRACT x
          WHERE x.INSTITUTION_ID = n.INSTITUTION_ID AND x.ACTION_CD = 'SAVE'
            AND x.BANK_CD = 'B02' AND x.TERM_FROM LIKE '2027-01%'
            AND x.REV_NO = (SELECT MAX(y.REV_NO) FROM INST_BANK_CONTRACT y
                             WHERE y.INSTITUTION_ID = x.INSTITUTION_ID AND y.CONTRACT_NO = x.CONTRACT_NO))
   -- 2027-01 시작인 다른 은행 최신 SAVE 줄이 있으면 충돌 — 넣지 않는다(BANK_CD 가 NULL 인 줄도 '다른 은행'으로 본다)
   AND NOT EXISTS (
         SELECT 1 FROM INST_BANK_CONTRACT x
          WHERE x.INSTITUTION_ID = n.INSTITUTION_ID AND x.ACTION_CD = 'SAVE'
            AND (x.BANK_CD IS NULL OR x.BANK_CD <> 'B02') AND x.TERM_FROM LIKE '2027-01%'
            AND x.REV_NO = (SELECT MAX(y.REV_NO) FROM INST_BANK_CONTRACT y
                             WHERE y.INSTITUTION_ID = x.INSTITUTION_ID AND y.CONTRACT_NO = x.CONTRACT_NO));

COMMIT;

-- 3) 확인 — 두 기관별로 넣은 것/안 넣은 것과 이유
SELECT n.INSTITUTION_ID AS 기관ID,
       COALESCE(i.NAME_KO, '(기관 표에 없음)') AS 기관명,
       CASE
         WHEN i.INSTITUTION_ID IS NULL THEN '안 넣음 — 기관 표에 없음'
         WHEN EXISTS (SELECT 1 FROM INST_BID_TARGET s
                       WHERE s.INSTITUTION_ID = n.INSTITUTION_ID AND s.BUTTON_ID = 'sample_104u'
                         AND s.MEMO = '표본(사용자 제공 11-23, 추가)') THEN '넣음'
         ELSE '안 넣음 — 올해(2026) 목표가 이미 있음'
       END AS 목표,
       CASE
         WHEN i.INSTITUTION_ID IS NULL THEN '안 넣음 — 기관 표에 없음'
         WHEN EXISTS (SELECT 1 FROM INST_BANK_CONTRACT s
                       WHERE s.INSTITUTION_ID = n.INSTITUTION_ID AND s.BUTTON_ID = 'sample_104u'
                         AND s.NOTE = '사용자 제공 결과(11-23) — 날짜·순위 가정, 표본') THEN '넣음'
         WHEN EXISTS (SELECT 1 FROM INST_BANK_CONTRACT x
                       WHERE x.INSTITUTION_ID = n.INSTITUTION_ID AND x.ACTION_CD = 'SAVE'
                         AND (x.BANK_CD IS NULL OR x.BANK_CD <> 'B02') AND x.TERM_FROM LIKE '2027-01%'
                         AND x.REV_NO = (SELECT MAX(y.REV_NO) FROM INST_BANK_CONTRACT y
                                          WHERE y.INSTITUTION_ID = x.INSTITUTION_ID AND y.CONTRACT_NO = x.CONTRACT_NO))
              THEN '충돌 — 사용자 확인 필요(2027-01 시작인 다른 은행 줄이 있음)'
         ELSE '안 넣음 — B02 2027-01 시작 약정이 이미 있음'
       END AS 약정
  FROM (SELECT 'dongjak' AS INSTITUTION_ID UNION ALL SELECT 'gangdong') n
  LEFT JOIN INSTITUTIONS i ON i.INSTITUTION_ID = n.INSTITUTION_ID;

-- 이 파일이 넣은 행 수(기대: 목표 2 · 약정 2. 적으면 위 표의 '안 넣음/충돌'을 본다)
SELECT (SELECT COUNT(*) FROM INST_BID_TARGET
         WHERE BUTTON_ID = 'sample_104u' AND MEMO = '표본(사용자 제공 11-23, 추가)') AS 추가_목표,
       (SELECT COUNT(*) FROM INST_BANK_CONTRACT
         WHERE BUTTON_ID = 'sample_104u' AND NOTE = '사용자 제공 결과(11-23) — 날짜·순위 가정, 표본'
           AND INSTITUTION_ID IN ('dongjak', 'gangdong')) AS 추가_약정;

-- =============================================================================
-- 되돌리기(이 파일이 넣은 행 포함 표본 전부를 지운다 — 주석을 풀어 따로 실행):
--   DELETE FROM INST_BID_TARGET    WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   DELETE FROM INST_BANK_CONTRACT WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   DELETE FROM INST_BID_TERM      WHERE EDITOR_NAME = '표본' AND BUTTON_ID = 'sample_104u';
--   COMMIT;
-- 이 파일이 넣은 두 기관 행만 지우려면 위 DELETE 에 AND INSTITUTION_ID IN ('dongjak','gangdong') 를 덧붙인다.
-- =============================================================================
