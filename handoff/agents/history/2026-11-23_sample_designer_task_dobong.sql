-- 로컬 개발 DB 전용 — 샘플 디자이너 작업(bc-sample-dsn1)의 기관을 노원구 → 도봉구로 바꿈(도봉구청 샘플 제안서로 시험하려고, 2026-11-23)
-- 되돌리기: UPDATE BID_CASES SET INSTITUTION_ID='nowon' WHERE BID_CASE_ID='bc-sample-dsn1';
UPDATE BID_CASES SET INSTITUTION_ID='dobong' WHERE BID_CASE_ID='bc-sample-dsn1' AND INSTITUTION_ID='nowon';
