-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — 시드 (017) : 공통 코드 — 공고 상태 NOTICE_STATUS (016 이후)
--
-- 확정된 업무 용어만 넣는다(NEXT 30). 표현은 '입찰 종료'가 아니라 '공고 종료'다.
--   IN_PROGRESS  공고 진행 중
--   CLOSED       공고 종료
--   DELAYED      지연·재공고 대기
--
-- ⚠️ CONTRACT_KIND(협약 구분)는 기획 미확정이라 시드하지 않는다. 은행·기관 유형·제안 단계 등도
--    실제 값 목록이 확정된 뒤 별도 시드로 붙인다(값을 지어내지 않는다).
-- ⚠️ 멱등하지 않다(같은 (그룹, 코드)를 다시 넣으면 PK 위반). 016 적용 후 한 번만 돌린다.
-- ⚠️ UPDATED_BY 는 시드라 NULL. 시각은 Times.nowIso 형식(ISO-8601, +09:00).
-- -----------------------------------------------------------------------------
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'IN_PROGRESS', '공고 진행 중', 1, 1, '2026-11-09T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'CLOSED', '공고 종료', 2, 1, '2026-11-09T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('NOTICE_STATUS', 'DELAYED', '지연·재공고 대기', 3, 1, '2026-11-09T00:00:00+09:00');

COMMIT;
