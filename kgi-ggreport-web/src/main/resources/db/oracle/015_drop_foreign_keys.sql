--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (015) : 이미 걸린 외래키(FK) 18개를 뗀다
--
-- 회사 DB 는 FK 를 두지 않는다(2026-11-09). 001·006·008·010·012·014 는 FK 없이 고쳐 놓았고,
-- 이 스크립트는 **고치기 전 버전으로 이미 적용된 DB** 를 같은 상태로 맞춘다.
-- 내부망에 001~014 중 FK 가 걸린 채 적용된 것이 하나라도 있을 때만 DBA 가 실행한다. 없으면 건너뛴다.
--
-- ⚠️ 멱등하다. FK 가 없으면 아무 일도 하지 않는다. 인덱스는 건드리지 않는다.
-- ⚠️ PL/SQL 익명 블록이다. 실행이 막혀 있으면 DBA 가 `ALTER TABLE <표> DROP CONSTRAINT <이름>;` 18문으로 푼다.
-- ⚠️ 테스트 DDL 목록(H2)에는 넣지 않는다(PL/SQL 이라 H2 에서 못 돌고, 테스트 DB 에는 FK 가 없다).
--------------------------------------------------------------------------------

DECLARE
  PROCEDURE drop_fk(p_table VARCHAR2, p_fk VARCHAR2) IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM USER_CONSTRAINTS
     WHERE TABLE_NAME = p_table AND CONSTRAINT_NAME = p_fk AND CONSTRAINT_TYPE = 'R';
    IF n > 0 THEN
      EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' DROP CONSTRAINT ' || p_fk;
    END IF;
  END;
BEGIN
  drop_fk('BID_CASES','FK_BID_CASES_INST');     drop_fk('TASKS','FK_TASKS_BID_CASE');
  drop_fk('MESSAGES','FK_MESSAGES_TASK');       drop_fk('VECTORS','FK_VECTORS_CHUNK');
  drop_fk('ORCH_RUN','FK_ORCH_RUN_INST');       drop_fk('ORCH_STEP','FK_ORCH_STEP_RUN');
  drop_fk('USER_MENU_PERMS','FK_UMP_USER');     drop_fk('USERS','FK_USERS_APPROVER');
  drop_fk('APPROVAL_DEPUTY','FK_AD_PRINCIPAL'); drop_fk('APPROVAL_DEPUTY','FK_AD_DEPUTY');
  drop_fk('APPROVAL_REQUEST','FK_AR_REQUESTER'); drop_fk('APPROVAL_STEP','FK_AS_REQ');
  drop_fk('BOARD_FORM','FK_BF_CREATED');        drop_fk('BOARD_FORM','FK_BF_UPDATED');
  drop_fk('BOARD_FORM_VER','FK_BFV_FORM');      drop_fk('BOARD_FORM_VER','FK_BFV_CREATED');
  drop_fk('BOARD_FORM_USE','FK_BFU_REQ');       drop_fk('BOARD_FORM_USE','FK_BFU_VER');
END;
/
