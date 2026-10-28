-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 스키마 (008) : 시스템 관리 — 사용자(사번)·메뉴별 권한·접근 이력
-- ⚠️ 이 파일은 **정본이 아니다.** 정본은 db/oracle/008_system_admin.sql 이다(외부망 로컬 전용).
--
-- ── 무엇이 들어 있나 ────────────────────────────────────────────────────────────
--   USERS            사용자. 사번(7자리 숫자)이 키. 결재 등급(팀장급·부장급·대표급).
--   USER_MENU_PERMS  사용자별 메뉴 권한 **예외**. 역할 기본값(ROLE_MENUS·앱 기본 격자) 위에 얹는다.
--                    메뉴 권한을 받으면 조회(CAN_VIEW)가 기본. 작성·수정·결재는 기본 꺼짐.
--                    결재(CAN_APPROVE)는 결재 개념이 확인된 메뉴(결재함·작업함)에서만 켤 수 있다
--                    — 판정은 서버 코드(MenuPerms.APPROVABLE)가 하고, 모르는 메뉴는 꺼 둔다.
--   ACCESS_LOG       접근 이력(보안 감사). **추가 전용** — 앱 DB 계정에는 INSERT/SELECT 만 주고
--                    UPDATE/DELETE 는 주지 않는 것을 권장한다. 본문·비밀번호·쿼리값은 넣지 않는다.
--   PERM_CHANGE_LOG  "누가 누구의 권한을 어떻게 바꿨나". 권한 변경과 **같은 트랜잭션**에 기록한다.
--
-- ⚠️ 신원은 아직 자기신고다(서버 인증 없음). ACCESS_LOG.EMP_VERIFIED=1 은 앞단(WebSphere/SSO)이 준
--    인증 주체를 받은 경우이고, 0 이면 화면이 보낸 사번을 그대로 적은 것이다. 0 인 행은 위조 가능.
-- ⚠️ 보존 기간은 사내 보안 규정을 따른다(기본 가정 1년, 별도 배치로 이관·삭제). 이 스크립트는 지우지 않는다.
-- ⚠️ 시각은 본체와 같은 ISO 문자열(Times.nowIso)이다.
-- ⚠️ 멱등하지 않다. 001~007 적용 후 한 번만 돌린다.
-- -----------------------------------------------------------------------------

CREATE TABLE USERS (
    EMP_NO         VARCHAR(7)   NOT NULL,
    NAME           VARCHAR(50)  NOT NULL,
    ROLE           VARCHAR(50)  NOT NULL,
    POSITION_TITLE VARCHAR(50),
    APPROVAL_GRADE VARCHAR(20)  NOT NULL DEFAULT 'NONE',
    STATUS         VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    FAILED_LOGINS  SMALLINT     NOT NULL DEFAULT 0,
    LAST_LOGIN_AT  VARCHAR(40),
    CREATED_AT     VARCHAR(40)  NOT NULL,
    UPDATED_AT     VARCHAR(40)  NOT NULL,
    PRIMARY KEY (EMP_NO),
    CONSTRAINT CK_USERS_EMP_NO CHECK (EMP_NO REGEXP '^[0-9]{7}$'),
    CONSTRAINT CK_USERS_GRADE  CHECK (APPROVAL_GRADE IN ('NONE', 'TEAM_LEAD', 'DEPT_HEAD', 'EXECUTIVE')),
    CONSTRAINT CK_USERS_STATUS CHECK (STATUS IN ('ACTIVE', 'LOCKED', 'RETIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE USER_MENU_PERMS (
    EMP_NO      VARCHAR(7)  NOT NULL,
    MENU_KEY    VARCHAR(50) NOT NULL,
    CAN_VIEW    SMALLINT    NOT NULL DEFAULT 1,
    CAN_WRITE   SMALLINT    NOT NULL DEFAULT 0,
    CAN_EDIT    SMALLINT    NOT NULL DEFAULT 0,
    CAN_APPROVE SMALLINT    NOT NULL DEFAULT 0,
    UPDATED_AT  VARCHAR(40) NOT NULL,
    PRIMARY KEY (EMP_NO, MENU_KEY),
    CONSTRAINT FK_UMP_USER FOREIGN KEY (EMP_NO) REFERENCES USERS (EMP_NO)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ACCESS_LOG (
    LOG_ID       BIGINT       NOT NULL AUTO_INCREMENT,
    OCCURRED_AT  VARCHAR(40)  NOT NULL,
    EMP_NO       VARCHAR(7),
    EMP_VERIFIED SMALLINT     NOT NULL DEFAULT 0,
    EVENT_TYPE   VARCHAR(20)  NOT NULL,
    HTTP_METHOD  VARCHAR(10),
    REQ_PATH     VARCHAR(300),
    STATUS_CODE  SMALLINT,
    CLIENT_IP    VARCHAR(64),
    USER_AGENT   VARCHAR(200),
    DURATION_MS  INT,
    DETAIL       VARCHAR(300),
    PRIMARY KEY (LOG_ID),
    KEY IDX_ACCESS_LOG_AT (OCCURRED_AT),
    KEY IDX_ACCESS_LOG_EMP (EMP_NO, OCCURRED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PERM_CHANGE_LOG (
    CHG_ID         BIGINT       NOT NULL AUTO_INCREMENT,
    CHANGED_AT     VARCHAR(40)  NOT NULL,
    ACTOR_EMP_NO   VARCHAR(7),
    TARGET_EMP_NO  VARCHAR(7)   NOT NULL,
    ITEM           VARCHAR(100) NOT NULL,
    BEFORE_VALUE   VARCHAR(200),
    AFTER_VALUE    VARCHAR(200),
    PRIMARY KEY (CHG_ID),
    KEY IDX_PERM_CHG_TARGET (TARGET_EMP_NO, CHANGED_AT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
