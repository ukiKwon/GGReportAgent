--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (067) : 제안 준비 현황 결과발표 값 선정(WON)·탈락(LOST) (NEXT 120 ①, 사용자 11-26 Q-25-45ⓐ)
-- 규칙: WON·LOST 는 RESULT(결과발표) 칸에서만 받는다(서버 허용 목록 PrepBoardService.RESULT_MARKS). 표·칸 변경 없음 — BID_PREP_CHECK.MARK_CD(20) 그대로.
--   '제안서 제출'(PROPOSAL_SUBMIT) 칸은 서버 코드(PrepBoardColumns)에만 있다(코드표 없음). 이름·날짜는 체크할 때 서버가 남긴다(054 그대로).
--   기존 행 채우기 없음 — 옛 RESULT 값 DONE·IN_PROGRESS 는 선정/탈락으로 추정하지 않는다(서버가 UNDECIDED 로 내보낸다).
-- ⚠️ 054(DASH_MARK) 뒤 한 번만(같은 코드 두 번이면 PK 중복). 번호 순서 실행 규칙상 066 다음에 돌리지만 066 에 기대지 않는다. 적용 뒤 고치지 않는다(체크섬).
-- ⚠️ 배포: DB 먼저 권장 — 없어도 서버는 돌고 값 이름만 기본 이름으로 나온다.
-- 사전 조회(읽기 전용 — 0 줄이어야 한다): SELECT CODE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' AND CODE IN ('WON', 'LOST');
-- 확인: SELECT CODE, CODE_NAME, SORT_NO FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' ORDER BY SORT_NO;  -- 6줄(DONE·IN_PROGRESS·NA·NONE·WON·LOST)
-- 되돌리기: DELETE FROM COMMON_CODE WHERE CODE_GROUP = 'DASH_MARK' AND CODE IN ('WON', 'LOST');
--------------------------------------------------------------------------------

-- [INSERT 블록 시작 — MySQL 067 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'WON', '선정', 5, 1, '2026-11-26T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('DASH_MARK', 'LOST', '탈락', 6, 1, '2026-11-26T00:00:00+09:00');
-- [INSERT 블록 끝 — 2행]
COMMIT;
