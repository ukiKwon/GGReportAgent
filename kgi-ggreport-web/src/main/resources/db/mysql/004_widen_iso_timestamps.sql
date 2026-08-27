-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 8.0 미러 (004) : ISO 시각 컬럼을 30 → 40 자로
--
-- ⚠️ **정본은 db/oracle/004_widen_iso_timestamps.sql 이다.** 배경·판단 근거(왜 32자가
--    나오는지, 왜 잘라 쓰면 안 되는지, 왜 40인지)는 전부 그쪽에 적혀 있다.
--
-- ⚠️ **MySQL 의 MODIFY 는 컬럼 정의를 통째로 갈아 끼운다** — `NOT NULL` 을 다시 적지
--    않으면 조용히 NULL 허용으로 바뀐다. 아래에서 원래 NOT NULL 이던 3개
--    (MESSAGES·NOTIFICATIONS·CHAT_MESSAGES 의 CREATED_AT)에 그대로 다시 붙인 이유다.
--    Oracle 의 MODIFY 는 안 적은 속성을 유지하므로 정본에는 이 반복이 없다.
-- ---------------------------------------------------------------------------

ALTER TABLE INSTITUTIONS  MODIFY CONTRACT_END   VARCHAR(40);
ALTER TABLE INSTITUTIONS  MODIFY LAST_BID       VARCHAR(40);

ALTER TABLE BID_CASES     MODIFY EXPECTED_DATE  VARCHAR(40);
ALTER TABLE BID_CASES     MODIFY CONFIRMED_DATE VARCHAR(40);
ALTER TABLE BID_CASES     MODIFY LAST_SYNCED_AT VARCHAR(40);
ALTER TABLE BID_CASES     MODIFY FINALIZED_AT   VARCHAR(40);

ALTER TABLE MESSAGES      MODIFY CREATED_AT     VARCHAR(40) NOT NULL;

ALTER TABLE NOTIFICATIONS MODIFY CREATED_AT     VARCHAR(40) NOT NULL;
ALTER TABLE NOTIFICATIONS MODIFY READ_AT        VARCHAR(40);

ALTER TABLE CHAT_MESSAGES MODIFY CREATED_AT     VARCHAR(40) NOT NULL;
