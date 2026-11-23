-- 로컬 MySQL 전용 — NEXT 104 '협약 성과 관리' 표본(11-23) 삭제. 회사 DB·Oracle에는 쓰지 않는다.
-- 지우는 것: EDITOR_NAME='표본' 이고 BUTTON_ID 가 sample_104 / sample_104u 인 행만(실제 기록은 건드리지 않음 — 예: 동작구 이영업 목표, 강동구 김영업 관심).
-- 적용: mysql -h localhost -P 3306 -u root -p --default-character-set=utf8mb4 ggreportdb < kgi-ggreport-web/tools/db/samples/104_target_result_cleanup_mysql.sql
SET NAMES utf8mb4;
DELETE FROM INST_BID_TARGET    WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');
DELETE FROM INST_BANK_CONTRACT WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');
DELETE FROM INST_BID_TERM      WHERE EDITOR_NAME = '표본' AND BUTTON_ID IN ('sample_104', 'sample_104u');
COMMIT;
SELECT (SELECT COUNT(*) FROM INST_BID_TARGET WHERE BUTTON_ID IN ('sample_104','sample_104u')) AS 남은_목표,
       (SELECT COUNT(*) FROM INST_BANK_CONTRACT WHERE BUTTON_ID IN ('sample_104','sample_104u')) AS 남은_약정,
       (SELECT COUNT(*) FROM INST_BID_TERM WHERE BUTTON_ID IN ('sample_104','sample_104u')) AS 남은_개시일;
