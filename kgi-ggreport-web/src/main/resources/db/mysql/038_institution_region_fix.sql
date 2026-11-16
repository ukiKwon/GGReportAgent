-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — MySQL 미러 (038) : 기관 시도(REGION_CODE)를 실제 소재지 시도로 정정 (2026-11-16)
-- 사용자 결정(11-16 ⓐ): 지원이 본원과 다른 시도에 있으면 지원이 있는 시도 목록에 보인다
--   (예: 대구지방법원 안동지원 27 → 경북 47). 연구원 2곳도 실제 소재지로(형사·법무정책연구원 36 → 서울 11,
--   한국석유관리원 43 → 경기 41). 근거: data-auditor 11-16(대법원 법원 안내 전재 표·알리오), frontend/data/institutions_nonmuni.js 와 같은 값.
-- 규칙: 지금 값이 029 시드 값(본원 시도)일 때만 바꾼다 — 사람이 기관 편집으로 이미 바꾼 행은 건드리지 않는다. 멱등.
-- 적용: mysql -u <계정> -p --default-character-set=utf8mb4 ggreportdb < 038_institution_region_fix.sql
-- 되돌리기: 아래 각 UPDATE 의 SET/WHERE 시도 값을 서로 바꿔 다시 실행.
-- ---------------------------------------------------------------------------
SET NAMES utf8mb4;

UPDATE INSTITUTIONS SET REGION_CODE = '47' WHERE REGION_CODE = '27' AND INSTITUTION_ID IN (
  'org-9740520','nm-f096d1df01',   -- 안동지원(지방·가정)
  'org-9740522','nm-c1ec1b6de9',   -- 경주지원
  'org-9740534','nm-8d4658bfbf',   -- 포항지원
  'org-9740526','nm-42a68a5770',   -- 김천지원
  'org-9740528','nm-57b10b535d',   -- 상주지원
  'org-9740530','nm-55feb91191',   -- 의성지원
  'org-9740532','nm-9331044a76');  -- 영덕지원

UPDATE INSTITUTIONS SET REGION_CODE = '44' WHERE REGION_CODE = '30' AND INSTITUTION_ID IN (
  'org-9740428','nm-932d2d65ac',   -- 홍성지원
  'org-9740438','nm-c19398fad7',   -- 공주지원
  'org-9740432','nm-48e7337d6a',   -- 논산지원
  'org-9740440','nm-8f2f51d113',   -- 서산지원
  'org-9740434','nm-7f6b04fd7c');  -- 천안지원

UPDATE INSTITUTIONS SET REGION_CODE = '41' WHERE REGION_CODE = '28' AND INSTITUTION_ID IN (
  'org-9740297','nm-9f9beb7b64');  -- 부천지원(지방·가정)

UPDATE INSTITUTIONS SET REGION_CODE = '11' WHERE REGION_CODE = '36' AND INSTITUTION_ID = 'g2b-B554626';   -- 한국형사·법무정책연구원(서울 서초구)
UPDATE INSTITUTIONS SET REGION_CODE = '41' WHERE REGION_CODE = '43' AND INSTITUTION_ID = 'g2b-B552532';   -- 한국석유관리원(성남시 분당구 본사)
