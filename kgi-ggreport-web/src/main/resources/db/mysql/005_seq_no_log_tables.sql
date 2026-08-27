-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (005) : NOTIFICATIONS·MESSAGES 에도 SEQ_NO
--                                        ※ 외부망 로컬(out-local) 전용
--
-- ⚠️ 이 파일은 **정본이 아니다.** 정본은 db/oracle/005_seq_no_log_tables.sql 이고,
--    왜 필요한지(같은 시각에 찍힌 줄의 순서 — 타임라인·골든 29)는 거기에 적혀 있다.
--
-- ⚠️ MySQL 은 AUTO_INCREMENT 컬럼이 **키의 일부여야 한다**(ERROR 1075) — 002 와 같은
--    이유로 UNIQUE KEY 를 같은 ALTER 문 안에서 함께 추가한다.
-- ⚠️ 멱등하지 않다. 두 번 돌리면 ERROR 1060 (Duplicate column name).
-- -----------------------------------------------------------------------------

ALTER TABLE NOTIFICATIONS
    ADD COLUMN SEQ_NO BIGINT NOT NULL AUTO_INCREMENT,
    ADD UNIQUE KEY UK_NOTIFICATIONS_SEQ (SEQ_NO);

ALTER TABLE MESSAGES
    ADD COLUMN SEQ_NO BIGINT NOT NULL AUTO_INCREMENT,
    ADD UNIQUE KEY UK_MESSAGES_SEQ (SEQ_NO);
