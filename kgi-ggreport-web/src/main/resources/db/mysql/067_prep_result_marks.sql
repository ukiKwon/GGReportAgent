-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (067) : 결과발표 값 선정(WON)·탈락(LOST) 코드 (DASH_MARK)
-- ⚠️ 정본이 아니다. 정본은 db/oracle/067_prep_result_marks.sql (규칙은 정본 헤더).
-- ⚠️ 멱등하지 않다 — 054(DASH_MARK) 뒤 한 번만(같은 코드 두 번이면 PK 중복). 066 에 기대지 않는다. 적용 뒤 고치지 않는다(체크섬).
-- 사전 조회(0 줄): SELECT CODE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' AND CODE IN ('WON', 'LOST');
-- 확인: SELECT CODE, CODE_NAME, SORT_NO FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' ORDER BY SORT_NO;  -- 6줄
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' AND CODE IN ('WON', 'LOST');
-- -----------------------------------------------------------------------------

-- [INSERT 블록 시작 — Oracle 067 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'WON', '선정', 5, 1, '2026-11-26T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'LOST', '탈락', 6, 1, '2026-11-26T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
