-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL (036) : 관리자 행위 증적 — PERM_CHANGE_LOG 에 화면·버튼·검증 여부·역할 대상 (2026-11-16)
--   SCREEN_ID/BUTTON_ID : X-Screen-Id/X-Button-Id 를 허용 목록(AdminUiIds)으로 거른 값. 밖이면 UNKNOWN.
--   UI_VALID            : 화면·버튼이 둘 다 허용 목록 안이면 1.
--   EMP_VERIFIED        : 1 = 앞단 인증 주체, 0 = X-Emp-No 자기신고(위조 가능).
--   TARGET_ROLE         : 역할×메뉴 격자(PUT /menus) 변경 행. 이때 TARGET_EMP_NO 는 NULL(둘 중 하나만 채움 — 서비스가 보장).
-- 기존 행은 UNKNOWN/0 으로 채워진다. ⚠️ 외래키·CHECK 없음. ⚠️ 멱등하지 않다 — 008 이후 한 번만.
-- 적용: mysql -u <계정> -p --default-character-set=utf8mb4 ggreportdb < 036_admin_audit.sql
-- 되돌리기(역할 행 삭제 = 이력 소멸, 운영 금지):
--   DELETE FROM PERM_CHANGE_LOG WHERE TARGET_EMP_NO IS NULL;
--   ALTER TABLE PERM_CHANGE_LOG DROP INDEX IDX_PERM_CHG_ROLE, DROP COLUMN SCREEN_ID, DROP COLUMN BUTTON_ID,
--     DROP COLUMN UI_VALID, DROP COLUMN EMP_VERIFIED, DROP COLUMN TARGET_ROLE, MODIFY COLUMN TARGET_EMP_NO VARCHAR(7) NOT NULL;
-- -----------------------------------------------------------------------------
SET NAMES utf8mb4;

ALTER TABLE PERM_CHANGE_LOG
    ADD COLUMN SCREEN_ID    VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN BUTTON_ID    VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN UI_VALID     SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN EMP_VERIFIED SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN TARGET_ROLE  VARCHAR(50) NULL,
    MODIFY COLUMN TARGET_EMP_NO VARCHAR(7) NULL;
CREATE INDEX IDX_PERM_CHG_ROLE ON PERM_CHANGE_LOG (TARGET_ROLE, CHANGED_AT);
