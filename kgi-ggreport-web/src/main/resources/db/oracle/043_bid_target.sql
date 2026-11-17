--------------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (043) : 올해 목표 기관 INST_BID_TARGET + 코드표 TARGET_TAG·TARGET_CANCEL_REASON (입찰 현황판 재설계 1단계, 2026-11-17)
-- 키 = (INSTITUTION_ID, TARGET_NO, REV_NO). TARGET_NO = 기관 안 목표 기록 번호(1,2,3…), REV_NO = 기록 안 1부터 연속.
-- 추가 전용(039 방식): 넣기 = 새 TARGET_NO 의 REV 1(SAVE), 고치기(목표 연도·태그·메모·주 담당) = 같은 번호 새 REV(SAVE),
--   빼기 = 새 REV(CANCEL, 값은 직전 행 복사 + 사유). 현재 상태 = 기록의 최대 REV 행. 그 행이 CANCEL 이면 목표에서 빠짐.
-- 같은 기관·같은 목표 연도에 살아 있는 기록은 하나만(서비스 409 DUP_TARGET). 뺀 뒤 다시 넣으면 새 TARGET_NO.
-- 번호·REV 발급은 INSTITUTIONS 행 FOR UPDATE 로 직렬화(039 와 같은 잠금), 복합 PK 가 마지막 방어선(서비스 409 STALE).
-- 참조(서비스가 확인, FK 없음): INSTITUTION_ID -> INSTITUTIONS, EDITOR_EMP_NO·OWNER_EMP_NO -> USERS,
--   TAG_CD -> COMMON_CODE(TARGET_TAG), CANCEL_REASON_CD -> COMMON_CODE(TARGET_CANCEL_REASON). ACTION_CD 는 Java 상수(SAVE/CANCEL).
-- TARGET_YEAR = 그 기관 입찰에 나설 해(넣을 때 고름, 기본 올해). 넣기·연도 바꾸기는 올해~올해+2 만(서비스 검사).
-- OWNER_EMP_NO = 주 담당(선택, 영업부서 활성 사용자만). OWNER_NAME 은 그때 이름 스냅샷.
-- 태그 기본값(지금 국민은행 협약 중 = 재유치 도전, 아니면 신규유치 도전)은 화면이 판정해 보낸다 — 서버는 코드표만 확인.
-- ⚠️ 수정자 사번·이름·시각·EMP_VERIFIED 는 서버가 Actor 로 채운다. EMP_VERIFIED=0 = X-Emp-No 자기신고(위조 가능) — '검증됨'으로 표시하지 않는다.
-- ⚠️ SCREEN_ID·BUTTON_ID 도 자기신고 머리글(허용 목록 밖은 UNKNOWN, UI_VALID=0).
-- ⚠️ MEMO·CANCEL_REASON_ETC 는 개인정보·정당·전화번호를 서버가 거르고, CANCEL_REASON_ETC 는 사람 이름+직함도 거른다.
-- ⚠️ DB 권한(DBA): INST_BID_TARGET 은 SELECT·INSERT 만(UPDATE·DELETE 없음).
-- ⚠️ 멱등하지 않다. 016·017 뒤 한 번만(042 다음). 적용한 뒤에는 이 파일을 고치지 않는다(체크섬).
-- 되돌리기(데이터 소멸, 운영 금지): DROP TABLE INST_BID_TARGET;
--   DELETE FROM COMMON_CODE WHERE CODE_GROUP IN ('TARGET_TAG','TARGET_CANCEL_REASON');
--------------------------------------------------------------------------------

CREATE TABLE INST_BID_TARGET (
    INSTITUTION_ID     VARCHAR2(64 CHAR)   NOT NULL,
    TARGET_NO          NUMBER(6)           NOT NULL,
    REV_NO             NUMBER(6)           NOT NULL,
    ACTION_CD          VARCHAR2(10 CHAR)   NOT NULL,   -- SAVE | CANCEL
    TARGET_YEAR        NUMBER(4)           NOT NULL,
    TAG_CD             VARCHAR2(20 CHAR)   NOT NULL,   -- TARGET_TAG
    MEMO               VARCHAR2(100 CHAR),
    OWNER_EMP_NO       VARCHAR2(7 CHAR),               -- 주 담당(선택)
    OWNER_NAME         VARCHAR2(50 CHAR),              -- 그때 이름 스냅샷
    CANCEL_REASON_CD   VARCHAR2(20 CHAR),              -- ACTION_CD='CANCEL' 일 때만. TARGET_CANCEL_REASON
    CANCEL_REASON_ETC  VARCHAR2(50 CHAR),              -- CANCEL_REASON_CD='ETC' 일 때만
    EDITOR_EMP_NO      VARCHAR2(7 CHAR)    NOT NULL,
    EDITOR_NAME        VARCHAR2(50 CHAR)   NOT NULL,
    EMP_VERIFIED       NUMBER(1)           DEFAULT 0 NOT NULL,
    SCREEN_ID          VARCHAR2(30 CHAR)   NOT NULL,
    BUTTON_ID          VARCHAR2(30 CHAR)   NOT NULL,
    UI_VALID           NUMBER(1)           DEFAULT 0 NOT NULL,
    SAVED_AT           VARCHAR2(40 CHAR)   NOT NULL,   -- Times.nowIso
    CONSTRAINT PK_INST_BID_TARGET PRIMARY KEY (INSTITUTION_ID, TARGET_NO, REV_NO)
);
CREATE INDEX IDX_IBT_YEAR ON INST_BID_TARGET (TARGET_YEAR, INSTITUTION_ID);
CREATE INDEX IDX_IBT_EDITOR ON INST_BID_TARGET (EDITOR_EMP_NO, SAVED_AT);

-- [INSERT 블록 시작 — MySQL 043 과 글자 그대로 같다]
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'RETAIN', '재유치 도전', 1, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_TAG', 'NEW', '신규유치 도전', 2, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_CANCEL_REASON', 'WRONG', '잘못 넣음', 1, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_CANCEL_REASON', 'DUP', '중복으로 넣음', 2, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_CANCEL_REASON', 'DROPPED', '목표 변경(포기)', 3, 1, '2026-11-17T00:00:00+09:00');
INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT) VALUES ('TARGET_CANCEL_REASON', 'ETC', '기타(직접 입력)', 4, 1, '2026-11-17T00:00:00+09:00');
-- [INSERT 블록 끝 — 6행]
COMMIT;
