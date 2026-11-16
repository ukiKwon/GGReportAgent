-- ---------------------------------------------------------------------------
-- kgi-ggreport-web — Oracle 정본 (038) : 기관 시도(REGION_CODE)를 실제 소재지 시도로 정정 (2026-11-16)
--   뜻·근거·규칙은 db/mysql/038 과 같다(사용자 결정 11-16 ⓐ — 지원은 지원이 있는 시도, 연구원 2곳은 실제 소재지).
--   지금 값이 029 시드 값일 때만 바꾼다(사람이 바꾼 행 보존). 멱등. 적용은 DBA.
-- ---------------------------------------------------------------------------
UPDATE INSTITUTIONS SET REGION_CODE = '47' WHERE REGION_CODE = '27' AND INSTITUTION_ID IN (
  'org-9740520','nm-f096d1df01','org-9740522','nm-c1ec1b6de9','org-9740534','nm-8d4658bfbf',
  'org-9740526','nm-42a68a5770','org-9740528','nm-57b10b535d','org-9740530','nm-55feb91191',
  'org-9740532','nm-9331044a76');

UPDATE INSTITUTIONS SET REGION_CODE = '44' WHERE REGION_CODE = '30' AND INSTITUTION_ID IN (
  'org-9740428','nm-932d2d65ac','org-9740438','nm-c19398fad7','org-9740432','nm-48e7337d6a',
  'org-9740440','nm-8f2f51d113','org-9740434','nm-7f6b04fd7c');

UPDATE INSTITUTIONS SET REGION_CODE = '41' WHERE REGION_CODE = '28' AND INSTITUTION_ID IN ('org-9740297','nm-9f9beb7b64');

UPDATE INSTITUTIONS SET REGION_CODE = '11' WHERE REGION_CODE = '36' AND INSTITUTION_ID = 'g2b-B554626';
UPDATE INSTITUTIONS SET REGION_CODE = '41' WHERE REGION_CODE = '43' AND INSTITUTION_ID = 'g2b-B552532';
-- COMMIT 은 DBA 가 결과 확인 뒤
