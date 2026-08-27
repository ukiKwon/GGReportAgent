--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 스키마 정본 (004) : ISO 시각 컬럼을 30 → 40 자로
--
-- ⚠️ 이 파일이 **정본**이다. db/mysql/004_widen_iso_timestamps.sql 은 외부망 로컬 미러다.
--
-- ── 무엇이 잘못됐나 ──────────────────────────────────────────────────────────
-- 001 이 ISO 시각 컬럼을 `VARCHAR2(30 CHAR)` 로 잡았다. 그런데 이 시스템이 쓰는 시각은
-- Python `datetime.now(timezone.utc).isoformat()` 모양이고, 그건 **32자**다:
--
--     2026-08-27T07:12:12.156000+00:00
--     |<--10-->|1|<--8-->|<--7-->|<-6->|   = 32
--
-- 30 자로는 **모든 INSERT 가 실패한다**(ORA-12899 / H2 22001). 빈 스키마에서는 아무
-- 증상이 없다가 첫 쓰기에서 터진다 — 단계 2(조회 전용)가 통과한 이유가 그것이다.
-- 단계 4 첫 쓰기 골든(10번, 공고 생성)에서 잡혔다(2026-08-27).
--
-- ⚠️ **잘라 쓰는 선택지는 없다.** 이미 Python 이 쓴 32자 값들과 한 테이블에 섞이고,
--    문자열 정렬로 최신을 고르는 자리(쪽지함 `ORDER BY CREATED_AT DESC`)가 여럿이다.
--    소수점을 버리면 같은 초에 찍힌 항목들의 순서가 무너진다.
--
-- ── 왜 40 인가 ───────────────────────────────────────────────────────────────
-- 32 가 최대치다(UTC든 `+09:00` 이든 오프셋 표기 길이는 같다). 40 은 그 위의 여유이고,
-- 다음에 시각 표기가 한 자라도 늘 때 또 DDL 을 하나 더 붙이지 않으려는 것이다.
-- VARCHAR2 는 선언 길이가 아니라 **실제 저장 길이**만큼 쓰므로 비용은 0 이다.
--
-- ⚠️ 001 과 달리 **다시 돌려도 안전하다** — 넓히는 방향의 MODIFY 는 같은 길이로 다시
--    실행해도 성공한다(줄이는 방향만 데이터가 있으면 거부된다).
--------------------------------------------------------------------------------

ALTER TABLE INSTITUTIONS  MODIFY (CONTRACT_END   VARCHAR2(40 CHAR));
ALTER TABLE INSTITUTIONS  MODIFY (LAST_BID       VARCHAR2(40 CHAR));

ALTER TABLE BID_CASES     MODIFY (EXPECTED_DATE  VARCHAR2(40 CHAR));
ALTER TABLE BID_CASES     MODIFY (CONFIRMED_DATE VARCHAR2(40 CHAR));
ALTER TABLE BID_CASES     MODIFY (LAST_SYNCED_AT VARCHAR2(40 CHAR));
ALTER TABLE BID_CASES     MODIFY (FINALIZED_AT   VARCHAR2(40 CHAR));

ALTER TABLE MESSAGES      MODIFY (CREATED_AT     VARCHAR2(40 CHAR));

ALTER TABLE NOTIFICATIONS MODIFY (CREATED_AT     VARCHAR2(40 CHAR));
ALTER TABLE NOTIFICATIONS MODIFY (READ_AT        VARCHAR2(40 CHAR));

ALTER TABLE CHAT_MESSAGES MODIFY (CREATED_AT     VARCHAR2(40 CHAR));

-- 넓히지 않는 30 자 컬럼들: MESSAGES.ROLE · NOTIFICATIONS.KIND · CHAT_MESSAGES.ROLE.
-- 시각이 아니라 짧은 코드값이다(`영업팀` · `쪽지` · `user`).
