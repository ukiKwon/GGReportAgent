-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — 시드 (017, MySQL 미러) : 공통 코드 — 공고 상태 NOTICE_STATUS (016 이후)
-- 값·규칙은 정본(db/oracle/017_seed_common_codes.sql) 헤더를 본다. CONTRACT_KIND 는 시드하지 않는다.
-- ⚠️ 멱등하지 않다(PK 위반). 016 적용 후 한 번만.
-- -----------------------------------------------------------------------------
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'IN_PROGRESS', '공고 진행 중', 1, 1, '2026-11-09T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'CLOSED', '공고 종료', 2, 1, '2026-11-09T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'DELAYED', '지연·재공고 대기', 3, 1, '2026-11-09T00:00:00+09:00');
