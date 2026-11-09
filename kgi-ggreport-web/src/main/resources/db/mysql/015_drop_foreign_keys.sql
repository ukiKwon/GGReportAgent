-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (015) : 이미 걸린 외래키(FK) 18개를 뗀다
--
-- 회사 DB 는 FK 를 두지 않는다(2026-11-09). 001·006·008·010·012·014 는 FK 없이 고쳐 놓았고,
-- 이 스크립트는 **고치기 전 버전으로 이미 적용된 DB** 를 같은 상태로 맞춘다.
--
-- ⚠️ 멱등하다. FK 가 없으면 아무 일도 하지 않는다(새 DB 에서 돌려도 안전, 여러 번 돌려도 안전).
-- ⚠️ DELIMITER 를 쓰므로 `mysql` CLI 로 실행한다(스프링 sql.init 로는 돌리지 않는다).
-- ⚠️ RENAME INDEX 는 MySQL 8.0 이상이다.
-- ⚠️ information_schema 의 이름이 Windows MySQL 에서 소문자일 수 있어 LOWER() 로 비교한다.
-- 되돌리기: 점검 쿼리(ops/integrity_check.sql)가 0행인지 확인한 뒤 git 이력의 원래 FK 정의를 ALTER 로 다시 건다.
-- -----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS P_DROP_FK;
DELIMITER //
CREATE PROCEDURE P_DROP_FK(IN p_table VARCHAR(64), IN p_fk VARCHAR(64), IN p_new_idx VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
              WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(p_table)
                AND LOWER(CONSTRAINT_NAME) = LOWER(p_fk) AND CONSTRAINT_TYPE = 'FOREIGN KEY') THEN
    SET @sql = CONCAT('ALTER TABLE ', p_table, ' DROP FOREIGN KEY ', p_fk);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
    -- FK 가 자동으로 만든 인덱스(이름 = FK 이름)가 남아 있으면 조회용 이름으로 바꾼다.
    IF p_new_idx IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(p_table)
                      AND LOWER(INDEX_NAME) = LOWER(p_fk))
       AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(p_table)
                      AND LOWER(INDEX_NAME) = LOWER(p_new_idx)) THEN
      SET @sql = CONCAT('ALTER TABLE ', p_table, ' RENAME INDEX ', p_fk, ' TO ', p_new_idx);
      PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;
  END IF;
END//
DELIMITER ;

CALL P_DROP_FK('BID_CASES',        'FK_BID_CASES_INST',  'IDX_BID_CASES_INST');
CALL P_DROP_FK('TASKS',            'FK_TASKS_BID_CASE',  NULL);
CALL P_DROP_FK('MESSAGES',         'FK_MESSAGES_TASK',   'IDX_MESSAGES_TASK');
CALL P_DROP_FK('VECTORS',          'FK_VECTORS_CHUNK',   NULL);
CALL P_DROP_FK('ORCH_RUN',         'FK_ORCH_RUN_INST',   NULL);
CALL P_DROP_FK('ORCH_STEP',        'FK_ORCH_STEP_RUN',   NULL);
CALL P_DROP_FK('USER_MENU_PERMS',  'FK_UMP_USER',        NULL);
CALL P_DROP_FK('USERS',            'FK_USERS_APPROVER',  NULL);
CALL P_DROP_FK('APPROVAL_DEPUTY',  'FK_AD_PRINCIPAL',    NULL);
CALL P_DROP_FK('APPROVAL_DEPUTY',  'FK_AD_DEPUTY',       NULL);
CALL P_DROP_FK('APPROVAL_REQUEST', 'FK_AR_REQUESTER',    NULL);
CALL P_DROP_FK('APPROVAL_STEP',    'FK_AS_REQ',          NULL);
CALL P_DROP_FK('BOARD_FORM',       'FK_BF_CREATED',      NULL);
CALL P_DROP_FK('BOARD_FORM',       'FK_BF_UPDATED',      NULL);
CALL P_DROP_FK('BOARD_FORM_VER',   'FK_BFV_FORM',        NULL);
CALL P_DROP_FK('BOARD_FORM_VER',   'FK_BFV_CREATED',     NULL);
CALL P_DROP_FK('BOARD_FORM_USE',   'FK_BFU_REQ',         NULL);
CALL P_DROP_FK('BOARD_FORM_USE',   'FK_BFU_VER',         NULL);
DROP PROCEDURE P_DROP_FK;
-- 자동 인덱스 FK_BF_CREATED / FK_BF_UPDATED / FK_BFV_CREATED 는 해로울 게 없어 남긴다(원하면 DROP INDEX).
