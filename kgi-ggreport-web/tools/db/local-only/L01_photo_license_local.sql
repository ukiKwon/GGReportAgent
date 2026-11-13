-- ---------------------------------------------------------------------------
-- 로컬 개발 전용(내부망·운영 DB에 적용 금지) — 기관장 사진 이용 조건 코드 LOCAL_ONLY
--
-- 사용자 11-13: "나중에는 내부망으로 가져가지만 지금은 로컬이니 일단 모두 채워서 작업" + 사진 경로는 .gitignore.
-- 공식 누리집 기관장 사진은 공공누리 제1유형 표시가 없어 KOGL1·INST_PERMIT 로 올릴 수 없다. 로컬 화면 작업용으로만
-- 받을 수 있게 이 코드를 켠다. 번호 마이그레이션(db/mysql/NNN_*)이 아니라서 apply-mysql.mjs 기록에 남지 않는다.
--
-- 적용(이 PC 로컬 MySQL, 비밀번호 입력):
--   mysql -u root -p ggreportdb < kgi-ggreport-web/tools/db/local-only/L01_photo_license_local.sql
-- 되돌리기:
--   UPDATE COMMON_CODE SET ENABLED = 0 WHERE CODE_GROUP = 'PHOTO_LICENSE' AND CODE = 'LOCAL_ONLY';
-- ---------------------------------------------------------------------------

INSERT INTO COMMON_CODE (CODE_GROUP, CODE, CODE_NAME, SORT_NO, ENABLED, UPDATED_AT)
VALUES ('PHOTO_LICENSE', 'LOCAL_ONLY', '로컬 작업용(이용 허락 미확인 — 반입 금지)', 99, 1, '2026-11-13T00:00:00+09:00')
ON DUPLICATE KEY UPDATE ENABLED = 1;
