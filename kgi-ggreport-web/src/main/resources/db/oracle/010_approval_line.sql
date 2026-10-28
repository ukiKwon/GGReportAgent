-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — 스키마 (010) : 결재라인 — 사용자별 상위 결재자
--
-- 사용자마다 "내 결재를 받는 사람"(APPROVER_EMP_NO)을 둔다. 기본은 팀·직위로 **자동 결정**하고
-- (APPROVER_MANUAL = 0), 바꿀 일이 있으면 시스템 관리자(master)가 **지정**한다(APPROVER_MANUAL = 1,
-- 이후 자동 재계산에서 제외). 자동 규칙은 서버 코드(ApproverRules)에 있다 — 후보가 0명이거나
-- 2명 이상이면 추측하지 않고 NULL 로 두고 화면에 "지정 필요"로 표시한다.
--
-- ⚠️ NULL 은 "최상위(대표급)" 이거나 "아직 정해지지 않음" 둘 다일 수 있다. 어느 쪽인지는 결재 등급과
--    자동 규칙으로 서버가 판정해 화면에 알려 준다(컬럼만 보고 판단하지 않는다).
-- ⚠️ 변경은 PERM_CHANGE_LOG 에 'user:APPROVER' / 'user:APPROVER_MODE' 로 같은 트랜잭션에 남는다.
-- ⚠️ 멱등하지 않다. 008 적용 후 한 번만 돌린다. 시드(011)는 009 이후에 적용한다.
-- -----------------------------------------------------------------------------

ALTER TABLE USERS ADD (
    APPROVER_EMP_NO  VARCHAR2(7 CHAR),
    APPROVER_MANUAL  NUMBER(1) DEFAULT 0 NOT NULL
);

ALTER TABLE USERS ADD CONSTRAINT FK_USERS_APPROVER FOREIGN KEY (APPROVER_EMP_NO) REFERENCES USERS (EMP_NO);
ALTER TABLE USERS ADD CONSTRAINT CK_USERS_APPROVER_SELF CHECK (APPROVER_EMP_NO IS NULL OR APPROVER_EMP_NO <> EMP_NO);
ALTER TABLE USERS ADD CONSTRAINT CK_USERS_APPROVER_MANUAL CHECK (APPROVER_MANUAL IN (0, 1));

CREATE INDEX IDX_USERS_APPROVER ON USERS (APPROVER_EMP_NO);
