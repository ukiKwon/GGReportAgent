-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 스키마 (010) : 결재라인 — 사용자별 상위 결재자
-- ⚠️ 이 파일은 **정본이 아니다.** 정본은 db/oracle/010_approval_line.sql 이다(외부망 로컬 전용).
-- 자동/지정 규칙·NULL 의미는 정본 헤더를 본다. 멱등하지 않다 — 008 적용 후 한 번만.
-- -----------------------------------------------------------------------------

ALTER TABLE USERS
    ADD COLUMN APPROVER_EMP_NO VARCHAR(7) NULL,
    ADD COLUMN APPROVER_MANUAL SMALLINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT FK_USERS_APPROVER FOREIGN KEY (APPROVER_EMP_NO) REFERENCES USERS (EMP_NO),
    ADD CONSTRAINT CK_USERS_APPROVER_SELF CHECK (APPROVER_EMP_NO IS NULL OR APPROVER_EMP_NO <> EMP_NO),
    ADD CONSTRAINT CK_USERS_APPROVER_MANUAL CHECK (APPROVER_MANUAL IN (0, 1));

CREATE INDEX IDX_USERS_APPROVER ON USERS (APPROVER_EMP_NO);
