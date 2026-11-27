--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (065) : 공고·건의 금고 순위 BID_CASES.BID_RANK_CD (NEXT 125 통합 설계, 사용자 11-26 '1·2금고는 별개 건')
-- 규칙(서비스가 지킨다 — CHECK·FK 없음):
--   BID_RANK_CD -> COMMON_CODE(TARGET_AIM_RANK: FIRST·SECOND·SINGLE·MAIN_BANK·OTHER). NULL = 미정(BID_SUBJECT_CD='MAIN_BANK') 또는 해당 없음(그 밖 대상).
--   OTHER(기타)의 이름(AIM_RANK_ETC)은 목표 건(INST_BID_TARGET)에만 둔다 — 이 표에는 코드만 옮겨 적는다. 코드표의 OTHER 행은 066 이 더한다.
--   제안 확정 때 목표 건(INST_BID_TARGET.AIM_RANK_CD)과 이으며 채운다. NULL → 값 한 번만, 값이 든 뒤에는 바꾸지 않는다.
--   기존 행 채우기 없음(공고 제목에서 추측하지 않는다) — 적용 직후 모든 기존 행은 NULL. 앱 POJO BidCase 에는 싣지 않는다(골든 10·14·25 고정).
-- ⚠️ 064 뒤 한 번만(멱등하지 않다 — 두 번째 실행은 칸 중복 오류). 적용 뒤 이 파일을 고치지 않는다(체크섬). 적용은 DBA. 066·067 과 순서 무관.
-- ⚠️ 배포 순서: DB 먼저, 서버 나중(칸 추가만이라 옛 서버는 그대로 돈다).
-- ⚠️ DB 권한(DBA): 앱 계정의 BID_CASES UPDATE 권한이 이 칸에도 필요하다(기존 UPDATE 권한 범위 확인).
-- 사전 조회(읽기 전용 — 이미 칸이 있으면 적용하지 않는다, 0 이어야 한다):
--   SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'BID_CASES' AND COLUMN_NAME = 'BID_RANK_CD';
-- 확인: SELECT COUNT(*) FROM BID_CASES WHERE BID_RANK_CD IS NOT NULL;  -- 적용 직후 0
-- 되돌리기(서버를 먼저 065 이전으로 되돌린 뒤): ALTER TABLE BID_CASES DROP (BID_RANK_CD);
--------------------------------------------------------------------------------

ALTER TABLE BID_CASES ADD (BID_RANK_CD VARCHAR2(20 CHAR));
COMMIT;
