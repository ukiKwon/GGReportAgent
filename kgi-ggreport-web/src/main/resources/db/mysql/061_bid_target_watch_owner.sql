-- -----------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (061) : INST_BID_TARGET.WATCH_EMP_NO(관심 주인) 추가 + 기존 관심 행 채우기
-- ⚠️ 정본이 아니다. 정본은 db/oracle/061_bid_target_watch_owner.sql (규칙은 정본 헤더).
-- ⚠️ 멱등하지 않다 — 060 뒤 한 번만. 이미 060 까지 적용한 DB: 이 파일만 한 번 돌리면 된다. 적용 뒤 고치지 않는다(체크섬).
-- Workbench 안전 갱신 모드면 UPDATE 가 막힌다 — mysql 명령줄로 돌리거나 SET SQL_SAFE_UPDATES=0; 뒤에.
-- 되돌리기(코드를 먼저 되돌린 뒤): ALTER TABLE INST_BID_TARGET DROP KEY IDX_IBT_WATCH, DROP COLUMN WATCH_EMP_NO;
-- 적용 뒤 검사(맨 끝 SELECT): NULL_WATCH_OWNER 는 0 이어야 한다. 0 이 아니면 DBA 가 그 행의 WATCH_EMP_NO 를 손으로 배정한다(정본 헤더).
-- -----------------------------------------------------------------------------

ALTER TABLE INST_BID_TARGET
    ADD COLUMN WATCH_EMP_NO VARCHAR(7) NULL,
    ADD KEY IDX_IBT_WATCH (WATCH_EMP_NO, KIND_CD);

-- 파생 표는 GROUP BY 로 물질화(같은 표 UPDATE 1093 회피)
UPDATE INST_BID_TARGET b
  JOIN (SELECT f.INSTITUTION_ID, f.TARGET_NO, MAX(COALESCE(ri.REQUESTER_EMP_NO, f.EDITOR_EMP_NO)) AS EMP
          FROM INST_BID_TARGET f
          LEFT JOIN INST_BID_TARGET_REQ_ITEM ri ON ri.REQ_ID = f.APPROVAL_REQ_ID AND ri.INSTITUTION_ID = f.INSTITUTION_ID
         WHERE f.REV_NO = 1
         GROUP BY f.INSTITUTION_ID, f.TARGET_NO) x
    ON x.INSTITUTION_ID = b.INSTITUTION_ID AND x.TARGET_NO = b.TARGET_NO
   SET b.WATCH_EMP_NO = x.EMP
 WHERE b.KIND_CD = 'WATCH';
COMMIT;

SELECT COUNT(*) AS NULL_WATCH_OWNER FROM INST_BID_TARGET WHERE KIND_CD = 'WATCH' AND WATCH_EMP_NO IS NULL;
